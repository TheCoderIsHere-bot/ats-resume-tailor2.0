import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generatePdf } from '@/lib/pdf';
import { generateDocx } from '@/lib/docx';
import { rateLimitMulti, buildRateLimitHeaders } from '@/lib/rateLimit';
import {
  getClientIp,
  getRequestId,
  logAuthEvent,
  logRateLimitExceeded,
  logApiError,
  logSecurityEvent,
} from '@/lib/securityLogger';
import { recordSuspiciousSignal } from '@/lib/trafficMonitor';

const ROUTE = '/api/download';

/**
 * Convert edited HTML back to markdown for PDF/DOCX generation.
 * Handles the HTML tags produced by contentEditable + our markdownToHtml().
 */
function htmlToMarkdown(html: string): string {
  let md = html;

  // Normalize <br> tags to newlines
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Headings: <h1>…</h1> → # …
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1');

  // Bold: <strong>…</strong> or <b>…</b> → **…**
  md = md.replace(/<(strong|b)>(.*?)<\/\1>/gi, '**$2**');

  // Italic: <em>…</em> or <i>…</i> → *…*
  md = md.replace(/<(em|i)>(.*?)<\/\1>/gi, '*$2*');

  // List items: <li>…</li> → - …
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1');

  // Strip remaining tags (ul, ol, p, div, span, etc.) — keep their inner text
  md = md.replace(/<\/?(ul|ol|div|span|p|section|article|header|footer|nav)[^>]*>/gi, '\n');

  // Decode common HTML entities
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&apos;/g, "'");
  md = md.replace(/&nbsp;/g, ' ');

  // Strip any remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Clean up excess blank lines
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        reason: authError?.message ?? 'missing_session',
        statusCode: 401,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    userId = user.id;

    // Rate limit downloads: 30 / 10min & 100 / 24h per user
    const rl = rateLimitMulti([
      {
        key: `download:10m:${user.id}`,
        name: 'user_10m',
        limit: 30,
        windowMs: 10 * 60 * 1000,
      },
      {
        key: `download:24h:${user.id}`,
        name: 'user_24h',
        limit: 100,
        windowMs: 24 * 60 * 60 * 1000,
      },
    ]);
    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        userId: user.id,
        limitKey: rl.blockedBy ?? 'download',
        limit: rl.limit,
        resetInMs: rl.resetInMs,
      });
      return NextResponse.json(
        { error: 'Download limit exceeded. Please wait a moment.' },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    const body = await request.json();
    const { generationId, type, format = 'pdf', editedHtml } = body as {
      generationId: string;
      type: 'resume' | 'cover_letter';
      format?: 'pdf' | 'docx';
      editedHtml?: string | null;
    };

    if (!generationId || typeof generationId !== 'string') {
      return NextResponse.json({ error: 'Invalid or missing generationId' }, { status: 400 });
    }
    if (type !== 'resume' && type !== 'cover_letter') {
      return NextResponse.json({ error: 'Invalid document type requested' }, { status: 400 });
    }
    if (format !== 'pdf' && format !== 'docx') {
      return NextResponse.json({ error: 'Invalid format requested' }, { status: 400 });
    }
    if (editedHtml && (typeof editedHtml !== 'string' || editedHtml.length > 200000)) {
      return NextResponse.json({ error: 'Edited content exceeds maximum length' }, { status: 400 });
    }

    // Strict IDOR Prevention: Verify that generationId exists and belongs to the authenticated user
    const serviceClient = await createServiceClient();
    const { data: generation, error: genError } = await serviceClient
      .from('generations')
      .select('tailored_resume, cover_letter, user_id')
      .eq('id', generationId)
      .eq('user_id', user.id)
      .single();

    if (genError || !generation) {
      const ip = getClientIp(request.headers);
      const signal = recordSuspiciousSignal(ip, 'IDOR_PROBE');
      logSecurityEvent({
        eventType: signal.escalated ? 'TRAFFIC_ANOMALY' : 'SECURITY_VIOLATION',
        severity: signal.escalated ? 'critical' : 'warn',
        route: ROUTE,
        method: request.method,
        ip,
        userId: user.id,
        userAgent: request.headers.get('user-agent'),
        requestId: getRequestId(request.headers),
        statusCode: 404,
        details: {
          violation: 'UNOWNED_OR_MISSING_GENERATION_ACCESS',
          attemptCount10m: signal.count,
        },
      });
      return NextResponse.json({ error: 'Generation not found or access denied.' }, { status: 404 });
    }

    // Use user-edited HTML if present; otherwise use the verified original from DB
    const markdown = editedHtml
      ? htmlToMarkdown(editedHtml)
      : (type === 'resume' ? generation.tailored_resume : generation.cover_letter);

    const filename = type === 'resume' ? 'tailored_resume' : 'cover_letter';

    if (format === 'docx') {
      const docxBytes = await generateDocx(markdown);
      return new NextResponse(Buffer.from(docxBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${filename}.docx"`,
        },
      });
    }

    const pdfBytes = await generatePdf(markdown);
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      },
    });
  } catch (error) {
    logApiError(request, ROUTE, error, { userId, statusCode: 500 });
    return NextResponse.json({ error: 'Failed to generate file.' }, { status: 500 });
  }
}

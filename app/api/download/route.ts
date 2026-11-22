import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generatePdf } from '@/lib/pdf';
import { generateDocx } from '@/lib/docx';

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
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { generationId, type, format = 'pdf', editedHtml } = body as {
      generationId: string;
      type: 'resume' | 'cover_letter';
      format?: 'pdf' | 'docx';
      editedHtml?: string | null;
    };

    if (!generationId || !type) {
      return NextResponse.json({ error: 'Missing generationId or type' }, { status: 400 });
    }

    let markdown: string;

    if (editedHtml) {
      // User edited the content — convert their HTML back to simple markdown
      markdown = htmlToMarkdown(editedHtml);
    } else {
      // No edits — fetch original from DB
      const { data: generation, error: genError } = await supabase
        .from('generations')
        .select('tailored_resume, cover_letter, user_id')
        .eq('id', generationId)
        .eq('user_id', user.id)
        .single();

      if (genError || !generation) {
        return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
      }

      markdown = type === 'resume'
        ? generation.tailored_resume
        : generation.cover_letter;
    }

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
    console.error('download error:', error);
    return NextResponse.json({ error: 'Failed to generate file.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimitMulti, buildRateLimitHeaders, getRateLimitKey } from '@/lib/rateLimit';
import { parseResumeFile } from '@/lib/parseResume';
import {
  getClientIp,
  getRequestId,
  logAuthEvent,
  logRateLimitExceeded,
  logApiError,
  logSecurityEvent,
} from '@/lib/securityLogger';

const ROUTE = '/api/parse-resume';

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

    // Rate limit: 15 / 10min, 50 / 24h per user, 30 / 1h per IP
    const rl = rateLimitMulti([
      {
        key: `parse:user-10m:${user.id}`,
        name: 'user_10m',
        limit: 15,
        windowMs: 10 * 60 * 1000,
      },
      {
        key: `parse:user-24h:${user.id}`,
        name: 'user_24h',
        limit: 50,
        windowMs: 24 * 60 * 60 * 1000,
      },
      {
        key: getRateLimitKey(request, ':parse-ip-1h'),
        name: 'ip_1h',
        limit: 30,
        windowMs: 60 * 60 * 1000,
      },
    ]);

    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        userId: user.id,
        limitKey: rl.blockedBy ?? 'parse',
        limit: rl.limit,
        resetInMs: rl.resetInMs,
      });
      return NextResponse.json(
        { error: 'Too many resume parse requests. Please wait a moment.' },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid multipart form upload.' }, { status: 400 });
    }
    const rawFile = formData.get('file');

    if (!(rawFile instanceof File)) {
      return NextResponse.json({ error: 'Valid file upload is required.' }, { status: 400 });
    }

    const parsed = await parseResumeFile(rawFile);
    if (!parsed.ok) {
      if (parsed.securityViolation) {
        logSecurityEvent({
          eventType: 'SECURITY_VIOLATION',
          severity: 'warn',
          route: ROUTE,
          method: request.method,
          ip: getClientIp(request.headers),
          userId: user.id,
          userAgent: request.headers.get('user-agent'),
          requestId: getRequestId(request.headers),
          statusCode: parsed.status,
          details: { violation: parsed.securityViolation },
        });
      }
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    return NextResponse.json({ text: parsed.text }, { headers: buildRateLimitHeaders(rl) });
  } catch (error) {
    logApiError(request, ROUTE, error, { userId, statusCode: 500 });
    return NextResponse.json({ error: 'Failed to parse resume.' }, { status: 500 });
  }
}

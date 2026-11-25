import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rateLimit';
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

    // Rate limit: 20 parses per user per 10 minutes
    const rl = rateLimit(`parse:${user.id}`, { limit: 20, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        userId: user.id,
        limitKey: 'parse',
        limit: 20,
        resetInMs: rl.resetInMs,
      });
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const parsed = await parseResumeFile(file);
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

    return NextResponse.json({ text: parsed.text });
  } catch (error) {
    logApiError(request, ROUTE, error, { userId, statusCode: 500 });
    return NextResponse.json({ error: 'Failed to parse resume.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimitMulti, buildRateLimitHeaders, getRateLimitKey } from '@/lib/rateLimit';
import { isValidEmail, canonicalizeEmail, isDisposableEmail } from '@/lib/auth/security';
import {
  getClientIp,
  getRequestId,
  logRateLimitExceeded,
  logApiError,
  logSecurityEvent,
} from '@/lib/securityLogger';
import { detectFormBotSubmission, recordSuspiciousSignal } from '@/lib/trafficMonitor';
import { parseJsonObject, hasOnlyAllowedKeys } from '@/lib/validation';

const ROUTE = '/api/leads';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  try {
    // 1. Multi-layer IP Rate Limit: 5 / 15min & 10 / 24h
    const rl = rateLimitMulti([
      {
        key: getRateLimitKey(request, ':leads-15m'),
        name: 'leads_15m',
        limit: 5,
        windowMs: 15 * 60 * 1000,
      },
      {
        key: getRateLimitKey(request, ':leads-24h'),
        name: 'leads_24h',
        limit: 10,
        windowMs: 24 * 60 * 60 * 1000,
      },
    ]);

    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        limitKey: rl.blockedBy ?? 'leads',
        limit: rl.limit,
        resetInMs: rl.resetInMs,
      });
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    const parsedBody = await parseJsonObject(request);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    }
    const body = parsedBody.data;
    if (!hasOnlyAllowedKeys(body, ['email', '_hp', '_ts'])) {
      return NextResponse.json({ error: 'Unexpected fields in request body.' }, { status: 400 });
    }
    if (
      (body._hp !== undefined && typeof body._hp !== 'string') ||
      (body._ts !== undefined && typeof body._ts !== 'number')
    ) {
      return NextResponse.json({ error: 'Invalid input types.' }, { status: 400 });
    }

    // 2. Bot Honeypot & Timing Check
    const botReason = detectFormBotSubmission(body);
    if (botReason) {
      const signal = recordSuspiciousSignal(ip, 'BOT_PROBE');
      logSecurityEvent({
        eventType: 'TRAFFIC_ANOMALY',
        severity: signal.escalated ? 'critical' : 'warn',
        route: ROUTE,
        method: request.method,
        ip,
        userAgent: request.headers.get('user-agent'),
        requestId: getRequestId(request.headers),
        statusCode: 403,
        details: { anomaly: botReason, probeCount10m: signal.count },
      });
      return NextResponse.json({ error: 'Unable to process submission.' }, { status: 403 });
    }

    const rawEmail = typeof body?.email === 'string' ? body.email : '';

    if (!rawEmail || !isValidEmail(rawEmail)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    const email = canonicalizeEmail(rawEmail);
    if (isDisposableEmail(email)) {
      return NextResponse.json({ error: 'Please use a valid non-disposable email address.' }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const { error } = await supabase.from('leads').insert({ email });

    // 23505 = unique_violation — email already exists, treat as success
    if (error && error.code !== '23505') {
      logApiError(request, ROUTE, error, { statusCode: 500, context: 'leads_insert' });
      return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { headers: buildRateLimitHeaders(rl) });
  } catch (err) {
    logApiError(request, ROUTE, err, { statusCode: 500 });
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}

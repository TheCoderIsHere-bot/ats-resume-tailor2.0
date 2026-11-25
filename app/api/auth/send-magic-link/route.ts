import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimitMulti, buildRateLimitHeaders, getRateLimitKey } from '@/lib/rateLimit';
import {
  isValidEmail,
  canonicalizeEmail,
  isDisposableEmail,
  getRateLimitEmailKey,
} from '@/lib/auth/security';
import { getAppOrigin } from '@/lib/env';
import {
  getClientIp,
  getRequestId,
  logAuthEvent,
  logRateLimitExceeded,
  logApiError,
  logSecurityEvent,
} from '@/lib/securityLogger';
import { detectFormBotSubmission, recordSuspiciousSignal } from '@/lib/trafficMonitor';
import { parseJsonObject, hasOnlyAllowedKeys } from '@/lib/validation';

const ROUTE = '/api/auth/send-magic-link';

export async function POST(request: NextRequest) {
  let emailForLog: string | undefined;
  const ip = getClientIp(request.headers);

  try {
    // 1. Multi-layer IP Rate Limiting (prevents login brute-force & account creation farming)
    const ipRl = rateLimitMulti([
      {
        key: getRateLimitKey(request, ':magic-link-ip-15m'),
        name: 'ip_15m',
        limit: 5,
        windowMs: 15 * 60 * 1000,
      },
      {
        key: getRateLimitKey(request, ':magic-link-ip-24h'),
        name: 'ip_24h',
        limit: 12,
        windowMs: 24 * 60 * 60 * 1000,
      },
    ]);

    if (!ipRl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        limitKey: ipRl.blockedBy ?? 'magic-link-ip',
        limit: ipRl.limit,
        resetInMs: ipRl.resetInMs,
      });
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        provider: 'magic_link',
        reason: `ip_rate_limited:${ipRl.blockedBy}`,
        statusCode: 429,
      });
      const waitMin = Math.ceil(ipRl.resetInMs / 60000);
      return NextResponse.json(
        { error: `Too many sign-in attempts from this network. Please wait ${waitMin} minutes before trying again.` },
        { status: 429, headers: buildRateLimitHeaders(ipRl) }
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

    // 2. Automated Bot Form Trap (honeypot + submission timing)
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
      return NextResponse.json(
        { error: 'Unable to verify your request. Please refresh the page and try again.' },
        { status: 403 }
      );
    }

    const rawEmail = typeof body?.email === 'string' ? body.email : '';

    // 3. Validate Email Format & RFC 5321 length limits
    if (!rawEmail || !isValidEmail(rawEmail)) {
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        provider: 'magic_link',
        reason: 'invalid_email_format',
        statusCode: 400,
      });
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const email = canonicalizeEmail(rawEmail);
    emailForLog = email;

    // 4. Reject throwaway/disposable email domains to prevent automated free-credit account creation
    if (isDisposableEmail(email)) {
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        email,
        provider: 'magic_link',
        reason: 'disposable_email_blocked',
        statusCode: 400,
      });
      return NextResponse.json(
        { error: 'Please use a permanent email address rather than a disposable email provider.' },
        { status: 400 }
      );
    }

    logAuthEvent(request, 'AUTH_ATTEMPT', {
      route: ROUTE,
      email,
      provider: 'magic_link',
    });

    // 5. Alias-Normalized Email Rate Limiting (prevents user+1@gmail.com account farming)
    const normalizedRateKey = getRateLimitEmailKey(email);
    const emailRl = rateLimitMulti([
      {
        key: `magic-link-email-15m:${normalizedRateKey}`,
        name: 'email_15m',
        limit: 3,
        windowMs: 15 * 60 * 1000,
      },
      {
        key: `magic-link-email-24h:${normalizedRateKey}`,
        name: 'email_24h',
        limit: 6,
        windowMs: 24 * 60 * 60 * 1000,
      },
    ]);

    if (!emailRl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        limitKey: emailRl.blockedBy ?? 'magic-link-email',
        limit: emailRl.limit,
        resetInMs: emailRl.resetInMs,
      });
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        email,
        provider: 'magic_link',
        reason: `email_rate_limited:${emailRl.blockedBy}`,
        statusCode: 429,
      });
      const waitMin = Math.ceil(emailRl.resetInMs / 60000);
      return NextResponse.json(
        { error: `A magic link was recently requested for this email. Please check your inbox or wait ${waitMin} minutes.` },
        { status: 429, headers: buildRateLimitHeaders(emailRl) }
      );
    }

    // 6. Construct HTTPS-enforced verified callback redirect URL
    const origin = getAppOrigin(request);
    const emailRedirectTo = `${origin}/auth/callback`;

    // 7. Trigger Supabase Auth OTP delivery via server client
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        shouldCreateUser: true,
      },
    });

    if (error) {
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        email,
        provider: 'magic_link',
        reason: error.message,
        statusCode: error.status ?? 500,
      });

      if (error.status === 429 || error.message.toLowerCase().includes('rate limit')) {
        return NextResponse.json(
          { error: 'Email service rate limit reached. Please wait a few minutes before trying again.' },
          { status: 429, headers: { 'Retry-After': '60' } }
        );
      }
      return NextResponse.json(
        { error: 'Unable to send magic link. Please check your email or try Google sign-in.' },
        { status: 500 }
      );
    }

    logAuthEvent(request, 'AUTH_SUCCESS', {
      route: ROUTE,
      email,
      provider: 'magic_link',
      reason: 'otp_dispatched',
      statusCode: 200,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Magic link sent successfully. Please check your inbox.',
      },
      { headers: buildRateLimitHeaders(emailRl) }
    );
  } catch (err) {
    logApiError(request, ROUTE, err, { statusCode: 500 });
    logAuthEvent(request, 'AUTH_FAILURE', {
      route: ROUTE,
      email: emailForLog,
      provider: 'magic_link',
      reason: 'server_exception',
      statusCode: 500,
    });
    return NextResponse.json({ error: 'Server error processing authentication request.' }, { status: 500 });
  }
}

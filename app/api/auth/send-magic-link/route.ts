import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getRateLimitKey } from '@/lib/rateLimit';
import { isValidEmail, canonicalizeEmail } from '@/lib/auth/security';
import { getAppOrigin } from '@/lib/env';
import { logAuthEvent, logRateLimitExceeded, logApiError } from '@/lib/securityLogger';

const ROUTE = '/api/auth/send-magic-link';

export async function POST(request: NextRequest) {
  let emailForLog: string | undefined;
  try {
    // 1. IP Rate Limiting: Max 5 attempts per IP per 15 minutes
    const ipKey = getRateLimitKey(request, ':magic-link-ip');
    const ipRl = rateLimit(ipKey, { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!ipRl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        limitKey: 'magic-link-ip',
        limit: 5,
        resetInMs: ipRl.resetInMs,
      });
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        provider: 'magic_link',
        reason: 'ip_rate_limited',
        statusCode: 429,
      });
      const waitMin = Math.ceil(ipRl.resetInMs / 60000);
      return NextResponse.json(
        { error: `Too many sign-in attempts from this network. Please wait ${waitMin} minutes before trying again.` },
        { status: 429 }
      );
    }

    const body = await request.json();
    const rawEmail = body?.email;

    // 2. Validate Email Format & RFC 5321 length limits
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

    logAuthEvent(request, 'AUTH_ATTEMPT', {
      route: ROUTE,
      email,
      provider: 'magic_link',
    });

    // 3. Email-specific Rate Limiting: Max 3 OTP requests per email per 15 minutes
    const emailRl = rateLimit(`magic-link:${email}`, { limit: 3, windowMs: 15 * 60 * 1000 });
    if (!emailRl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        limitKey: 'magic-link-email',
        limit: 3,
        resetInMs: emailRl.resetInMs,
      });
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        email,
        provider: 'magic_link',
        reason: 'email_rate_limited',
        statusCode: 429,
      });
      const waitMin = Math.ceil(emailRl.resetInMs / 60000);
      return NextResponse.json(
        { error: `A magic link was recently requested for this email. Please check your inbox or wait ${waitMin} minutes.` },
        { status: 429 }
      );
    }

    // 4. Construct HTTPS-enforced verified callback redirect URL
    const origin = getAppOrigin(request);
    const emailRedirectTo = `${origin}/auth/callback`;

    // 5. Trigger Supabase Auth OTP delivery via server client
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
          { status: 429 }
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

    return NextResponse.json({
      success: true,
      message: 'Magic link sent successfully. Please check your inbox.',
    });
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

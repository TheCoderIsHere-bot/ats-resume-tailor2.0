import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, buildRateLimitHeaders, getRateLimitKey } from '@/lib/rateLimit';
import { getAppOrigin } from '@/lib/env';
import { logAuthEvent, logRateLimitExceeded, logApiError } from '@/lib/securityLogger';
import { detectUnsafeQueryString, sanitizeRelativeRedirectPath } from '@/lib/validation';

const ROUTE = '/auth/callback';
const AUTH_CODE_REGEX = /^[A-Za-z0-9\-_.]{6,512}$/;

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = getAppOrigin(request);

  // 0. Reject unsafe query parameters immediately
  if (detectUnsafeQueryString(requestUrl.search)) {
    logAuthEvent(request, 'AUTH_FAILURE', {
      route: ROUTE,
      reason: 'unsafe_query_parameter',
      statusCode: 400,
    });
    return NextResponse.redirect(`${origin}/?error=invalid_request`);
  }

  // 1. Rate limit callback exchanges (max 20 per IP per 10 minutes) to prevent code brute-forcing
  const rl = rateLimit(getRateLimitKey(request, ':auth-callback'), { limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) {
    logRateLimitExceeded(request, ROUTE, {
      limitKey: 'auth-callback',
      limit: 20,
      resetInMs: rl.resetInMs,
    });
    logAuthEvent(request, 'AUTH_FAILURE', {
      route: ROUTE,
      reason: 'callback_rate_limited',
      statusCode: 429,
    });
    return NextResponse.redirect(`${origin}/?error=rate_limited`, {
      headers: buildRateLimitHeaders(rl),
    });
  }

  // 2. Check for upstream OAuth provider errors (sanitized token)
  const rawOauthError = requestUrl.searchParams.get('error');
  if (rawOauthError) {
    const safeErrorCode = rawOauthError.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'oauth_error';
    logAuthEvent(request, 'AUTH_FAILURE', {
      route: ROUTE,
      reason: `oauth_provider_error:${safeErrorCode}`,
      statusCode: 400,
    });
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(safeErrorCode)}`);
  }

  const code = requestUrl.searchParams.get('code');
  const rawNext = requestUrl.searchParams.get('next');

  // 3. Strict same-origin relative path check to eliminate Open Redirect & path traversal
  const safeNext = sanitizeRelativeRedirectPath(rawNext, origin);

  if (code) {
    if (!AUTH_CODE_REGEX.test(code)) {
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        reason: 'malformed_auth_code',
        statusCode: 400,
      });
      return NextResponse.redirect(`${origin}/?error=invalid_code`);
    }

    logAuthEvent(request, 'AUTH_ATTEMPT', {
      route: ROUTE,
      reason: 'code_exchange',
    });

    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        logAuthEvent(request, 'AUTH_FAILURE', {
          route: ROUTE,
          reason: `exchange_failed:${error.message}`,
          statusCode: 401,
        });
        return NextResponse.redirect(`${origin}/?error=auth_failed`);
      }

      logAuthEvent(request, 'AUTH_SUCCESS', {
        route: ROUTE,
        userId: data.user?.id,
        provider: (data.user?.app_metadata?.provider as string) ?? 'unknown',
        statusCode: 200,
      });
    } catch (err) {
      logApiError(request, ROUTE, err, { statusCode: 500 });
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        reason: 'callback_exception',
        statusCode: 500,
      });
      return NextResponse.redirect(`${origin}/?error=server_error`);
    }
  }

  return NextResponse.redirect(new URL(safeNext, origin));
}

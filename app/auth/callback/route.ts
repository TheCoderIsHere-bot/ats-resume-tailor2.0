import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, buildRateLimitHeaders, getRateLimitKey } from '@/lib/rateLimit';
import { getAppOrigin } from '@/lib/env';
import { logAuthEvent, logRateLimitExceeded, logApiError } from '@/lib/securityLogger';

const ROUTE = '/auth/callback';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = getAppOrigin(request);

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

  // 2. Check for upstream OAuth provider errors (e.g., user denied permission, invalid grant)
  const oauthError = requestUrl.searchParams.get('error');
  if (oauthError) {
    logAuthEvent(request, 'AUTH_FAILURE', {
      route: ROUTE,
      reason: `oauth_provider_error:${oauthError}`,
      statusCode: 400,
    });
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(oauthError)}`);
  }

  const code = requestUrl.searchParams.get('code');
  const rawNext = requestUrl.searchParams.get('next') ?? '/';

  // 3. Prevent Open Redirect: only allow strict relative paths on the same origin
  const safeNext =
    rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('\\')
      ? rawNext
      : '/';

  if (code && typeof code === 'string' && code.length >= 6 && code.length <= 512) {
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
  } else if (code) {
    logAuthEvent(request, 'AUTH_FAILURE', {
      route: ROUTE,
      reason: 'malformed_auth_code',
      statusCode: 400,
    });
    return NextResponse.redirect(`${origin}/?error=invalid_code`);
  }

  return NextResponse.redirect(new URL(safeNext, origin));
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimitMulti, buildRateLimitHeaders, getRateLimitKey } from '@/lib/rateLimit';
import { getAppOrigin } from '@/lib/env';
import { logAuthEvent, logRateLimitExceeded, logApiError } from '@/lib/securityLogger';

const ROUTE = '/api/auth/oauth/google';

export async function POST(request: NextRequest) {
  try {
    // Rate limit Google OAuth login & account creation attempts (burst + 24h cap per IP)
    const rl = rateLimitMulti([
      {
        key: getRateLimitKey(request, ':oauth-google-15m'),
        name: 'ip_15m',
        limit: 10,
        windowMs: 15 * 60 * 1000,
      },
      {
        key: getRateLimitKey(request, ':oauth-google-24h'),
        name: 'ip_24h',
        limit: 25,
        windowMs: 24 * 60 * 60 * 1000,
      },
    ]);

    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        limitKey: rl.blockedBy ?? 'oauth-google',
        limit: rl.limit,
        resetInMs: rl.resetInMs,
      });
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        provider: 'google',
        reason: `rate_limited:${rl.blockedBy}`,
        statusCode: 429,
      });
      return NextResponse.json(
        { error: 'Too many sign-in attempts. Please wait before trying again.' },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    logAuthEvent(request, 'AUTH_ATTEMPT', {
      route: ROUTE,
      provider: 'google',
    });

    const origin = getAppOrigin(request);
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        provider: 'google',
        reason: error?.message ?? 'missing_oauth_url',
        statusCode: 500,
      });
      return NextResponse.json(
        { error: 'Failed to initiate Google sign in. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { url: data.url },
      { headers: buildRateLimitHeaders(rl) }
    );
  } catch (err) {
    logApiError(request, ROUTE, err, { statusCode: 500 });
    return NextResponse.json(
      { error: 'Failed to initiate Google sign in.' },
      { status: 500 }
    );
  }
}

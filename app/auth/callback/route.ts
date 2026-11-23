import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { rateLimit, getRateLimitKey } from '@/lib/rateLimit';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  // 1. Rate limit callback exchanges (max 20 per IP per 10 minutes) to prevent code brute-forcing
  const rl = rateLimit(getRateLimitKey(request, ':auth-callback'), { limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.redirect(`${origin}/?error=rate_limited`);
  }

  // 2. Check for upstream OAuth provider errors (e.g., user denied permission, invalid grant)
  const oauthError = requestUrl.searchParams.get('error');
  if (oauthError) {
    console.warn('OAuth provider returned error:', oauthError, requestUrl.searchParams.get('error_description'));
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
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, {
                  ...options,
                  sameSite: 'lax',
                  secure: process.env.NODE_ENV === 'production',
                  path: '/',
                })
              );
            },
          },
        }
      );

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.warn('Auth exchangeCodeForSession error:', error.message);
        return NextResponse.redirect(`${origin}/?error=auth_failed`);
      }
    } catch (err) {
      console.error('Callback error:', err);
      return NextResponse.redirect(`${origin}/?error=server_error`);
    }
  }

  return NextResponse.redirect(new URL(safeNext, origin));
}

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const rawNext = requestUrl.searchParams.get('next') ?? '/';
  const origin = requestUrl.origin;

  // Prevent Open Redirect: only allow strict relative paths on the same origin
  const safeNext =
    rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('\\')
      ? rawNext
      : '/';

  if (code) {
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
                cookieStore.set(name, value, options)
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

import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getSupabaseConfig, getSupabaseServiceRoleKey } from '@/lib/env';

/**
 * Authenticated user server client bound to verified HTTP cookies.
 * Enforces secure cookie attributes (sameSite=lax, secure in production).
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseConfig();

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
              })
            );
          } catch {
            // setAll called from Server Component — safe to ignore
          }
        },
      },
    }
  );
}

/**
 * Server-only privileged Supabase client using the Service Role Key.
 * Never persists sessions or attaches user cookies, preventing cross-session bleed.
 * MUST only be called after explicit server-side authorization/ownership checks.
 */
export async function createServiceClient() {
  const { url } = getSupabaseConfig();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return createSupabaseAdminClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

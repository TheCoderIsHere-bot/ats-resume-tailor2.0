import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  console.log('[Supabase] url:', url.slice(0, 30), 'key len:', key.length);

  if (!url || !url.startsWith('http') || !key || key.length < 20) {
    // Return a no-op stub during build/SSR when env vars aren't set
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithOAuth: async () => {},
        signOut: async () => {},
      },
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }), order: () => ({ limit: async () => ({ data: null, error: null }) }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  return createBrowserClient(url, key);
}

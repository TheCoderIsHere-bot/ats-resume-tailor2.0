-- ==============================================================================
-- Supabase Security Hardening: RLS, Direct Internet Access Lockdown & RPC Guards
-- ==============================================================================
-- Run this script in the Supabase Dashboard SQL Editor.
--
-- Defense-in-Depth Architecture:
-- 1. All application DB reads/writes now execute strictly inside authenticated
--    Next.js server API routes using SUPABASE_SERVICE_ROLE_KEY.
-- 2. Direct access from the public internet to PostgREST (/rest/v1/*) via the
--    public `anon` or `authenticated` roles is REVOKED on all sensitive tables
--    and token-modifying RPCs.
-- 3. Strict Row Level Security (RLS) policies remain enabled as a secondary guard.
-- 4. Platform-level Network Restrictions (Supabase Dashboard -> Database ->
--    Network Restrictions) should also be set to block direct TCP connections
--    (ports 5432 / 6543) from 0.0.0.0/0 on the public internet and enforce SSL.
-- ==============================================================================

-- 1. Enable RLS on all sensitive tables
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. RESTRICT DIRECT PUBLIC INTERNET ACCESS (PostgREST Lockdown)
-- Revoke direct table permissions from `PUBLIC`, `anon`, and `authenticated`.
-- Only `service_role` (server-side backend) retains access to these tables.
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.generations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.leads FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.users TO service_role;
GRANT ALL ON TABLE public.generations TO service_role;
GRANT ALL ON TABLE public.transactions TO service_role;
GRANT ALL ON TABLE public.leads TO service_role;

-- Prevent unprivileged internet users from calling privileged token RPCs directly
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('deduct_token', 'refund_token', 'add_tokens')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3. SECONDARY RLS POLICIES (Defense-in-Depth)
-- Even if table grants were ever widened, RLS binds every row to auth.uid().
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;

CREATE POLICY "users_select_own"
  ON public.users FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "generations_select_own" ON public.generations;
DROP POLICY IF EXISTS "generations_insert_own" ON public.generations;
DROP POLICY IF EXISTS "generations_update_own" ON public.generations;
DROP POLICY IF EXISTS "generations_delete_own" ON public.generations;

CREATE POLICY "generations_select_own"
  ON public.generations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
CREATE POLICY "transactions_select_own"
  ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "leads_insert_anon" ON public.leads;

-- ------------------------------------------------------------------------------
-- 4. STORAGE BUCKET LOCKDOWN (resumes bucket — Private, Server-Only Access)
-- Drop permissive client storage policies so resumes cannot be read/enumerated
-- directly via public storage URLs or client JWTs.
-- ------------------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'resumes';

DROP POLICY IF EXISTS "User owns their folder" ON storage.objects;
DROP POLICY IF EXISTS "resumes_select_own" ON storage.objects;
DROP POLICY IF EXISTS "resumes_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "resumes_update_own" ON storage.objects;
DROP POLICY IF EXISTS "resumes_delete_own" ON storage.objects;

-- ==============================================================================
-- Supabase Row Level Security (RLS) & IDOR Prevention Policies
-- ==============================================================================
-- Run this script in the Supabase Dashboard SQL Editor.
-- Enforces strict ownership checks at the PostgreSQL database engine level
-- ensuring that no user can SELECT, UPDATE, or DELETE another user's data.
-- ==============================================================================

-- 1. Enable RLS on all sensitive tables
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. POLICIES FOR public.users
-- Users can only view and update their own profile record.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- 3. POLICIES FOR public.generations
-- Users can only read, create, update, or delete their own generations.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "generations_select_own" ON public.generations;
CREATE POLICY "generations_select_own"
  ON public.generations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "generations_insert_own" ON public.generations;
CREATE POLICY "generations_insert_own"
  ON public.generations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "generations_update_own" ON public.generations;
CREATE POLICY "generations_update_own"
  ON public.generations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "generations_delete_own" ON public.generations;
CREATE POLICY "generations_delete_own"
  ON public.generations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. POLICIES FOR public.transactions
-- Users can view their own transaction history. Writes are service-role only.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
CREATE POLICY "transactions_select_own"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 5. POLICIES FOR public.leads
-- Anonymous users can insert email leads; reads are restricted to service role.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "leads_insert_anon" ON public.leads;
CREATE POLICY "leads_insert_anon"
  ON public.leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 6. POLICIES FOR Supabase Storage (resumes bucket)
-- Enforces storage namespace isolation: users can only manage objects in `<user_id>/*`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "resumes_select_own" ON storage.objects;
CREATE POLICY "resumes_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "resumes_insert_own" ON storage.objects;
CREATE POLICY "resumes_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "resumes_update_own" ON storage.objects;
CREATE POLICY "resumes_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "resumes_delete_own" ON storage.objects;
CREATE POLICY "resumes_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

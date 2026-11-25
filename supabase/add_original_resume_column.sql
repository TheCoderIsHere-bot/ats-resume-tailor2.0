-- ==============================================================================
-- Optional Schema Migration: Store original_resume snapshot alongside generations
-- ==============================================================================
-- Run this in Supabase SQL Editor to persist the original master resume snapshot
-- for historical diffing. Note: /api/generate works cleanly even before applying
-- this migration (tailored_resume already contains computed ==...== markers and
-- missing-column fallback keeps ATS score persistence intact).
-- ==============================================================================

ALTER TABLE IF EXISTS public.generations
  ADD COLUMN IF NOT EXISTS original_resume TEXT;

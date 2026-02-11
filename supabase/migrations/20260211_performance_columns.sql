-- ============================================================================
-- Performance Columns Migration
-- Created: 2026-02-11
-- Description: Add campaign performance tracking columns for Meta API sync.
-- ============================================================================

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS impressions integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS cpl_cents integer; -- cost per lead in cents, nullable
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS performance_status text NOT NULL DEFAULT 'learning'; -- learning | healthy | underperforming | paused

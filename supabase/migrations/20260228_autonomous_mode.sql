-- Autonomous Mode Migration
-- Created: 2026-02-28
-- Tables: autonomous_policies
-- Actions are stored in automation_runs.output (no separate log table needed)

-- autonomous_policies table
-- One policy per business. Stores the deterministic rules for the cron loop.
CREATE TABLE IF NOT EXISTS public.autonomous_policies (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id               uuid        NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id                   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled                   boolean     NOT NULL DEFAULT true,
  -- Core policy parameters (all monetary values in dollars)
  target_cpa                numeric     NOT NULL,             -- target cost-per-acquisition in dollars
  pause_multiplier          numeric     NOT NULL DEFAULT 2.5, -- pause if cpa > target_cpa * pause_multiplier
  scale_multiplier          numeric     NOT NULL DEFAULT 0.7, -- scale if cpa < target_cpa * scale_multiplier
  frequency_cap             numeric     NOT NULL DEFAULT 3.5, -- pause if ad frequency > this (requires Meta insights)
  max_daily_budget          numeric     NOT NULL DEFAULT 100, -- safety cap: never scale above this daily budget ($)
  scale_pct                 numeric     NOT NULL DEFAULT 0.2, -- scale daily_budget by this fraction (+20%)
  min_conversions_to_scale  integer     NOT NULL DEFAULT 3,   -- require at least N conversions before scaling
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autonomous_policies_business_id ON public.autonomous_policies(business_id);
CREATE INDEX IF NOT EXISTS idx_autonomous_policies_enabled ON public.autonomous_policies(enabled);

ALTER TABLE public.autonomous_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autonomous_policies_select_own" ON public.autonomous_policies
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "autonomous_policies_insert_own" ON public.autonomous_policies
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "autonomous_policies_update_own" ON public.autonomous_policies
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "autonomous_policies_delete_own" ON public.autonomous_policies
  FOR DELETE USING (user_id = auth.uid());

-- Trigger to auto-update updated_at on autonomous_policies
CREATE OR REPLACE FUNCTION public.set_autonomous_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER autonomous_policies_updated_at
  BEFORE UPDATE ON public.autonomous_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_autonomous_policies_updated_at();

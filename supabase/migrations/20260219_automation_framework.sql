-- Automation Framework Migration
-- Created: 2026-02-19
-- Tables: automation_runs, automation_config
-- Also adds columns to businesses table

-- automation_runs table
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_type      text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending',
  trigger_type    text        NOT NULL DEFAULT 'manual',
  trigger_reason  text,
  input           jsonb       NOT NULL DEFAULT '{}',
  output          jsonb,
  summary         text,
  first_person_summary text,
  error_message   text,
  tinyfish_replay_url text,
  duration_ms     integer,
  requires_approval boolean  NOT NULL DEFAULT false,
  approved_at     timestamptz,
  approved_action jsonb,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_business_id ON public.automation_runs(business_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_user_id ON public.automation_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_agent_type ON public.automation_runs(agent_type);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON public.automation_runs(status);
CREATE INDEX IF NOT EXISTS idx_automation_runs_created_at ON public.automation_runs(created_at DESC);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_runs_select_own" ON public.automation_runs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "automation_runs_insert_anon" ON public.automation_runs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "automation_runs_update_own" ON public.automation_runs
  FOR UPDATE USING (user_id = auth.uid());

-- automation_config table
CREATE TABLE IF NOT EXISTS public.automation_config (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid        NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creative_director_enabled     boolean NOT NULL DEFAULT true,
  competitor_analyst_enabled    boolean NOT NULL DEFAULT true,
  review_scout_enabled          boolean NOT NULL DEFAULT true,
  performance_monitor_enabled   boolean NOT NULL DEFAULT true,
  campaign_optimizer_enabled    boolean NOT NULL DEFAULT true,
  creative_director_frequency_hours   integer NOT NULL DEFAULT 336,
  competitor_analyst_frequency_hours  integer NOT NULL DEFAULT 168,
  review_scout_frequency_hours        integer NOT NULL DEFAULT 168,
  performance_monitor_frequency_hours integer NOT NULL DEFAULT 4,
  cpa_spike_threshold_pct       integer NOT NULL DEFAULT 50,
  ctr_drop_threshold_pct        integer NOT NULL DEFAULT 30,
  spend_pacing_threshold_pct    integer NOT NULL DEFAULT 120,
  auto_approve_creatives        boolean NOT NULL DEFAULT false,
  auto_approve_budget_shifts    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_config_select_own" ON public.automation_config
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "automation_config_insert_own" ON public.automation_config
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "automation_config_update_own" ON public.automation_config
  FOR UPDATE USING (user_id = auth.uid());

-- Add columns to businesses if missing
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS competitor_names text[];
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS google_maps_url text;

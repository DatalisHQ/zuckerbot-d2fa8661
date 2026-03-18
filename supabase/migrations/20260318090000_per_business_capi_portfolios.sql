-- Per-business CAPI configuration, event logging, and audience portfolio system
-- Created: 2026-03-18

-- ============================================================================
-- 1. businesses extensions
-- ============================================================================

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS markets text[] NOT NULL DEFAULT ARRAY['US'];

COMMENT ON COLUMN public.businesses.currency IS 'Business operating/reporting currency used for CAPI values and portfolio planning.';
COMMENT ON COLUMN public.businesses.markets IS 'Primary target markets for this business, stored as ISO-like country codes such as AU, US, GB.';

-- ============================================================================
-- 2. capi_configs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.capi_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  event_mapping jsonb NOT NULL DEFAULT '{
    "lead": {"meta_event": "Lead", "value": 0},
    "marketingqualifiedlead": {"meta_event": "Lead", "value": 0},
    "salesqualifiedlead": {"meta_event": "Contact", "value": 0},
    "opportunity": {"meta_event": "InitiateCheckout", "value": 0},
    "customer": {"meta_event": "Purchase", "value": 0}
  }'::jsonb,
  currency text NOT NULL DEFAULT 'USD',
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  crm_source text NOT NULL DEFAULT 'hubspot',
  optimise_for text NOT NULL DEFAULT 'lead',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capi_configs_event_mapping_object CHECK (jsonb_typeof(event_mapping) = 'object'),
  CONSTRAINT capi_configs_optimise_for_check CHECK (optimise_for IN ('lead', 'sql', 'customer'))
);

CREATE INDEX IF NOT EXISTS idx_capi_configs_user_id ON public.capi_configs(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_capi_configs_webhook_secret ON public.capi_configs(webhook_secret);

COMMENT ON TABLE public.capi_configs IS 'Per-business Conversions API configuration, including CRM stage mappings and webhook auth.';

ALTER TABLE public.capi_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "capi_configs_select_own" ON public.capi_configs;
CREATE POLICY "capi_configs_select_own" ON public.capi_configs
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "capi_configs_insert_own" ON public.capi_configs;
CREATE POLICY "capi_configs_insert_own" ON public.capi_configs
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "capi_configs_update_own" ON public.capi_configs;
CREATE POLICY "capi_configs_update_own" ON public.capi_configs
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "capi_configs_delete_own" ON public.capi_configs;
CREATE POLICY "capi_configs_delete_own" ON public.capi_configs
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS set_capi_configs_updated_at ON public.capi_configs;
CREATE TRIGGER set_capi_configs_updated_at
  BEFORE UPDATE ON public.capi_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.capi_configs (business_id, user_id, currency)
SELECT b.id, b.user_id, COALESCE(NULLIF(b.currency, ''), 'USD')
FROM public.businesses b
ON CONFLICT (business_id) DO NOTHING;

-- ============================================================================
-- 3. capi_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.capi_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  crm_source text NOT NULL DEFAULT 'hubspot',
  source_stage text,
  meta_event_name text,
  event_time timestamptz NOT NULL DEFAULT now(),
  hubspot_contact_id text,
  meta_event_id text,
  match_quality text,
  status text NOT NULL DEFAULT 'received',
  meta_response jsonb,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capi_events_business_id ON public.capi_events(business_id);
CREATE INDEX IF NOT EXISTS idx_capi_events_user_id ON public.capi_events(user_id);
CREATE INDEX IF NOT EXISTS idx_capi_events_campaign_id ON public.capi_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_capi_events_lead_id ON public.capi_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_capi_events_created_at ON public.capi_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capi_events_source_stage ON public.capi_events(source_stage);
CREATE INDEX IF NOT EXISTS idx_capi_events_status ON public.capi_events(status);
CREATE INDEX IF NOT EXISTS idx_capi_events_is_test ON public.capi_events(is_test);

COMMENT ON TABLE public.capi_events IS 'Per-business CAPI event log including attribution status, downstream stage, and Meta delivery response.';

ALTER TABLE public.capi_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "capi_events_select_own" ON public.capi_events;
CREATE POLICY "capi_events_select_own" ON public.capi_events
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "capi_events_insert_own" ON public.capi_events;
CREATE POLICY "capi_events_insert_own" ON public.capi_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "capi_events_update_own" ON public.capi_events;
CREATE POLICY "capi_events_update_own" ON public.capi_events
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 4. portfolio_templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.portfolio_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  business_type text NOT NULL UNIQUE,
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_templates_tiers_array CHECK (jsonb_typeof(tiers) = 'array')
);

COMMENT ON TABLE public.portfolio_templates IS 'Shared system-level portfolio templates. Each business copies a template into its own portfolio row.';

ALTER TABLE public.portfolio_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolio_templates_select_authenticated" ON public.portfolio_templates;
CREATE POLICY "portfolio_templates_select_authenticated" ON public.portfolio_templates
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.portfolio_templates (name, description, business_type, tiers, is_system)
VALUES
(
  'SaaS / B2B',
  'Optimised for software and subscription businesses with longer sales cycles.',
  'saas',
  '[
    {"tier": "prospecting_broad", "budget_pct": 40, "target_cpa_multiplier": 1.1, "description": "Broad or Advantage+ targeting"},
    {"tier": "prospecting_lal", "budget_pct": 30, "target_cpa_multiplier": 0.9, "description": "Lookalike audiences from customers or SQLs"},
    {"tier": "retargeting", "budget_pct": 20, "target_cpa_multiplier": 0.6, "description": "Website visitors and engaged leads"},
    {"tier": "reactivation", "budget_pct": 10, "target_cpa_multiplier": 0.8, "description": "Paused or churned customers"}
  ]'::jsonb,
  true
),
(
  'Local Services',
  'Optimised for local service businesses such as trades, medical, and legal.',
  'local_services',
  '[
    {"tier": "prospecting_broad", "budget_pct": 50, "target_cpa_multiplier": 1.0, "description": "Broad local targeting"},
    {"tier": "prospecting_lal", "budget_pct": 25, "target_cpa_multiplier": 0.8, "description": "Lookalike audiences from booked customers"},
    {"tier": "retargeting", "budget_pct": 25, "target_cpa_multiplier": 0.5, "description": "Website visitors and form abandoners"}
  ]'::jsonb,
  true
),
(
  'Ecommerce',
  'Optimised for online stores with direct purchase conversion.',
  'ecommerce',
  '[
    {"tier": "prospecting_broad", "budget_pct": 35, "target_cpa_multiplier": 1.2, "description": "Broad and interest targeting"},
    {"tier": "prospecting_lal", "budget_pct": 25, "target_cpa_multiplier": 0.9, "description": "Lookalikes from purchasers"},
    {"tier": "retargeting", "budget_pct": 30, "target_cpa_multiplier": 0.5, "description": "Cart abandoners and product viewers"},
    {"tier": "reactivation", "budget_pct": 10, "target_cpa_multiplier": 0.7, "description": "Past purchasers and lapsed customers"}
  ]'::jsonb,
  true
),
(
  'Custom',
  'Start from scratch with a custom tier configuration.',
  'custom',
  '[]'::jsonb,
  true
)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    business_type = EXCLUDED.business_type,
    tiers = EXCLUDED.tiers,
    is_system = EXCLUDED.is_system;

-- ============================================================================
-- 5. audience_portfolios + audience_tier_campaigns
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audience_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.portfolio_templates(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'Audience Portfolio',
  total_daily_budget_cents integer NOT NULL DEFAULT 5000,
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audience_portfolios_tiers_array CHECK (jsonb_typeof(tiers) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_audience_portfolios_business_id ON public.audience_portfolios(business_id);
CREATE INDEX IF NOT EXISTS idx_audience_portfolios_user_id ON public.audience_portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_audience_portfolios_template_id ON public.audience_portfolios(template_id);

ALTER TABLE public.audience_portfolios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audience_portfolios_select_own" ON public.audience_portfolios;
CREATE POLICY "audience_portfolios_select_own" ON public.audience_portfolios
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "audience_portfolios_insert_own" ON public.audience_portfolios;
CREATE POLICY "audience_portfolios_insert_own" ON public.audience_portfolios
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "audience_portfolios_update_own" ON public.audience_portfolios;
CREATE POLICY "audience_portfolios_update_own" ON public.audience_portfolios
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "audience_portfolios_delete_own" ON public.audience_portfolios;
CREATE POLICY "audience_portfolios_delete_own" ON public.audience_portfolios
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS set_audience_portfolios_updated_at ON public.audience_portfolios;
CREATE TRIGGER set_audience_portfolios_updated_at
  BEFORE UPDATE ON public.audience_portfolios
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.audience_tier_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.audience_portfolios(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  meta_campaign_id text,
  meta_adset_id text,
  meta_audience_id text,
  daily_budget_cents integer,
  status text NOT NULL DEFAULT 'draft',
  performance_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audience_tier_campaigns_portfolio_id ON public.audience_tier_campaigns(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_audience_tier_campaigns_business_id ON public.audience_tier_campaigns(business_id);
CREATE INDEX IF NOT EXISTS idx_audience_tier_campaigns_user_id ON public.audience_tier_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_audience_tier_campaigns_tier ON public.audience_tier_campaigns(tier);
CREATE INDEX IF NOT EXISTS idx_audience_tier_campaigns_campaign_id ON public.audience_tier_campaigns(campaign_id);

ALTER TABLE public.audience_tier_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audience_tier_campaigns_select_own" ON public.audience_tier_campaigns;
CREATE POLICY "audience_tier_campaigns_select_own" ON public.audience_tier_campaigns
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "audience_tier_campaigns_insert_own" ON public.audience_tier_campaigns;
CREATE POLICY "audience_tier_campaigns_insert_own" ON public.audience_tier_campaigns
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "audience_tier_campaigns_update_own" ON public.audience_tier_campaigns;
CREATE POLICY "audience_tier_campaigns_update_own" ON public.audience_tier_campaigns
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "audience_tier_campaigns_delete_own" ON public.audience_tier_campaigns;
CREATE POLICY "audience_tier_campaigns_delete_own" ON public.audience_tier_campaigns
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS set_audience_tier_campaigns_updated_at ON public.audience_tier_campaigns;
CREATE TRIGGER set_audience_tier_campaigns_updated_at
  BEFORE UPDATE ON public.audience_tier_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 6. autonomous_policies extensions
-- ============================================================================

ALTER TABLE public.autonomous_policies
  ADD COLUMN IF NOT EXISTS target_cpa_cents integer,
  ADD COLUMN IF NOT EXISTS optimise_for text NOT NULL DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS capi_lookback_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS min_spend_before_evaluation_cents integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS evaluation_frequency_hours integer NOT NULL DEFAULT 4;

UPDATE public.autonomous_policies
SET target_cpa_cents = ROUND(target_cpa * 100)::integer
WHERE target_cpa_cents IS NULL
  AND target_cpa IS NOT NULL;

ALTER TABLE public.autonomous_policies
  ALTER COLUMN target_cpa_cents SET DEFAULT 5000;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'autonomous_policies_optimise_for_check'
      AND conrelid = 'public.autonomous_policies'::regclass
  ) THEN
    ALTER TABLE public.autonomous_policies
      ADD CONSTRAINT autonomous_policies_optimise_for_check
      CHECK (optimise_for IN ('lead', 'sql', 'customer'));
  END IF;
END $$;

COMMENT ON COLUMN public.autonomous_policies.target_cpa_cents IS 'Preferred target CPA storage in integer cents.';
COMMENT ON COLUMN public.autonomous_policies.target_cpa IS 'Legacy target CPA value in dollars kept for backward compatibility.';
COMMENT ON COLUMN public.autonomous_policies.evaluation_frequency_hours IS 'How often the autonomous loop should evaluate this business.';

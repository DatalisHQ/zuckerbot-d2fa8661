ALTER TABLE public.api_campaigns
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_version text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS context jsonb,
  ADD COLUMN IF NOT EXISTS goals jsonb,
  ADD COLUMN IF NOT EXISTS workflow_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_strategy jsonb,
  ADD COLUMN IF NOT EXISTS strategy_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS creative_handoff jsonb,
  ADD COLUMN IF NOT EXISTS creative_status text NOT NULL DEFAULT 'not_requested';

CREATE INDEX IF NOT EXISTS idx_api_campaigns_business_id ON public.api_campaigns(business_id);
CREATE INDEX IF NOT EXISTS idx_api_campaigns_version ON public.api_campaigns(campaign_version);

CREATE TABLE IF NOT EXISTS public.api_campaign_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_campaign_id text NOT NULL REFERENCES public.api_campaigns(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_name text NOT NULL,
  angle_name text,
  variant_index integer NOT NULL DEFAULT 0,
  asset_url text NOT NULL,
  asset_type text NOT NULL DEFAULT 'image',
  headline text,
  body text,
  cta text,
  link_url text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  meta_adcreative_id text,
  meta_image_hash text,
  meta_video_id text,
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_campaign_creatives_campaign ON public.api_campaign_creatives(api_campaign_id);
CREATE INDEX IF NOT EXISTS idx_api_campaign_creatives_business ON public.api_campaign_creatives(business_id);
CREATE INDEX IF NOT EXISTS idx_api_campaign_creatives_status ON public.api_campaign_creatives(status);

ALTER TABLE public.api_campaign_creatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on api_campaign_creatives" ON public.api_campaign_creatives;
CREATE POLICY "Service role full access on api_campaign_creatives"
  ON public.api_campaign_creatives
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS set_api_campaign_creatives_updated_at ON public.api_campaign_creatives;
CREATE TRIGGER set_api_campaign_creatives_updated_at
  BEFORE UPDATE ON public.api_campaign_creatives
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.capi_events
  ADD COLUMN IF NOT EXISTS hashed_user_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS crm_attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.facebook_audiences
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seed_source_stage text,
  ADD COLUMN IF NOT EXISTS lookback_days integer,
  ADD COLUMN IF NOT EXISTS lookalike_pct numeric,
  ADD COLUMN IF NOT EXISTS seed_audience_id text,
  ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_status text;

CREATE INDEX IF NOT EXISTS idx_facebook_audiences_business_id ON public.facebook_audiences(business_id);
CREATE INDEX IF NOT EXISTS idx_facebook_audiences_seed_stage ON public.facebook_audiences(seed_source_stage);

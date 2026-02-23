-- api_campaigns — stores draft campaigns created via the public API
-- These are separate from the main campaigns table because:
-- 1. They don't require a business_id (API consumers don't have business profiles)
-- 2. They store the full strategy/targeting/variants as JSONB (richer data)
-- 3. They're keyed by api_key_id for multi-tenant isolation

CREATE TABLE IF NOT EXISTS api_campaigns (
  id text PRIMARY KEY,                        -- e.g. "camp_m4k7x2abc123"
  api_key_id uuid NOT NULL,                   -- references api_keys(id)
  user_id uuid NOT NULL,                      -- references auth.users(id)
  status text NOT NULL DEFAULT 'draft',       -- draft | active | paused | deleted
  url text,                                   -- business website URL
  business_name text,
  business_type text,
  strategy jsonb,                             -- full strategy object
  targeting jsonb,                            -- targeting configuration
  variants jsonb,                             -- ad variants array
  roadmap jsonb,                              -- 30/60/90 day roadmap
  objective text DEFAULT 'leads',
  daily_budget_cents integer DEFAULT 2000,
  meta_access_token text,                     -- optional stored Meta token
  meta_campaign_id text,                      -- set after launch
  meta_adset_id text,                         -- set after launch
  meta_ad_id text,                            -- set after launch
  meta_leadform_id text,                      -- set after launch
  launched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_api_campaigns_api_key ON api_campaigns(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_campaigns_user ON api_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_api_campaigns_meta ON api_campaigns(meta_campaign_id) WHERE meta_campaign_id IS NOT NULL;

-- RLS: API key owners can see their own campaigns
ALTER TABLE api_campaigns ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (the API layer uses service role)
-- No user-facing RLS policies needed since all access goes through the API layer
CREATE POLICY "Service role full access on api_campaigns"
  ON api_campaigns
  FOR ALL
  USING (true)
  WITH CHECK (true);

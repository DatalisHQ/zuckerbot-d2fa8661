-- ============================================================================
-- Zuckerbot v2 Schema Migration
-- Created: 2026-02-10
-- Description: Fresh v2 schema for the tradie-focused Facebook ad platform.
--              Creates businesses, campaigns, leads, and sms_log tables with
--              RLS policies, indexes, and trigger functions.
-- ============================================================================

-- ============================================================================
-- 1. UTILITY FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp on row modification
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Increment leads_count on campaigns when a new lead is inserted
CREATE OR REPLACE FUNCTION public.increment_campaign_leads_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.campaigns
  SET leads_count = leads_count + 1
  WHERE id = NEW.campaign_id;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- ---------------------------------------------------------------------------
-- businesses — one per user, stores trade info, location, and FB credentials
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.businesses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  trade           text        NOT NULL,       -- e.g. 'plumber', 'electrician', 'landscaper'
  suburb          text        NOT NULL,
  postcode        text        NOT NULL,
  state           text        NOT NULL,       -- 'QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT'
  lat             double precision,
  lng             double precision,
  phone           text        NOT NULL,
  facebook_page_id        text,
  facebook_ad_account_id  text,
  facebook_access_token   text,               -- encrypted at application level
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.businesses IS 'Business profile — one per authenticated user.';
COMMENT ON COLUMN public.businesses.trade IS 'Primary trade type, e.g. plumber, electrician, landscaper.';
COMMENT ON COLUMN public.businesses.facebook_access_token IS 'Stored encrypted at application level — never expose raw.';

-- ---------------------------------------------------------------------------
-- campaigns — Facebook ad campaigns created by a business
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  status            text        NOT NULL DEFAULT 'draft',   -- draft | active | paused | ended
  daily_budget_cents integer    NOT NULL DEFAULT 1500,       -- $15/day default
  radius_km         integer     NOT NULL DEFAULT 25,
  ad_copy           text,
  ad_headline       text,
  ad_image_url      text,
  meta_campaign_id  text,
  meta_adset_id     text,
  meta_ad_id        text,
  meta_leadform_id  text,
  leads_count       integer     NOT NULL DEFAULT 0,
  spend_cents       integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  launched_at       timestamptz
);

COMMENT ON TABLE public.campaigns IS 'Facebook ad campaigns linked to a business.';
COMMENT ON COLUMN public.campaigns.daily_budget_cents IS 'Daily spend budget in cents AUD. Default $15.';

-- ---------------------------------------------------------------------------
-- leads — inbound leads captured from Facebook lead forms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  business_id   uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name          text,
  phone         text,
  email         text,
  suburb        text,
  status        text        NOT NULL DEFAULT 'new',   -- new | contacted | won | lost
  meta_lead_id  text,
  sms_sent      boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leads IS 'Leads captured from Facebook lead-gen campaigns.';

-- ---------------------------------------------------------------------------
-- sms_log — outbound SMS messages sent to leads via Twilio
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  business_id   uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  to_phone      text        NOT NULL,
  message       text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending',  -- pending | sent | delivered | failed
  twilio_sid    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sms_log IS 'Log of outbound SMS messages sent to leads.';

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

-- businesses
CREATE INDEX IF NOT EXISTS idx_businesses_user_id   ON public.businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_trade     ON public.businesses(trade);
CREATE INDEX IF NOT EXISTS idx_businesses_state     ON public.businesses(state);

-- campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_business_id ON public.campaigns(business_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status      ON public.campaigns(status);

-- leads
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id     ON public.leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_business_id     ON public.leads(business_id);
CREATE INDEX IF NOT EXISTS idx_leads_status          ON public.leads(status);

-- sms_log
CREATE INDEX IF NOT EXISTS idx_sms_log_lead_id       ON public.sms_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_log_business_id   ON public.sms_log(business_id);
CREATE INDEX IF NOT EXISTS idx_sms_log_status        ON public.sms_log(status);

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

-- Auto-update businesses.updated_at on modification
DROP TRIGGER IF EXISTS set_businesses_updated_at ON public.businesses;
CREATE TRIGGER set_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Auto-increment campaigns.leads_count when a lead is inserted
DROP TRIGGER IF EXISTS increment_leads_count_on_insert ON public.leads;
CREATE TRIGGER increment_leads_count_on_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_campaign_leads_count();

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_log    ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- businesses — direct ownership check via user_id = auth.uid()
-- ---------------------------------------------------------------------------

CREATE POLICY "businesses_select_own" ON public.businesses
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "businesses_insert_own" ON public.businesses
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "businesses_update_own" ON public.businesses
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "businesses_delete_own" ON public.businesses
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- campaigns — ownership check via business_id join to businesses
-- ---------------------------------------------------------------------------

CREATE POLICY "campaigns_select_own" ON public.campaigns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = campaigns.business_id
        AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "campaigns_insert_own" ON public.campaigns
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = campaigns.business_id
        AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "campaigns_update_own" ON public.campaigns
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = campaigns.business_id
        AND businesses.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = campaigns.business_id
        AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "campaigns_delete_own" ON public.campaigns
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = campaigns.business_id
        AND businesses.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- leads — ownership check via business_id join to businesses
-- ---------------------------------------------------------------------------

CREATE POLICY "leads_select_own" ON public.leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = leads.business_id
        AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "leads_insert_own" ON public.leads
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = leads.business_id
        AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "leads_update_own" ON public.leads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = leads.business_id
        AND businesses.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = leads.business_id
        AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "leads_delete_own" ON public.leads
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = leads.business_id
        AND businesses.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- sms_log — ownership check via business_id join to businesses
-- ---------------------------------------------------------------------------

CREATE POLICY "sms_log_select_own" ON public.sms_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = sms_log.business_id
        AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "sms_log_insert_own" ON public.sms_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = sms_log.business_id
        AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "sms_log_update_own" ON public.sms_log
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = sms_log.business_id
        AND businesses.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = sms_log.business_id
        AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "sms_log_delete_own" ON public.sms_log
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE businesses.id = sms_log.business_id
        AND businesses.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. STORAGE BUCKET for business photos (used in onboarding)
-- ============================================================================

-- Create the business-photos bucket if it doesn't exist.
-- Note: Supabase storage bucket creation via SQL requires the storage schema.
-- This is idempotent — INSERT ... ON CONFLICT DO NOTHING.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-photos',
  'business-photos',
  true,
  5242880,  -- 5MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can upload to their own folder (user_id/*)
CREATE POLICY "business_photos_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'business-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: anyone can view business photos (they're public for ads)
CREATE POLICY "business_photos_public_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'business-photos'
  );

-- Storage RLS: users can delete their own photos
CREATE POLICY "business_photos_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'business-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- Done! 🇦🇺
-- ============================================================================

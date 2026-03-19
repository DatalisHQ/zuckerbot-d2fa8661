ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS ad_factory_webhook_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ad_factory_callback_base_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ad_factory_font_preset text DEFAULT 'impact_blue',
  ADD COLUMN IF NOT EXISTS ad_factory_default_market text DEFAULT 'AU';

ALTER TABLE public.api_campaign_creatives
  ALTER COLUMN tier_name DROP NOT NULL;

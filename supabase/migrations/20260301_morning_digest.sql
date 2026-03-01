ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS telegram_chat_id text;

ALTER TABLE public.automation_config
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digest_hour integer NOT NULL DEFAULT 7
    CHECK (digest_hour >= 0 AND digest_hour <= 23),
  ADD COLUMN IF NOT EXISTS digest_tz text NOT NULL DEFAULT 'Australia/Sydney';

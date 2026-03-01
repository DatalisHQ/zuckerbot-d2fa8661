-- Link API keys to businesses so stored Meta credentials can be used at launch time
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_business_id ON public.api_keys(business_id)
  WHERE business_id IS NOT NULL;

-- For existing users: auto-link api_keys to businesses via shared user_id
UPDATE public.api_keys ak
SET business_id = b.id
FROM public.businesses b
WHERE ak.user_id = b.user_id
  AND ak.business_id IS NULL;

-- Notification preferences on businesses
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT false;

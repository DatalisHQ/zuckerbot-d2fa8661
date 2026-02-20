-- Fix onboarding flow: allow NULL location fields for online businesses
-- and add preview_ads column for Try It Now data passthrough

ALTER TABLE public.businesses ALTER COLUMN suburb DROP NOT NULL;
ALTER TABLE public.businesses ALTER COLUMN postcode DROP NOT NULL;
ALTER TABLE public.businesses ALTER COLUMN state DROP NOT NULL;

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS preview_ads jsonb;

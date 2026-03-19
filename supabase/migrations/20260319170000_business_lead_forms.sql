ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS meta_leadgen_form_id text;

COMMENT ON COLUMN public.businesses.meta_leadgen_form_id IS 'Selected Meta Instant Form ID used for lead generation launches.';

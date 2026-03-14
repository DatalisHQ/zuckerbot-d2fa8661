ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS meta_pixel_id text;

COMMENT ON COLUMN public.businesses.meta_pixel_id IS 'User Meta Pixel ID for conversion tracking and CAPI events.';

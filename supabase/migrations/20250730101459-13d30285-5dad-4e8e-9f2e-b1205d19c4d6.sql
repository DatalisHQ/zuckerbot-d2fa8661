-- Add fields to support multiple businesses and active business selection
ALTER TABLE public.brand_analysis ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
ALTER TABLE public.brand_analysis ADD COLUMN IF NOT EXISTS business_display_name TEXT;

-- Create index for performance when querying active businesses
CREATE INDEX IF NOT EXISTS idx_brand_analysis_user_active ON public.brand_analysis(user_id, is_active);

-- Update existing records to have a display name if missing
UPDATE public.brand_analysis 
SET business_display_name = COALESCE(brand_name, 'Business ' || SUBSTRING(id::text, 1, 8))
WHERE business_display_name IS NULL;

-- Set the most recent brand_analysis as active for each user
WITH latest_analysis AS (
  SELECT DISTINCT ON (user_id) id, user_id
  FROM public.brand_analysis
  ORDER BY user_id, created_at DESC
)
UPDATE public.brand_analysis 
SET is_active = true
WHERE id IN (SELECT id FROM latest_analysis);

-- Now create the unique constraint for one active business per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_analysis_one_active_per_user 
ON public.brand_analysis(user_id) 
WHERE is_active = true;
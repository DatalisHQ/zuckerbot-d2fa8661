-- Add fields to support multiple businesses and active business selection
ALTER TABLE public.brand_analysis ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.brand_analysis ADD COLUMN IF NOT EXISTS business_display_name TEXT;

-- Create index for performance when querying active businesses
CREATE INDEX IF NOT EXISTS idx_brand_analysis_user_active ON public.brand_analysis(user_id, is_active);

-- Update existing records to have a display name if missing
UPDATE public.brand_analysis 
SET business_display_name = COALESCE(brand_name, 'Business ' || SUBSTRING(id::text, 1, 8))
WHERE business_display_name IS NULL;

-- Add a constraint to ensure only one active business per user for now
-- (we'll remove this later if needed for multiple active businesses)
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_analysis_one_active_per_user 
ON public.brand_analysis(user_id) 
WHERE is_active = true;
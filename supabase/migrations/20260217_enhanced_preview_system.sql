-- Enhanced Preview System Migration
-- Adds brand analysis support and enhanced audit capabilities

-- Add brand_analysis column to preview_logs
ALTER TABLE preview_logs 
ADD COLUMN brand_analysis JSONB DEFAULT NULL;

-- Add comment for the new column
COMMENT ON COLUMN preview_logs.brand_analysis IS 'Stores detailed brand analysis from brand-analysis function';

-- Create index for querying by business category
CREATE INDEX IF NOT EXISTS idx_preview_logs_brand_analysis_category 
ON preview_logs USING GIN ((brand_analysis->'business_category'));

-- Create index for querying by business type
CREATE INDEX IF NOT EXISTS idx_preview_logs_brand_analysis_type 
ON preview_logs USING GIN ((brand_analysis->'business_type'));

-- Create storage bucket for generated ads (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-ads', 
  'generated-ads', 
  true, 
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for generated-ads bucket
INSERT INTO storage.policies (id, bucket_id, name, definition, check_definition)
VALUES (
  'generated-ads-select',
  'generated-ads',
  'Public read access for generated ads',
  '(true)',
  '(true)'
)
ON CONFLICT (id) DO NOTHING;

-- Policy for uploading (service role only)
INSERT INTO storage.policies (id, bucket_id, name, definition, check_definition)
VALUES (
  'generated-ads-insert',
  'generated-ads', 
  'Service role can upload generated ads',
  '(auth.role() = ''service_role'')',
  '(auth.role() = ''service_role'')'
)
ON CONFLICT (id) DO NOTHING;

-- Create a view for enhanced analytics
CREATE OR REPLACE VIEW enhanced_preview_analytics AS
SELECT 
  id,
  url,
  business_name,
  created_at,
  success,
  has_images,
  image_count,
  brand_analysis->>'business_type' as business_type,
  brand_analysis->>'business_category' as business_category,
  brand_analysis->'product_focus' as product_focus,
  brand_analysis->>'target_audience' as target_audience,
  brand_analysis->>'brand_aesthetic' as brand_aesthetic,
  brand_analysis->'extracted_assets' as extracted_assets,
  array_length(saved_image_urls, 1) as saved_image_count,
  CASE 
    WHEN brand_analysis IS NOT NULL THEN 'enhanced'
    ELSE 'legacy'
  END as analysis_version
FROM preview_logs
WHERE success = true
ORDER BY created_at DESC;

-- Grant access to the view
GRANT SELECT ON enhanced_preview_analytics TO authenticated, anon;

-- Add helpful comments
COMMENT ON VIEW enhanced_preview_analytics IS 'Analytics view for enhanced preview system with brand analysis';

-- Create function to get brand analysis stats
CREATE OR REPLACE FUNCTION get_brand_analysis_stats()
RETURNS TABLE (
  business_category text,
  count bigint,
  avg_images numeric,
  success_rate numeric
) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    brand_analysis->>'business_category' as business_category,
    COUNT(*) as count,
    AVG(image_count) as avg_images,
    (COUNT(CASE WHEN has_images THEN 1 END) * 100.0 / COUNT(*)) as success_rate
  FROM preview_logs 
  WHERE brand_analysis IS NOT NULL 
    AND created_at > CURRENT_DATE - INTERVAL '30 days'
  GROUP BY brand_analysis->>'business_category'
  ORDER BY count DESC;
$$;

-- Grant execution permission
GRANT EXECUTE ON FUNCTION get_brand_analysis_stats() TO authenticated, anon;
-- Add fields to preview_logs for auditing generated ads

ALTER TABLE preview_logs 
ADD COLUMN saved_image_urls TEXT[],
ADD COLUMN generated_ads JSONB;

-- Add comment
COMMENT ON COLUMN preview_logs.saved_image_urls IS 'URLs of generated ad images saved to storage';
COMMENT ON COLUMN preview_logs.generated_ads IS 'Complete generated ad data for auditing';

-- Create storage bucket for ad previews if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-previews', 'ad-previews', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policy for public read access
CREATE POLICY "Public read access for ad previews"
ON storage.objects FOR SELECT
USING (bucket_id = 'ad-previews');
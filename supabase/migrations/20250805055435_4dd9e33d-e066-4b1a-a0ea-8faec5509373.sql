-- Enhance audience and campaign data structures for complete workflow
-- Add columns for detailed audience targeting and asset storage

-- Update ad_campaigns table for comprehensive workflow support
ALTER TABLE ad_campaigns 
ADD COLUMN IF NOT EXISTS selected_audiences jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS creative_assets jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS generated_ad_copy jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS facebook_campaign_data jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS launch_status text DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS ad_account_id text;

-- Create audience_segments table for persistent audience management
CREATE TABLE IF NOT EXISTS audience_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  segment_name text NOT NULL,
  segment_criteria text NOT NULL,
  targeting_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  facebook_audience_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS for audience_segments
ALTER TABLE audience_segments ENABLE ROW LEVEL SECURITY;

-- Create policies for audience_segments
CREATE POLICY "Users can create their own audience segments" 
ON audience_segments FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own audience segments" 
ON audience_segments FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own audience segments" 
ON audience_segments FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own audience segments" 
ON audience_segments FOR DELETE 
USING (auth.uid() = user_id);

-- Create campaign_ad_sets table for ad set management
CREATE TABLE IF NOT EXISTS campaign_ad_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  ad_set_name text NOT NULL,
  audience_segment_id uuid,
  targeting_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  budget_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  placement_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  facebook_adset_id text,
  status text DEFAULT 'draft',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS for campaign_ad_sets
ALTER TABLE campaign_ad_sets ENABLE ROW LEVEL SECURITY;

-- Create policies for campaign_ad_sets
CREATE POLICY "Users can create their own campaign ad sets" 
ON campaign_ad_sets FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own campaign ad sets" 
ON campaign_ad_sets FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaign ad sets" 
ON campaign_ad_sets FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaign ad sets" 
ON campaign_ad_sets FOR DELETE 
USING (auth.uid() = user_id);

-- Create campaign_ads table for individual ad management
CREATE TABLE IF NOT EXISTS campaign_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  ad_set_id uuid,
  ad_name text NOT NULL,
  creative_asset_url text NOT NULL,
  ad_copy_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  facebook_ad_id text,
  status text DEFAULT 'draft',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS for campaign_ads
ALTER TABLE campaign_ads ENABLE ROW LEVEL SECURITY;

-- Create policies for campaign_ads
CREATE POLICY "Users can create their own campaign ads" 
ON campaign_ads FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own campaign ads" 
ON campaign_ads FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaign ads" 
ON campaign_ads FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaign ads" 
ON campaign_ads FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_audience_segments_campaign_id ON audience_segments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_ad_sets_campaign_id ON campaign_ad_sets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_ads_campaign_id ON campaign_ads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_ads_ad_set_id ON campaign_ads(ad_set_id);

-- Add triggers for updated_at
CREATE TRIGGER update_audience_segments_updated_at
  BEFORE UPDATE ON audience_segments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_ad_sets_updated_at
  BEFORE UPDATE ON campaign_ad_sets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_ads_updated_at
  BEFORE UPDATE ON campaign_ads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
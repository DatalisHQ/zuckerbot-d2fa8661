-- Expand competitor_ad_insights schema for richer ad intelligence
ALTER TABLE public.competitor_ad_insights
  ADD COLUMN IF NOT EXISTS engagement JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS creative_breakdown JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS spend_tier_range int4range,
  ADD COLUMN IF NOT EXISTS impression_tier_range int4range,
  ADD COLUMN IF NOT EXISTS analysis_window_daterange daterange;

-- Add generated metrics materialization table to simplify querying ads_data
-- This is optional; if needed we can normalize later. For now, keep ads_data enriched in-place.



-- Add window column to fb_metrics_cache if it doesn't exist
ALTER TABLE fb_metrics_cache ADD COLUMN IF NOT EXISTS window text;

-- Create index for multi-window queries
CREATE INDEX IF NOT EXISTS idx_fb_metrics_cache_key
  ON fb_metrics_cache (ad_account_id, scope, entity_id, window, cache_key);
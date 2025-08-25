-- Add time_window column to fb_metrics_cache if it doesn't exist
ALTER TABLE fb_metrics_cache ADD COLUMN IF NOT EXISTS time_window text;

-- Create index for multi-window queries
CREATE INDEX IF NOT EXISTS idx_fb_metrics_cache_multi_window
  ON fb_metrics_cache (ad_account_id, cache_key, time_window);
-- Create competitor_analysis_history table to store time-series snapshots
CREATE TABLE IF NOT EXISTS public.competitor_analysis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  competitor_list_id UUID NOT NULL,
  competitor_name TEXT NOT NULL,
  snapshot_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ads_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  insights JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.competitor_analysis_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own competitor analysis history"
ON public.competitor_analysis_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own competitor analysis history"
ON public.competitor_analysis_history
FOR SELECT
USING (auth.uid() = user_id);

-- Helpful index for querying recent snapshots
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_history_list_time
ON public.competitor_analysis_history (competitor_list_id, snapshot_at DESC);



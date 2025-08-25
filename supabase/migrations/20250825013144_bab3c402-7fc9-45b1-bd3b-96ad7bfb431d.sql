-- Create table for queued actions from dashboard copilot
CREATE TABLE public.queued_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('increase_budget', 'decrease_budget', 'reallocate_budget', 'pause', 'swap_creative', 'change_placements')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('campaign', 'adset', 'ad')),
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  why TEXT NOT NULL,
  impact_score NUMERIC NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  creative_suggestions JSONB,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.queued_actions ENABLE ROW LEVEL SECURITY;

-- Create policies for queued_actions
CREATE POLICY "Users can view their own queued actions" 
ON public.queued_actions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own queued actions" 
ON public.queued_actions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own queued actions" 
ON public.queued_actions 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own queued actions" 
ON public.queued_actions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create table for Facebook metrics cache
CREATE TABLE public.fb_metrics_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ad_account_id TEXT NOT NULL,
  cache_key TEXT NOT NULL, -- e.g., "7d_summary", "30d_summary"
  metrics_data JSONB NOT NULL DEFAULT '{}',
  entity_metrics JSONB NOT NULL DEFAULT '{}', -- campaign/adset/ad level metrics
  cached_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '4 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, ad_account_id, cache_key)
);

-- Enable RLS
ALTER TABLE public.fb_metrics_cache ENABLE ROW LEVEL SECURITY;

-- Create policies for fb_metrics_cache
CREATE POLICY "Users can view their own metrics cache" 
ON public.fb_metrics_cache 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own metrics cache" 
ON public.fb_metrics_cache 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own metrics cache" 
ON public.fb_metrics_cache 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for updated_at timestamps
CREATE TRIGGER update_queued_actions_updated_at
BEFORE UPDATE ON public.queued_actions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fb_metrics_cache_updated_at
BEFORE UPDATE ON public.fb_metrics_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_queued_actions_user_status ON public.queued_actions(user_id, status);
CREATE INDEX idx_fb_metrics_cache_user_account ON public.fb_metrics_cache(user_id, ad_account_id);
CREATE INDEX idx_fb_metrics_cache_expires ON public.fb_metrics_cache(expires_at);
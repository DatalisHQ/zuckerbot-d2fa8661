-- Create tables for storing the 3-agent ad creation pipeline results

-- Table for storing ad creation campaigns
CREATE TABLE public.ad_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_name TEXT NOT NULL DEFAULT 'Untitled Campaign',
  brand_analysis JSONB,
  framework_selection JSONB,
  generated_ads JSONB,
  pipeline_status TEXT NOT NULL DEFAULT 'pending',
  current_step INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own ad campaigns" 
ON public.ad_campaigns 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own ad campaigns" 
ON public.ad_campaigns 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ad campaigns" 
ON public.ad_campaigns 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ad campaigns" 
ON public.ad_campaigns 
FOR DELETE 
USING (auth.uid() = user_id);

-- Table for storing individual ad sets from the pipeline
CREATE TABLE public.ad_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  set_name TEXT NOT NULL,
  primary_text TEXT NOT NULL,
  headline TEXT NOT NULL,
  call_to_action TEXT NOT NULL,
  creative_concept TEXT,
  framework_used TEXT,
  performance_score NUMERIC DEFAULT 0,
  is_saved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ad_sets ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own ad sets" 
ON public.ad_sets 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own ad sets" 
ON public.ad_sets 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ad sets" 
ON public.ad_sets 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ad sets" 
ON public.ad_sets 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_ad_campaigns_updated_at
BEFORE UPDATE ON public.ad_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ad_sets_updated_at
BEFORE UPDATE ON public.ad_sets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
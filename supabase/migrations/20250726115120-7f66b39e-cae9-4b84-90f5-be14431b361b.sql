-- Add competitor_profiles table for website analysis results
CREATE TABLE public.competitor_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  competitor_list_id UUID NOT NULL,
  competitor_name TEXT NOT NULL,
  competitor_url TEXT,
  scraped_content TEXT,
  niche TEXT,
  audience TEXT,
  value_props JSONB DEFAULT '[]'::jsonb,
  tone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add competitor_ad_insights table for Meta Ad Library analysis
CREATE TABLE public.competitor_ad_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  competitor_list_id UUID NOT NULL,
  competitor_name TEXT NOT NULL,
  ads_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  hooks JSONB DEFAULT '[]'::jsonb,
  ctas JSONB DEFAULT '[]'::jsonb,
  creative_trends JSONB DEFAULT '[]'::jsonb,
  total_ads_found INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_ad_insights ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for competitor_profiles
CREATE POLICY "Users can create their own competitor profiles" 
ON public.competitor_profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own competitor profiles" 
ON public.competitor_profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own competitor profiles" 
ON public.competitor_profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create RLS policies for competitor_ad_insights
CREATE POLICY "Users can create their own competitor ad insights" 
ON public.competitor_ad_insights 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own competitor ad insights" 
ON public.competitor_ad_insights 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own competitor ad insights" 
ON public.competitor_ad_insights 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Add triggers for automatic timestamp updates
CREATE TRIGGER update_competitor_profiles_updated_at
BEFORE UPDATE ON public.competitor_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_competitor_ad_insights_updated_at
BEFORE UPDATE ON public.competitor_ad_insights
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
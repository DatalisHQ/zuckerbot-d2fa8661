-- Create competitor intelligence table
CREATE TABLE public.competitor_intelligence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  competitor_discovery_id UUID REFERENCES public.competitor_discovery(id),
  competitor_name TEXT NOT NULL,
  competitor_url TEXT NOT NULL,
  detailed_analysis JSONB,
  social_presence JSONB,
  feature_matrix JSONB,
  pricing_info JSONB,
  market_position JSONB,
  sentiment_analysis JSONB,
  analysis_status TEXT DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitor_intelligence ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own competitor intelligence" 
ON public.competitor_intelligence 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own competitor intelligence" 
ON public.competitor_intelligence 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own competitor intelligence" 
ON public.competitor_intelligence 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_competitor_intelligence_updated_at
    BEFORE UPDATE ON public.competitor_intelligence
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
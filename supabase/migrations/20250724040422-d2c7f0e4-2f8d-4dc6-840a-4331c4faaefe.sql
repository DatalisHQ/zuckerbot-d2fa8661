-- Create competitor discovery table
CREATE TABLE public.competitor_discovery (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  brand_analysis_id UUID REFERENCES public.brand_analysis(id),
  search_query TEXT NOT NULL,
  discovered_competitors JSONB,
  discovery_status TEXT DEFAULT 'pending' CHECK (discovery_status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitor_discovery ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own competitor discovery" 
ON public.competitor_discovery 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own competitor discovery" 
ON public.competitor_discovery 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own competitor discovery" 
ON public.competitor_discovery 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_competitor_discovery_updated_at
    BEFORE UPDATE ON public.competitor_discovery
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
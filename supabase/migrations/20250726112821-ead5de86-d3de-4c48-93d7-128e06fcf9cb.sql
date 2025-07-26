-- Add tables for competitor list and selected angles
CREATE TABLE IF NOT EXISTS public.competitor_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  brand_analysis_id UUID,
  competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
  auto_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitor_lists ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create their own competitor lists" 
ON public.competitor_lists 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own competitor lists" 
ON public.competitor_lists 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own competitor lists" 
ON public.competitor_lists 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create table for selected angles
CREATE TABLE IF NOT EXISTS public.selected_angles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  brand_analysis_id UUID,
  competitor_list_id UUID,
  angle_type TEXT NOT NULL, -- 'competitor-inspired', 'differentiated', 'hybrid', 'custom'
  angle_description TEXT NOT NULL,
  competitor_insights JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.selected_angles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create their own selected angles" 
ON public.selected_angles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own selected angles" 
ON public.selected_angles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own selected angles" 
ON public.selected_angles 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_competitor_lists_updated_at
BEFORE UPDATE ON public.competitor_lists
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_selected_angles_updated_at
BEFORE UPDATE ON public.selected_angles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
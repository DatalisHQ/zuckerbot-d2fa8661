-- Add campaign-specific data fields to support per-campaign workflow data
ALTER TABLE public.ad_campaigns 
ADD COLUMN IF NOT EXISTS competitor_data jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS audience_data jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS brand_data jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS image_data jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS angles_data jsonb DEFAULT '{}';

-- Create table to link Facebook audiences to specific campaigns
CREATE TABLE IF NOT EXISTS public.campaign_facebook_audiences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  facebook_audience_id uuid NOT NULL REFERENCES public.facebook_audiences(id) ON DELETE CASCADE,
  audience_segment_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, facebook_audience_id)
);

-- Enable RLS
ALTER TABLE public.campaign_facebook_audiences ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for campaign_facebook_audiences
CREATE POLICY "Users can create their own campaign audience links"
ON public.campaign_facebook_audiences
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ad_campaigns 
    WHERE id = campaign_facebook_audiences.campaign_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can view their own campaign audience links"
ON public.campaign_facebook_audiences
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.ad_campaigns 
    WHERE id = campaign_facebook_audiences.campaign_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own campaign audience links"
ON public.campaign_facebook_audiences
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.ad_campaigns 
    WHERE id = campaign_facebook_audiences.campaign_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own campaign audience links"
ON public.campaign_facebook_audiences
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.ad_campaigns 
    WHERE id = campaign_facebook_audiences.campaign_id 
    AND user_id = auth.uid()
  )
);

-- Add updated_at trigger
CREATE TRIGGER update_campaign_facebook_audiences_updated_at
BEFORE UPDATE ON public.campaign_facebook_audiences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
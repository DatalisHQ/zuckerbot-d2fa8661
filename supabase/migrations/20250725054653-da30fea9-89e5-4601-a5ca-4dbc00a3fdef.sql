-- Create Facebook Ads campaign data tables

-- Facebook campaigns table
CREATE TABLE public.facebook_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  objective text,
  status text,
  daily_budget numeric,
  lifetime_budget numeric,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  created_time timestamp with time zone,
  updated_time timestamp with time zone,
  raw_data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, campaign_id)
);

-- Facebook ad metrics table  
CREATE TABLE public.facebook_ad_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  campaign_id text,
  adset_id text,
  ad_id text,
  date_start date NOT NULL,
  date_stop date NOT NULL,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  spend numeric DEFAULT 0,
  reach bigint DEFAULT 0,
  frequency numeric DEFAULT 0,
  ctr numeric DEFAULT 0,
  cpc numeric DEFAULT 0,
  cpm numeric DEFAULT 0,
  cpp numeric DEFAULT 0,
  conversions bigint DEFAULT 0,
  conversion_value numeric DEFAULT 0,
  cost_per_conversion numeric DEFAULT 0,
  raw_data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, campaign_id, adset_id, ad_id, date_start, date_stop)
);

-- Facebook audiences table
CREATE TABLE public.facebook_audiences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  audience_id text NOT NULL,
  audience_name text NOT NULL,
  audience_type text, -- saved, custom, lookalike, etc.
  audience_size bigint,
  description text,
  demographics jsonb, -- age, gender, location data
  interests jsonb,
  behaviors jsonb,
  raw_data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, audience_id)
);

-- Facebook ad creatives table
CREATE TABLE public.facebook_ad_creatives (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  creative_id text NOT NULL,
  creative_name text,
  ad_id text,
  title text,
  body text,
  image_url text,
  video_url text,
  call_to_action text,
  link_url text,
  creative_type text, -- image, video, carousel, etc.
  performance_score numeric,
  raw_data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, creative_id)
);

-- Enable RLS on all tables
ALTER TABLE public.facebook_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_ad_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_ad_creatives ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for facebook_campaigns
CREATE POLICY "Users can view their own Facebook campaigns" 
ON public.facebook_campaigns 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own Facebook campaigns" 
ON public.facebook_campaigns 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Facebook campaigns" 
ON public.facebook_campaigns 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create RLS policies for facebook_ad_metrics
CREATE POLICY "Users can view their own Facebook ad metrics" 
ON public.facebook_ad_metrics 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own Facebook ad metrics" 
ON public.facebook_ad_metrics 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Facebook ad metrics" 
ON public.facebook_ad_metrics 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create RLS policies for facebook_audiences
CREATE POLICY "Users can view their own Facebook audiences" 
ON public.facebook_audiences 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own Facebook audiences" 
ON public.facebook_audiences 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Facebook audiences" 
ON public.facebook_audiences 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create RLS policies for facebook_ad_creatives
CREATE POLICY "Users can view their own Facebook ad creatives" 
ON public.facebook_ad_creatives 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own Facebook ad creatives" 
ON public.facebook_ad_creatives 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Facebook ad creatives" 
ON public.facebook_ad_creatives 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_facebook_campaigns_user_id ON public.facebook_campaigns(user_id);
CREATE INDEX idx_facebook_campaigns_campaign_id ON public.facebook_campaigns(campaign_id);
CREATE INDEX idx_facebook_ad_metrics_user_id ON public.facebook_ad_metrics(user_id);
CREATE INDEX idx_facebook_ad_metrics_date_range ON public.facebook_ad_metrics(date_start, date_stop);
CREATE INDEX idx_facebook_audiences_user_id ON public.facebook_audiences(user_id);
CREATE INDEX idx_facebook_ad_creatives_user_id ON public.facebook_ad_creatives(user_id);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_facebook_campaigns_updated_at
BEFORE UPDATE ON public.facebook_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_facebook_ad_metrics_updated_at
BEFORE UPDATE ON public.facebook_ad_metrics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_facebook_audiences_updated_at
BEFORE UPDATE ON public.facebook_audiences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_facebook_ad_creatives_updated_at
BEFORE UPDATE ON public.facebook_ad_creatives
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
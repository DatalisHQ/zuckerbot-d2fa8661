-- Create monitoring configuration table
CREATE TABLE public.monitoring_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  competitor_name TEXT NOT NULL,
  competitor_url TEXT NOT NULL,
  monitoring_type TEXT NOT NULL CHECK (monitoring_type IN ('website', 'pricing', 'social', 'content', 'all')),
  check_frequency_hours INTEGER DEFAULT 24,
  alert_threshold JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create monitoring alerts table
CREATE TABLE public.monitoring_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  monitoring_config_id UUID REFERENCES public.monitoring_config(id),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  description TEXT,
  detected_changes JSONB,
  previous_state JSONB,
  current_state JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create monitoring history table  
CREATE TABLE public.monitoring_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  monitoring_config_id UUID REFERENCES public.monitoring_config(id),
  check_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  monitoring_data JSONB NOT NULL,
  changes_detected JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'error')),
  error_message TEXT
);

-- Enable RLS on all tables
ALTER TABLE public.monitoring_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for monitoring_config
CREATE POLICY "Users can view their own monitoring config" 
ON public.monitoring_config 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own monitoring config" 
ON public.monitoring_config 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own monitoring config" 
ON public.monitoring_config 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own monitoring config" 
ON public.monitoring_config 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create RLS policies for monitoring_alerts
CREATE POLICY "Users can view their own monitoring alerts" 
ON public.monitoring_alerts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own monitoring alerts" 
ON public.monitoring_alerts 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create RLS policies for monitoring_history
CREATE POLICY "Users can view monitoring history for their configs" 
ON public.monitoring_history 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.monitoring_config 
  WHERE monitoring_config.id = monitoring_history.monitoring_config_id 
  AND monitoring_config.user_id = auth.uid()
));

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_monitoring_config_updated_at
    BEFORE UPDATE ON public.monitoring_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_monitoring_alerts_user_created ON public.monitoring_alerts(user_id, created_at DESC);
CREATE INDEX idx_monitoring_config_active ON public.monitoring_config(is_active, check_frequency_hours);
CREATE INDEX idx_monitoring_history_config_timestamp ON public.monitoring_history(monitoring_config_id, check_timestamp DESC);
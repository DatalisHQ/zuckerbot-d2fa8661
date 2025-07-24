-- Create strategic insights table
CREATE TABLE public.strategic_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  brand_analysis_id UUID REFERENCES public.brand_analysis(id),
  insight_type TEXT NOT NULL CHECK (insight_type IN ('opportunity', 'threat', 'strength', 'weakness', 'recommendation')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  impact_score INTEGER CHECK (impact_score >= 1 AND impact_score <= 10),
  effort_score INTEGER CHECK (effort_score >= 1 AND effort_score <= 10),
  timeframe TEXT CHECK (timeframe IN ('immediate', 'short_term', 'medium_term', 'long_term')),
  category TEXT,
  supporting_data JSONB,
  action_items JSONB,
  is_implemented BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create competitive reports table
CREATE TABLE public.competitive_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  report_name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('swot', 'competitive_analysis', 'market_position', 'strategic_overview')),
  generated_data JSONB NOT NULL,
  executive_summary TEXT,
  key_findings JSONB,
  recommendations JSONB,
  competitor_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed' CHECK (status IN ('generating', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create dashboard metrics table for tracking KPIs
CREATE TABLE public.dashboard_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('competitor_count', 'threat_level', 'opportunity_score', 'market_share', 'monitoring_alerts')),
  time_period TEXT NOT NULL CHECK (time_period IN ('daily', 'weekly', 'monthly', 'quarterly')),
  calculation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.strategic_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitive_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_metrics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for strategic_insights
CREATE POLICY "Users can view their own strategic insights" 
ON public.strategic_insights 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own strategic insights" 
ON public.strategic_insights 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategic insights" 
ON public.strategic_insights 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create RLS policies for competitive_reports
CREATE POLICY "Users can view their own competitive reports" 
ON public.competitive_reports 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own competitive reports" 
ON public.competitive_reports 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own competitive reports" 
ON public.competitive_reports 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create RLS policies for dashboard_metrics
CREATE POLICY "Users can view their own dashboard metrics" 
ON public.dashboard_metrics 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own dashboard metrics" 
ON public.dashboard_metrics 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_strategic_insights_updated_at
    BEFORE UPDATE ON public.strategic_insights
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_competitive_reports_updated_at
    BEFORE UPDATE ON public.competitive_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_strategic_insights_user_priority ON public.strategic_insights(user_id, priority, created_at DESC);
CREATE INDEX idx_competitive_reports_user_type ON public.competitive_reports(user_id, report_type, created_at DESC);
CREATE INDEX idx_dashboard_metrics_user_date ON public.dashboard_metrics(user_id, calculation_date DESC, metric_type);
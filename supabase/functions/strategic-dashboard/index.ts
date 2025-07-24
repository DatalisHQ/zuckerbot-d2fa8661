import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (action) {
      case 'generate_insights':
        return await generateStrategicInsights(supabase, params);
      case 'create_report':
        return await createCompetitiveReport(supabase, params);
      case 'get_dashboard_data':
        return await getDashboardData(supabase, params);
      case 'update_metrics':
        return await updateDashboardMetrics(supabase, params);
      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    console.error('Error in strategic-dashboard function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function generateStrategicInsights(supabase: any, params: any) {
  const { userId, brandAnalysisId } = params;

  console.log('Generating strategic insights for brand analysis:', brandAnalysisId);

  // Get brand analysis data
  const { data: brandAnalysis, error: brandError } = await supabase
    .from('brand_analysis')
    .select('*')
    .eq('id', brandAnalysisId)
    .eq('user_id', userId)
    .single();

  if (brandError) throw brandError;

  // Get competitor data
  const { data: competitors, error: competitorError } = await supabase
    .from('competitor_discovery')
    .select(`
      *,
      competitor_intelligence(*)
    `)
    .eq('brand_analysis_id', brandAnalysisId);

  if (competitorError) throw competitorError;

  // Get monitoring alerts
  const { data: alerts, error: alertsError } = await supabase
    .from('monitoring_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (alertsError) throw alertsError;

  // Generate AI-powered insights
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  let aiInsights = [];

  if (openaiApiKey) {
    const analysisPrompt = `Based on the following competitive intelligence data, generate strategic insights and recommendations:

Brand Analysis: ${JSON.stringify(brandAnalysis, null, 2)}
Competitors Found: ${competitors.length}
Recent Alerts: ${alerts.length}

Generate a JSON array of strategic insights with this structure:
[
  {
    "insight_type": "opportunity|threat|strength|weakness|recommendation",
    "priority": "low|medium|high|critical",
    "title": "Brief insight title",
    "description": "Detailed description of the insight",
    "impact_score": 1-10,
    "effort_score": 1-10,
    "timeframe": "immediate|short_term|medium_term|long_term",
    "category": "marketing|product|pricing|positioning",
    "action_items": ["actionable item 1", "actionable item 2"]
  }
]

Focus on actionable insights that can drive competitive advantage.`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a strategic business analyst specializing in competitive intelligence. Generate actionable insights based on competitive analysis data. Always respond with valid JSON only.'
            },
            {
              role: 'user',
              content: analysisPrompt
            }
          ],
          temperature: 0.3,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const insightsText = data.choices[0].message.content;
        
        try {
          aiInsights = JSON.parse(insightsText);
        } catch (parseError) {
          console.error('Failed to parse AI insights:', insightsText);
        }
      }
    } catch (error) {
      console.error('Error generating AI insights:', error);
    }
  }

  // Add default insights if AI didn't generate any
  if (aiInsights.length === 0) {
    aiInsights = [
      {
        insight_type: 'opportunity',
        priority: 'high',
        title: 'Market Gap Analysis',
        description: `Based on competitor analysis, there appear to be gaps in ${brandAnalysis.niche} that could be exploited.`,
        impact_score: 8,
        effort_score: 6,
        timeframe: 'medium_term',
        category: 'positioning',
        action_items: ['Conduct detailed market research', 'Develop unique value proposition', 'Test market receptivity']
      },
      {
        insight_type: 'threat',
        priority: 'medium',
        title: 'Competitive Pressure',
        description: `${competitors.length} direct competitors identified in your market space, indicating high competition.`,
        impact_score: 7,
        effort_score: 4,
        timeframe: 'immediate',
        category: 'marketing',
        action_items: ['Monitor competitor pricing', 'Strengthen unique differentiators', 'Improve customer retention']
      },
      {
        insight_type: 'recommendation',
        priority: 'high',
        title: 'Continuous Monitoring Setup',
        description: 'Implement systematic competitor monitoring to stay ahead of market changes.',
        impact_score: 9,
        effort_score: 3,
        timeframe: 'immediate',
        category: 'strategy',
        action_items: ['Set up automated monitoring', 'Define key metrics to track', 'Create alert systems']
      }
    ];
  }

  // Store insights in database
  const insightsToStore = aiInsights.map((insight: any) => ({
    user_id: userId,
    brand_analysis_id: brandAnalysisId,
    ...insight,
    supporting_data: {
      competitor_count: competitors.length,
      alert_count: alerts.length,
      generated_at: new Date().toISOString()
    }
  }));

  const { data: storedInsights, error: insertError } = await supabase
    .from('strategic_insights')
    .insert(insightsToStore)
    .select();

  if (insertError) throw insertError;

  return new Response(
    JSON.stringify({
      success: true,
      insights: storedInsights,
      total: storedInsights.length
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function createCompetitiveReport(supabase: any, params: any) {
  const { userId, reportName, reportType, brandAnalysisId } = params;

  console.log('Creating competitive report:', reportName);

  // Gather all relevant data
  const { data: brandAnalysis } = await supabase
    .from('brand_analysis')
    .select('*')
    .eq('id', brandAnalysisId)
    .single();

  const { data: competitors } = await supabase
    .from('competitor_discovery')
    .select(`
      *,
      competitor_intelligence(*)
    `)
    .eq('brand_analysis_id', brandAnalysisId);

  const { data: insights } = await supabase
    .from('strategic_insights')
    .select('*')
    .eq('brand_analysis_id', brandAnalysisId)
    .order('priority', { ascending: false });

  const { data: alerts } = await supabase
    .from('monitoring_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  // Generate report data based on type
  let reportData = {};
  let executiveSummary = '';
  let keyFindings = [];
  let recommendations = [];

  switch (reportType) {
    case 'swot':
      reportData = generateSWOTAnalysis(brandAnalysis, competitors, insights);
      executiveSummary = 'SWOT analysis revealing key strategic opportunities and competitive positioning.';
      break;
    case 'competitive_analysis':
      reportData = generateCompetitiveAnalysis(competitors);
      executiveSummary = 'Comprehensive analysis of competitive landscape and market positioning.';
      break;
    case 'market_position':
      reportData = generateMarketPositionReport(brandAnalysis, competitors);
      executiveSummary = 'Market positioning analysis with strategic recommendations for competitive advantage.';
      break;
    case 'strategic_overview':
      reportData = generateStrategicOverview(brandAnalysis, competitors, insights, alerts);
      executiveSummary = 'Strategic overview combining competitive intelligence with actionable insights.';
      break;
  }

  keyFindings = [
    `${competitors?.length || 0} direct competitors identified`,
    `${insights?.length || 0} strategic insights generated`,
    `${alerts?.length || 0} monitoring alerts in recent period`,
    'Market shows active competitive dynamics'
  ];

  recommendations = insights?.slice(0, 5).map((insight: any) => ({
    title: insight.title,
    priority: insight.priority,
    timeframe: insight.timeframe
  })) || [];

  // Store report
  const { data: report, error: reportError } = await supabase
    .from('competitive_reports')
    .insert({
      user_id: userId,
      report_name: reportName,
      report_type: reportType,
      generated_data: reportData,
      executive_summary: executiveSummary,
      key_findings: keyFindings,
      recommendations: recommendations,
      competitor_count: competitors?.length || 0
    })
    .select()
    .single();

  if (reportError) throw reportError;

  return new Response(
    JSON.stringify({
      success: true,
      report: report
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function getDashboardData(supabase: any, params: any) {
  const { userId } = params;

  // Get all user data for dashboard
  const [
    { data: brandAnalyses },
    { data: insights },
    { data: alerts },
    { data: reports },
    { data: monitoringConfigs }
  ] = await Promise.all([
    supabase.from('brand_analysis').select('*').eq('user_id', userId),
    supabase.from('strategic_insights').select('*').eq('user_id', userId),
    supabase.from('monitoring_alerts').select('*').eq('user_id', userId),
    supabase.from('competitive_reports').select('*').eq('user_id', userId),
    supabase.from('monitoring_config').select('*').eq('user_id', userId)
  ]);

  // Calculate metrics
  const metrics = {
    totalBrands: brandAnalyses?.length || 0,
    totalInsights: insights?.length || 0,
    unreadAlerts: alerts?.filter((a: any) => !a.is_read).length || 0,
    activeMonitoring: monitoringConfigs?.filter((m: any) => m.is_active).length || 0,
    reportsGenerated: reports?.length || 0,
    criticalInsights: insights?.filter((i: any) => i.priority === 'critical').length || 0
  };

  // Get recent activity
  const recentActivity = [
    ...(alerts?.slice(0, 5).map((alert: any) => ({
      type: 'alert',
      title: alert.title,
      timestamp: alert.created_at,
      severity: alert.severity
    })) || []),
    ...(insights?.slice(0, 3).map((insight: any) => ({
      type: 'insight',
      title: insight.title,
      timestamp: insight.created_at,
      priority: insight.priority
    })) || [])
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        metrics,
        recentActivity,
        insights: insights?.slice(0, 10) || [],
        alerts: alerts?.slice(0, 5) || [],
        reports: reports?.slice(0, 5) || []
      }
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function updateDashboardMetrics(supabase: any, params: any) {
  const { userId } = params;

  // This would typically be called on a schedule to update dashboard metrics
  const metrics = [
    { metric_name: 'daily_active_monitoring', metric_type: 'monitoring_alerts', metric_value: Math.floor(Math.random() * 10) },
    { metric_name: 'weekly_insights_generated', metric_type: 'opportunity_score', metric_value: Math.floor(Math.random() * 50) },
    { metric_name: 'threat_level', metric_type: 'threat_level', metric_value: Math.random() * 10 }
  ];

  const metricsToInsert = metrics.map(metric => ({
    user_id: userId,
    time_period: 'daily',
    calculation_date: new Date().toISOString().split('T')[0],
    ...metric
  }));

  await supabase.from('dashboard_metrics').insert(metricsToInsert);

  return new Response(
    JSON.stringify({ success: true }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// Helper functions for report generation
function generateSWOTAnalysis(brand: any, competitors: any[], insights: any[]) {
  return {
    strengths: insights?.filter(i => i.insight_type === 'strength').map(i => i.title) || ['Strong brand positioning'],
    weaknesses: insights?.filter(i => i.insight_type === 'weakness').map(i => i.title) || ['Limited market presence'],
    opportunities: insights?.filter(i => i.insight_type === 'opportunity').map(i => i.title) || ['Market expansion potential'],
    threats: insights?.filter(i => i.insight_type === 'threat').map(i => i.title) || ['Increasing competition']
  };
}

function generateCompetitiveAnalysis(competitors: any[]) {
  return {
    competitorCount: competitors.length,
    marketLeaders: competitors.slice(0, 3).map(c => c.competitor_name || 'Unknown'),
    averageSimilarityScore: competitors.reduce((acc, c) => acc + (c.similarity_score || 0), 0) / competitors.length,
    competitiveGaps: ['Pricing advantage', 'Feature differentiation', 'Market positioning']
  };
}

function generateMarketPositionReport(brand: any, competitors: any[]) {
  return {
    marketCategory: brand?.business_category || 'Technology',
    positioningStrength: 'Medium',
    competitorDensity: competitors.length > 5 ? 'High' : 'Medium',
    recommendedStrategy: 'Differentiation and niche focus'
  };
}

function generateStrategicOverview(brand: any, competitors: any[], insights: any[], alerts: any[]) {
  return {
    overallHealth: 'Good',
    competitivePosition: 'Stable',
    riskLevel: alerts?.filter(a => a.severity === 'high').length > 3 ? 'High' : 'Medium',
    growthOpportunities: insights?.filter(i => i.insight_type === 'opportunity').length || 0,
    immediateActions: insights?.filter(i => i.timeframe === 'immediate').length || 0
  };
}
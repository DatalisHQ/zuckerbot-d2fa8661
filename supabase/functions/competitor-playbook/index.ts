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
    const { competitorListId, userId } = await req.json();
    if (!competitorListId || !userId) {
      return new Response(JSON.stringify({ success: false, error: 'competitorListId and userId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // Pull latest competitor_ad_insights rows for this list
    const { data: insightsRows, error } = await supabase
      .from('competitor_ad_insights')
      .select('*')
      .eq('competitor_list_id', competitorListId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const allAds = (insightsRows || []).flatMap(r => Array.isArray(r.ads_data) ? r.ads_data : []);
    const hooks = (insightsRows || []).flatMap(r => (r.hooks as any[]) || []);
    const ctas = (insightsRows || []).flatMap(r => (r.ctas as any[]) || []);
    const creativeTrends = (insightsRows || []).flatMap(r => (r.creative_trends as any[]) || []);

    // Top-N helpers
    const countMap = (arr: string[]) => arr.reduce((acc: Record<string, number>, v) => { if (!v) return acc; acc[v] = (acc[v] || 0) + 1; return acc; }, {});
    const topN = (arr: string[], n: number) => Object.entries(countMap(arr)).sort((a,b) => b[1]-a[1]).slice(0, n).map(([k]) => k);

    const topHooks = topN(hooks, 5);
    const topCTAs = topN(ctas, 5);
    const visualThemes = topN(creativeTrends, 5);

    // Creative fatigue: ads running >30 days with decreasing visible engagement proxy (impressions upper bound not growing vs long run)
    const parseDate = (s?: string) => (s ? new Date(s) : null);
    const now = new Date();
    const fatigueCandidates = allAds.filter((ad: any) => {
      const start = parseDate(ad?.run_window?.start);
      if (!start) return false;
      const days = Math.floor((now.getTime() - start.getTime()) / (1000*60*60*24));
      return days > 30;
    }).map((ad: any) => ({ ad_id: ad.id, reason: 'running >30 days; monitor for fatigue' }));

    // Positioning opportunities: look for gaps where common CTAs/hooks are missing
    const opportunityPool = [
      'Offer risk-reversal/guarantee messaging',
      'Emphasize speed-to-value or time savings',
      'Leverage social proof (reviews, UGC) prominently',
      'Introduce scarcity or limited-time incentives',
      'Highlight unique feature parity gaps'
    ];
    const positioningOpportunities = opportunityPool.filter(op => !hooks.some(h => h.toLowerCase().includes(op.split(' ')[0].toLowerCase()))).slice(0,3);

    const playbook = {
      top_hooks: topHooks,
      top_ctas: topCTAs,
      visual_themes: visualThemes,
      creative_fatigue_flags: fatigueCandidates.slice(0, 10),
      positioning_opportunities: positioningOpportunities,
      totals: { competitors: insightsRows?.length || 0, ads: allAds.length }
    };

    // Snapshot to history for trend tracking
    await supabase.from('competitor_analysis_history').insert({
      user_id: userId,
      competitor_list_id: competitorListId,
      competitor_name: 'PLAYBOOK_SUMMARY',
      ads_data: [],
      insights: playbook,
      metrics: { groups: insightsRows?.length || 0 }
    });

    return new Response(JSON.stringify({ success: true, playbook }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('competitor-playbook error', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});



import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

    // Try ad insights first (may be empty if ads analysis is disabled)
    const { data: insightsRows, error: insightsErr } = await supabase
      .from('competitor_ad_insights')
      .select('*')
      .eq('competitor_list_id', competitorListId)
      .order('created_at', { ascending: false });
    if (insightsErr) throw insightsErr;

    let allAds: any[] = (insightsRows || []).flatMap(r => Array.isArray(r.ads_data) ? r.ads_data : []);
    let hooks: string[] = (insightsRows || []).flatMap(r => (r.hooks as any[]) || []);
    let ctas: string[] = (insightsRows || []).flatMap(r => (r.ctas as any[]) || []);
    let creativeTrends: string[] = (insightsRows || []).flatMap(r => (r.creative_trends as any[]) || []);

    // Fallback to website profiles when ad insights are not available
    if (allAds.length === 0 && hooks.length === 0 && ctas.length === 0 && creativeTrends.length === 0) {
      const { data: profilesRows, error: profilesErr } = await supabase
        .from('competitor_profiles')
        .select('competitor_name, value_props, tone')
        .eq('competitor_list_id', competitorListId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (profilesErr) throw profilesErr;

      const valueProps = (profilesRows || []).flatMap(r => Array.isArray(r.value_props) ? r.value_props : []);
      hooks = valueProps; // treat value props as hooks for playbook
      ctas = []; // not derivable reliably from websites
      creativeTrends = (profilesRows || []).map(r => r.tone).filter(Boolean) as string[];
      allAds = [];
    }

    // Helpers
    const countMap = (arr: string[]) => arr.reduce((acc: Record<string, number>, v) => { if (!v) return acc; acc[v] = (acc[v] || 0) + 1; return acc; }, {} as Record<string, number>);
    const topN = (arr: string[], n: number) => Object.entries(countMap(arr)).sort((a,b) => b[1]-a[1]).slice(0, n).map(([k]) => k);

    const playbook = {
      top_hooks: topN(hooks, 5),
      top_ctas: topN(ctas, 5),
      visual_themes: topN(creativeTrends, 5),
      creative_fatigue_flags: [], // not applicable without ad history
      positioning_opportunities: hooks.length > 0 ? [
        'Differentiate with a stronger proof-driven message',
        'Emphasize unique outcomes not highlighted by competitors',
        'Address objections competitors ignore'
      ] : [],
      totals: { competitors: insightsRows?.length || 0, ads: allAds.length }
    };

    return new Response(JSON.stringify({ success: true, playbook }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('competitor-playbook error', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

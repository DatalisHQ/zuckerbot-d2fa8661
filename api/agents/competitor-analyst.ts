import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 45 };

const supabaseUrl = process.env.SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { business_id, user_id, trigger_type } = req.body || {};
  if (!business_id || !user_id) {
    return res.status(400).json({ error: 'business_id and user_id required' });
  }

  let runId: string | null = null;
  const startTime = Date.now();

  try {
    // Get business info
    const { data: business } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', business_id)
      .single();

    const industry = business?.trade || '';
    const location = business?.suburb || '';
    const country = business?.country || 'AU';
    const businessName = business?.name || '';

    if (!industry) {
      return res.status(400).json({ error: 'Could not determine industry' });
    }

    // Create automation run
    const { data: run, error: runErr } = await supabase
      .from('automation_runs')
      .insert({
        business_id,
        user_id,
        agent_type: 'competitor_analyst',
        status: 'running',
        trigger_type: trigger_type || 'manual',
        trigger_reason: `Analyzing competitors for ${industry} in ${location || country}`,
        input: { industry, location, country },
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (runErr) throw new Error(`Failed to create run: ${runErr.message}`);
    runId = run.id;

    // Search Brave
    const query = `${industry} ${location || country} Facebook ads advertising competitors`;
    const braveRes = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
      { headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' } }
    );

    let searchContext = '';
    if (braveRes.ok) {
      const braveData = await braveRes.json();
      searchContext = (braveData.web?.results || []).slice(0, 8)
        .map((r: any) => `${r.title}: ${r.description}`).join('\n');
    }

    // Claude analysis
    let competitorData: any = { competitors: [], common_hooks: [], gaps: [] };

    if (ANTHROPIC_API_KEY) {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: 'You are a competitive intelligence analyst. Respond ONLY with valid JSON.',
          messages: [{
            role: 'user',
            content: `Analyze competitive landscape:\n\nIndustry: ${industry}\nBusiness: ${businessName}\nLocation: ${location || 'N/A'}\nCountry: ${country}\n\nSearch results:\n${searchContext || 'None'}\n\nReturn JSON:\n{"competitors":[{"name":"str","badge":"Top Spender|Rising Star|New Entrant|Established","description":"str","threat_level":"high|medium|low"}],"common_hooks":["str"],"gaps":["str"],"market_insights":"str","recommended_positioning":"str"}\n\nList 3-5 competitors. Be specific to industry and location.`
          }],
        }),
      });

      if (claudeRes.ok) {
        const cd = await claudeRes.json();
        try { competitorData = JSON.parse(cd.content?.[0]?.text || '{}'); } catch {}
      }
    }

    const competitors = (competitorData.competitors || []).slice(0, 5);
    const durationMs = Date.now() - startTime;

    const firstPersonSummary = competitors.length > 0
      ? `I analyzed your competitive landscape. ${competitors.length} competitors active. ${(competitorData.gaps || []).length} gaps they are not exploiting.`
      : `I searched for competitors in ${industry} but found limited data.`;

    // Complete the run
    await supabase
      .from('automation_runs')
      .update({
        status: 'completed',
        output: {
          competitors,
          common_hooks: competitorData.common_hooks || [],
          gaps: competitorData.gaps || [],
          market_insights: competitorData.market_insights || null,
          recommended_positioning: competitorData.recommended_positioning || null,
          scanned_at: new Date().toISOString(),
        },
        summary: `Found ${competitors.length} competitors for ${industry}`,
        first_person_summary: firstPersonSummary,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    return res.status(200).json({ run_id: runId, status: 'completed' });
  } catch (error: any) {
    if (runId) {
      await supabase.from('automation_runs').update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }
    return res.status(500).json({ error: error.message });
  }
}

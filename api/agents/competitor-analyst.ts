import {
  handleCors,
  createAutomationRun,
  completeAutomationRun,
  failAutomationRun,
  getLastRunForAgent,
  getBusinessWithConfig,
} from './_utils';

export const config = { maxDuration: 45 };

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

export default async function handler(req: any, res: any) {
  try { return await _handler(req, res); } catch (e: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ fatal: e.message, stack: e.stack?.split('\n').slice(0, 5) });
  }
}

async function _handler(req: any, res: any) {
  if (handleCors(req, res)) return;

  const { business_id, user_id, trigger_type, industry, location, country } = req.body || {};
  if (!business_id || !user_id) {
    return res.status(400).json({ error: 'business_id and user_id required' });
  }

  let runId: string | null = null;
  const startTime = Date.now();

  try {
    const { business } = await getBusinessWithConfig(business_id);
    const resolvedIndustry = industry || business?.trade || '';
    const resolvedLocation = location || business?.suburb || '';
    const resolvedCountry = country || business?.country || 'AU';
    const businessName = business?.name || '';

    if (!resolvedIndustry) {
      return res.status(400).json({ error: 'Could not determine industry for this business' });
    }

    runId = await createAutomationRun(
      business_id,
      user_id,
      'competitor_analyst',
      trigger_type || 'manual',
      `Analyzing competitors for ${resolvedIndustry} in ${resolvedLocation || resolvedCountry}`,
      { industry: resolvedIndustry, location: resolvedLocation, country: resolvedCountry }
    );

    // Search Brave for competitor info
    const query = `${resolvedIndustry} ${resolvedLocation || resolvedCountry} Facebook ads advertising competitors`;
    const braveRes = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
      { headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' } }
    );

    let searchContext = '';
    if (braveRes.ok) {
      const braveData = await braveRes.json();
      const results = braveData.web?.results || [];
      searchContext = results.slice(0, 8).map((r: any) => `${r.title}: ${r.description}`).join('\n');
    }

    // Use Claude to analyze competitive landscape
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
          system: 'You are a competitive intelligence analyst for local business advertising. Respond ONLY with valid JSON.',
          messages: [{
            role: 'user',
            content: `Analyze the competitive advertising landscape:

Industry: ${resolvedIndustry}
Business: ${businessName}
Location: ${resolvedLocation || 'N/A'}
Country: ${resolvedCountry}

Search results:
${searchContext || 'No search data available.'}

Return JSON:
{
  "competitors": [{ "name": "string", "badge": "Top Spender|Rising Star|New Entrant|Established", "description": "what they do and how they advertise", "threat_level": "high|medium|low" }],
  "common_hooks": ["marketing hooks competitors use"],
  "gaps": ["things competitors are NOT doing"],
  "market_insights": "2-3 sentence competitive landscape summary",
  "recommended_positioning": "how ${businessName || 'this business'} should position against competitors"
}

List 3-5 competitors. Be specific to the industry and location.`
          }],
        }),
      });

      if (claudeRes.ok) {
        const claudeData = await claudeRes.json();
        try {
          competitorData = JSON.parse(claudeData.content?.[0]?.text || '{}');
        } catch {}
      }
    }

    const competitors = (competitorData.competitors || []).slice(0, 5);
    const commonHooks = (competitorData.common_hooks || []).slice(0, 5);
    const gaps = (competitorData.gaps || []).slice(0, 4);

    // Compare with last run
    const lastRun = await getLastRunForAgent(business_id, 'competitor_analyst');
    const previousNames = new Set((lastRun?.output?.competitors || []).map((c: any) => c.name?.toLowerCase()));
    const currentNames = new Set(competitors.map((c: any) => c.name?.toLowerCase()));
    const newCompetitors = competitors.filter((c: any) => !previousNames.has(c.name?.toLowerCase()));
    const droppedCompetitors = (lastRun?.output?.competitors || []).filter((c: any) => !currentNames.has(c.name?.toLowerCase()));

    const output = {
      competitors,
      common_hooks: commonHooks,
      gaps,
      market_insights: competitorData.market_insights || null,
      recommended_positioning: competitorData.recommended_positioning || null,
      diff: {
        new_competitors: newCompetitors.map((c: any) => c.name),
        dropped_competitors: droppedCompetitors.map((c: any) => c.name),
      },
      scanned_at: new Date().toISOString(),
    };

    const durationMs = Date.now() - startTime;
    const summary = `Found ${competitors.length} competitors for ${resolvedIndustry} in ${resolvedLocation || resolvedCountry}. ${commonHooks.length} hooks, ${gaps.length} gaps identified.`;

    let firstPersonSummary: string;
    if (competitors.length > 0) {
      const highThreat = competitors.filter((c: any) => c.threat_level === 'high').length;
      firstPersonSummary = `I analyzed your competitive landscape. ${competitors.length} competitors active${highThreat > 0 ? `, ${highThreat} high-threat` : ''}. ${gaps.length > 0 ? `Found ${gaps.length} gaps they are not exploiting.` : ''} ${competitorData.recommended_positioning ? `My recommendation: ${competitorData.recommended_positioning}` : ''}`.trim();
    } else {
      firstPersonSummary = `I searched for competitors in ${resolvedIndustry} near ${resolvedLocation || resolvedCountry} but found limited advertising data. This could mean low competition or competitors using channels other than Facebook.`;
    }

    await completeAutomationRun(runId, output, summary, firstPersonSummary, { durationMs });

    return res.status(200).json({ run_id: runId, status: 'completed', output });
  } catch (error: any) {
    if (runId) await failAutomationRun(runId, error.message || 'Unknown error');
    return res.status(500).json({ error: error.message || 'Competitor analysis failed' });
  }
}

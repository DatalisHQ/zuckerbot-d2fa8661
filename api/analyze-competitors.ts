import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 30 };

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || 'BSA3NLr2aVETRurlr8KaqHN-pBcOEqP';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { industry, location, country } = req.body || {};
  if (!industry) return res.status(400).json({ error: 'industry required' });

  // SSE headers to match frontend expectations
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Step 1: Brave Search for competitor landscape
    const query = `${industry} ${location || ''} Facebook ads advertising competitors`;
    const braveRes = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
      { headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' } }
    );

    let searchContext = '';
    if (braveRes.ok) {
      const braveData = await braveRes.json();
      const results = braveData.web?.results || [];
      searchContext = results
        .slice(0, 8)
        .map((r: any) => `${r.title}: ${r.description}`)
        .join('\n');
    }

    // Step 2: Claude generates competitor analysis from search context + industry knowledge
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
        system: 'You are a competitive intelligence analyst for local business advertising. Respond ONLY with valid JSON. No markdown fences.',
        messages: [{
          role: 'user',
          content: `Analyze the competitive advertising landscape for this business:

Industry: ${industry}
Location: ${location || 'unknown'}
Country: ${country || 'AU'}

Search results about competitors in this space:
${searchContext || 'No search data available.'}

Based on the search results AND your knowledge of how businesses in this industry typically advertise on Facebook, generate a competitive analysis.

Return JSON:
{
  "competitors": [
    { "name": "string (competitor business name or type)", "badge": "string (one of: Top Spender, Rising Star, New Entrant, Established)", "description": "string (what they do and how they advertise)" }
  ],
  "common_hooks": ["string (marketing hooks/angles competitors commonly use)"],
  "gaps": ["string (things competitors are NOT doing that could be exploited)"],
  "market_insights": "string (1-2 sentence summary of the competitive landscape)"
}

Rules:
- List 3-5 real or representative competitors (use real names from search results where possible)
- Identify 3-5 common advertising hooks in this industry
- Identify 2-4 gaps/opportunities competitors are missing
- Be specific to the industry and location, not generic`
        }],
      }),
    });

    if (!claudeRes.ok) {
      console.error('[analyze-competitors] Claude error:', await claudeRes.text());
      res.write(`data: ${JSON.stringify({ type: 'COMPLETE', competitors: [], common_hooks: [], gaps: [] })}\n\n`);
      return res.end();
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '{}';

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { competitors: [], common_hooks: [], gaps: [] };
    }

    res.write(`data: ${JSON.stringify({
      type: 'COMPLETE',
      competitors: (parsed.competitors || []).slice(0, 5),
      common_hooks: (parsed.common_hooks || []).slice(0, 5),
      gaps: (parsed.gaps || []).slice(0, 4),
      market_insights: parsed.market_insights || null,
    })}\n\n`);
  } catch (err) {
    console.error('[analyze-competitors] Error:', err);
    res.write(`data: ${JSON.stringify({ type: 'COMPLETE', competitors: [], common_hooks: [], gaps: [] })}\n\n`);
  }

  return res.end();
}

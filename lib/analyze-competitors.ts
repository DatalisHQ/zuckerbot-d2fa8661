import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY || '';
const TINYFISH_URL = 'https://agent.tinyfish.ai/v1/automation/run-sse';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { industry, location, country } = req.body || {};
  if (!industry) return res.status(400).json({ error: 'industry required' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Go straight to Brave+Claude (fast, reliable). TinyFish is timing out consistently.
  await fallbackBraveClaude(industry, location, country, res);
  return res.end();
}

async function tryTinyFish(
  industry: string, location: string | undefined, country: string | undefined, res: VercelResponse
): Promise<any | null> {
  if (!TINYFISH_API_KEY) return null;

  const searchQuery = `${industry} ${location || ''}`.trim();
  const adLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country || 'AU'}&q=${encodeURIComponent(searchQuery)}&media_type=all`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40000); // 40s timeout

    const response = await fetch(TINYFISH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': TINYFISH_API_KEY },
      body: JSON.stringify({
        url: adLibraryUrl,
        goal: `You are on Facebook Ad Library. Find the first 3-5 ads visible in the results. For each ad, extract: {"ads": [{"page_name": string, "body_text": string, "started_running_date": string, "media_type": "image"|"video", "ad_snapshot_url": string}]}. The ad_snapshot_url should be the URL of the ad preview/image if visible. If you can see the ad creative image, include its URL. Scroll down if needed to find more ads.`,
        browser_profile: 'stealth',
        proxy_config: { enabled: true, country_code: country || 'AU' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const text = await response.text();
    let streamingUrl: string | null = null;
    let resultData: any = null;

    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        
        // Capture streaming URL for live view
        if (parsed.type === 'STREAMING_URL' && parsed.streamingUrl) {
          streamingUrl = parsed.streamingUrl;
          // Send streaming URL immediately so frontend can show "Watch agent live"
          res.write(`data: ${JSON.stringify({ type: 'STREAMING_URL', streamingUrl })}\n\n`);
        }
        
        if (parsed.type === 'COMPLETE' || parsed.status === 'COMPLETED') {
          const rj = parsed.resultJson || parsed.data?.resultJson;
          resultData = typeof rj === 'string' ? JSON.parse(rj) : rj;
        }
      } catch {}
    }

    if (!resultData?.ads || resultData.ads.length === 0) return null;

    // Transform TinyFish ads into our competitor format
    const competitors = resultData.ads.slice(0, 5).map((ad: any) => ({
      name: ad.page_name || 'Competitor',
      badge: ad.started_running_date ? `Running since ${ad.started_running_date}` : 'Active',
      description: ad.body_text ? ad.body_text.slice(0, 250) + (ad.body_text.length > 250 ? '...' : '') : 'Running ads on Facebook.',
      ad_snapshot_url: ad.ad_snapshot_url || null,
      media_type: ad.media_type || 'image',
    }));

    // Extract hooks from ad copy
    const allCopy = resultData.ads.map((a: any) => a.body_text || '').join(' ').toLowerCase();
    const hookPatterns = [
      { keyword: 'free', label: 'Free offer' },
      { keyword: 'discount', label: 'Discount' },
      { keyword: '% off', label: 'Percentage off' },
      { keyword: 'limited', label: 'Scarcity / limited time' },
      { keyword: 'book now', label: 'Urgency CTA' },
      { keyword: 'call now', label: 'Direct CTA' },
      { keyword: 'guarantee', label: 'Guarantee' },
      { keyword: 'trusted', label: 'Trust signal' },
      { keyword: 'review', label: 'Social proof' },
      { keyword: 'award', label: 'Authority' },
    ];
    const seen = new Set<string>();
    const common_hooks: string[] = [];
    for (const p of hookPatterns) {
      if (allCopy.includes(p.keyword) && !seen.has(p.label)) {
        seen.add(p.label);
        common_hooks.push(p.label);
      }
    }

    return {
      type: 'COMPLETE',
      source: 'tinyfish',
      competitors,
      common_hooks,
      gaps: [], // Claude fallback fills these better
      streamingUrl,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.log('[analyze-competitors] TinyFish timed out, falling back');
    } else {
      console.error('[analyze-competitors] TinyFish error:', err.message);
    }
    return null;
  }
}

async function fallbackBraveClaude(
  industry: string, location: string | undefined, country: string | undefined, res: VercelResponse
) {
  try {
    const query = `${industry} ${location || ''} Facebook ads advertising competitors`;
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
      res.write(`data: ${JSON.stringify({ type: 'COMPLETE', source: 'fallback', competitors: [], common_hooks: [], gaps: [] })}\n\n`);
      return;
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '{}';

    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { competitors: [], common_hooks: [], gaps: [] }; }

    res.write(`data: ${JSON.stringify({
      type: 'COMPLETE',
      source: 'claude',
      competitors: (parsed.competitors || []).slice(0, 5),
      common_hooks: (parsed.common_hooks || []).slice(0, 5),
      gaps: (parsed.gaps || []).slice(0, 4),
      market_insights: parsed.market_insights || null,
    })}\n\n`);
  } catch (err) {
    console.error('[analyze-competitors] Fallback error:', err);
    res.write(`data: ${JSON.stringify({ type: 'COMPLETE', source: 'error', competitors: [], common_hooks: [], gaps: [] })}\n\n`);
  }
}

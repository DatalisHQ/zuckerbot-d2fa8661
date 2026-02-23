/**
 * POST /api/v1/research/market
 *
 * Market intelligence for a category + location. Combines review landscape,
 * competitor analysis, and market trends into a comprehensive market brief.
 *
 * Request body:
 *   - industry (required): string
 *   - location (required): string
 *   - country (optional): string (default "US")
 *
 * Response: market brief with size estimate, trends, key players, ad landscape,
 *           recommended positioning, and budget recommendation
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest, logUsage } from '../_utils/auth';

export const config = { maxDuration: 90 };

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || 'BSA3NLr2aVETRurlr8KaqHN-pBcOEqP';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// ── Brave Search helper ─────────────────────────────────────────
async function braveSearch(query: string, count = 10): Promise<any[]> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
    {
      headers: {
        'X-Subscription-Token': BRAVE_API_KEY,
        Accept: 'application/json',
      },
    },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.web?.results || [];
}

// ── Claude helper ───────────────────────────────────────────────
async function callClaude(system: string, userMessage: string, maxTokens = 2000): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.content?.[0]?.text || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: { code: 'method_not_allowed', message: 'POST required' },
    });
  }

  const startTime = Date.now();

  // ── Auth ─────────────────────────────────────────────────────────
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) {
      for (const [k, v] of Object.entries(auth.rateLimitHeaders)) res.setHeader(k, v);
    }
    return res.status(auth.status).json(auth.body);
  }
  for (const [k, v] of Object.entries(auth.rateLimitHeaders)) res.setHeader(k, v);

  // ── Validate request body ────────────────────────────────────────
  const { industry, location, country } = req.body || {};

  if (!industry || typeof industry !== 'string') {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/research/market',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: '`industry` is required and must be a string' },
    });
  }

  if (!location || typeof location !== 'string') {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/research/market',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: '`location` is required and must be a string' },
    });
  }

  const selectedCountry = typeof country === 'string' ? country : 'US';

  try {
    // ── Run diverse searches for comprehensive market data ───────────
    const queries = [
      `${industry} market ${location} ${selectedCountry}`,
      `${industry} industry trends ${selectedCountry} 2025 2026`,
      `best ${industry} in ${location} reviews ratings`,
      `${industry} ${location} advertising marketing`,
      `${industry} market size growth ${selectedCountry}`,
      `${industry} ${location} competitors pricing`,
    ];

    const searchPromises = queries.map((q) => braveSearch(q, 6));
    const allResults = await Promise.all(searchPromises);

    // Keep results categorized for richer context
    const marketResults = [...(allResults[0] || []), ...(allResults[4] || [])];
    const trendResults = allResults[1] || [];
    const reviewResults = allResults[2] || [];
    const adResults = allResults[3] || [];
    const competitorResults = allResults[5] || [];

    // Deduplicate for the combined context
    const seenUrls = new Set<string>();
    const dedup = (results: any[]) => {
      const unique: any[] = [];
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          unique.push(r);
        }
      }
      return unique;
    };

    const marketContext = dedup(marketResults)
      .slice(0, 6)
      .map((r: any) => `${r.title}: ${r.description || ''}`)
      .join('\n');

    const trendContext = dedup(trendResults)
      .slice(0, 4)
      .map((r: any) => `${r.title}: ${r.description || ''}`)
      .join('\n');

    const reviewContext = dedup(reviewResults)
      .slice(0, 5)
      .map((r: any) => `${r.title}: ${r.description || ''}`)
      .join('\n');

    const adContext = dedup(adResults)
      .slice(0, 4)
      .map((r: any) => `${r.title}: ${r.description || ''}`)
      .join('\n');

    const competitorContext = dedup(competitorResults)
      .slice(0, 5)
      .map((r: any) => `[${r.url}] ${r.title}: ${r.description || ''}`)
      .join('\n');

    // ── Call Claude to synthesize market brief ──────────────────────
    const claudeText = await callClaude(
      'You are a market intelligence analyst specializing in local business advertising. You synthesize search data into actionable market briefs for businesses planning their advertising strategy. Respond ONLY with valid JSON. No markdown fences, no explanation.',
      `Create a comprehensive market intelligence brief for this market:

Industry: ${industry}
Location: ${location}
Country: ${selectedCountry}

=== MARKET SIZE & STRUCTURE DATA ===
${marketContext || 'No market data found.'}

=== INDUSTRY TRENDS ===
${trendContext || 'No trend data found.'}

=== REVIEW LANDSCAPE ===
${reviewContext || 'No review data found.'}

=== ADVERTISING LANDSCAPE ===
${adContext || 'No advertising data found.'}

=== KEY COMPETITORS ===
${competitorContext || 'No competitor data found.'}

Return this exact JSON structure:
{
  "market_size_estimate": "<string — estimated market size for this industry in this location, e.g. '$12M annual revenue in Austin metro area' or 'approximately 45 businesses serving this market'. Be specific based on data. If no data, give a reasonable estimate with a qualifier.>",
  "growth_trend": "<string — 'growing', 'stable', 'declining', or 'emerging'. Include a brief reason, e.g. 'growing — 15% YoY increase driven by remote work migration to Austin'>",
  "key_players": [
    {
      "name": "<string — business name>",
      "estimated_market_position": "<string — 'leader', 'challenger', 'niche', 'new entrant'>",
      "notable_strength": "<string — what makes them strong>"
    }
  ],
  "advertising_landscape": {
    "competition_level": "<'low' | 'medium' | 'high'>",
    "primary_channels": ["<string — where competitors advertise, e.g. 'Google Ads', 'Facebook', 'Instagram', 'Yelp Ads', 'Local Print'>"],
    "common_strategies": ["<string — what approaches competitors use in their ads>"],
    "estimated_avg_cpc_cents": <integer or null — estimated average cost per click in cents for this market>,
    "estimated_avg_cpl_cents": <integer or null — estimated average cost per lead in cents>
  },
  "recommended_positioning": "<string — 2-3 sentences describing how a new advertiser should position themselves to stand out in this market. Be specific about angles, messaging, and differentiation.>",
  "budget_recommendation_daily_cents": <integer — recommended daily ad budget in cents for a new entrant. Consider the market, competition level, and location. Typical range: 1000-5000 cents ($10-$50/day) for local businesses.>,
  "budget_rationale": "<string — brief explanation of why this budget level>",
  "opportunities": ["<string — specific opportunities for a new advertiser in this market, 2-4 items>"],
  "risks": ["<string — potential risks or challenges, 1-3 items>"]
}

Rules:
- Use REAL business names from search results for key_players
- Return 3-5 key players
- Base market_size_estimate on available data; use qualifiers if estimating
- budget_recommendation_daily_cents should be realistic for a small/medium local business
- Be specific to ${industry} in ${location}, not generic advice
- All monetary values in cents (USD)`,
    );

    let parsed: any = {};
    if (claudeText) {
      try {
        parsed = JSON.parse(claudeText);
      } catch {
        const jsonMatch = claudeText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            parsed = {};
          }
        }
      }
    }

    // ── Build response ──────────────────────────────────────────────
    const keyPlayers = Array.isArray(parsed.key_players)
      ? parsed.key_players.slice(0, 5).map((p: any) => ({
          name: p.name || 'Unknown',
          estimated_market_position: p.estimated_market_position || 'unknown',
          notable_strength: p.notable_strength || null,
        }))
      : [];

    const adLandscape = parsed.advertising_landscape || {};

    const response = {
      industry,
      location,
      country: selectedCountry,
      market_size_estimate: parsed.market_size_estimate || 'Unable to estimate from available data',
      growth_trend: parsed.growth_trend || 'unknown',
      key_players: keyPlayers,
      advertising_landscape: {
        competition_level: ['low', 'medium', 'high'].includes(adLandscape.competition_level)
          ? adLandscape.competition_level
          : 'unknown',
        primary_channels: Array.isArray(adLandscape.primary_channels) ? adLandscape.primary_channels : [],
        common_strategies: Array.isArray(adLandscape.common_strategies) ? adLandscape.common_strategies : [],
        estimated_avg_cpc_cents: typeof adLandscape.estimated_avg_cpc_cents === 'number'
          ? adLandscape.estimated_avg_cpc_cents
          : null,
        estimated_avg_cpl_cents: typeof adLandscape.estimated_avg_cpl_cents === 'number'
          ? adLandscape.estimated_avg_cpl_cents
          : null,
      },
      recommended_positioning: parsed.recommended_positioning || 'Insufficient data for positioning recommendation.',
      budget_recommendation_daily_cents: typeof parsed.budget_recommendation_daily_cents === 'number'
        ? parsed.budget_recommendation_daily_cents
        : 2000,
      budget_rationale: parsed.budget_rationale || null,
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 4) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 3) : [],
    };

    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/research/market',
      method: 'POST',
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    });

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[research/market] Error:', err);

    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/research/market',
      method: 'POST',
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    });

    return res.status(500).json({
      error: {
        code: 'internal_error',
        message: 'Failed to generate market intelligence',
        details: err?.message || String(err),
      },
    });
  }
}

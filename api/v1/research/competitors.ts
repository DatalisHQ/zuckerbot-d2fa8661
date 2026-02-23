/**
 * POST /api/v1/research/competitors
 *
 * Analyze competitors in a market. Uses Brave Search to find competitors,
 * then Claude to synthesize a structured competitive analysis.
 *
 * Request body:
 *   - industry (required): string
 *   - location (required): string
 *   - country (optional): string (default "US")
 *   - limit (optional): number (default 5, max 10)
 *
 * Response: competitor list, common hooks, gaps, market saturation
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest, logUsage } from '../_utils/auth';

export const config = { maxDuration: 60 };

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
async function callClaude(system: string, userMessage: string, maxTokens = 1500): Promise<string | null> {
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
  const { industry, location, country, limit } = req.body || {};

  if (!industry || typeof industry !== 'string') {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/research/competitors',
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
      endpoint: '/v1/research/competitors',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: '`location` is required and must be a string' },
    });
  }

  const selectedCountry = typeof country === 'string' ? country : 'US';
  const competitorLimit = Math.min(Math.max(typeof limit === 'number' ? limit : 5, 1), 10);

  try {
    // ── Run multiple searches for broad coverage ─────────────────────
    const queries = [
      `best ${industry} in ${location} ${selectedCountry}`,
      `${industry} ${location} competitors advertising`,
      `top ${industry} companies near ${location}`,
      `${industry} ${location} reviews ratings`,
    ];

    const searchPromises = queries.map((q) => braveSearch(q, 8));
    const allResults = await Promise.all(searchPromises);

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const results: any[] = [];
    for (const batch of allResults) {
      for (const r of batch) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          results.push(r);
        }
      }
    }

    // ── Build search context for Claude ─────────────────────────────
    const searchContext = results
      .slice(0, 15)
      .map((r: any) => `[${r.url}] ${r.title}: ${r.description || ''}`)
      .join('\n');

    if (!searchContext) {
      const response = {
        industry,
        location,
        country: selectedCountry,
        competitors: [],
        common_hooks: [],
        gaps: [],
        market_saturation: 'unknown' as const,
      };

      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/research/competitors',
        method: 'POST',
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(200).json(response);
    }

    // ── Call Claude to analyze ──────────────────────────────────────
    const claudeText = await callClaude(
      'You are a competitive intelligence analyst for local businesses. You analyze search results to identify competitors, their strategies, and market gaps. Respond ONLY with valid JSON. No markdown fences, no explanation.',
      `Analyze the competitive landscape for this market:

Industry: ${industry}
Location: ${location}
Country: ${selectedCountry}

Search results about businesses and competitors in this space:
${searchContext}

Return this exact JSON structure:
{
  "competitors": [
    {
      "name": "<string — actual business name from search results>",
      "url": "<string — their website URL if found, otherwise null>",
      "strengths": ["<string — what they do well, 1-3 items>"],
      "weaknesses": ["<string — potential weaknesses or gaps, 1-2 items>"],
      "ad_presence": <boolean — whether they appear to be running ads or have strong online presence>,
      "pricing_info": "<string or null — any pricing data found>"
    }
  ],
  "common_hooks": ["<string — messaging patterns and marketing hooks competitors use, 3-5 items>"],
  "gaps": ["<string — opportunities no competitor is exploiting, 2-4 items>"],
  "market_saturation": "<'low' | 'medium' | 'high' — how saturated the market appears>"
}

Rules:
- Return exactly ${competitorLimit} competitors (or fewer if not enough real businesses found)
- Use REAL business names from the search results, not generic placeholders
- Include actual URLs from the search results
- Strengths and weaknesses should be specific to each business, not generic
- Common hooks should reflect actual marketing patterns you see in the results
- Gaps should be actionable opportunities a new advertiser could exploit
- Market saturation: "low" = few competitors, easy to stand out; "medium" = moderate competition; "high" = crowded market
- Base everything on the actual search results, supplemented by your knowledge of the industry`,
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
    const competitors = Array.isArray(parsed.competitors)
      ? parsed.competitors.slice(0, competitorLimit).map((c: any) => ({
          name: c.name || 'Unknown',
          url: c.url || null,
          strengths: Array.isArray(c.strengths) ? c.strengths : [],
          weaknesses: Array.isArray(c.weaknesses) ? c.weaknesses : [],
          ad_presence: typeof c.ad_presence === 'boolean' ? c.ad_presence : false,
          pricing_info: c.pricing_info || null,
        }))
      : [];

    const response = {
      industry,
      location,
      country: selectedCountry,
      competitors,
      common_hooks: Array.isArray(parsed.common_hooks) ? parsed.common_hooks.slice(0, 5) : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 4) : [],
      market_saturation: ['low', 'medium', 'high'].includes(parsed.market_saturation)
        ? parsed.market_saturation
        : 'unknown',
    };

    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/research/competitors',
      method: 'POST',
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    });

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[research/competitors] Error:', err);

    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/research/competitors',
      method: 'POST',
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    });

    return res.status(500).json({
      error: {
        code: 'internal_error',
        message: 'Failed to analyze competitors',
        details: err?.message || String(err),
      },
    });
  }
}

/**
 * POST /api/v1/research/reviews
 *
 * Get review intelligence for a business. Searches Google Reviews, Yelp,
 * and other review sites via Brave Search, then synthesizes with Claude.
 *
 * Request body:
 *   - business_name (required): string
 *   - location (optional): string
 *   - platform (optional): "google" | "yelp" | "all" (default "all")
 *
 * Response: structured review intelligence (rating, themes, quotes, sentiment)
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
async function callClaude(system: string, userMessage: string, maxTokens = 1200): Promise<string | null> {
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
  const { business_name, location, platform } = req.body || {};

  if (!business_name || typeof business_name !== 'string') {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/research/reviews',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: '`business_name` is required and must be a string' },
    });
  }

  const validPlatforms = ['google', 'yelp', 'all'];
  const selectedPlatform = validPlatforms.includes(platform) ? platform : 'all';

  try {
    // ── Build search queries by platform ────────────────────────────
    const locationStr = location ? ` ${location}` : '';
    const queries: string[] = [];

    if (selectedPlatform === 'google' || selectedPlatform === 'all') {
      queries.push(`"${business_name}"${locationStr} Google reviews rating`);
      queries.push(`"${business_name}"${locationStr} reviews`);
    }
    if (selectedPlatform === 'yelp' || selectedPlatform === 'all') {
      queries.push(`"${business_name}"${locationStr} Yelp reviews`);
    }

    // ── Run searches in parallel ────────────────────────────────────
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

    // ── Fast extract rating/count from snippets ─────────────────────
    let snippetRating = 0;
    let snippetReviewCount = 0;

    for (const r of results) {
      const combined = `${r.title || ''} ${r.description || ''}`;

      if (snippetRating === 0) {
        const ratingMatch =
          combined.match(/(\d+\.?\d*)\s*(?:stars?|\/\s*5|out of 5)/i) ||
          combined.match(/rating[:\s]+(\d+\.?\d*)/i) ||
          combined.match(/(\d\.\d)\s*\(\d+\)/);
        if (ratingMatch) {
          const parsed = parseFloat(ratingMatch[1]);
          if (parsed >= 1 && parsed <= 5) snippetRating = parsed;
        }
      }

      if (snippetReviewCount === 0) {
        const countMatch =
          combined.match(/(\d[\d,]*)\s*(?:reviews?|ratings?|Google reviews?)/i) ||
          combined.match(/\d\.\d\s*\((\d[\d,]*)\)/);
        if (countMatch) {
          const parsed = parseInt(countMatch[1].replace(/,/g, ''));
          if (parsed > 0 && parsed < 100000) snippetReviewCount = parsed;
        }
      }
    }

    // ── Build search context for Claude ─────────────────────────────
    const searchContext = results
      .slice(0, 12)
      .map((r: any) => `[${r.url}] ${r.title}: ${r.description || ''}`)
      .join('\n');

    if (!searchContext && results.length === 0) {
      // No search results at all
      const response = {
        business_name,
        rating: null,
        review_count: null,
        themes: [],
        best_quotes: [],
        worst_quotes: [],
        sentiment_summary: 'No review data found for this business.',
        sources: [],
      };

      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/research/reviews',
        method: 'POST',
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(200).json(response);
    }

    // ── Call Claude to analyze ──────────────────────────────────────
    const claudeText = await callClaude(
      'You are a review intelligence analyst. You extract structured reputation data from search results about businesses. Respond ONLY with valid JSON. No markdown fences, no explanation.',
      `Analyze the following search results about "${business_name}"${location ? ` in ${location}` : ''} and extract review intelligence.

Search results:
${searchContext}

Return this exact JSON structure:
{
  "rating": <number or null — average star rating if found (e.g. 4.8)>,
  "review_count": <integer or null — total number of reviews if found>,
  "themes": ["<string — recurring positive or negative themes, 3-6 items>"],
  "best_quotes": ["<string — best customer quotes or paraphrased positive sentiments, 2-4 items>"],
  "worst_quotes": ["<string — negative customer quotes or complaints, 1-3 items>"],
  "sentiment_summary": "<string — 1-2 sentence summary of overall sentiment and reputation>",
  "sources": ["<string — review platforms found, e.g. 'Google Reviews', 'Yelp', 'TripAdvisor'>"]
}

Rules:
- Only include data that is grounded in the search results
- Use actual quotes from snippets where available
- If synthesizing sentiment from descriptions, make it clear these are themes, not verbatim quotes
- If no rating or review count is found in the results, return null
- For themes, identify recurring topics across multiple results
- For worst_quotes, only include if negative sentiment is actually present; empty array is fine`,
    );

    let parsed: any = {};
    if (claudeText) {
      try {
        parsed = JSON.parse(claudeText);
      } catch {
        // Try to extract JSON from response if Claude wrapped it
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
    const response = {
      business_name,
      rating: parsed.rating ?? snippetRating || null,
      review_count: parsed.review_count ?? snippetReviewCount || null,
      themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 6) : [],
      best_quotes: Array.isArray(parsed.best_quotes) ? parsed.best_quotes.slice(0, 4) : [],
      worst_quotes: Array.isArray(parsed.worst_quotes) ? parsed.worst_quotes.slice(0, 3) : [],
      sentiment_summary: parsed.sentiment_summary || 'Unable to determine sentiment from available data.',
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    };

    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/research/reviews',
      method: 'POST',
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    });

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[research/reviews] Error:', err);

    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/research/reviews',
      method: 'POST',
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    });

    return res.status(500).json({
      error: {
        code: 'internal_error',
        message: 'Failed to analyze reviews',
        details: err?.message || String(err),
      },
    });
  }
}

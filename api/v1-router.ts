/**
 * Catch-all route for /api/v1/*
 *
 * Consolidates all v1 API endpoints into a single serverless function
 * to stay within Vercel Hobby plan's 12-function limit.
 *
 * Routing table:
 *   POST /api/v1/campaigns/preview        → handlePreview
 *   POST /api/v1/campaigns/create         → handleCreate
 *   POST /api/v1/campaigns/:id/launch     → handleLaunch
 *   POST /api/v1/campaigns/:id/pause      → handlePause
 *   GET  /api/v1/campaigns/:id/performance → handlePerformance
 *   POST /api/v1/campaigns/:id/conversions → handleConversions
 *   POST /api/v1/keys/create              → handleKeysCreate
 *   POST /api/v1/research/reviews         → handleReviews
 *   POST /api/v1/research/competitors     → handleCompetitors
 *   POST /api/v1/research/market          → handleMarket
 *   POST /api/v1/creatives/generate       → handleCreativesGenerate
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';

export const config = { maxDuration: 120 };

// ═══════════════════════════════════════════════════════════════════════════
// ENV + CLIENTS
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || 'BSA3NLr2aVETRurlr8KaqHN-pBcOEqP';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ═══════════════════════════════════════════════════════════════════════════
// AUTH (inlined from _utils/auth.ts)
// ═══════════════════════════════════════════════════════════════════════════

const TIER_LIMITS: Record<string, { perMinute: number; perDay: number }> = {
  free:       { perMinute: 10,  perDay: 100   },
  pro:        { perMinute: 60,  perDay: 5_000 },
  enterprise: { perMinute: 300, perDay: 50_000 },
};

interface ApiKeyRecord {
  id: string;
  user_id: string;
  tier: string;
  is_live: boolean;
  rate_limit_per_min: number;
  rate_limit_per_day: number;
  name: string;
}

interface AuthSuccess {
  error: false;
  keyRecord: ApiKeyRecord;
  rateLimitHeaders: Record<string, string>;
}

interface AuthFailure {
  error: true;
  status: number;
  body: { error: { code: string; message: string; retry_after?: number } };
  rateLimitHeaders?: Record<string, string>;
}

type AuthResult = AuthSuccess | AuthFailure;

/** Narrow auth result after error check */
function assertAuth(auth: AuthResult): asserts auth is AuthSuccess {
  if (auth.error) throw new Error('Auth not narrowed');
}

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

async function authenticateRequest(
  req: { headers: Record<string, string | string[] | undefined> },
): Promise<AuthResult> {
  const authHeader =
    (req.headers['authorization'] as string) ||
    (req.headers['Authorization'] as string) ||
    '';

  if (!authHeader.startsWith('Bearer ')) {
    return {
      error: true,
      status: 401,
      body: { error: { code: 'missing_api_key', message: 'Authorization header must be: Bearer <api_key>' } },
    };
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    return {
      error: true,
      status: 401,
      body: { error: { code: 'missing_api_key', message: 'API key is empty' } },
    };
  }

  const keyHash = hashKey(rawKey);

  const { data: keyRecord, error: dbError } = await supabaseAdmin
    .from('api_keys')
    .select('id, user_id, tier, is_live, rate_limit_per_min, rate_limit_per_day, name, revoked_at')
    .eq('key_hash', keyHash)
    .single();

  if (dbError || !keyRecord) {
    return {
      error: true,
      status: 401,
      body: { error: { code: 'invalid_api_key', message: 'The provided API key is not valid' } },
    };
  }

  if (keyRecord.revoked_at) {
    return {
      error: true,
      status: 401,
      body: { error: { code: 'revoked_api_key', message: 'This API key has been revoked' } },
    };
  }

  const tier = keyRecord.tier || 'free';
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  const perMin = keyRecord.rate_limit_per_min || limits.perMinute;

  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await supabaseAdmin
    .from('api_usage')
    .select('id', { count: 'exact', head: true })
    .eq('api_key_id', keyRecord.id)
    .gte('created_at', oneMinuteAgo);

  const used = recentCount ?? 0;
  const remaining = Math.max(0, perMin - used);
  const resetAt = Math.ceil((Date.now() + 60_000) / 1000);

  const rateLimitHeaders: Record<string, string> = {
    'X-RateLimit-Limit': String(perMin),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(resetAt),
  };

  if (used >= perMin) {
    return {
      error: true,
      status: 429,
      body: {
        error: {
          code: 'rate_limit_exceeded',
          message: `Rate limit exceeded. You may make ${perMin} requests per minute on the ${tier} tier.`,
          retry_after: 60,
        },
      },
      rateLimitHeaders,
    };
  }

  supabaseAdmin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id)
    .then(() => {});

  return {
    error: false,
    keyRecord: {
      id: keyRecord.id,
      user_id: keyRecord.user_id,
      tier,
      is_live: keyRecord.is_live,
      rate_limit_per_min: perMin,
      rate_limit_per_day: keyRecord.rate_limit_per_day || limits.perDay,
      name: keyRecord.name,
    },
    rateLimitHeaders,
  };
}

async function logUsage(opts: {
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
}): Promise<void> {
  await supabaseAdmin.from('api_usage').insert({
    api_key_id: opts.apiKeyId,
    endpoint: opts.endpoint,
    method: opts.method,
    status_code: opts.statusCode,
    response_time_ms: opts.responseTimeMs,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function applyRateLimitHeaders(res: VercelResponse, headers: Record<string, string>) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
}

async function metaPost(
  path: string,
  params: Record<string, string>,
  accessToken: string,
): Promise<{ ok: boolean; data: any; rawBody: string }> {
  const form = new URLSearchParams(params);
  form.set('access_token', accessToken);

  const r = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const rawBody = await r.text();
  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch {
    data = { error: { message: `Non-JSON response: ${rawBody.slice(0, 500)}`, type: 'ParseError', code: -1 } };
  }
  return { ok: r.ok, data, rawBody };
}

async function braveSearch(query: string, count = 10): Promise<any[]> {
  const r = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
    { headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' } },
  );
  if (!r.ok) return [];
  const data = await r.json();
  return data.web?.results || [];
}

async function callClaude(system: string, userMessage: string, maxTokens = 1500): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
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
  if (!r.ok) return null;
  const data = await r.json();
  return data.content?.[0]?.text || null;
}

function parseClaudeJson(text: string | null): any {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { return {}; }
    }
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// ── POST /api/v1/campaigns/preview ──────────────────────────────────────

async function handlePreview(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const { url, ad_count, review_data, competitor_data } = req.body || {};

  if (!url || typeof url !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/preview', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`url` is required and must be a string' } });
  }

  try {
    // Step 1: Scrape the website
    let scrapedData: Record<string, any> | null = null;
    try {
      let targetUrl = url;
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) targetUrl = 'https://' + targetUrl;

      const scrapeResponse = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZuckerBot/1.0; +https://zuckerbot.ai)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      if (scrapeResponse.ok) {
        const html = await scrapeResponse.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);

        const headingRegex = /<h[1-3][^>]*>([^<]*(?:<[^/][^>]*>[^<]*)*)<\/h[1-3]>/gi;
        const headings: string[] = [];
        let hMatch;
        while ((hMatch = headingRegex.exec(html)) !== null && headings.length < 10) {
          const cleanText = hMatch[1].replace(/<[^>]+>/g, '').trim();
          if (cleanText) headings.push(cleanText);
        }

        const rawText = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 2000);

        scrapedData = {
          title: titleMatch?.[1]?.trim() || '',
          description: metaDescMatch?.[1] || ogDescMatch?.[1] || '',
          ogImage: ogImageMatch?.[1] || null,
          headings,
          rawText,
        };
      }
    } catch {
      // Scraping failed — continue without it
    }

    // Step 2: Generate ad copy via Claude
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/preview', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
      return res.status(500).json({ error: { code: 'config_error', message: 'AI generation service not configured' } });
    }

    const numAds = Math.min(Math.max(ad_count ?? 2, 1), 3);
    const businessName = scrapedData?.title || url;
    const scrapedSection = scrapedData
      ? `\nWEBSITE DATA:\n- Title: ${scrapedData.title}\n- Description: ${scrapedData.description}\n- Key headings: ${scrapedData.headings.join(', ')}\n- Content: ${scrapedData.rawText.slice(0, 1500)}\n`
      : 'No website content could be scraped. Base analysis on the URL only.';

    const reviewSection = review_data
      ? `\nREVIEW DATA:\n- Rating: ${review_data.rating || 'N/A'}\n- Review count: ${review_data.review_count || 'N/A'}\n- Themes: ${(review_data.themes || []).join(', ')}\n- Best quotes: ${(review_data.best_quotes || []).join('; ')}\n`
      : '';

    const competitorSection = competitor_data
      ? `\nCOMPETITOR DATA:\n- Common hooks: ${(competitor_data.common_hooks || []).join(', ')}\n- Gaps: ${(competitor_data.gaps || []).join(', ')}\n`
      : '';

    const prompt = `You are a Facebook ad copywriter for ZuckerBot. Generate ${numAds} ad variant(s) for this business.

URL: ${url}
${scrapedSection}${reviewSection}${competitorSection}

Generate a JSON response with EXACTLY this structure (no markdown, pure JSON):

{
  "business_name": "string — inferred business name",
  "description": "string — one line describing the business",
  "ads": [
    {
      "headline": "string — max 40 chars, attention-grabbing",
      "copy": "string — max 125 chars, compelling primary text",
      "rationale": "string — why this angle works for this business",
      "angle": "social_proof|urgency|value|curiosity"
    }
  ]
}

RULES:
- Each ad should use a DIFFERENT psychological angle
- Reference SPECIFIC details from the website (not generic copy)
- If review data is provided, incorporate ratings/quotes as social proof
- If competitor data is provided, exploit gaps they're missing
- Headlines must be ≤40 chars. Copy must be ≤125 chars.
- Respond with ONLY the JSON. No explanation.`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error('[api/preview] Claude API error:', errText);
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/preview', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'upstream_error', message: 'AI generation service returned an error' } });
    }

    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content?.[0]?.type === 'text' ? claudeData.content[0].text : '';

    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Try extracting JSON from markdown fences
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        console.error('[api/preview] Failed to parse Claude response:', rawText.slice(0, 500));
        await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/preview', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
        return res.status(502).json({ error: { code: 'parse_error', message: 'Failed to parse AI-generated ad data' } });
      }
    }

    const previewId = `prev_${Date.now().toString(36)}`;
    const response = {
      id: previewId,
      business_name: parsed.business_name || businessName,
      description: parsed.description || scrapedData?.description || null,
      ads: Array.isArray(parsed.ads)
        ? parsed.ads.map((ad: any) => ({
            headline: ad.headline || '',
            copy: ad.copy || ad.primary_text || '',
            rationale: ad.rationale || '',
            angle: ad.angle || 'general',
            image_url: scrapedData?.ogImage || null,
          }))
        : [],
      enrichment: {
        has_reviews: !!review_data,
        has_competitors: !!competitor_data,
        review_themes_used: review_data?.themes || [],
        competitor_gaps_exploited: competitor_data?.gaps || [],
      },
      created_at: new Date().toISOString(),
    };

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/preview', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[api/preview] Unexpected error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/preview', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred', details: err?.message || String(err) } });
  }
}

// ── POST /api/v1/campaigns/create ───────────────────────────────────────

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const { url, business_name, business_type, location, budget_daily_cents, objective, meta_access_token } = req.body || {};

  if (!url || typeof url !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`url` is required and must be a string' } });
  }

  try {
    // Scrape the website
    let scrapedData: Record<string, any> | null = null;
    try {
      let targetUrl = url;
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) targetUrl = 'https://' + targetUrl;

      const scrapeResponse = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZuckerBot/1.0; +https://zuckerbot.ai)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      if (scrapeResponse.ok) {
        const html = await scrapeResponse.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);

        const headingRegex = /<h[1-3][^>]*>([^<]*(?:<[^/][^>]*>[^<]*)*)<\/h[1-3]>/gi;
        const headings: string[] = [];
        let hMatch;
        while ((hMatch = headingRegex.exec(html)) !== null && headings.length < 10) {
          const cleanText = hMatch[1].replace(/<[^>]+>/g, '').trim();
          if (cleanText) headings.push(cleanText);
        }

        const rawText = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 3000);

        scrapedData = { title: titleMatch?.[1]?.trim() || '', description: metaDescMatch?.[1] || ogDescMatch?.[1] || '', headings, rawText };
      }
    } catch {
      // Scraping failed — continue without it
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
      return res.status(500).json({ error: { code: 'config_error', message: 'AI generation service not configured' } });
    }

    const resolvedName = business_name || scrapedData?.title || url;
    const resolvedType = business_type || 'business';
    const locationStr = location ? [location.city, location.state, location.country].filter(Boolean).join(', ') : '';
    const budgetCents = budget_daily_cents || 2000;
    const obj = objective || 'leads';

    const scrapedSection = scrapedData
      ? `\nWEBSITE ANALYSIS:\n- Title: ${scrapedData.title}\n- Description: ${scrapedData.description}\n- Key headings: ${scrapedData.headings.join(', ')}\n- Page content preview: ${scrapedData.rawText.slice(0, 1500)}\n`
      : 'No website content could be scraped — analysis based on URL and provided details only.';

    const prompt = `You are the head strategist at ZuckerBot, an AI-powered advertising agency. Generate a complete campaign plan for this business.

BUSINESS DETAILS:
- Name: ${resolvedName}
- Type: ${resolvedType}
- Location: ${locationStr || 'Not specified'}
- Website: ${url}
- Daily budget: $${(budgetCents / 100).toFixed(2)}
- Objective: ${obj}

${scrapedSection}

Generate a JSON response with this EXACT structure (no markdown fences, pure JSON):

{
  "business_name": "string",
  "business_type": "string",
  "strategy": {
    "objective": "leads|traffic|awareness",
    "summary": "string — 1-2 sentence strategy summary",
    "strengths": ["string"],
    "opportunities": ["string"],
    "recommended_daily_budget_cents": number,
    "projected_cpl_cents": number,
    "projected_monthly_leads": number
  },
  "targeting": {
    "age_min": number,
    "age_max": number,
    "radius_km": number,
    "interests": ["string — 4-6 Meta interest targeting keywords"],
    "geo_locations": {
      "custom_locations": [
        { "latitude": number, "longitude": number, "radius": 15, "distance_unit": "kilometer" }
      ]
    },
    "publisher_platforms": ["facebook", "instagram"],
    "facebook_positions": ["feed"],
    "instagram_positions": ["stream"]
  },
  "variants": [
    {
      "headline": "string — max 40 chars",
      "copy": "string — max 125 chars",
      "cta": "Learn More|Call Now|Get Quote|Book Now|Sign Up",
      "angle": "social_proof|urgency|value",
      "image_prompt": "string — prompt to generate an ad image"
    }
  ],
  "roadmap": {
    "week_1_2": ["string — action items"],
    "week_3_4": ["string — action items"],
    "month_2": ["string — action items"],
    "month_3": ["string — action items"]
  }
}

RULES:
- Generate exactly 3 variants with different psychological angles (social_proof, urgency, value)
- Headlines ≤40 chars. Copy ≤125 chars.
- Be SPECIFIC to this business — reference actual details from the website
- Use real benchmark numbers for projections based on business type
- If location data is provided, include it in geo_locations targeting
- Respond with ONLY the JSON object. No explanation.`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error('[api/create] Claude API error:', errText);
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'upstream_error', message: 'AI generation service returned an error' } });
    }

    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content?.[0]?.type === 'text' ? claudeData.content[0].text : '';

    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error('[api/create] Failed to parse Claude response:', rawText.slice(0, 500));
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'parse_error', message: 'Failed to parse AI-generated campaign data' } });
    }

    const campaignId = `camp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    const { error: insertError } = await supabaseAdmin
      .from('api_campaigns')
      .insert({
        id: campaignId, api_key_id: auth.keyRecord.id, user_id: auth.keyRecord.user_id,
        status: 'draft', url, business_name: parsed.business_name || resolvedName,
        business_type: parsed.business_type || resolvedType, strategy: parsed.strategy || null,
        targeting: parsed.targeting || null, variants: parsed.variants || null,
        roadmap: parsed.roadmap || null, meta_access_token: meta_access_token || null,
        daily_budget_cents: budgetCents, objective: obj, created_at: new Date().toISOString(),
      })
      .single();

    if (insertError) console.warn('[api/create] Could not persist campaign to DB:', insertError.message);

    const response = {
      id: campaignId,
      status: 'draft' as const,
      business_name: parsed.business_name || resolvedName,
      business_type: parsed.business_type || resolvedType,
      strategy: parsed.strategy || { objective: obj, summary: `${obj} campaign for ${resolvedName}`, strengths: [], opportunities: [], recommended_daily_budget_cents: budgetCents, projected_cpl_cents: null, projected_monthly_leads: null },
      targeting: parsed.targeting || { age_min: 25, age_max: 65, radius_km: 25, interests: [], publisher_platforms: ['facebook', 'instagram'] },
      variants: (parsed.variants || []).map((v: any) => ({ headline: v.headline || '', copy: v.copy || v.body || '', cta: v.cta || 'Learn More', angle: v.angle || 'general', image_prompt: v.image_prompt || null, image_url: v.image_url || null })),
      roadmap: parsed.roadmap || {},
      created_at: new Date().toISOString(),
    };

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[api/create] Unexpected error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred while creating the campaign', details: err?.message || String(err) } });
  }
}

// ── POST /api/v1/campaigns/:id/launch ───────────────────────────────────

async function handleLaunch(req: VercelRequest, res: VercelResponse, campaignId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  if (!campaignId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: 'Campaign ID is required in URL path' } });
  }

  const { meta_access_token, meta_ad_account_id, meta_page_id, variant_index = 0, daily_budget_cents, radius_km } = req.body || {};

  if (!meta_access_token || typeof meta_access_token !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`meta_access_token` is required' } });
  }
  if (!meta_ad_account_id || typeof meta_ad_account_id !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`meta_ad_account_id` is required (e.g. "act_123456789")' } });
  }
  if (!meta_page_id || typeof meta_page_id !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`meta_page_id` is required (Facebook Page ID for lead form)' } });
  }

  try {
    let campaign: Record<string, any> | null = null;
    const { data: apiCampaign } = await supabaseAdmin
      .from('api_campaigns').select('*').eq('id', campaignId).eq('api_key_id', auth.keyRecord.id).single();
    if (apiCampaign) campaign = apiCampaign;

    const businessName = campaign?.business_name || 'Campaign';
    const variants = campaign?.variants || [];
    const targeting = campaign?.targeting || {};
    const selectedVariant = variants[variant_index] || variants[0] || {};
    const budgetCents = daily_budget_cents || campaign?.daily_budget_cents || 2000;
    const targetRadius = radius_km || targeting?.radius_km || 25;

    const headline = selectedVariant.headline || businessName;
    const adBody = selectedVariant.copy || `Check out ${businessName}`;
    const cta = selectedVariant.cta || 'Learn More';
    const imageUrl = selectedVariant.image_url || null;

    const campaignName = `${businessName} – API – ${new Date().toISOString().slice(0, 10)}`;
    const adAccountId = meta_ad_account_id.replace(/^act_/, '');

    // Step 1: Create Meta Campaign
    const campaignResult = await metaPost(`/act_${adAccountId}/campaigns`, { name: campaignName, objective: 'OUTCOME_LEADS', status: 'PAUSED', special_ad_categories: JSON.stringify([]) }, meta_access_token);
    if (!campaignResult.ok || !campaignResult.data.id) {
      console.error('[api/launch] Campaign creation failed:', campaignResult.rawBody);
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'meta_api_error', message: campaignResult.data.error?.message || 'Failed to create campaign on Meta', meta_error: campaignResult.data.error, step: 'campaign' } });
    }
    const metaCampaignId = campaignResult.data.id;

    // Step 2: Create Ad Set
    const geoLocations: Record<string, any> = {};
    if (targeting?.geo_locations?.custom_locations?.length) geoLocations.custom_locations = targeting.geo_locations.custom_locations;
    else geoLocations.countries = ['US'];

    const adSetTargeting: Record<string, any> = {
      age_min: targeting?.age_min || 25, age_max: targeting?.age_max || 65,
      geo_locations: geoLocations, publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed'], instagram_positions: ['stream'],
    };

    const adSetResult = await metaPost(`/act_${adAccountId}/adsets`, {
      name: `${campaignName} – Ad Set`, campaign_id: metaCampaignId,
      daily_budget: String(budgetCents), billing_event: 'IMPRESSIONS',
      optimization_goal: 'LEAD_GENERATION', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify(adSetTargeting), promoted_object: JSON.stringify({ page_id: meta_page_id }),
      destination_type: 'ON_AD', status: 'PAUSED', start_time: new Date().toISOString(),
    }, meta_access_token);

    if (!adSetResult.ok || !adSetResult.data.id) {
      console.error('[api/launch] Ad set creation failed:', adSetResult.rawBody);
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'meta_api_error', message: adSetResult.data.error?.message || 'Failed to create ad set on Meta', meta_error: adSetResult.data.error, step: 'adset' } });
    }
    const metaAdSetId = adSetResult.data.id;

    // Step 3: Create Lead Form
    const leadFormResult = await metaPost(`/${meta_page_id}/leadgen_forms`, {
      name: `${businessName} Lead Form – ${Date.now()}`,
      questions: JSON.stringify([{ type: 'FULL_NAME' }, { type: 'PHONE' }, { type: 'EMAIL' }, { type: 'CUSTOM', key: 'location', label: 'What area are you in?' }]),
      privacy_policy: JSON.stringify({ url: 'https://zuckerbot.ai/privacy', link_text: 'Privacy Policy' }),
      thank_you_page: JSON.stringify({ title: 'Thanks for your enquiry!', body: `${businessName} will be in touch shortly.`, button_type: 'NONE' }),
    }, meta_access_token);

    if (!leadFormResult.ok || !leadFormResult.data.id) {
      console.error('[api/launch] Lead form creation failed:', leadFormResult.rawBody);
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'meta_api_error', message: leadFormResult.data.error?.message || 'Failed to create lead form', meta_error: leadFormResult.data.error, step: 'leadform' } });
    }
    const metaLeadFormId = leadFormResult.data.id;

    // Step 4: Create Ad Creative
    const ctaMap: Record<string, string> = { 'Get Quote': 'GET_QUOTE', 'Call Now': 'CALL_NOW', 'Learn More': 'LEARN_MORE', 'Sign Up': 'SIGN_UP', 'Book Now': 'BOOK_NOW', 'Contact Us': 'CONTACT_US' };
    const ctaType = ctaMap[cta] || 'LEARN_MORE';

    const objectStorySpec: Record<string, any> = {
      page_id: meta_page_id,
      link_data: { message: adBody, name: headline, link: 'https://zuckerbot.ai/', call_to_action: { type: ctaType, value: { lead_gen_form_id: metaLeadFormId } }, ...(imageUrl ? { picture: imageUrl } : {}) },
    };

    const creativeResult = await metaPost(`/act_${adAccountId}/adcreatives`, { name: `${campaignName} – Creative`, object_story_spec: JSON.stringify(objectStorySpec) }, meta_access_token);
    if (!creativeResult.ok || !creativeResult.data.id) {
      console.error('[api/launch] Creative creation failed:', creativeResult.rawBody);
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'meta_api_error', message: creativeResult.data.error?.message || 'Failed to create ad creative', meta_error: creativeResult.data.error, step: 'creative' } });
    }
    const metaCreativeId = creativeResult.data.id;

    // Step 5: Create Ad
    const adResult = await metaPost(`/act_${adAccountId}/ads`, { name: `${campaignName} – Ad`, adset_id: metaAdSetId, creative: JSON.stringify({ creative_id: metaCreativeId }), status: 'PAUSED' }, meta_access_token);
    if (!adResult.ok || !adResult.data.id) {
      console.error('[api/launch] Ad creation failed:', adResult.rawBody);
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'meta_api_error', message: adResult.data.error?.message || 'Failed to create ad', meta_error: adResult.data.error, step: 'ad' } });
    }
    const metaAdId = adResult.data.id;

    // Step 6: Activate
    const activateAd = await metaPost(`/${metaAdId}`, { status: 'ACTIVE' }, meta_access_token);
    if (!activateAd.ok) {
      console.error('[api/launch] Failed to activate ad:', activateAd.rawBody);
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'meta_api_error', message: activateAd.data.error?.message || 'Failed to activate ad', meta_error: activateAd.data.error, step: 'activate' } });
    }

    await metaPost(`/${metaAdSetId}`, { status: 'ACTIVE' }, meta_access_token);
    await metaPost(`/${metaCampaignId}`, { status: 'ACTIVE' }, meta_access_token);

    // Step 7: Update DB
    const launchedAt = new Date().toISOString();

    supabaseAdmin.from('api_campaigns').update({ status: 'active', meta_campaign_id: metaCampaignId, meta_adset_id: metaAdSetId, meta_ad_id: metaAdId, meta_leadform_id: metaLeadFormId, launched_at: launchedAt }).eq('id', campaignId).then(() => {});
    supabaseAdmin.from('campaigns').insert({ business_id: null, name: campaignName, status: 'active', daily_budget_cents: budgetCents, radius_km: targetRadius, ad_headline: headline, ad_copy: adBody, ad_image_url: imageUrl || null, meta_campaign_id: metaCampaignId, meta_adset_id: metaAdSetId, meta_ad_id: metaAdId, meta_leadform_id: metaLeadFormId, leads_count: 0, spend_cents: 0, launched_at: launchedAt }).then(() => {});

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json({ id: campaignId, status: 'active', meta_campaign_id: metaCampaignId, meta_adset_id: metaAdSetId, meta_ad_id: metaAdId, meta_leadform_id: metaLeadFormId, daily_budget_cents: budgetCents, launched_at: launchedAt });
  } catch (err: any) {
    console.error('[api/launch] Unexpected error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred while launching the campaign', details: err?.message || String(err) } });
  }
}

// ── POST /api/v1/campaigns/:id/pause ────────────────────────────────────

async function handlePause(req: VercelRequest, res: VercelResponse, campaignId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  if (!campaignId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/pause', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: 'Campaign ID is required in URL path' } });
  }

  const { action = 'pause', meta_access_token } = req.body || {};

  if (!['pause', 'resume'].includes(action)) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/pause', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`action` must be "pause" or "resume"' } });
  }

  try {
    let metaCampaignId: string | null = null;
    let source: 'api_campaigns' | 'campaigns' | null = null;
    let recordId: string | null = null;

    const { data: apiCampaign } = await supabaseAdmin
      .from('api_campaigns').select('id, meta_campaign_id, meta_access_token, status')
      .eq('id', campaignId).eq('api_key_id', auth.keyRecord.id).single();

    if (apiCampaign?.meta_campaign_id) {
      metaCampaignId = apiCampaign.meta_campaign_id;
      source = 'api_campaigns';
      recordId = apiCampaign.id;
    }

    if (!metaCampaignId) {
      const { data: dbCampaign } = await supabaseAdmin
        .from('campaigns').select('id, meta_campaign_id, status')
        .eq('meta_campaign_id', campaignId).single();
      if (dbCampaign?.meta_campaign_id) {
        metaCampaignId = dbCampaign.meta_campaign_id;
        source = 'campaigns';
        recordId = dbCampaign.id;
      }
    }

    if (!metaCampaignId) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/pause', method: 'POST', statusCode: 404, responseTimeMs: Date.now() - startTime });
      return res.status(404).json({ error: { code: 'not_found', message: 'Campaign not found or has not been launched on Meta yet' } });
    }

    const accessToken = meta_access_token || (apiCampaign?.meta_access_token as string) || process.env.META_SYSTEM_USER_TOKEN;
    if (!accessToken) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/pause', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({ error: { code: 'missing_token', message: '`meta_access_token` is required — either in the request body or stored with the campaign' } });
    }

    const metaStatus = action === 'pause' ? 'PAUSED' : 'ACTIVE';
    const form = new URLSearchParams({ status: metaStatus, access_token: accessToken });

    const metaResponse = await fetch(`${GRAPH_BASE}/${metaCampaignId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const metaData = await metaResponse.json();
    if (!metaResponse.ok || metaData.error) {
      console.error('[api/pause] Meta API error:', JSON.stringify(metaData));
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/pause', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'meta_api_error', message: metaData.error?.message || `Meta API returned ${metaResponse.status}`, meta_error: metaData.error } });
    }

    const newStatus = action === 'pause' ? 'paused' : 'active';
    if (source === 'api_campaigns' && recordId) supabaseAdmin.from('api_campaigns').update({ status: newStatus }).eq('id', recordId).then(() => {});
    if (source === 'campaigns' && recordId) supabaseAdmin.from('campaigns').update({ status: newStatus }).eq('id', recordId).then(() => {});

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/pause', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json({ campaign_id: campaignId, status: newStatus, meta_campaign_id: metaCampaignId });
  } catch (err: any) {
    console.error('[api/pause] Unexpected error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/pause', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred', details: err?.message || String(err) } });
  }
}

// ── GET /api/v1/campaigns/:id/performance ───────────────────────────────

function determinePerformanceStatus(status: string, launchedAt: string | null, createdAt: string | null, impressions: number, spendCents: number, leadsCount: number, cplCents: number | null): string {
  if (status === 'paused') return 'paused';
  const refTime = launchedAt || createdAt;
  const hoursSinceLaunch = refTime ? (Date.now() - new Date(refTime).getTime()) / (1000 * 60 * 60) : 0;
  if (hoursSinceLaunch < 48 || impressions < 500) return 'learning';
  if (cplCents !== null && cplCents >= 3000) return 'underperforming';
  if (spendCents > 5000 && leadsCount === 0) return 'underperforming';
  if (cplCents !== null && cplCents < 3000 && leadsCount >= 1) return 'healthy';
  return 'learning';
}

async function handlePerformance(req: VercelRequest, res: VercelResponse, campaignId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  if (!campaignId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/performance', method: 'GET', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: 'Campaign ID is required in URL path' } });
  }

  const queryToken = req.query.meta_access_token as string | undefined;

  try {
    let metaCampaignId: string | null = null;
    let campaignStatus = 'unknown';
    let launchedAt: string | null = null;
    let createdAt: string | null = null;
    let storedAccessToken: string | null = null;
    let businessId: string | null = null;

    const { data: apiCampaign } = await supabaseAdmin
      .from('api_campaigns').select('id, meta_campaign_id, meta_access_token, status, launched_at, created_at')
      .eq('id', campaignId).eq('api_key_id', auth.keyRecord.id).single();

    if (apiCampaign?.meta_campaign_id) {
      metaCampaignId = apiCampaign.meta_campaign_id;
      campaignStatus = apiCampaign.status || 'unknown';
      launchedAt = apiCampaign.launched_at;
      createdAt = apiCampaign.created_at;
      storedAccessToken = apiCampaign.meta_access_token;
    }

    if (!metaCampaignId) {
      const { data: dbCampaign } = await supabaseAdmin
        .from('campaigns').select('id, business_id, meta_campaign_id, status, launched_at, created_at')
        .or(`meta_campaign_id.eq.${campaignId},id.eq.${campaignId}`).single();

      if (dbCampaign?.meta_campaign_id) {
        metaCampaignId = dbCampaign.meta_campaign_id;
        campaignStatus = dbCampaign.status || 'unknown';
        launchedAt = dbCampaign.launched_at;
        createdAt = dbCampaign.created_at;
        businessId = dbCampaign.business_id;

        if (businessId) {
          const { data: biz } = await supabaseAdmin.from('businesses').select('facebook_access_token').eq('id', businessId).single();
          if (biz?.facebook_access_token) storedAccessToken = biz.facebook_access_token;
        }
      }
    }

    if (!metaCampaignId) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/performance', method: 'GET', statusCode: 404, responseTimeMs: Date.now() - startTime });
      return res.status(404).json({ error: { code: 'not_found', message: 'Campaign not found or has not been launched on Meta yet' } });
    }

    const accessToken = queryToken || storedAccessToken || process.env.META_SYSTEM_USER_TOKEN;
    if (!accessToken) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/performance', method: 'GET', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({ error: { code: 'missing_token', message: 'A Meta access token is required. Pass `meta_access_token` as a query parameter.' } });
    }

    const insightsUrl = `${GRAPH_BASE}/${metaCampaignId}/insights?fields=impressions,clicks,spend,actions&date_preset=lifetime&access_token=${accessToken}`;
    const metaResponse = await fetch(insightsUrl);
    const metaData = await metaResponse.json();

    if (!metaResponse.ok || metaData.error) {
      console.error('[api/performance] Meta Insights error:', JSON.stringify(metaData));
      if (metaResponse.status === 401 || metaData.error?.code === 190) {
        await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/performance', method: 'GET', statusCode: 401, responseTimeMs: Date.now() - startTime });
        return res.status(401).json({ error: { code: 'token_expired', message: 'Meta access token has expired. Please provide a fresh token.' } });
      }
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/performance', method: 'GET', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'meta_api_error', message: metaData.error?.message || `Meta API returned ${metaResponse.status}`, meta_error: metaData.error } });
    }

    const insights = metaData.data?.[0];
    const impressions = insights?.impressions ? parseInt(insights.impressions, 10) : 0;
    const clicks = insights?.clicks ? parseInt(insights.clicks, 10) : 0;
    const spendDollars = insights?.spend ? parseFloat(insights.spend) : 0;
    const spendCents = Math.round(spendDollars * 100);
    const leadAction = insights?.actions?.find((a: any) => a.action_type === 'lead');
    const leadsCount = leadAction ? parseInt(leadAction.value, 10) : 0;
    const cplCents = leadsCount > 0 ? Math.round(spendCents / leadsCount) : null;
    const ctrPct = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;

    const hoursSinceLaunch = launchedAt ? (Date.now() - new Date(launchedAt).getTime()) / (1000 * 60 * 60)
      : createdAt ? (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60) : 0;

    const performanceStatus = determinePerformanceStatus(campaignStatus, launchedAt, createdAt, impressions, spendCents, leadsCount, cplCents);

    const updatePayload = { impressions, clicks, spend_cents: spendCents, leads_count: leadsCount, cpl_cents: cplCents, performance_status: performanceStatus, last_synced_at: new Date().toISOString() };
    supabaseAdmin.from('campaigns').update(updatePayload).eq('meta_campaign_id', metaCampaignId).then(() => {});

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/performance', method: 'GET', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json({
      campaign_id: campaignId, status: campaignStatus, performance_status: performanceStatus,
      metrics: { impressions, clicks, spend_cents: spendCents, leads_count: leadsCount, cpl_cents: cplCents, ctr_pct: ctrPct },
      hours_since_launch: Math.round(hoursSinceLaunch * 10) / 10, last_synced_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[api/performance] Unexpected error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/performance', method: 'GET', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred', details: err?.message || String(err) } });
  }
}

// ── POST /api/v1/campaigns/:id/conversions ──────────────────────────────

async function handleConversions(req: VercelRequest, res: VercelResponse, campaignId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  if (!campaignId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/conversions', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: 'Campaign ID is required in URL path' } });
  }

  const { lead_id, quality, meta_access_token, user_data } = req.body || {};

  if (!lead_id || typeof lead_id !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/conversions', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`lead_id` is required' } });
  }
  if (!quality || !['good', 'bad'].includes(quality)) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/conversions', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`quality` must be "good" or "bad"' } });
  }

  try {
    let storedAccessToken: string | null = null;
    let pixelId: string | null = process.env.META_PIXEL_ID || null;

    const { data: apiCampaign } = await supabaseAdmin
      .from('api_campaigns').select('id, meta_campaign_id, meta_access_token')
      .eq('id', campaignId).eq('api_key_id', auth.keyRecord.id).single();
    if (apiCampaign) storedAccessToken = apiCampaign.meta_access_token;

    let leadData: Record<string, any> | null = null;
    const { data: lead } = await supabaseAdmin
      .from('leads').select('id, name, phone, email, meta_lead_id, campaign_id, business_id, created_at')
      .eq('id', lead_id).single();
    if (lead) {
      leadData = lead;
      if (lead.business_id) {
        const { data: biz } = await supabaseAdmin.from('businesses').select('facebook_access_token, facebook_page_id').eq('id', lead.business_id).single();
        if (biz?.facebook_access_token) storedAccessToken = storedAccessToken || biz.facebook_access_token;
      }
    }

    const accessToken = meta_access_token || storedAccessToken || process.env.META_SYSTEM_USER_TOKEN;
    if (!accessToken || !pixelId) {
      console.log('[api/conversions] No Meta access token or pixel ID — skipping CAPI call');
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/conversions', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
      return res.status(200).json({ success: true, capi_sent: false, message: 'Conversion quality recorded but Meta CAPI not configured (missing access token or pixel ID)', quality, lead_id });
    }

    const eventTime = Math.floor(Date.now() / 1000);
    const capiUserData: Record<string, string> = {};

    if (user_data?.email) capiUserData.em = user_data.email.toLowerCase().trim();
    if (user_data?.phone) {
      let phone = user_data.phone.replace(/\s+/g, '');
      if (phone.startsWith('0')) phone = '+61' + phone.slice(1);
      capiUserData.ph = phone;
    }
    if (user_data?.first_name) capiUserData.fn = user_data.first_name.toLowerCase().trim();
    if (user_data?.last_name) capiUserData.ln = user_data.last_name.toLowerCase().trim();

    if (leadData) {
      if (leadData.email && !capiUserData.em) capiUserData.em = leadData.email.toLowerCase().trim();
      if (leadData.phone && !capiUserData.ph) {
        let phone = leadData.phone.replace(/\s+/g, '');
        if (phone.startsWith('0')) phone = '+61' + phone.slice(1);
        capiUserData.ph = phone;
      }
      if (leadData.name && !capiUserData.fn) {
        const parts = leadData.name.trim().split(/\s+/);
        if (parts[0]) capiUserData.fn = parts[0].toLowerCase();
        if (parts.length > 1) capiUserData.ln = parts[parts.length - 1].toLowerCase();
      }
    }

    const event: Record<string, any> = {
      event_name: quality === 'good' ? 'Lead' : 'Other',
      event_time: eventTime,
      action_source: 'system',
      user_data: capiUserData,
      custom_data: { lead_quality: quality, lead_id, campaign_id: campaignId, value: quality === 'good' ? 100 : 0, currency: 'USD' },
    };
    if (leadData?.meta_lead_id) event.event_id = leadData.meta_lead_id;

    const capiUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`;
    const capiResponse = await fetch(capiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event], access_token: accessToken }),
    });

    const capiResult = await capiResponse.json();
    if (!capiResponse.ok) {
      console.error('[api/conversions] CAPI error:', JSON.stringify(capiResult));
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/conversions', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'capi_error', message: 'Meta Conversion API returned an error', details: capiResult } });
    }

    console.log(`[api/conversions] CAPI success — ${quality} signal for lead ${lead_id}`);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/conversions', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json({ success: true, capi_sent: true, events_received: capiResult.events_received || 1, quality, lead_id });
  } catch (err: any) {
    console.error('[api/conversions] Unexpected error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/conversions', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred', details: err?.message || String(err) } });
  }
}

// ── POST /api/v1/keys/create ────────────────────────────────────────────

async function handleKeysCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const authHeader = (req.headers['authorization'] as string) || (req.headers['Authorization'] as string) || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Authorization header with Supabase JWT required' } });
  }

  const jwt = authHeader.slice(7).trim();
  const { data: userData, error: authError } = await supabaseAnon.auth.getUser(jwt);
  if (authError || !userData?.user) {
    return res.status(401).json({ error: { code: 'invalid_jwt', message: 'Invalid or expired Supabase auth token' } });
  }

  const userId = userData.user.id;
  const { name = 'Default', is_live = true, tier = 'free' } = req.body || {};

  const validTiers = ['free', 'pro', 'enterprise'];
  const safeTier = validTiers.includes(tier) ? tier : 'free';

  const KEY_TIER_DEFAULTS: Record<string, { perMin: number; perDay: number }> = {
    free: { perMin: 10, perDay: 100 },
    pro: { perMin: 60, perDay: 5_000 },
    enterprise: { perMin: 300, perDay: 50_000 },
  };

  const prefix = is_live ? 'zb_live_' : 'zb_test_';
  const randomPart = randomBytes(16).toString('hex');
  const fullKey = `${prefix}${randomPart}`;
  const keyHash = createHash('sha256').update(fullKey).digest('hex');
  const keyPrefix = fullKey.slice(0, 16);

  const defaults = KEY_TIER_DEFAULTS[safeTier] || KEY_TIER_DEFAULTS.free;

  const { data: insertedKey, error: insertError } = await supabaseAdmin
    .from('api_keys')
    .insert({ user_id: userId, key_prefix: keyPrefix, key_hash: keyHash, name, tier: safeTier, is_live: !!is_live, rate_limit_per_min: defaults.perMin, rate_limit_per_day: defaults.perDay })
    .select('id, name, tier, is_live, rate_limit_per_min, rate_limit_per_day, created_at')
    .single();

  if (insertError) {
    console.error('Failed to create API key:', insertError);
    return res.status(500).json({ error: { code: 'internal_error', message: 'Failed to create API key' } });
  }

  return res.status(201).json({
    key: fullKey,
    key_prefix: keyPrefix,
    id: insertedKey.id,
    name: insertedKey.name,
    tier: insertedKey.tier,
    is_live: insertedKey.is_live,
    rate_limit_per_min: insertedKey.rate_limit_per_min,
    rate_limit_per_day: insertedKey.rate_limit_per_day,
    created_at: insertedKey.created_at,
    _warning: 'Store this key securely. It will not be shown again.',
  });
}

// ── POST /api/v1/research/reviews ───────────────────────────────────────

async function handleReviews(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const { business_name, location, platform } = req.body || {};
  if (!business_name || typeof business_name !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/reviews', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`business_name` is required and must be a string' } });
  }

  const validPlatforms = ['google', 'yelp', 'all'];
  const selectedPlatform = validPlatforms.includes(platform) ? platform : 'all';

  try {
    const locationStr = location ? ` ${location}` : '';
    const queries: string[] = [];
    if (selectedPlatform === 'google' || selectedPlatform === 'all') {
      queries.push(`"${business_name}"${locationStr} Google reviews rating`);
      queries.push(`"${business_name}"${locationStr} reviews`);
    }
    if (selectedPlatform === 'yelp' || selectedPlatform === 'all') {
      queries.push(`"${business_name}"${locationStr} Yelp reviews`);
    }

    const allResults = await Promise.all(queries.map((q) => braveSearch(q, 8)));
    const seenUrls = new Set<string>();
    const results: any[] = [];
    for (const batch of allResults) {
      for (const r of batch) {
        if (!seenUrls.has(r.url)) { seenUrls.add(r.url); results.push(r); }
      }
    }

    let snippetRating = 0;
    let snippetReviewCount = 0;
    for (const r of results) {
      const combined = `${r.title || ''} ${r.description || ''}`;
      if (snippetRating === 0) {
        const ratingMatch = combined.match(/(\d+\.?\d*)\s*(?:stars?|\/\s*5|out of 5)/i) || combined.match(/rating[:\s]+(\d+\.?\d*)/i) || combined.match(/(\d\.\d)\s*\(\d+\)/);
        if (ratingMatch) { const p = parseFloat(ratingMatch[1]); if (p >= 1 && p <= 5) snippetRating = p; }
      }
      if (snippetReviewCount === 0) {
        const countMatch = combined.match(/(\d[\d,]*)\s*(?:reviews?|ratings?|Google reviews?)/i) || combined.match(/\d\.\d\s*\((\d[\d,]*)\)/);
        if (countMatch) { const p = parseInt(countMatch[1].replace(/,/g, '')); if (p > 0 && p < 100000) snippetReviewCount = p; }
      }
    }

    const searchContext = results.slice(0, 12).map((r: any) => `[${r.url}] ${r.title}: ${r.description || ''}`).join('\n');

    if (!searchContext && results.length === 0) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/reviews', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
      return res.status(200).json({ business_name, rating: null, review_count: null, themes: [], best_quotes: [], worst_quotes: [], sentiment_summary: 'No review data found for this business.', sources: [] });
    }

    const claudeText = await callClaude(
      'You are a review intelligence analyst. You extract structured reputation data from search results about businesses. Respond ONLY with valid JSON. No markdown fences, no explanation.',
      `Analyze the following search results about "${business_name}"${location ? ` in ${location}` : ''} and extract review intelligence.

Search results:
${searchContext}

Return this exact JSON structure:
{
  "rating": <number or null>,
  "review_count": <integer or null>,
  "themes": ["<string>"],
  "best_quotes": ["<string>"],
  "worst_quotes": ["<string>"],
  "sentiment_summary": "<string>",
  "sources": ["<string>"]
}

Rules:
- Only include data grounded in the search results
- Use actual quotes from snippets where available
- If no rating or review count is found, return null
- For themes, identify recurring topics across multiple results
- For worst_quotes, only include if negative sentiment is actually present; empty array is fine`,
      1200,
    );

    const parsed = parseClaudeJson(claudeText);

    const response = {
      business_name,
      rating: parsed.rating ?? (snippetRating || null),
      review_count: parsed.review_count ?? (snippetReviewCount || null),
      themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 6) : [],
      best_quotes: Array.isArray(parsed.best_quotes) ? parsed.best_quotes.slice(0, 4) : [],
      worst_quotes: Array.isArray(parsed.worst_quotes) ? parsed.worst_quotes.slice(0, 3) : [],
      sentiment_summary: parsed.sentiment_summary || 'Unable to determine sentiment from available data.',
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    };

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/reviews', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[research/reviews] Error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/reviews', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'Failed to analyze reviews', details: err?.message || String(err) } });
  }
}

// ── POST /api/v1/research/competitors ───────────────────────────────────

async function handleCompetitors(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const { industry, location, country, limit } = req.body || {};
  if (!industry || typeof industry !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/competitors', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`industry` is required and must be a string' } });
  }
  if (!location || typeof location !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/competitors', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`location` is required and must be a string' } });
  }

  const selectedCountry = typeof country === 'string' ? country : 'US';
  const competitorLimit = Math.min(Math.max(typeof limit === 'number' ? limit : 5, 1), 10);

  try {
    const queries = [
      `best ${industry} in ${location} ${selectedCountry}`,
      `${industry} ${location} competitors advertising`,
      `top ${industry} companies near ${location}`,
      `${industry} ${location} reviews ratings`,
    ];

    const allResults = await Promise.all(queries.map((q) => braveSearch(q, 8)));
    const seenUrls = new Set<string>();
    const results: any[] = [];
    for (const batch of allResults) {
      for (const r of batch) {
        if (!seenUrls.has(r.url)) { seenUrls.add(r.url); results.push(r); }
      }
    }

    const searchContext = results.slice(0, 15).map((r: any) => `[${r.url}] ${r.title}: ${r.description || ''}`).join('\n');

    if (!searchContext) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/competitors', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
      return res.status(200).json({ industry, location, country: selectedCountry, competitors: [], common_hooks: [], gaps: [], market_saturation: 'unknown' });
    }

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
    { "name": "<string>", "url": "<string or null>", "strengths": ["<string>"], "weaknesses": ["<string>"], "ad_presence": <boolean>, "pricing_info": "<string or null>" }
  ],
  "common_hooks": ["<string>"],
  "gaps": ["<string>"],
  "market_saturation": "<'low' | 'medium' | 'high'>"
}

Rules:
- Return exactly ${competitorLimit} competitors (or fewer if not enough)
- Use REAL business names from the search results
- Base everything on the actual search results`,
    );

    const parsed = parseClaudeJson(claudeText);

    const competitors = Array.isArray(parsed.competitors)
      ? parsed.competitors.slice(0, competitorLimit).map((c: any) => ({
          name: c.name || 'Unknown', url: c.url || null,
          strengths: Array.isArray(c.strengths) ? c.strengths : [],
          weaknesses: Array.isArray(c.weaknesses) ? c.weaknesses : [],
          ad_presence: typeof c.ad_presence === 'boolean' ? c.ad_presence : false,
          pricing_info: c.pricing_info || null,
        }))
      : [];

    const response = {
      industry, location, country: selectedCountry, competitors,
      common_hooks: Array.isArray(parsed.common_hooks) ? parsed.common_hooks.slice(0, 5) : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 4) : [],
      market_saturation: ['low', 'medium', 'high'].includes(parsed.market_saturation) ? parsed.market_saturation : 'unknown',
    };

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/competitors', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[research/competitors] Error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/competitors', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'Failed to analyze competitors', details: err?.message || String(err) } });
  }
}

// ── POST /api/v1/research/market ────────────────────────────────────────

async function handleMarket(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const { industry, location, country } = req.body || {};
  if (!industry || typeof industry !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/market', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`industry` is required and must be a string' } });
  }
  if (!location || typeof location !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/market', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`location` is required and must be a string' } });
  }

  const selectedCountry = typeof country === 'string' ? country : 'US';

  try {
    const queries = [
      `${industry} market ${location} ${selectedCountry}`,
      `${industry} industry trends ${selectedCountry} 2025 2026`,
      `best ${industry} in ${location} reviews ratings`,
      `${industry} ${location} advertising marketing`,
      `${industry} market size growth ${selectedCountry}`,
      `${industry} ${location} competitors pricing`,
    ];

    const allResults = await Promise.all(queries.map((q) => braveSearch(q, 6)));
    const marketResults = [...(allResults[0] || []), ...(allResults[4] || [])];
    const trendResults = allResults[1] || [];
    const reviewResults = allResults[2] || [];
    const adResults = allResults[3] || [];
    const competitorResults = allResults[5] || [];

    const seenUrls = new Set<string>();
    const dedup = (arr: any[]) => {
      const unique: any[] = [];
      for (const r of arr) { if (!seenUrls.has(r.url)) { seenUrls.add(r.url); unique.push(r); } }
      return unique;
    };

    const marketContext = dedup(marketResults).slice(0, 6).map((r: any) => `${r.title}: ${r.description || ''}`).join('\n');
    const trendContext = dedup(trendResults).slice(0, 4).map((r: any) => `${r.title}: ${r.description || ''}`).join('\n');
    const reviewContext = dedup(reviewResults).slice(0, 5).map((r: any) => `${r.title}: ${r.description || ''}`).join('\n');
    const adContext = dedup(adResults).slice(0, 4).map((r: any) => `${r.title}: ${r.description || ''}`).join('\n');
    const competitorContext = dedup(competitorResults).slice(0, 5).map((r: any) => `[${r.url}] ${r.title}: ${r.description || ''}`).join('\n');

    const claudeText = await callClaude(
      'You are a market intelligence analyst specializing in local business advertising. Respond ONLY with valid JSON. No markdown fences, no explanation.',
      `Create a comprehensive market intelligence brief for:

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
  "market_size_estimate": "<string>",
  "growth_trend": "<string>",
  "key_players": [{ "name": "<string>", "estimated_market_position": "<string>", "notable_strength": "<string>" }],
  "advertising_landscape": { "competition_level": "<'low'|'medium'|'high'>", "primary_channels": ["<string>"], "common_strategies": ["<string>"], "estimated_avg_cpc_cents": <integer or null>, "estimated_avg_cpl_cents": <integer or null> },
  "recommended_positioning": "<string>",
  "budget_recommendation_daily_cents": <integer>,
  "budget_rationale": "<string>",
  "opportunities": ["<string>"],
  "risks": ["<string>"]
}

Rules:
- Use REAL business names from search results for key_players (3-5)
- budget_recommendation_daily_cents realistic for a small/medium local business
- Be specific to ${industry} in ${location}`,
      2000,
    );

    const parsed = parseClaudeJson(claudeText);

    const keyPlayers = Array.isArray(parsed.key_players)
      ? parsed.key_players.slice(0, 5).map((p: any) => ({ name: p.name || 'Unknown', estimated_market_position: p.estimated_market_position || 'unknown', notable_strength: p.notable_strength || null }))
      : [];

    const adLandscape = parsed.advertising_landscape || {};

    const response = {
      industry, location, country: selectedCountry,
      market_size_estimate: parsed.market_size_estimate || 'Unable to estimate from available data',
      growth_trend: parsed.growth_trend || 'unknown',
      key_players: keyPlayers,
      advertising_landscape: {
        competition_level: ['low', 'medium', 'high'].includes(adLandscape.competition_level) ? adLandscape.competition_level : 'unknown',
        primary_channels: Array.isArray(adLandscape.primary_channels) ? adLandscape.primary_channels : [],
        common_strategies: Array.isArray(adLandscape.common_strategies) ? adLandscape.common_strategies : [],
        estimated_avg_cpc_cents: typeof adLandscape.estimated_avg_cpc_cents === 'number' ? adLandscape.estimated_avg_cpc_cents : null,
        estimated_avg_cpl_cents: typeof adLandscape.estimated_avg_cpl_cents === 'number' ? adLandscape.estimated_avg_cpl_cents : null,
      },
      recommended_positioning: parsed.recommended_positioning || 'Insufficient data for positioning recommendation.',
      budget_recommendation_daily_cents: typeof parsed.budget_recommendation_daily_cents === 'number' ? parsed.budget_recommendation_daily_cents : 2000,
      budget_rationale: parsed.budget_rationale || null,
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 4) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 3) : [],
    };

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/market', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[research/market] Error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/market', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'Failed to generate market intelligence', details: err?.message || String(err) } });
  }
}

// -- POST /api/v1/creatives/generate ------------------------------------

async function handleCreativesGenerate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const { url, business_name, description, style, aspect_ratio, count } = req.body || {};

  // Validate style
  const validStyles = ['photo', 'illustration', 'minimal', 'bold'];
  const selectedStyle: string = validStyles.includes(style) ? style : 'photo';

  // Validate aspect ratio
  const validRatios = ['1:1', '9:16', '16:9', '3:4', '4:3'];
  const selectedRatio: string = validRatios.includes(aspect_ratio) ? aspect_ratio : '1:1';

  // Validate count (1-4)
  const imageCount = Math.min(Math.max(typeof count === 'number' ? count : 1, 1), 4);

  if (!url && !business_name && !description) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: 'At least one of `url`, `business_name`, or `description` is required' } });
  }

  if (!GOOGLE_AI_API_KEY) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'config_error', message: 'Image generation service not configured' } });
  }

  if (!ANTHROPIC_API_KEY) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'config_error', message: 'AI generation service not configured' } });
  }

  try {
    // Step 1: Scrape website if URL provided
    let scrapedData: Record<string, any> | null = null;
    if (url) {
      try {
        let targetUrl = url;
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) targetUrl = 'https://' + targetUrl;

        const scrapeResponse = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZuckerBot/1.0; +https://zuckerbot.ai)' },
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
        });

        if (scrapeResponse.ok) {
          const html = await scrapeResponse.text();
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
          const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);

          const headingRegex = /<h[1-3][^>]*>([^<]*(?:<[^/][^>]*>[^<]*)*)<\/h[1-3]>/gi;
          const headings: string[] = [];
          let hMatch;
          while ((hMatch = headingRegex.exec(html)) !== null && headings.length < 10) {
            const cleanText = hMatch[1].replace(/<[^>]+>/g, '').trim();
            if (cleanText) headings.push(cleanText);
          }

          const rawText = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 2000);

          scrapedData = {
            title: titleMatch?.[1]?.trim() || '',
            description: metaDescMatch?.[1] || ogDescMatch?.[1] || '',
            headings,
            rawText,
          };
        }
      } catch {
        // Scraping failed - continue without it
      }
    }

    // Step 2: Build context for Claude prompt generation
    const resolvedName = business_name || scrapedData?.title || url || 'Business';
    const resolvedDesc = description || scrapedData?.description || '';

    const scrapedSection = scrapedData
      ? `\nWEBSITE DATA:\n- Title: ${scrapedData.title}\n- Description: ${scrapedData.description}\n- Key headings: ${scrapedData.headings.join(', ')}\n- Content: ${scrapedData.rawText.slice(0, 1200)}\n`
      : '';

    const styleGuides: Record<string, string> = {
      photo: 'Photorealistic style. Use natural lighting, real textures, and lifelike compositions. Think stock photography but more compelling.',
      illustration: 'Modern digital illustration style. Clean lines, stylized elements, vibrant but cohesive color palette. Think premium tech startup aesthetic.',
      minimal: 'Minimalist design. Lots of negative space, simple shapes, one or two accent colors against a clean white or light background. Less is more.',
      bold: 'Bold and high-impact. Saturated colors, strong contrast, dynamic compositions. Think attention-grabbing billboard or social media thumb-stopper.',
    };

    const promptGenerationRequest = `You are an expert at writing image generation prompts for Facebook ad creatives. Generate ${imageCount} distinct image prompt(s) for this business.

BUSINESS:
- Name: ${resolvedName}
- Description: ${resolvedDesc}
${scrapedSection}
STYLE: ${selectedStyle} - ${styleGuides[selectedStyle]}
ASPECT RATIO: ${selectedRatio}

Generate a JSON response with this EXACT structure (no markdown fences, pure JSON):

{
  "prompts": [
    "<image generation prompt>"
  ]
}

RULES FOR EACH PROMPT:
- Optimized for Facebook/Instagram ads: bright, eye-catching, product-focused
- Clean backgrounds that work well with text overlays
- No text, words, letters, numbers, logos, or watermarks in the image
- Be SPECIFIC about the subject, lighting, composition, and mood
- Reference the actual product/service from the business info
- Each prompt should take a different creative angle (different scene, composition, or focus)
- Keep each prompt under 200 words
- Do NOT include any em dashes in the prompts
- The image should make someone stop scrolling and pay attention`;

    const claudeText = await callClaude(
      'You write image generation prompts for advertising creatives. Respond ONLY with valid JSON. No markdown fences, no explanation.',
      promptGenerationRequest,
      1500,
    );

    const parsed = parseClaudeJson(claudeText);
    const prompts: string[] = Array.isArray(parsed.prompts) ? parsed.prompts.slice(0, imageCount) : [];

    if (prompts.length === 0) {
      console.error('[api/creatives] Failed to generate prompts from Claude:', claudeText?.slice(0, 500));
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'parse_error', message: 'Failed to generate image prompts from AI' } });
    }

    // Step 3: Call Imagen API for each prompt
    const creatives: Array<{ url: string; base64?: string; mimeType: string; prompt: string; aspect_ratio: string }> = [];

    for (const imagePrompt of prompts) {
      const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${GOOGLE_AI_API_KEY}`;
      const imagenBody = {
        instances: [{ prompt: imagePrompt }],
        parameters: { sampleCount: 1, aspectRatio: selectedRatio },
      };

      let imagenResponse = await fetch(imagenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imagenBody),
        signal: AbortSignal.timeout(60000),
      });

      // Fallback to fast model if standard fails
      if (!imagenResponse.ok) {
        console.warn('[api/creatives] Standard Imagen model failed, trying fast model');
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${GOOGLE_AI_API_KEY}`;
        imagenResponse = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(imagenBody),
          signal: AbortSignal.timeout(60000),
        });
      }

      if (!imagenResponse.ok) {
        const errText = await imagenResponse.text();
        console.error('[api/creatives] Imagen API error:', errText);
        // Continue to next prompt instead of failing entirely
        continue;
      }

      const imagenData = await imagenResponse.json();
      const predictions = imagenData.predictions || [];

      for (const prediction of predictions) {
        if (prediction.bytesBase64Encoded) {
          const mimeType = prediction.mimeType || 'image/png';
          const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
          const fileName = `creative-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

          // Upload to Supabase Storage via raw fetch (most reliable on Vercel)
          let publicUrl = '';
          let _uploadError = `init:srkLen=${SUPABASE_SERVICE_ROLE_KEY.length},url=${SUPABASE_URL.slice(0,30)}`;
          try {
            const buf = Buffer.from(prediction.bytesBase64Encoded, 'base64');
            const storageUrl = `${SUPABASE_URL}/storage/v1/object/ad-previews/${fileName}`;
            const uploadRes = await fetch(storageUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': mimeType,
                'x-upsert': 'true',
                'Content-Length': String(buf.length),
              },
              body: buf,
            });
            const uploadBody = await uploadRes.text();
            if (uploadRes.ok) {
              publicUrl = `${SUPABASE_URL}/storage/v1/object/public/ad-previews/${fileName}`;
            } else {
              _uploadError = `HTTP ${uploadRes.status}: ${uploadBody}`;
              console.error('[api/creatives] Storage upload failed:', _uploadError);
            }
            if (!publicUrl) {
              _uploadError = _uploadError || `status=${uploadRes.status} body=${uploadBody.slice(0, 200)} bufLen=${buf.length} srkLen=${SUPABASE_SERVICE_ROLE_KEY.length}`;
            }
          } catch (uploadErr: any) {
            _uploadError = `catch: ${uploadErr?.message || String(uploadErr)}`;
            console.error('[api/creatives] Storage upload error:', _uploadError);
          }

          creatives.push({
            url: publicUrl || null,
            base64: prediction.bytesBase64Encoded,
            mimeType,
            prompt: imagePrompt,
            aspect_ratio: selectedRatio,
            _upload_debug: _uploadError || 'no error captured',
          });
        }
      }
    }

    if (creatives.length === 0) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'image_generation_failed', message: 'Image generation service failed to produce any images. Try again or use a different description.' } });
    }

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json({ creatives });
  } catch (err: any) {
    console.error('[api/creatives] Unexpected error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred while generating creatives', details: err?.message || String(err) } });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN DATA (routed via /api/admin-data → v1-router?path=admin-data)
// ═══════════════════════════════════════════════════════════════════════════

const ADMIN_EMAILS = ['davisgrainger@gmail.com', 'davis@datalis.app'];

async function handleAdminData(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Extract JWT
  const authHeader =
    (req.headers['authorization'] as string) ||
    (req.headers['Authorization'] as string) ||
    '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');

  // Validate JWT using anon client (admin client can't validate user JWTs)
  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Check admin email
  if (!user.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return res.status(403).json({ error: 'Forbidden: admin access required' });
  }

  try {
    // Fetch auth users via admin API
    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000,
    });

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Fetch all API keys
    const { data: apiKeys, error: keysError } = await supabaseAdmin
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (keysError) {
      console.error('Error fetching api_keys:', keysError);
      return res.status(500).json({ error: 'Failed to fetch API keys' });
    }

    // Fetch all API usage (last 10k rows, ordered newest first)
    const { data: apiUsage, error: usageError } = await supabaseAdmin
      .from('api_usage')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10000);

    if (usageError) {
      console.error('Error fetching api_usage:', usageError);
      return res.status(500).json({ error: 'Failed to fetch usage data' });
    }

    return res.status(200).json({
      users: usersData.users || [],
      apiKeys: apiKeys || [],
      apiUsage: apiUsage || [],
    });
  } catch (err: any) {
    console.error('Admin data error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Parse the path segments. With rewrites, path comes via query param or URL.
  let segments: string[] = [];

  // Method 1: query.path from rewrite rule (?path=campaigns/preview)
  const qp = req.query.path;
  if (Array.isArray(qp)) {
    segments = qp;
  } else if (typeof qp === 'string' && qp) {
    // Could be "campaigns/preview" as a single string
    segments = qp.split('/').filter(Boolean);
  }

  // Method 2: Parse from URL if query didn't work
  if (segments.length === 0 && req.url) {
    const match = req.url.match(/\/api\/v1\/(.+?)(?:\?|$)/);
    if (match) {
      segments = match[1].split('/').filter(Boolean);
    }
  }

  const route = segments.join('/');

  // ── Admin route (routed here via vercel.json rewrite) ──────────────
  if (route === 'admin-data') return handleAdminData(req, res);

  // ── Static routes ──────────────────────────────────────────────────
  if (route === 'campaigns/preview') return handlePreview(req, res);
  if (route === 'campaigns/create') return handleCreate(req, res);
  if (route === 'keys/create') return handleKeysCreate(req, res);
  if (route === 'research/reviews') return handleReviews(req, res);
  if (route === 'research/competitors') return handleCompetitors(req, res);
  if (route === 'research/market') return handleMarket(req, res);
  if (route === 'creatives/generate') return handleCreativesGenerate(req, res);

  // ── Dynamic campaign/:id routes ────────────────────────────────────
  if (segments.length === 3 && segments[0] === 'campaigns') {
    const id = segments[1];
    const action = segments[2];

    if (action === 'launch') return handleLaunch(req, res, id);
    if (action === 'pause') return handlePause(req, res, id);
    if (action === 'performance') return handlePerformance(req, res, id);
    if (action === 'conversions') return handleConversions(req, res, id);
  }

  // ── 404 ────────────────────────────────────────────────────────────
  return res.status(404).json({
    error: {
      code: 'not_found',
      message: `Unknown API endpoint: /api/v1/${route}`,
      available_endpoints: [
        'POST /api/v1/campaigns/preview',
        'POST /api/v1/campaigns/create',
        'POST /api/v1/campaigns/:id/launch',
        'POST /api/v1/campaigns/:id/pause',
        'GET  /api/v1/campaigns/:id/performance',
        'POST /api/v1/campaigns/:id/conversions',
        'POST /api/v1/keys/create',
        'POST /api/v1/research/reviews',
        'POST /api/v1/research/competitors',
        'POST /api/v1/research/market',
        'POST /api/v1/creatives/generate',
      ],
    },
  });
}
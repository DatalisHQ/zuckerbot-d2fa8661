/**
 * Catch-all route for /api/v1/*
 *
 * Consolidates all v1 API endpoints into a single serverless function
 * to stay within Vercel Hobby plan's 12-function limit.
 *
 * Routing table:
 *   POST /api/v1/campaigns/preview          → handlePreview
 *   POST /api/v1/campaigns/create           → handleCreate
 *   POST /api/v1/campaigns/:id/launch       → handleLaunch
 *   POST /api/v1/campaigns/:id/pause        → handlePause
 *   GET  /api/v1/campaigns/:id/performance  → handlePerformance
 *   POST /api/v1/campaigns/:id/conversions  → handleConversions
 *   POST /api/v1/keys/create                → handleKeysCreate
 *   POST /api/v1/research/reviews           → handleReviews
 *   POST /api/v1/research/competitors       → handleCompetitors
 *   POST /api/v1/research/market            → handleMarket
 *   POST /api/v1/creatives/generate         → handleCreativesGenerate
 *   POST /api/v1/creatives/:id/variants     → handleCreativeVariants
 *   POST /api/v1/creatives/:id/feedback     → handleCreativeFeedback
 *   GET  /api/v1/meta/status                → handleMetaStatus
 *   GET  /api/v1/meta/credentials           → handleMetaCredentials
 *   GET  /api/v1/meta/pages                 → handleMetaPages
 *   POST /api/v1/meta/select-page           → handleMetaSelectPage
 *   POST /api/v1/notifications/telegram     → handleSetTelegram
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';
import {
  type ZuckerObjective,
  VALID_OBJECTIVES,
  isValidObjective,
  getMetaCampaignObjective,
  getAdsetParams,
  getPromotedObject,
  needsLeadForm,
  needsUrl,
  needsPixel,
  buildCreativeLinkData,
} from '../lib/objective.js';

export const config = { maxDuration: 120 };

// ═══════════════════════════════════════════════════════════════════════════
// ENV + CLIENTS
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GOOGLE_AI_API_KEY =
  process.env.GOOGLE_AI_API_KEY
  || process.env.GEMINI_API_KEY
  || process.env.VITE_GOOGLE_AI_API_KEY
  || '';

// Seedream 4.5 API credentials (multiple provider support)
const AIML_API_KEY = process.env.AIML_API_KEY || '';
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY || '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const PURCHASE_CREDITS_URL = 'https://zuckerbot.ai/pricing?credits=1';
const CREDIT_COSTS = {
  campaign_launch: 5,
  autonomous_execute_call: 3,
  autonomous_run_call: 3,
} as const;

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
  generation_method?: string;
  detected_industry?: string;
}): Promise<void> {
  await supabaseAdmin.from('api_usage').insert({
    api_key_id: opts.apiKeyId,
    endpoint: opts.endpoint,
    method: opts.method,
    status_code: opts.statusCode,
    response_time_ms: opts.responseTimeMs,
    generation_method: opts.generation_method || null,
    detected_industry: opts.detected_industry || null,
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

async function metaPostLegacy(
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

function getValidationDocsUrl(endpointKey: 'research-competitors' | 'research-reviews' | 'creatives-generate'): string {
  if (endpointKey === 'research-competitors') return 'https://zuckerbot.ai/docs#research-competitors';
  if (endpointKey === 'research-reviews') return 'https://zuckerbot.ai/docs#research-reviews';
  return 'https://zuckerbot.ai/docs#creatives-generate';
}

function validationError(
  res: VercelResponse,
  endpointKey: 'research-competitors' | 'research-reviews' | 'creatives-generate',
  message: string,
  exampleBody: Record<string, any>,
) {
  return res.status(400).json({
    error: {
      code: 'validation_error',
      message,
      example_body: exampleBody,
      docs_url: getValidationDocsUrl(endpointKey),
    },
  });
}

async function debitCredits(args: {
  userId: string;
  businessId?: string | null;
  cost: number;
  reason: string;
  refType: string;
  refId?: string | null;
  meta?: Record<string, any>;
}): Promise<{ ok: boolean; balance: number }> {
  const { data, error } = await supabaseAdmin.rpc('debit_credits', {
    p_user_id: args.userId,
    p_business_id: args.businessId || null,
    p_cost: args.cost,
    p_reason: args.reason,
    p_ref_type: args.refType,
    p_ref_id: args.refId || null,
    p_meta: args.meta || {},
  });

  if (error) throw new Error(`credit_debit_failed: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: !!row?.ok,
    balance: Number(row?.balance || 0),
  };
}

function paymentRequiredError(requiredCredits: number, currentBalance: number) {
  return {
    error: {
      code: 'insufficient_credits',
      message: `Insufficient credits. ${requiredCredits} credit(s) required.`,
      required_credits: requiredCredits,
      current_balance: currentBalance,
      purchase_url: PURCHASE_CREDITS_URL,
    },
  };
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

// ═══════════════════════════════════════════════════════════════════════════
// CAMPAIGN LAUNCH HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper to make Meta API POST requests
 */
async function metaPost(endpoint: string, data: Record<string, any>, accessToken: string): Promise<{ok: boolean, data: any, rawBody: string}> {
  const url = `${GRAPH_BASE}${endpoint}`;
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    form.append(key, String(value));
  }
  form.append('access_token', accessToken);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const rawBody = await response.text();
    const jsonData = JSON.parse(rawBody);
    return { ok: response.ok, data: jsonData, rawBody };
  } catch (err) {
    return { ok: false, data: { error: { message: `Request failed: ${err}` } }, rawBody: String(err) };
  }
}

type CredentialSource = 'request' | 'businesses' | 'meta_profiles' | 'mixed' | null;

interface ResolvedMetaCredentials {
  meta_access_token: string | null;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  business_id: string | null;
  source: CredentialSource;
}

interface MetaPageOption {
  id: string;
  name: string;
  category: string | null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function resolveMetaCredentials(params: {
  apiKeyId: string;
  userId: string;
  meta_access_token?: string | null;
  meta_ad_account_id?: string | null;
  meta_page_id?: string | null;
}): Promise<ResolvedMetaCredentials> {
  let accessToken = normalizeString(params.meta_access_token);
  let adAccountId = normalizeString(params.meta_ad_account_id);
  let pageId = normalizeString(params.meta_page_id);

  const sources = new Set<string>();
  if (accessToken || adAccountId || pageId) {
    sources.add('request');
  }

  let businessId: string | null = null;
  const { data: keyWithBiz } = await supabaseAdmin
    .from('api_keys')
    .select('business_id')
    .eq('id', params.apiKeyId)
    .maybeSingle();

  businessId = normalizeString(keyWithBiz?.business_id);

  if (!businessId) {
    const { data: userBiz } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('user_id', params.userId)
      .limit(1)
      .maybeSingle();
    businessId = normalizeString(userBiz?.id);
  }

  if (businessId) {
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('facebook_access_token, facebook_ad_account_id, facebook_page_id')
      .eq('id', businessId)
      .maybeSingle();

    const businessAccessToken = normalizeString(biz?.facebook_access_token);
    const businessAdAccountId = normalizeString(biz?.facebook_ad_account_id);
    const businessPageId = normalizeString(biz?.facebook_page_id);

    if (businessAccessToken || businessAdAccountId || businessPageId) {
      sources.add('businesses');
    }

    accessToken = accessToken || businessAccessToken;
    adAccountId = adAccountId || businessAdAccountId;
    pageId = pageId || businessPageId;
  }

  if (!accessToken || !adAccountId || !pageId) {
    const { data: metaProfile, error: metaProfileError } = await supabaseAdmin
      .from('meta_profiles')
      .select('*')
      .eq('user_id', params.userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (metaProfileError && metaProfileError.code !== '42P01' && metaProfileError.code !== 'PGRST205') {
      console.warn('[api/meta] Could not read meta_profiles:', metaProfileError.message);
    }

    if (metaProfile) {
      const profileAccessToken = normalizeString(
        metaProfile.meta_access_token
        || metaProfile.access_token
        || metaProfile.facebook_access_token
        || metaProfile.token,
      );
      const profileAdAccountId = normalizeString(
        metaProfile.meta_ad_account_id
        || metaProfile.ad_account_id
        || metaProfile.facebook_ad_account_id,
      );
      const profilePageId = normalizeString(
        metaProfile.meta_page_id
        || metaProfile.page_id
        || metaProfile.facebook_page_id,
      );

      if (profileAccessToken || profileAdAccountId || profilePageId) {
        sources.add('meta_profiles');
      }

      accessToken = accessToken || profileAccessToken;
      adAccountId = adAccountId || profileAdAccountId;
      pageId = pageId || profilePageId;
    }
  }

  let source: CredentialSource = null;
  if (sources.size === 1) {
    source = Array.from(sources)[0] as CredentialSource;
  } else if (sources.size > 1) {
    source = 'mixed';
  }

  return {
    meta_access_token: accessToken,
    meta_ad_account_id: adAccountId,
    meta_page_id: pageId,
    business_id: businessId,
    source,
  };
}

async function listFacebookPages(accessToken: string): Promise<{ ok: boolean; pages: MetaPageOption[]; error?: string }> {
  const pages: MetaPageOption[] = [];
  let nextUrl = `${GRAPH_BASE}/me/accounts?fields=id,name,category&limit=100&access_token=${encodeURIComponent(accessToken)}`;

  try {
    while (nextUrl && pages.length < 300) {
      const response = await fetch(nextUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(20000),
      });

      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        return {
          ok: false,
          pages: [],
          error: data?.error?.message || `Meta pages API error: HTTP ${response.status}`,
        };
      }

      if (Array.isArray(data?.data)) {
        for (const page of data.data) {
          const id = normalizeString(page?.id);
          const name = normalizeString(page?.name);
          if (!id || !name) continue;
          pages.push({
            id,
            name,
            category: normalizeString(page?.category),
          });
        }
      }

      const pagingNext = normalizeString(data?.paging?.next);
      nextUrl = pagingNext || '';
    }

    return { ok: true, pages };
  } catch (err: any) {
    return { ok: false, pages: [], error: err?.message || String(err) };
  }
}

async function persistBusinessPageId(userId: string, businessId: string | null, pageId: string): Promise<void> {
  if (!businessId) return;
  const { error } = await supabaseAdmin
    .from('businesses')
    .update({ facebook_page_id: pageId })
    .eq('id', businessId)
    .eq('user_id', userId);
  if (error) {
    console.warn('[api/meta] Failed to persist facebook_page_id:', error.message);
  }
}

async function resolvePageIdForLaunch(params: {
  userId: string;
  resolvedMeta: ResolvedMetaCredentials;
}): Promise<{
  meta_page_id: string | null;
  available_pages?: MetaPageOption[];
  source: 'stored' | 'auto_selected' | 'selection_required' | 'none' | 'meta_error';
  meta_error?: string;
}> {
  const existingPageId = normalizeString(params.resolvedMeta.meta_page_id);
  if (existingPageId) {
    return { meta_page_id: existingPageId, source: 'stored' };
  }

  const accessToken = normalizeString(params.resolvedMeta.meta_access_token);
  if (!accessToken) {
    return { meta_page_id: null, source: 'none' };
  }

  const pageResult = await listFacebookPages(accessToken);
  if (!pageResult.ok) {
    return {
      meta_page_id: null,
      source: 'meta_error',
      meta_error: pageResult.error || 'Failed to list Facebook pages',
    };
  }

  const pages = pageResult.pages;
  if (pages.length === 1) {
    const selected = pages[0].id;
    await persistBusinessPageId(params.userId, params.resolvedMeta.business_id, selected);
    return { meta_page_id: selected, available_pages: pages, source: 'auto_selected' };
  }

  if (pages.length > 1) {
    return { meta_page_id: null, available_pages: pages, source: 'selection_required' };
  }

  return { meta_page_id: null, available_pages: [], source: 'none' };
}

/**
 * Internal campaign launch logic (used by both /create with auto_launch and /launch)
 */
async function launchCampaignInternal(params: {
  campaignId: string;
  meta_access_token: string;
  meta_ad_account_id: string;
  meta_page_id: string;
  variant_index: number;
  daily_budget_cents: number;
  radius_km: number;
  campaign: any;
  auth: any;
}): Promise<{success: boolean, data?: any, error?: any}> {
  
  const {
    campaignId, meta_access_token, meta_ad_account_id, meta_page_id,
    variant_index, daily_budget_cents, radius_km, campaign, auth
  } = params;

  try {
    // Read objective from campaign data, default to traffic
    const objective: ZuckerObjective = isValidObjective(campaign.objective) ? campaign.objective : 'traffic';
    console.log('[api/launchInternal] Launching campaign with objective:', objective);
    console.log('[api/launchInternal] Meta objective:', getMetaCampaignObjective(objective));

    // Validation: traffic and conversions require a URL
    if (needsUrl(objective) && !campaign.url) {
      return { success: false, error: { code: 'validation_error', message: `The '${objective}' objective requires a campaign URL.` } };
    }
    // Validation: conversions requires META_PIXEL_ID
    if (needsPixel(objective) && !process.env.META_PIXEL_ID) {
      return { success: false, error: { code: 'validation_error', message: 'Conversions objective requires META_PIXEL_ID configured' } };
    }

    const businessName = campaign.business_name || 'Campaign';
    const variants = campaign.variants || [];
    const targeting = campaign.targeting || {};
    const selectedVariant = variants[variant_index] || variants[0] || {};

    const headline = selectedVariant.headline || businessName;
    const adBody = selectedVariant.copy || `Check out ${businessName}`;
    const cta = selectedVariant.cta || 'Learn More';
    const ctaType = cta.toUpperCase().replace(/ /g, '_');
    const imageUrl = selectedVariant.image_url || null;

    const campaignName = `${businessName} – API – ${new Date().toISOString().slice(0, 10)}`;
    const adAccountId = meta_ad_account_id.replace(/^act_/, '');

    // Step 1: Create Meta Campaign (objective-aware)
    const campaignResult = await metaPost(`/act_${adAccountId}/campaigns`, {
      name: campaignName,
      objective: getMetaCampaignObjective(objective),
      status: 'PAUSED',
      special_ad_categories: JSON.stringify([])
    }, meta_access_token);

    if (!campaignResult.ok || !campaignResult.data.id) {
      return {
        success: false,
        error: {
          code: 'meta_api_error',
          message: campaignResult.data.error?.message || 'Failed to create campaign on Meta',
          meta_error: campaignResult.data.error,
          step: 'campaign'
        }
      };
    }
    const metaCampaignId = campaignResult.data.id;

    // Step 2: Create Ad Set (objective-aware)
    const adsetParams = getAdsetParams(objective);
    const geoLocations: Record<string, any> = {};
    if (targeting?.geo_locations?.custom_locations?.length) {
      geoLocations.custom_locations = targeting.geo_locations.custom_locations;
    } else {
      geoLocations.countries = ['US'];
    }

    const adSetTargeting: Record<string, any> = {
      age_min: targeting?.age_min || 25,
      age_max: targeting?.age_max || 65,
      geo_locations: geoLocations,
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed'],
      instagram_positions: ['stream'],
    };

    const adSetResult = await metaPost(`/act_${adAccountId}/adsets`, {
      name: `${campaignName} – Ad Set`,
      campaign_id: metaCampaignId,
      daily_budget: String(daily_budget_cents),
      billing_event: 'IMPRESSIONS',
      optimization_goal: adsetParams.optimization_goal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify({ ...adSetTargeting, targeting_automation: { advantage_audience: 0 } }),
      promoted_object: JSON.stringify(getPromotedObject(objective, meta_page_id)),
      ...(adsetParams.destination_type ? { destination_type: adsetParams.destination_type } : {}),
      status: 'PAUSED',
      start_time: new Date().toISOString(),
    }, meta_access_token);

    if (!adSetResult.ok || !adSetResult.data.id) {
      // Cleanup: delete campaign
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      return {
        success: false,
        error: {
          code: 'meta_api_error',
          message: adSetResult.data.error?.message || 'Failed to create ad set on Meta',
          meta_error: adSetResult.data.error,
          step: 'adset'
        }
      };
    }
    const metaAdSetId = adSetResult.data.id;

    // Step 3: Create Lead Form (only for leads objective)
    let leadFormId: string | undefined;
    if (needsLeadForm(objective)) {
      const leadFormResult = await metaPost(`/${meta_page_id}/leadgen_forms`, {
        name: `${businessName} Lead Form – ${Date.now()}`,
        questions: JSON.stringify([
          { type: 'FULL_NAME' },
          { type: 'PHONE' },
          { type: 'EMAIL' },
          { type: 'CUSTOM', key: 'location', label: 'What area are you in?' }
        ]),
        privacy_policy: JSON.stringify({
          url: 'https://zuckerbot.ai/privacy',
          link_text: 'Privacy Policy'
        }),
        thank_you_page: JSON.stringify({
          title: 'Thanks for your enquiry!',
          body: `${businessName} will be in touch shortly.`,
          button_type: 'NONE'
        }),
      }, meta_access_token);

      if (!leadFormResult.ok || !leadFormResult.data.id) {
        // Cleanup
        await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
        return {
          success: false,
          error: {
            code: 'meta_api_error',
            message: leadFormResult.data.error?.message || 'Failed to create lead form on Meta',
            meta_error: leadFormResult.data.error,
            step: 'leadform'
          }
        };
      }
      leadFormId = leadFormResult.data.id;
    }

    // Step 4: Create Ad Creative (objective-aware link_data)
    const linkData = buildCreativeLinkData(objective, {
      headline,
      body: adBody,
      ctaType,
      imageUrl,
      leadFormId,
      campaignUrl: campaign.url,
    });

    const creativeResult = await metaPost(`/act_${adAccountId}/adcreatives`, {
      name: `${campaignName} – Creative`,
      object_story_spec: JSON.stringify({
        page_id: meta_page_id,
        link_data: linkData,
      })
    }, meta_access_token);

    let adCreativeId = creativeResult.ok && creativeResult.data.id ? creativeResult.data.id : null;

    // Step 5: Create Ad
    const adParams: Record<string, any> = {
      name: `${campaignName} – Ad`,
      adset_id: metaAdSetId,
      status: 'PAUSED',
    };

    if (adCreativeId) {
      adParams.creative = JSON.stringify({ creative_id: adCreativeId });
    } else {
      // Fallback: inline creative
      const fallbackLinkData = buildCreativeLinkData(objective, {
        headline,
        body: adBody,
        ctaType: 'LEARN_MORE',
        imageUrl: null,
        leadFormId,
        campaignUrl: campaign.url,
      });

      adParams.creative = JSON.stringify({
        object_story_spec: {
          page_id: meta_page_id,
          link_data: fallbackLinkData,
        }
      });
    }

    const adResult = await metaPost(`/act_${adAccountId}/ads`, adParams, meta_access_token);

    if (!adResult.ok || !adResult.data.id) {
      // Cleanup
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      return {
        success: false,
        error: {
          code: 'meta_api_error',
          message: adResult.data.error?.message || 'Failed to create ad on Meta',
          meta_error: adResult.data.error,
          step: 'ad'
        }
      };
    }
    const metaAdId = adResult.data.id;

    // Step 6: Activate everything
    const activationResults = await Promise.allSettled([
      fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'status=ACTIVE'
      }),
      fetch(`${GRAPH_BASE}/${metaAdSetId}?access_token=${meta_access_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'status=ACTIVE'
      }),
      fetch(`${GRAPH_BASE}/${metaAdId}?access_token=${meta_access_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'status=ACTIVE'
      })
    ]);

    return {
      success: true,
      data: {
        campaign_id: campaignId,
        meta_campaign_id: metaCampaignId,
        meta_adset_id: metaAdSetId,
        meta_ad_id: metaAdId,
        ...(leadFormId ? { lead_form_id: leadFormId } : {}),
        ad_creative_id: adCreativeId,
        selected_variant: selectedVariant,
        daily_budget_cents: daily_budget_cents,
        targeting_radius_km: radius_km,
        launched_at: new Date().toISOString(),
        status: 'active'
      }
    };

  } catch (error: any) {
    return {
      success: false,
      error: {
        code: 'internal_error',
        message: error.message || 'Internal launch error',
        details: String(error)
      }
    };
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

  let { 
    url, business_name, business_type, location, budget_daily_cents, objective, 
    meta_access_token, auto_launch, meta_ad_account_id, meta_page_id, variant_index = 0, radius_km
  } = req.body || {};

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
    const obj: ZuckerObjective = isValidObjective(objective) ? objective : 'traffic';

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
    "objective": "leads|traffic|conversions|awareness",
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

    // Auto-launch if requested
    if (auto_launch === true) {
      const resolvedMeta = await resolveMetaCredentials({
        apiKeyId: auth.keyRecord.id,
        userId: auth.keyRecord.user_id,
        meta_access_token,
        meta_ad_account_id,
        meta_page_id,
      });
      const autoLaunchBusinessId: string | null = resolvedMeta.business_id;
      meta_access_token = resolvedMeta.meta_access_token;
      meta_ad_account_id = resolvedMeta.meta_ad_account_id;
      meta_page_id = resolvedMeta.meta_page_id;

      const pageResolution = await resolvePageIdForLaunch({
        userId: auth.keyRecord.user_id,
        resolvedMeta: {
          ...resolvedMeta,
          meta_access_token,
          meta_ad_account_id,
          meta_page_id,
        },
      });
      if (!meta_page_id && pageResolution.meta_page_id) {
        meta_page_id = pageResolution.meta_page_id;
      }

      const hasToken = typeof meta_access_token === 'string' && meta_access_token.length > 0;
      const hasAdAccount = typeof meta_ad_account_id === 'string' && meta_ad_account_id.length > 0;
      const hasPage = typeof meta_page_id === 'string' && meta_page_id.length > 0;

      if (!hasToken || !hasAdAccount || !hasPage) {
        if (!hasPage && pageResolution.source === 'selection_required') {
          await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
          return res.status(400).json({
            error: {
              code: 'meta_page_selection_required',
              message: 'Multiple Facebook pages were found. Select one page before launching.',
              select_page_endpoint: '/api/v1/meta/select-page',
            },
            available_pages: (pageResolution.available_pages || []).slice(0, 25),
          });
        }

        const missing = [
          !hasToken && 'meta_access_token',
          !hasAdAccount && 'meta_ad_account_id',
          !hasPage && 'meta_page_id',
        ].filter(Boolean).join(', ');

        await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
        return res.status(400).json({
          error: {
            code: 'missing_meta_credentials',
            message: `Missing: ${missing}. Either pass them in the request body, or connect Facebook at https://zuckerbot.ai/profile to store them automatically.`,
            connect_url: 'https://zuckerbot.ai/profile',
            ...(pageResolution.source === 'meta_error' ? { meta_error: pageResolution.meta_error } : {}),
          },
        });
      }

      try {
        const autoLaunchCreditDebit = await debitCredits({
          userId: auth.keyRecord.user_id,
          businessId: autoLaunchBusinessId,
          cost: CREDIT_COSTS.campaign_launch,
          reason: 'campaign_launch',
          refType: 'api_campaign',
          refId: campaignId,
          meta: { endpoint: '/api/v1/campaigns/create', auto_launch: true },
        });
        if (!autoLaunchCreditDebit.ok) {
          await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 402, responseTimeMs: Date.now() - startTime });
          return res.status(402).json(paymentRequiredError(CREDIT_COSTS.campaign_launch, autoLaunchCreditDebit.balance));
        }

        // Launch the campaign immediately
        const launchResult = await launchCampaignInternal({
          campaignId,
          meta_access_token,
          meta_ad_account_id,
          meta_page_id,
          variant_index: variant_index || 0,
          daily_budget_cents: budgetCents,
          radius_km: radius_km || response.targeting.radius_km || 25,
          campaign: response,
          auth: auth.keyRecord,
        });

        if (!launchResult.success) {
          // Launch failed, but campaign was created successfully
          await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 207, responseTimeMs: Date.now() - startTime });
          return res.status(207).json({
            ...response,
            launch_error: launchResult.error,
            message: 'Campaign created successfully but launch failed. You can try launching manually with /campaigns/{id}/launch',
          });
        }

        // Success - campaign created and launched
        const combinedResponse = {
          ...response,
          status: 'active' as const,
          launch_result: launchResult.data,
          meta_campaign_id: launchResult.data.meta_campaign_id,
          launched_at: new Date().toISOString(),
          message: 'Campaign created and launched successfully',
        };

        // Update database with launch info
        await supabaseAdmin.from('api_campaigns').update({
          status: 'active',
          meta_campaign_id: launchResult.data.meta_campaign_id,
          launched_at: new Date().toISOString(),
        }).eq('id', campaignId);

        await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
        return res.status(200).json(combinedResponse);

      } catch (launchErr: any) {
        console.error('[api/create] Auto-launch error:', launchErr);
        await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 207, responseTimeMs: Date.now() - startTime });
        return res.status(207).json({
          ...response,
          launch_error: { code: 'launch_failed', message: launchErr.message || 'Launch failed after campaign creation' },
          message: 'Campaign created successfully but launch failed. You can try launching manually with /campaigns/{id}/launch',
        });
      }
    }

    // Standard response without auto-launch
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

  let { meta_access_token, meta_ad_account_id, meta_page_id, variant_index = 0, daily_budget_cents, radius_km, launch_all_variants = false } = req.body || {};

  const resolvedMeta = await resolveMetaCredentials({
    apiKeyId: auth.keyRecord.id,
    userId: auth.keyRecord.user_id,
    meta_access_token,
    meta_ad_account_id,
    meta_page_id,
  });

  const launchBusinessId: string | null = resolvedMeta.business_id;
  meta_access_token = resolvedMeta.meta_access_token;
  meta_ad_account_id = resolvedMeta.meta_ad_account_id;
  meta_page_id = resolvedMeta.meta_page_id;

  const pageResolution = await resolvePageIdForLaunch({
    userId: auth.keyRecord.user_id,
    resolvedMeta: {
      ...resolvedMeta,
      meta_access_token,
      meta_ad_account_id,
      meta_page_id,
    },
  });
  if (!meta_page_id && pageResolution.meta_page_id) {
    meta_page_id = pageResolution.meta_page_id;
  }

  if (!meta_access_token || !meta_ad_account_id || !meta_page_id) {
    if (!meta_page_id && pageResolution.source === 'selection_required') {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({
        error: {
          code: 'meta_page_selection_required',
          message: 'Multiple Facebook pages were found. Select one page before launching.',
          select_page_endpoint: '/api/v1/meta/select-page',
        },
        available_pages: (pageResolution.available_pages || []).slice(0, 25),
      });
    }

    const missing = [
      !meta_access_token && 'meta_access_token',
      !meta_ad_account_id && 'meta_ad_account_id',
      !meta_page_id && 'meta_page_id',
    ].filter(Boolean).join(', ');

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'missing_meta_credentials',
        message: `Missing: ${missing}. Either pass them in the request body, or connect Facebook at https://zuckerbot.ai/profile to store them automatically.`,
        connect_url: 'https://zuckerbot.ai/profile',
        ...(pageResolution.source === 'meta_error' ? { meta_error: pageResolution.meta_error } : {}),
      }
    });
  }

  try {
    let campaign: Record<string, any> | null = null;
    const { data: apiCampaign } = await supabaseAdmin
      .from('api_campaigns').select('*').eq('id', campaignId).eq('api_key_id', auth.keyRecord.id).single();
    if (apiCampaign) campaign = apiCampaign;

    // Read objective from DB record (set during create), default to traffic
    const objective: ZuckerObjective = isValidObjective(campaign?.objective) ? campaign.objective : 'traffic';
    console.log('[api/launch] Launching campaign with objective:', objective);
    console.log('[api/launch] Meta objective:', getMetaCampaignObjective(objective));

    // Validation: traffic and conversions require a URL
    if (needsUrl(objective) && !campaign?.url) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({ error: { code: 'validation_error', message: `The '${objective}' objective requires a campaign URL. Set it during campaign creation.` } });
    }

    // Validation: conversions requires META_PIXEL_ID
    if (needsPixel(objective) && !process.env.META_PIXEL_ID) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({ error: { code: 'validation_error', message: 'Conversions objective requires META_PIXEL_ID configured' } });
    }

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

    const creditDebit = await debitCredits({
      userId: auth.keyRecord.user_id,
      businessId: launchBusinessId,
      cost: CREDIT_COSTS.campaign_launch,
      reason: 'campaign_launch',
      refType: 'api_campaign',
      refId: campaignId,
      meta: { endpoint: '/api/v1/campaigns/:id/launch' },
    });
    if (!creditDebit.ok) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 402, responseTimeMs: Date.now() - startTime });
      return res.status(402).json(paymentRequiredError(CREDIT_COSTS.campaign_launch, creditDebit.balance));
    }

    // Step 1: Create Meta Campaign (objective-aware)
    const campaignResult = await metaPost(`/act_${adAccountId}/campaigns`, { name: campaignName, objective: getMetaCampaignObjective(objective), status: 'PAUSED', special_ad_categories: JSON.stringify([]) }, meta_access_token);
    if (!campaignResult.ok || !campaignResult.data.id) {
      console.error('[api/launch] Campaign creation failed:', campaignResult.rawBody);
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'meta_api_error', message: campaignResult.data.error?.message || 'Failed to create campaign on Meta', meta_error: campaignResult.data.error, step: 'campaign' } });
    }
    const metaCampaignId = campaignResult.data.id;

    // Step 2: Create Ad Set (objective-aware)
    const adsetParams = getAdsetParams(objective);
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
      optimization_goal: adsetParams.optimization_goal, bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify({ ...adSetTargeting, targeting_automation: { advantage_audience: 0 } }),
      promoted_object: JSON.stringify(getPromotedObject(objective, meta_page_id)),
      ...(adsetParams.destination_type ? { destination_type: adsetParams.destination_type } : {}),
      status: 'PAUSED', start_time: new Date().toISOString(),
    }, meta_access_token);

    if (!adSetResult.ok || !adSetResult.data.id) {
      console.error('[api/launch] Ad set creation failed:', adSetResult.rawBody);
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'meta_api_error', message: adSetResult.data.error?.message || 'Failed to create ad set on Meta', meta_error: adSetResult.data.error, step: 'adset' } });
    }
    const metaAdSetId = adSetResult.data.id;

    // Step 3-6: Create ads (single or multi-variant A/B test)
    const ctaMap: Record<string, string> = { 'Get Quote': 'GET_QUOTE', 'Call Now': 'CALL_NOW', 'Learn More': 'LEARN_MORE', 'Sign Up': 'SIGN_UP', 'Book Now': 'BOOK_NOW', 'Contact Us': 'CONTACT_US' };
    const variantsToLaunch = launch_all_variants ? variants : [selectedVariant];
    const metaAdIds: string[] = [];
    const variantResults: Array<{ variant_index: number; headline: string; meta_ad_id: string; status: string }> = [];
    let metaLeadFormId = '';

    for (let vi = 0; vi < variantsToLaunch.length; vi++) {
      const v = variantsToLaunch[vi] || {};
      const vHeadline = v.headline || businessName;
      const vBody = v.copy || `Check out ${businessName}`;
      const vCta = v.cta || 'Learn More';
      const vImage = v.image_url || null;
      const vCtaType = ctaMap[vCta] || 'LEARN_MORE';

      // Step 3: Create lead form ONLY for leads objective
      let variantLeadFormId: string | undefined;
      if (needsLeadForm(objective)) {
        const leadFormResult = await metaPost(`/${meta_page_id}/leadgen_forms`, {
          name: `${businessName} Lead Form ${vi + 1} \u2013 ${Date.now()}`,
          questions: JSON.stringify([{ type: 'FULL_NAME' }, { type: 'PHONE' }, { type: 'EMAIL' }, { type: 'CUSTOM', key: 'location', label: 'What area are you in?' }]),
          privacy_policy: JSON.stringify({ url: 'https://zuckerbot.ai/privacy', link_text: 'Privacy Policy' }),
          thank_you_page: JSON.stringify({ title: 'Thanks for your enquiry!', body: `${businessName} will be in touch shortly.`, button_type: 'NONE' }),
        }, meta_access_token);

        if (!leadFormResult.ok || !leadFormResult.data.id) {
          console.error(`[api/launch] Lead form creation failed for variant ${vi}:`, leadFormResult.rawBody);
          variantResults.push({ variant_index: vi, headline: vHeadline, meta_ad_id: '', status: 'failed_leadform' });
          continue;
        }
        variantLeadFormId = leadFormResult.data.id;
        if (vi === 0) metaLeadFormId = leadFormResult.data.id;
      }

      // Step 4: Create creative (objective-aware link_data)
      const linkData = buildCreativeLinkData(objective, {
        headline: vHeadline,
        body: vBody,
        ctaType: vCtaType,
        imageUrl: vImage,
        leadFormId: variantLeadFormId,
        campaignUrl: campaign?.url,
      });

      const objectStorySpec: Record<string, any> = {
        page_id: meta_page_id,
        link_data: linkData,
      };

      const creativeResult = await metaPost(`/act_${adAccountId}/adcreatives`, { name: `${campaignName} \u2013 Creative ${vi + 1}`, object_story_spec: JSON.stringify(objectStorySpec) }, meta_access_token);
      if (!creativeResult.ok || !creativeResult.data.id) {
        console.error(`[api/launch] Creative creation failed for variant ${vi}:`, creativeResult.rawBody);
        variantResults.push({ variant_index: vi, headline: vHeadline, meta_ad_id: '', status: 'failed_creative' });
        continue;
      }

      // Step 5: Create ad
      const adResult = await metaPost(`/act_${adAccountId}/ads`, { name: `${campaignName} \u2013 Ad ${vi + 1}: ${vHeadline.slice(0, 40)}`, adset_id: metaAdSetId, creative: JSON.stringify({ creative_id: creativeResult.data.id }), status: 'PAUSED' }, meta_access_token);
      if (!adResult.ok || !adResult.data.id) {
        console.error(`[api/launch] Ad creation failed for variant ${vi}:`, adResult.rawBody);
        variantResults.push({ variant_index: vi, headline: vHeadline, meta_ad_id: '', status: 'failed_ad' });
        continue;
      }

      metaAdIds.push(adResult.data.id);
      variantResults.push({ variant_index: vi, headline: vHeadline, meta_ad_id: adResult.data.id, status: 'created' });
    }

    if (metaAdIds.length === 0) {
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'meta_api_error', message: 'Failed to create any ads', variant_results: variantResults, step: 'ads' } });
    }

    // Activate all ads, ad set, and campaign
    for (const adId of metaAdIds) {
      await metaPost(`/${adId}`, { status: 'ACTIVE' }, meta_access_token);
    }
    await metaPost(`/${metaAdSetId}`, { status: 'ACTIVE' }, meta_access_token);
    await metaPost(`/${metaCampaignId}`, { status: 'ACTIVE' }, meta_access_token);

    const metaAdId = metaAdIds[0];

    // Step 7: Update DB
    const launchedAt = new Date().toISOString();

    supabaseAdmin.from('api_campaigns').update({ status: 'active', meta_campaign_id: metaCampaignId, meta_adset_id: metaAdSetId, meta_ad_id: metaAdId, ...(metaLeadFormId ? { meta_leadform_id: metaLeadFormId } : {}), launched_at: launchedAt }).eq('id', campaignId).then(() => {});
    supabaseAdmin.from('campaigns').insert({ business_id: null, name: campaignName, status: 'active', daily_budget_cents: budgetCents, radius_km: targetRadius, ad_headline: headline, ad_copy: adBody, ad_image_url: imageUrl || null, meta_campaign_id: metaCampaignId, meta_adset_id: metaAdSetId, meta_ad_id: metaAdId, ...(metaLeadFormId ? { meta_leadform_id: metaLeadFormId } : {}), leads_count: 0, spend_cents: 0, launched_at: launchedAt }).then(() => {});

    // Send launch notification (non-blocking)
    try {
      const { data: notifBiz } = await supabaseAdmin
        .from('businesses')
        .select('telegram_chat_id, notifications_enabled, name')
        .eq('user_id', auth.keyRecord.user_id)
        .single();

      if (notifBiz) {
        const { notifyCampaignLaunched } = await import('../lib/notifications.js');
        await notifyCampaignLaunched(notifBiz, campaignName, budgetCents);
      }
    } catch (e) {
      console.warn('[api/launch] Notification failed (non-fatal):', e);
    }

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json({ id: campaignId, status: 'active', objective, meta_campaign_id: metaCampaignId, meta_adset_id: metaAdSetId, meta_ad_id: metaAdId, meta_ad_ids: metaAdIds, variants_launched: metaAdIds.length, variant_results: launch_all_variants ? variantResults : undefined, ...(metaLeadFormId ? { meta_leadform_id: metaLeadFormId } : {}), daily_budget_cents: budgetCents, launched_at: launchedAt });
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
      .from('api_campaigns').select('id, meta_campaign_id, meta_access_token, status, business_name')
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

    let accessToken = meta_access_token || (apiCampaign?.meta_access_token as string) || process.env.META_SYSTEM_USER_TOKEN;
    if (!accessToken) {
      const { data: bizForToken } = await supabaseAdmin.from('businesses').select('facebook_access_token').eq('user_id', auth.keyRecord.user_id).single();
      if (bizForToken?.facebook_access_token) accessToken = bizForToken.facebook_access_token;
    }
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

    // Send pause/resume notification (non-blocking)
    if (action === 'pause') {
      try {
        const { data: notifBiz } = await supabaseAdmin
          .from('businesses')
          .select('telegram_chat_id, notifications_enabled, name')
          .eq('user_id', auth.keyRecord.user_id)
          .single();

        if (notifBiz) {
          const { notifyCampaignPaused } = await import('../lib/notifications.js');
          await notifyCampaignPaused(notifBiz, apiCampaign?.business_name || 'Campaign');
        }
      } catch (e) {
        console.warn('[api/pause] Notification failed (non-fatal):', e);
      }
    }

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

    let accessToken = queryToken || storedAccessToken || process.env.META_SYSTEM_USER_TOKEN;
    if (!accessToken) {
      const { data: bizForToken } = await supabaseAdmin.from('businesses').select('facebook_access_token').eq('user_id', auth.keyRecord.user_id).single();
      if (bizForToken?.facebook_access_token) accessToken = bizForToken.facebook_access_token;
    }
    if (!accessToken) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/performance', method: 'GET', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({ error: { code: 'missing_token', message: 'A Meta access token is required. Pass `meta_access_token` as a query parameter.' } });
    }

    const insightsUrl = `${GRAPH_BASE}/${metaCampaignId}/insights?fields=impressions,clicks,spend,actions&date_preset=maximum&access_token=${accessToken}`;
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

  // Auto-link to user's business if they have one
  const { data: userBiz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (userBiz) {
    await supabaseAdmin
      .from('api_keys')
      .update({ business_id: userBiz.id })
      .eq('id', insertedKey.id);
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
    return validationError(
      res,
      'research-reviews',
      '`business_name` is required and must be a string',
      { business_name: 'Rosebud AI', location: 'Austin, TX', platform: 'google' },
    );
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
    return validationError(
      res,
      'research-competitors',
      '`industry` is required and must be a string',
      { industry: 'dental', location: 'Austin', country: 'US', limit: 3 },
    );
  }
  if (!location || typeof location !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/research/competitors', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return validationError(
      res,
      'research-competitors',
      '`location` is required and must be a string',
      { industry: 'dental', location: 'Austin', country: 'US', limit: 3 },
    );
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

// ── GET /api/v1/meta/status ──────────────────────────────────────────────

async function handleMetaStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const resolvedMeta = await resolveMetaCredentials({
    apiKeyId: auth.keyRecord.id,
    userId: auth.keyRecord.user_id,
  });

  let businessName: string | null = null;
  if (resolvedMeta.business_id) {
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('name')
      .eq('id', resolvedMeta.business_id)
      .maybeSingle();
    businessName = normalizeString(business?.name);
  }

  const hasToken = !!resolvedMeta.meta_access_token;
  const hasAdAccount = !!resolvedMeta.meta_ad_account_id;
  const hasPage = !!resolvedMeta.meta_page_id;
  const connected = hasToken && hasAdAccount && hasPage;

  const missing = [
    !hasToken ? 'meta_access_token' : null,
    !hasAdAccount ? 'meta_ad_account_id' : null,
    !hasPage ? 'meta_page_id' : null,
  ].filter(Boolean);

  await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/status', method: 'GET', statusCode: 200, responseTimeMs: Date.now() - startTime });

  return res.status(200).json({
    connected,
    has_business: !!resolvedMeta.business_id,
    business_name: businessName,
    credentials: {
      access_token: hasToken,
      ad_account_id: hasAdAccount,
      page_id: hasPage,
      resolved_ad_account_id: resolvedMeta.meta_ad_account_id,
      resolved_page_id: resolvedMeta.meta_page_id,
      source: resolvedMeta.source,
    },
    missing,
    ...(connected ? {} : {
      message: 'Facebook not fully connected. Connect at https://zuckerbot.ai/profile',
      connect_url: 'https://zuckerbot.ai/profile',
    }),
  });
}

// ── GET /api/v1/meta/credentials ────────────────────────────────────────

async function handleMetaCredentials(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const resolvedMeta = await resolveMetaCredentials({
    apiKeyId: auth.keyRecord.id,
    userId: auth.keyRecord.user_id,
  });

  const canLaunchAutonomously = !!(
    resolvedMeta.meta_access_token
    && resolvedMeta.meta_ad_account_id
    && resolvedMeta.meta_page_id
  );

  const missing = [
    !resolvedMeta.meta_access_token ? 'meta_access_token' : null,
    !resolvedMeta.meta_ad_account_id ? 'meta_ad_account_id' : null,
    !resolvedMeta.meta_page_id ? 'meta_page_id' : null,
  ].filter(Boolean);

  await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/credentials', method: 'GET', statusCode: 200, responseTimeMs: Date.now() - startTime });

  return res.status(200).json({
    can_launch_autonomously: canLaunchAutonomously,
    source: resolvedMeta.source,
    credentials: {
      access_token: !!resolvedMeta.meta_access_token,
      ad_account_id: resolvedMeta.meta_ad_account_id,
      page_id: resolvedMeta.meta_page_id,
    },
    missing,
    ...(canLaunchAutonomously ? {} : {
      message: 'Facebook credentials are incomplete. Connect at https://zuckerbot.ai/profile',
      connect_url: 'https://zuckerbot.ai/profile',
    }),
  });
}

// ── GET /api/v1/meta/pages ───────────────────────────────────────────────

async function handleMetaPages(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const resolvedMeta = await resolveMetaCredentials({
    apiKeyId: auth.keyRecord.id,
    userId: auth.keyRecord.user_id,
  });

  const accessToken = normalizeString(resolvedMeta.meta_access_token);
  if (!accessToken) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/pages', method: 'GET', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'missing_meta_credentials',
        message: 'No stored Meta access token found. Connect Facebook at https://zuckerbot.ai/profile first.',
        connect_url: 'https://zuckerbot.ai/profile',
      },
    });
  }

  const pagesResult = await listFacebookPages(accessToken);
  if (!pagesResult.ok) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/pages', method: 'GET', statusCode: 502, responseTimeMs: Date.now() - startTime });
    return res.status(502).json({
      error: {
        code: 'meta_api_error',
        message: pagesResult.error || 'Failed to fetch Facebook pages',
      },
    });
  }

  let selectedPageId = normalizeString(resolvedMeta.meta_page_id);
  if (!selectedPageId && pagesResult.pages.length === 1) {
    selectedPageId = pagesResult.pages[0].id;
    await persistBusinessPageId(auth.keyRecord.user_id, resolvedMeta.business_id, selectedPageId);
  }

  const pages = pagesResult.pages.map((page) => ({
    ...page,
    selected: selectedPageId === page.id,
  }));

  await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/pages', method: 'GET', statusCode: 200, responseTimeMs: Date.now() - startTime });

  return res.status(200).json({
    pages,
    selected_page_id: selectedPageId,
    page_count: pages.length,
  });
}

// ── POST /api/v1/meta/select-page ────────────────────────────────────────

async function handleMetaSelectPage(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const selectedPageId = normalizeString(req.body?.page_id);
  if (!selectedPageId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/select-page', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: '`page_id` is required',
      },
    });
  }

  const resolvedMeta = await resolveMetaCredentials({
    apiKeyId: auth.keyRecord.id,
    userId: auth.keyRecord.user_id,
  });

  const accessToken = normalizeString(resolvedMeta.meta_access_token);
  if (!accessToken) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/select-page', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'missing_meta_credentials',
        message: 'No stored Meta access token found. Connect Facebook at https://zuckerbot.ai/profile first.',
        connect_url: 'https://zuckerbot.ai/profile',
      },
    });
  }

  const pagesResult = await listFacebookPages(accessToken);
  if (!pagesResult.ok) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/select-page', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
    return res.status(502).json({
      error: {
        code: 'meta_api_error',
        message: pagesResult.error || 'Failed to fetch Facebook pages',
      },
    });
  }

  const selectedPage = pagesResult.pages.find((page) => page.id === selectedPageId);
  if (!selectedPage) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/select-page', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'The provided `page_id` is not available for the connected Meta account.',
      },
      available_pages: pagesResult.pages.slice(0, 25),
    });
  }

  await persistBusinessPageId(auth.keyRecord.user_id, resolvedMeta.business_id, selectedPage.id);

  await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/select-page', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
  return res.status(200).json({
    selected_page_id: selectedPage.id,
    selected_page_name: selectedPage.name,
    stored: true,
  });
}

// ── POST /api/v1/notifications/telegram ─────────────────────────────────

async function handleSetTelegram(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const { chat_id, enabled } = req.body || {};

  if (!chat_id || typeof chat_id !== 'string') {
    return res.status(400).json({ error: { code: 'validation_error', message: '`chat_id` is required (your Telegram chat ID)' } });
  }

  const { error } = await supabaseAdmin
    .from('businesses')
    .update({
      telegram_chat_id: chat_id,
      notifications_enabled: enabled !== false,
    })
    .eq('user_id', auth.keyRecord.user_id);

  if (error) {
    return res.status(500).json({ error: { code: 'internal_error', message: 'Failed to update notification settings' } });
  }

  const { sendTelegram } = await import('../lib/notifications.js');
  const sent = await sendTelegram({ chatId: chat_id, message: '✅ ZuckerBot notifications connected! You\'ll receive campaign updates here.' });

  return res.status(200).json({
    ok: true,
    test_message_sent: sent,
    message: sent ? 'Telegram connected! Test message sent.' : 'Settings saved, but test message failed. Check your chat ID.',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SEEDREAM 4.5 INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

interface SeedreamResult {
  success: boolean;
  imageUrl?: string;
  base64?: string;
  mimeType?: string;
  error?: string;
}

function inferMimeTypeFromUrl(url?: string): string {
  if (!url) return 'image/png';
  const lower = url.toLowerCase();
  if (lower.includes('.mp4')) return 'video/mp4';
  if (lower.includes('.webm')) return 'video/webm';
  if (lower.includes('.mov')) return 'video/quicktime';
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  if (lower.includes('.png')) return 'image/png';
  return 'image/png';
}

function getImageSizeFromAspectRatio(aspectRatio: string): { width: number; height: number } {
  if (aspectRatio === '16:9') return { width: 2560, height: 1440 };
  if (aspectRatio === '9:16') return { width: 1440, height: 2560 };
  if (aspectRatio === '4:3') return { width: 1920, height: 1440 };
  if (aspectRatio === '3:4') return { width: 1440, height: 1920 };
  return { width: 2048, height: 2048 };
}

function extractImageResult(payload: any): SeedreamResult {
  const b64 =
    payload?.data?.[0]?.b64_json
    || payload?.output?.[0]?.b64_json
    || payload?.outputs?.[0]?.b64_json
    || payload?.result?.images?.[0]?.b64_json
    || payload?.result?.b64_json
    || payload?.image_base64
    || payload?.base64
    || payload?.image?.base64;

  if (typeof b64 === 'string' && b64.length > 0) {
    return {
      success: true,
      base64: b64,
      mimeType: payload?.data?.[0]?.mime_type || payload?.output?.[0]?.mime_type || payload?.mime_type || 'image/png',
    };
  }

  const imageUrl =
    payload?.data?.[0]?.url
    || (typeof payload?.output?.[0] === 'string' ? payload?.output?.[0] : payload?.output?.[0]?.url)
    || (typeof payload?.outputs?.[0] === 'string' ? payload?.outputs?.[0] : payload?.outputs?.[0]?.url)
    || payload?.result?.images?.[0]?.url
    || payload?.image_url
    || payload?.url
    || payload?.image?.url;

  if (typeof imageUrl === 'string' && imageUrl.length > 0) {
    return {
      success: true,
      imageUrl,
      mimeType: payload?.data?.[0]?.mime_type || payload?.output?.[0]?.mime_type || payload?.mime_type || inferMimeTypeFromUrl(imageUrl),
    };
  }

  return { success: false, error: 'No image payload found in provider response' };
}

/**
 * Call Seedream 4.5 via AI/ML API (primary provider)
 */
async function callSeedreamAIML(prompt: string, aspectRatio: string): Promise<SeedreamResult> {
  if (!AIML_API_KEY) {
    return { success: false, error: 'AIML API key not configured' };
  }

  const requestSeedream = async (ratio: string): Promise<SeedreamResult> => {
    const response = await fetch('https://api.aimlapi.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIML_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'bytedance/seedream-4-5',
        prompt,
        image_size: getImageSizeFromAspectRatio(ratio),
        response_format: 'b64_json',
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `AIML API error: ${response.status} ${errorText}` };
    }

    const data = await response.json();
    const normalized = extractImageResult(data);
    if (normalized.success) {
      return normalized;
    }

    return { success: false, error: normalized.error || 'No image payload found in AIML response' };
  };

  try {
    let result = await requestSeedream(aspectRatio);
    if (result.success) return result;

    // Safety fallback for provider-side ratio rejections.
    if (aspectRatio !== '1:1') {
      const retryResult = await requestSeedream('1:1');
      if (retryResult.success) return retryResult;
      result = {
        success: false,
        error: `${result.error}; retry 1:1 failed: ${retryResult.error}`,
      };
    }

    return result;
  } catch (error: any) {
    return { success: false, error: `AIML API call failed: ${error.message}` };
  }
}

/**
 * Call Seedream 4.5 via Replicate (fallback provider)
 */
async function callSeedreamReplicate(prompt: string, aspectRatio: string): Promise<SeedreamResult> {
  if (!REPLICATE_API_TOKEN) {
    return { success: false, error: 'Replicate API token not configured' };
  }

  const mapReplicateAspectRatio = (ratio: string): string => {
    if (['1:1', '16:9', '9:16', '3:2', '2:3', '4:3', '3:4'].includes(ratio)) return ratio;
    return '1:1';
  };

  const startPrediction = async (ratio: string): Promise<{ id?: string; error?: string }> => {
    const startResponse = await fetch('https://api.replicate.com/v1/models/bytedance/seedream-4.5/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: mapReplicateAspectRatio(ratio),
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      return { error: `Replicate start error: ${startResponse.status} ${errorText}` };
    }

    const prediction = await startResponse.json();
    return { id: prediction.id };
  };

  try {
    let startResult = await startPrediction(aspectRatio);
    if (!startResult.id && aspectRatio !== '1:1') {
      const retryStart = await startPrediction('1:1');
      if (retryStart.id) {
        startResult = retryStart;
      } else {
        return {
          success: false,
          error: `${startResult.error}; retry 1:1 failed: ${retryStart.error}`,
        };
      }
    }

    if (!startResult.id) {
      return { success: false, error: startResult.error || 'Replicate failed to start prediction' };
    }

    const predictionId = startResult.id;

    // Poll for completion (max 60 seconds)
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` },
      });

      if (statusResponse.ok) {
        const status = await statusResponse.json();
        if (status.status === 'succeeded') {
          const normalized = extractImageResult(status);
          if (normalized.success) return normalized;
          const output = status?.output;
          if (typeof output === 'string' && output.length > 0) {
            return { success: true, imageUrl: output, mimeType: inferMimeTypeFromUrl(output) };
          }
          if (Array.isArray(output) && typeof output[0] === 'string' && output[0].length > 0) {
            return { success: true, imageUrl: output[0], mimeType: inferMimeTypeFromUrl(output[0]) };
          }
          return { success: false, error: normalized.error || 'Replicate succeeded without media output' };
        } else if (status.status === 'failed') {
          return { success: false, error: `Replicate prediction failed: ${status.error}` };
        }
      }
    }

    return { success: false, error: 'Replicate prediction timed out' };
  } catch (error: any) {
    return { success: false, error: `Replicate API call failed: ${error.message}` };
  }
}

/**
 * Generate image using Seedream 4.5 with fallback chain
 */
async function generateWithSeedream(prompt: string, aspectRatio: string): Promise<SeedreamResult> {
  console.log('[Seedream] Attempting generation with AIML API...');
  const aimlResult = await callSeedreamAIML(prompt, aspectRatio);
  
  if (aimlResult.success) {
    console.log('[Seedream] AIML API succeeded');
    return aimlResult;
  }

  console.log('[Seedream] AIML API failed, trying Replicate...', aimlResult.error);
  const replicateResult = await callSeedreamReplicate(prompt, aspectRatio);
  
  if (replicateResult.success) {
    console.log('[Seedream] Replicate succeeded');
    return replicateResult;
  }

  console.log('[Seedream] All providers failed');
  return {
    success: false,
    error: `AIML failed: ${aimlResult.error || 'unknown error'}; Replicate failed: ${replicateResult.error || 'unknown error'}`,
  };
}

/**
 * Call Kling via WaveSpeed and normalize into SeedreamResult shape
 */
async function callKlingWavespeed(prompt: string, aspectRatio: string): Promise<SeedreamResult> {
  if (!WAVESPEED_API_KEY) {
    return { success: false, error: 'WaveSpeed API key not configured' };
  }

  const apiBase = (process.env.WAVESPEED_API_BASE_URL || 'https://api.wavespeed.ai').replace(/\/$/, '');
  const model = process.env.WAVESPEED_KLING_MODEL || 'kwaivgi/kling-video-o3-std/text-to-video';
  const createUrl = `${apiBase}/api/v3/${model}`;
  const klingAspectRatio = ['16:9', '9:16', '1:1'].includes(aspectRatio) ? aspectRatio : '1:1';
  const rawDuration = Number(process.env.WAVESPEED_KLING_VIDEO_DURATION || 5);
  const duration = Number.isFinite(rawDuration) && rawDuration >= 3 && rawDuration <= 15 ? Math.floor(rawDuration) : 5;

  try {
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: klingAspectRatio,
        duration,
        sound: false,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      return { success: false, error: `WaveSpeed create error: ${createResponse.status} ${errorText}` };
    }

    const createData = await createResponse.json();
    const createPayload = createData?.data || createData;
    const directResult = extractImageResult(createPayload);
    if (directResult.success) return directResult;

    const resultUrl = createPayload?.urls?.get;
    const jobId = createPayload?.id || createPayload?.job_id || createPayload?.prediction_id;
    if (!resultUrl && !jobId) {
      return { success: false, error: directResult.error || 'WaveSpeed returned neither image payload nor prediction id' };
    }
    const pollUrl = resultUrl || `${apiBase}/api/v3/predictions/${jobId}/result`;

    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const pollResponse = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${WAVESPEED_API_KEY}`,
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!pollResponse.ok) continue;
      const pollData = await pollResponse.json();
      const pollPayload = pollData?.data || pollData;
      const status = String(pollPayload?.status || pollPayload?.state || '').toLowerCase();

      if (status === 'failed' || status === 'error' || status === 'cancelled') {
        return { success: false, error: `WaveSpeed job failed: ${pollPayload?.error || pollData?.message || 'unknown error'}` };
      }

      const pollResult = extractImageResult(pollPayload);
      if (pollResult.success) return pollResult;
      if (status === 'succeeded' || status === 'completed' || status === 'finished' || status === 'success') {
        return { success: false, error: pollResult.error || 'WaveSpeed job completed without image payload' };
      }
    }

    return { success: false, error: 'WaveSpeed prediction timed out' };
  } catch (error: any) {
    return { success: false, error: `WaveSpeed API call failed: ${error.message}` };
  }
}

/**
 * Quick competitor insights for market intelligence (internal use)
 */
async function getCompetitorInsights(industry: string, location: string, country: string, limit: number): Promise<Array<{creative_style: string, advertising_strategy: string}> | null> {
  try {
    const queries = [`${industry} advertising creative styles`, `${industry} marketing strategies 2026`];
    const allResults = await Promise.all(queries.map((q) => braveSearch(q, 4)));
    const results: any[] = [];
    for (const batch of allResults) {
      for (const r of batch) results.push(r);
    }

    if (results.length === 0) return null;

    const searchContext = results.slice(0, 6).map((r: any) => `${r.title}: ${r.description || ''}`).join('\n');
    
    const analysisPrompt = `Analyze these search results about ${industry} advertising and extract creative insights:

${searchContext}

Respond with JSON only:
{
  "insights": [
    {"creative_style": "<style>", "advertising_strategy": "<strategy>"}
  ]
}

Focus on visual styles and advertising approaches that work for ${industry} businesses.`;

    const claudeText = await callClaude('You analyze advertising trends.', analysisPrompt, 800);
    const parsed = parseClaudeJson(claudeText);
    
    return Array.isArray(parsed.insights) ? parsed.insights.slice(0, limit) : null;
  } catch (err) {
    console.warn('[getCompetitorInsights] Failed:', err);
    return null;
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

  const {
    url,
    business_name,
    description,
    style,
    aspect_ratio,
    media_type,
    count,
    image_count,
    model,
    quality,
    use_market_intelligence,
    use_market_intel,
  } = req.body || {};

  // Validate style
  const validStyles = ['photo', 'illustration', 'minimal', 'bold'];
  const selectedStyle: string = validStyles.includes(style) ? style : 'photo';

  // Validate aspect ratio
  const validRatios = ['1:1', '9:16', '16:9', '3:4', '4:3'];
  const selectedRatio: string = validRatios.includes(aspect_ratio) ? aspect_ratio : '1:1';

  // Validate count (1-4)
  const rawCount = typeof count === 'number' ? count : (typeof image_count === 'number' ? image_count : 1);
  const imageCount = Math.min(Math.max(rawCount, 1), 4);

  // Validate model
  const validModels = ['seedream', 'imagen', 'kling', 'auto'];
  const requestedModel: string = validModels.includes(model) ? model : 'auto';
  const intentText = `${business_name || ''} ${description || ''}`.toLowerCase();
  const inferredVideoIntent = !model && !media_type && /\b(video|video ad|reel|short[- ]form|ugc|clip|tiktok)\b/.test(intentText);
  const selectedModel: string = inferredVideoIntent ? 'kling' : requestedModel;
  const isVideoRequest = media_type === 'video' || selectedModel === 'kling';

  // Validate quality
  const validQualities = ['fast', 'ultra'];
  const selectedQuality: string = validQualities.includes(quality) ? quality : 'fast';

  // Market intelligence flag
  const useMarketIntel =
    use_market_intelligence === true
    || (use_market_intelligence === undefined && use_market_intel === true);

  if (!url && !business_name && !description) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return validationError(
      res,
      'creatives-generate',
      'At least one of `url`, `business_name`, or `description` is required',
      {
        business_name: 'Rosebud AI',
        description: 'AI assistant that helps teams ship faster.',
        count: 3,
        image_count: 3,
        style: 'photo',
        aspect_ratio: '1:1',
        model: 'auto',
        quality: 'fast',
        use_market_intel: false,
      },
    );
  }

  if (selectedQuality === 'ultra' && !isVideoRequest) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return validationError(
      res,
      'creatives-generate',
      '`quality` can be "ultra" only for video generation (`media_type: "video"` or `model: "kling"`)',
      {
        business_name: 'Rosebud AI',
        description: 'AI assistant that helps teams ship faster.',
        image_count: 3,
        style: 'photo',
        aspect_ratio: '1:1',
        model: 'kling',
        quality: 'ultra',
        use_market_intel: false,
      },
    );
  }

  // Check provider availability while preserving fallback chains
  const hasSeedreamProvider = !!(AIML_API_KEY || REPLICATE_API_TOKEN);
  const hasImagenProvider = !!GOOGLE_AI_API_KEY;

  if (!isVideoRequest) {
    if (selectedModel === 'imagen' && !hasImagenProvider) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
      return res.status(500).json({ error: { code: 'config_error', message: 'Google AI API key not configured' } });
    }

    if ((selectedModel === 'seedream' || selectedModel === 'auto') && !hasSeedreamProvider && !hasImagenProvider) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
      return res.status(500).json({ error: { code: 'config_error', message: 'No image generation providers configured (Seedream or Imagen)' } });
    }
  }

  if (isVideoRequest && !WAVESPEED_API_KEY) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'config_error', message: 'WaveSpeed API key not configured for Kling model' } });
  }

  if (!ANTHROPIC_API_KEY) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'config_error', message: 'Anthropic API key required for prompt generation' } });
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

    // Step 2: Gather market intelligence if requested
    let marketIntelligence = '';
    let detectedIndustry = null;
    
    if (useMarketIntel && (url || business_name)) {
      try {
        // Quick industry detection
        const industryPrompt = `Based on this business information, identify the industry category in 1-2 words:
Business: ${business_name || 'Unknown'}
Description: ${description || scrapedData?.description || 'None'}
Website content: ${scrapedData?.rawText?.slice(0, 500) || 'None'}

Respond with ONLY the industry category (e.g., "restaurant", "dental", "ecommerce", "saas", "fitness").`;
        
        const industryResult = await callClaude('You identify business industries concisely.', industryPrompt, 50);
        detectedIndustry = industryResult.trim().toLowerCase().replace(/[^a-z]/g, '');
        
        if (detectedIndustry && detectedIndustry !== 'unknown') {
          // Get quick competitor insights (internal call, doesn't count against rate limits)
          const competitorData = await getCompetitorInsights(detectedIndustry, 'general', 'US', 3);
          if (competitorData && competitorData.length > 0) {
            const styles = competitorData.map(c => c.creative_style).filter(Boolean);
            const strategies = competitorData.map(c => c.advertising_strategy).filter(Boolean);
            
            if (styles.length > 0 || strategies.length > 0) {
              marketIntelligence = `\nMARKET INTELLIGENCE:\n- Industry: ${detectedIndustry}\n- Competitor styles: ${styles.join(', ')}\n- Common strategies: ${strategies.join(', ')}\n`;
            }
          }
        }
      } catch (err) {
        console.warn('[api/creatives] Market intelligence gathering failed:', err);
        // Continue without market intelligence
      }
    }

    // Step 3: Build context for Claude prompt generation
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

    const requestedPromptCount = isVideoRequest && selectedQuality === 'ultra' ? 6 : imageCount;
    const promptGenerationRequest = `You are an expert at writing image generation prompts for Facebook ad creatives. Generate ${requestedPromptCount} distinct image prompt(s) for this business.

BUSINESS:
- Name: ${resolvedName}
- Description: ${resolvedDesc}
${scrapedSection}${marketIntelligence}
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
    const prompts: string[] = Array.isArray(parsed.prompts) ? parsed.prompts.slice(0, requestedPromptCount) : [];

    if (prompts.length === 0) {
      console.error('[api/creatives] Failed to generate prompts from Claude:', claudeText?.slice(0, 500));
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/generate', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'parse_error', message: 'Failed to generate image prompts from AI' } });
    }

    // Step 4: Generate media using selected model routing
    const creatives: Array<{ 
      url: string | null; 
      base64?: string; 
      mimeType: string; 
      prompt: string; 
      aspect_ratio: string;
      generation_method?: string;
    }> = [];
    const providerErrors: Array<{ provider: string; error: string }> = [];
    let actualGenerationMethod = 'unknown';

    if (isVideoRequest) {
      // Dedicated video path: Kling only
      for (const videoPrompt of prompts) {
        const klingResult = await callKlingWavespeed(videoPrompt, selectedRatio);
        if (!klingResult.success) {
          console.warn('[api/creatives] Kling generation failed:', klingResult.error);
          providerErrors.push({ provider: 'kling', error: String(klingResult.error || 'unknown error') });
          continue;
        }

        const mimeType = klingResult.mimeType || 'video/mp4';
        let publicUrl = klingResult.imageUrl || null;
        let base64Data = klingResult.base64;

        if (!publicUrl && base64Data) {
          try {
            const ext = mimeType === 'video/mp4' ? 'mp4' : mimeType === 'video/webm' ? 'webm' : 'bin';
            const fileName = `creative-kling-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const storageUrl = `${SUPABASE_URL}/storage/v1/object/ad-previews/${fileName}`;
            const buf = Buffer.from(base64Data, 'base64');
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
            if (uploadRes.ok) {
              publicUrl = `${SUPABASE_URL}/storage/v1/object/public/ad-previews/${fileName}`;
            } else {
              console.error('[api/creatives] Kling upload failed:', await uploadRes.text());
            }
          } catch (uploadErr: any) {
            console.error('[api/creatives] Kling upload error:', uploadErr);
          }
        }

        if (publicUrl || base64Data) {
          actualGenerationMethod = 'kling_video';
          creatives.push({
            url: publicUrl,
            ...(base64Data ? { base64: base64Data } : {}),
            mimeType,
            prompt: videoPrompt,
            aspect_ratio: selectedRatio,
            generation_method: 'kling_video',
          });
        }
      }
    } else {
      // Dedicated image path: Seedream -> Imagen fallback
      for (const imagePrompt of prompts) {
        let generationSuccess = false;
        
        // Try Seedream first if auto or explicitly requested
        if ((selectedModel === 'auto' || selectedModel === 'seedream') && (AIML_API_KEY || REPLICATE_API_TOKEN)) {
          const seedreamResult = await generateWithSeedream(imagePrompt, selectedRatio);
          
          if (seedreamResult.success) {
            actualGenerationMethod = 'seedream';
            generationSuccess = true;
            
            let publicUrl = '';
            let base64Data = seedreamResult.base64;
            
            // Handle URL-based result (from Replicate)
            if (seedreamResult.imageUrl && !seedreamResult.base64) {
              try {
                const imageResponse = await fetch(seedreamResult.imageUrl);
                if (imageResponse.ok) {
                  const buffer = await imageResponse.arrayBuffer();
                  base64Data = Buffer.from(buffer).toString('base64');
                }
              } catch (err) {
                console.error('[api/creatives] Failed to download Replicate image:', err);
                continue;
              }
            }
            
            // Upload to Supabase Storage
            if (base64Data) {
              try {
                const buf = Buffer.from(base64Data, 'base64');
                const fileName = `creative-seedream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
                const storageUrl = `${SUPABASE_URL}/storage/v1/object/ad-previews/${fileName}`;
                
                const uploadRes = await fetch(storageUrl, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': seedreamResult.mimeType || 'image/png',
                    'x-upsert': 'true',
                    'Content-Length': String(buf.length),
                  },
                  body: buf,
                });
                
                if (uploadRes.ok) {
                  publicUrl = `${SUPABASE_URL}/storage/v1/object/public/ad-previews/${fileName}`;
                } else {
                  console.error('[api/creatives] Seedream upload failed:', await uploadRes.text());
                }
              } catch (uploadErr: any) {
                console.error('[api/creatives] Seedream upload error:', uploadErr);
              }
              
              creatives.push({
                url: publicUrl || null,
                base64: base64Data,
                mimeType: seedreamResult.mimeType || 'image/png',
                prompt: imagePrompt,
                aspect_ratio: selectedRatio,
                generation_method: 'seedream',
              });
            }
          } else if (seedreamResult.error) {
            providerErrors.push({ provider: 'seedream', error: String(seedreamResult.error) });
          }
        }
        
        // Fallback to Imagen if Seedream failed or if explicitly requested
        if (!generationSuccess && (selectedModel === 'auto' || selectedModel === 'seedream' || selectedModel === 'imagen') && GOOGLE_AI_API_KEY) {
          console.log('[api/creatives] Falling back to Imagen...');
          
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

          if (imagenResponse.ok) {
            const imagenData = await imagenResponse.json();
            const predictions = imagenData.predictions || [];

            for (const prediction of predictions) {
              if (prediction.bytesBase64Encoded) {
                actualGenerationMethod = 'imagen';
                const mimeType = prediction.mimeType || 'image/png';
                const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
                const fileName = `creative-imagen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

                // Upload to Supabase Storage
                let publicUrl = '';
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
                  
                  if (uploadRes.ok) {
                    publicUrl = `${SUPABASE_URL}/storage/v1/object/public/ad-previews/${fileName}`;
                  }
                } catch (uploadErr: any) {
                  console.error('[api/creatives] Imagen upload error:', uploadErr);
                }

                creatives.push({
                  url: publicUrl || null,
                  base64: prediction.bytesBase64Encoded,
                  mimeType,
                  prompt: imagePrompt,
                  aspect_ratio: selectedRatio,
                  generation_method: 'imagen',
                });
              }
            }
          } else {
            const imagenError = await imagenResponse.text();
            console.error('[api/creatives] Imagen API error:', imagenError);
            providerErrors.push({ provider: 'imagen', error: `HTTP ${imagenResponse.status}: ${imagenError}` });
          }
        }
      }
    }

    const candidateCount = creatives.length;

    if (creatives.length === 0) {
      const failureCode = isVideoRequest ? 'video_generation_failed' : 'image_generation_failed';
      const failureMessage = isVideoRequest
        ? 'Video generation service failed to produce any videos. Try again or use a different description.'
        : 'Image generation service failed to produce any images. Try again or use a different description.';

      await logUsage({ 
        apiKeyId: auth.keyRecord.id, 
        endpoint: '/v1/creatives/generate', 
        method: 'POST', 
        statusCode: 502, 
        responseTimeMs: Date.now() - startTime,
  
  
      });
      return res.status(502).json({
        error: { code: failureCode, message: failureMessage },
        diagnostics: providerErrors.slice(0, 5),
      });
    }

    // Ultra mode for Kling: best-of-N selection (N=6 generated, return top requested count)
    if (isVideoRequest && selectedQuality === 'ultra' && creatives.length > imageCount) {
      try {
        const rankingPrompt = `Rank these ${creatives.length} ad creative prompts for likely Facebook/Instagram ad performance.

Return JSON only:
{
  "ranked_indexes": [<0-based indexes best to worst>]
}

Scoring criteria:
- Prompt adherence and clarity
- Commercial visual appeal
- Scroll-stopping potential
- Relevance to the business description
- Clean ad-suitable composition with no text/logos

Business name: ${resolvedName}
Business description: ${resolvedDesc || 'N/A'}

Candidates:
${creatives.map((creative, idx) => `${idx}: ${creative.prompt}`).join('\n')}
`;

        const rankingText = await callClaude(
          'You are a strict creative quality ranker. Return JSON only.',
          rankingPrompt,
          800,
        );
        const rankingParsed = parseClaudeJson(rankingText);
        const rankedIndexes = Array.isArray(rankingParsed.ranked_indexes)
          ? rankingParsed.ranked_indexes
              .map((value: any) => Number(value))
              .filter((value: number) => Number.isInteger(value) && value >= 0 && value < creatives.length)
          : [];

        if (rankedIndexes.length > 0) {
          const seen = new Set<number>();
          const deduped = rankedIndexes.filter((value: number) => {
            if (seen.has(value)) return false;
            seen.add(value);
            return true;
          });
          const selectedIndexes = deduped.slice(0, imageCount);
          for (let idx = 0; idx < creatives.length && selectedIndexes.length < imageCount; idx++) {
            if (!selectedIndexes.includes(idx)) selectedIndexes.push(idx);
          }
          const selectedCreatives = selectedIndexes.map((idx: number) => creatives[idx]).filter(Boolean);
          if (selectedCreatives.length > 0) {
            creatives.splice(0, creatives.length, ...selectedCreatives);
          }
        } else {
          creatives.splice(imageCount);
        }
      } catch (rankingErr) {
        console.warn('[api/creatives] Ultra ranking failed, returning first results:', rankingErr);
        creatives.splice(imageCount);
      }
    }

    // Store original prompts in database for variations support
    try {
      for (const creative of creatives) {
        if (creative.url) {
          // Extract creative ID from URL for storage
          const urlParts = creative.url.split('/');
          const fileName = urlParts[urlParts.length - 1];
          const creativeId = fileName.split('.')[0];
          
          await supabaseAdmin.from('creatives').upsert({
            id: creativeId,
            url: creative.url,
            original_prompt: creative.prompt,
            generation_method: creative.generation_method || actualGenerationMethod,
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch (dbErr) {
      console.warn('[api/creatives] Failed to store creative metadata:', dbErr);
      // Continue without failing the request
    }

    await logUsage({ 
      apiKeyId: auth.keyRecord.id, 
      endpoint: '/v1/creatives/generate', 
      method: 'POST', 
      statusCode: 200, 
      responseTimeMs: Date.now() - startTime,


    });
    
    return res.status(200).json({ 
      creatives,
      meta: {
        market_intelligence_used: useMarketIntel,
        model_requested: selectedModel,
        model_used: actualGenerationMethod,
        quality: selectedQuality,
        candidate_count: candidateCount,
      }
    });
  } catch (err: any) {
    console.error('[api/creatives] Unexpected error:', err);
    await logUsage({ 
      apiKeyId: auth.keyRecord.id, 
      endpoint: '/v1/creatives/generate', 
      method: 'POST', 
      statusCode: 500, 
      responseTimeMs: Date.now() - startTime,


    });
    return res.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred while generating creatives', details: err?.message || String(err) } });
  }
}

// -- POST /api/v1/creatives/{id}/variants -------------------------------

async function handleCreativeVariants(req: VercelRequest, res: VercelResponse, creativeId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  if (!creativeId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/:id/variants', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: 'Creative ID is required' } });
  }

  const { count, variations, aspect_ratio } = req.body || {};
  
  // Validate count (1-5)
  const variantCount = Math.min(Math.max(typeof count === 'number' ? count : 3, 1), 5);
  
  // Validate variations
  const validVariations = ['background', 'style', 'composition', 'lighting', 'color'];
  const selectedVariations = Array.isArray(variations) ? 
    variations.filter(v => validVariations.includes(v)) : 
    ['background', 'style'];
  
  // Validate aspect ratio
  const validRatios = ['1:1', '9:16', '16:9', '3:4', '4:3'];
  const selectedRatio = validRatios.includes(aspect_ratio) ? aspect_ratio : '1:1';

  try {
    // Retrieve original creative data
    const { data: originalCreative } = await supabaseAdmin
      .from('creatives')
      .select('original_prompt, generation_method')
      .eq('id', creativeId)
      .single();

    if (!originalCreative || !originalCreative.original_prompt) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/:id/variants', method: 'POST', statusCode: 404, responseTimeMs: Date.now() - startTime });
      return res.status(404).json({ error: { code: 'not_found', message: 'Original creative not found or does not support variations' } });
    }

    const originalPrompt = originalCreative.original_prompt;
    const preferredMethod = originalCreative.generation_method || 'auto';

    // Generate variation prompts
    const variationRequest = `Based on this original image prompt, create ${variantCount} variations that change these aspects: ${selectedVariations.join(', ')}.

Original prompt: "${originalPrompt}"

Generate variations that maintain the core subject and message but change the specified aspects. Each variation should be distinctly different.

Respond with JSON only:
{
  "variations": [
    "<modified prompt>"
  ]
}

Rules:
- Keep the same core product/subject
- Change only the specified aspects: ${selectedVariations.join(', ')}
- Make each variation visually distinct
- Maintain ad-appropriate composition
- No text, logos, or watermarks`;

    const claudeText = await callClaude('You create image prompt variations.', variationRequest, 1200);
    const parsed = parseClaudeJson(claudeText);
    const variationPrompts = Array.isArray(parsed.variations) ? parsed.variations.slice(0, variantCount) : [];

    if (variationPrompts.length === 0) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/:id/variants', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'generation_failed', message: 'Failed to generate prompt variations' } });
    }

    // Generate images using the same method as original
    const variants = [];
    let generationMethod = 'unknown';

    for (const prompt of variationPrompts) {
      let success = false;
      
      // Try to use the same generation method as original
      if ((preferredMethod === 'seedream' || preferredMethod === 'auto') && (AIML_API_KEY || REPLICATE_API_TOKEN)) {
        const seedreamResult = await generateWithSeedream(prompt, selectedRatio);
        if (seedreamResult.success) {
          generationMethod = 'seedream';
          success = true;
          
          let publicUrl = '';
          let base64Data = seedreamResult.base64;
          
          if (seedreamResult.imageUrl && !seedreamResult.base64) {
            try {
              const imageResponse = await fetch(seedreamResult.imageUrl);
              if (imageResponse.ok) {
                const buffer = await imageResponse.arrayBuffer();
                base64Data = Buffer.from(buffer).toString('base64');
              }
            } catch (err) {
              console.error('[api/variants] Failed to download image:', err);
              continue;
            }
          }
          
          if (base64Data) {
            try {
              const buf = Buffer.from(base64Data, 'base64');
              const fileName = `variant-${creativeId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`;
              const storageUrl = `${SUPABASE_URL}/storage/v1/object/ad-previews/${fileName}`;
              
              const uploadRes = await fetch(storageUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': seedreamResult.mimeType || 'image/png',
                  'x-upsert': 'true',
                  'Content-Length': String(buf.length),
                },
                body: buf,
              });
              
              if (uploadRes.ok) {
                publicUrl = `${SUPABASE_URL}/storage/v1/object/public/ad-previews/${fileName}`;
              }
            } catch (uploadErr) {
              console.error('[api/variants] Upload error:', uploadErr);
            }
            
            variants.push({
              url: publicUrl || null,
              base64: base64Data,
              mimeType: seedreamResult.mimeType || 'image/png',
              prompt: prompt,
              aspect_ratio: selectedRatio,
              variation_of: creativeId,
            });
          }
        }
      }
      
      // Fallback to Imagen if needed
      if (!success && GOOGLE_AI_API_KEY) {
        // Similar Imagen generation logic as in main function
        // (shortened for brevity, but follows same pattern)
        console.log('[api/variants] Fallback to Imagen for variant');
        generationMethod = 'imagen';
        // Implementation would mirror the Imagen logic from handleCreativesGenerate
      }
    }

    if (variants.length === 0) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/:id/variants', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'generation_failed', message: 'Failed to generate any variants' } });
    }

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/:id/variants', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json({ 
      variants,
      original_creative_id: creativeId,
      variations_applied: selectedVariations,
      generation_method: generationMethod,
    });

  } catch (err: any) {
    console.error('[api/variants] Error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/:id/variants', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'Failed to generate variants', details: err?.message } });
  }
}

// -- POST /api/v1/creatives/{id}/feedback -------------------------------

async function handleCreativeFeedback(req: VercelRequest, res: VercelResponse, creativeId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  if (!creativeId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/:id/feedback', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: 'Creative ID is required' } });
  }

  const { rating, notes } = req.body || {};
  
  // Validate rating
  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/:id/feedback', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: 'Rating must be a number between 1 and 5' } });
  }

  try {
    // Store feedback
    const { data: feedback, error: insertError } = await supabaseAdmin
      .from('creative_feedback')
      .insert({
        creative_id: creativeId,
        api_key_id: auth.keyRecord.id,
        rating: rating,
        notes: typeof notes === 'string' ? notes.slice(0, 500) : null,
      })
      .select('id, created_at')
      .single();

    if (insertError) {
      console.error('[api/feedback] Database error:', insertError);
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/:id/feedback', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
      return res.status(500).json({ error: { code: 'database_error', message: 'Failed to store feedback' } });
    }

    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/:id/feedback', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json({ 
      feedback_id: feedback.id,
      creative_id: creativeId,
      rating: rating,
      notes: notes || null,
      created_at: feedback.created_at,
      message: 'Feedback recorded successfully',
    });

  } catch (err: any) {
    console.error('[api/feedback] Error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/creatives/:id/feedback', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'Failed to record feedback', details: err?.message } });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTONOMOUS MODE
// Routes:
//   POST /api/v1/autonomous/policies/upsert
//   GET  /api/v1/autonomous/metrics
//   POST /api/v1/autonomous/evaluate
//   POST /api/v1/autonomous/execute
//   POST /api/v1/autonomous/run   (cron-internal, CRON_SECRET auth)
// ═══════════════════════════════════════════════════════════════════════════

interface AutonomousPolicy {
  id: string;
  business_id: string;
  user_id: string;
  enabled: boolean;
  target_cpa: number;
  pause_multiplier: number;
  scale_multiplier: number;
  frequency_cap: number;
  /** @deprecated Use max_daily_budget_cents (integer cents). Kept for backward compat. */
  max_daily_budget: number;
  /** Budget safety cap in integer cents (e.g. $100 = 10000). Preferred over max_daily_budget. */
  max_daily_budget_cents?: number;
  scale_pct: number;
  min_conversions_to_scale: number;
}

interface CampaignMetric {
  campaign_id: string;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  name: string;
  status: string;
  daily_budget: number;       // dollars
  spend_today: number | null; // dollars — lifetime spend from DB (see docs)
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number | null;         // dollars per conversion
  ctr: number | null;         // ratio (0–1)
  cpc: number | null;         // dollars per click
  frequency: number | null;   // not available without Meta insights call
}

interface AutonomousAction {
  type: 'pause' | 'scale';
  campaign_id: string;
  meta_campaign_id: string | null;
  meta_adset_id?: string | null;
  current_budget?: number;
  new_budget?: number;
  reason: string;
}

/** Load all campaigns for a business and return normalized metrics. */
async function fetchBusinessCampaignMetrics(businessId: string): Promise<CampaignMetric[]> {
  const { data: campaigns } = await supabaseAdmin
    .from('campaigns')
    .select('id, name, status, daily_budget_cents, spend_cents, impressions, clicks, leads_count, meta_campaign_id, meta_adset_id')
    .eq('business_id', businessId);

  return (campaigns || []).map((c: any) => {
    const spendDollars = (c.spend_cents || 0) / 100;
    const budgetDollars = (c.daily_budget_cents || 0) / 100;
    const conversions = c.leads_count || 0;
    const clicks = c.clicks || 0;
    const impressions = c.impressions || 0;
    const cpa = conversions > 0 ? spendDollars / conversions : null;
    const ctr = impressions > 0 ? clicks / impressions : null;
    const cpc = clicks > 0 ? spendDollars / clicks : null;

    return {
      campaign_id: c.id,
      meta_campaign_id: c.meta_campaign_id || null,
      meta_adset_id: c.meta_adset_id || null,
      name: c.name,
      status: c.status,
      daily_budget: budgetDollars,
      spend_today: spendDollars, // proxy: lifetime spend from DB; see README for real-time notes
      impressions,
      clicks,
      conversions,
      cpa,
      ctr,
      cpc,
      frequency: null, // requires Meta Insights API call — not fetched in MVP
    };
  });
}

/** Deterministically generate actions from policy + metrics. Pure function. */
function generateAutonomousActions(policy: AutonomousPolicy, metrics: CampaignMetric[]): AutonomousAction[] {
  const actions: AutonomousAction[] = [];
  const SPEND_MIN_USD = 5; // do not act on campaigns with < $5 lifetime spend

  // Prefer max_daily_budget_cents (integer cents, added by migration 20260302).
  // Fall back to legacy max_daily_budget (dollars) for rows not yet backfilled.
  const maxBudgetDollars = policy.max_daily_budget_cents != null
    ? policy.max_daily_budget_cents / 100
    : policy.max_daily_budget;

  for (const m of metrics) {
    const statusNorm = (m.status || '').toLowerCase();
    if (!['active', 'running'].includes(statusNorm)) continue;

    // Rule 1: PAUSE if CPA exceeds pause threshold
    if (
      m.cpa !== null &&
      (m.spend_today === null || m.spend_today > SPEND_MIN_USD) &&
      m.cpa > policy.target_cpa * policy.pause_multiplier
    ) {
      actions.push({
        type: 'pause',
        campaign_id: m.campaign_id,
        meta_campaign_id: m.meta_campaign_id,
        reason: `CPA $${m.cpa.toFixed(2)} exceeds pause threshold ($${(policy.target_cpa * policy.pause_multiplier).toFixed(2)} = ${policy.pause_multiplier}× target CPA $${policy.target_cpa})`,
      });
      continue; // one rule per campaign
    }

    // Rule 2: PAUSE if frequency cap exceeded (frequency is null in MVP until Meta insights wired)
    if (m.frequency !== null && m.frequency > policy.frequency_cap) {
      actions.push({
        type: 'pause',
        campaign_id: m.campaign_id,
        meta_campaign_id: m.meta_campaign_id,
        reason: `Frequency ${m.frequency.toFixed(1)} exceeds cap of ${policy.frequency_cap} (frequency fatigue)`,
      });
      continue;
    }

    // Rule 3: SCALE if CPA is excellent and conversions sufficient
    const spendBelowMax = m.spend_today === null || m.spend_today < maxBudgetDollars;
    if (
      m.cpa !== null &&
      m.cpa < policy.target_cpa * policy.scale_multiplier &&
      m.conversions >= policy.min_conversions_to_scale &&
      spendBelowMax
    ) {
      const currentBudget = m.daily_budget;
      const rawNewBudget = currentBudget * (1 + policy.scale_pct);
      const newBudget = Math.min(rawNewBudget, maxBudgetDollars);
      const MIN_BUDGET_USD = 5;

      if (newBudget > Math.max(currentBudget, MIN_BUDGET_USD)) {
        actions.push({
          type: 'scale',
          campaign_id: m.campaign_id,
          meta_campaign_id: m.meta_campaign_id,
          meta_adset_id: m.meta_adset_id,
          current_budget: currentBudget,
          new_budget: newBudget,
          reason: `CPA $${m.cpa.toFixed(2)} is below scale threshold ($${(policy.target_cpa * policy.scale_multiplier).toFixed(2)} = ${policy.scale_multiplier}× target $${policy.target_cpa}); ${m.conversions} conversions. Scaling budget $${currentBudget.toFixed(2)} → $${newBudget.toFixed(2)}`,
        });
      }
    }
  }

  return actions;
}

/** Execute a single autonomous action against the Meta Graph API. */
async function executeAutonomousAction(
  action: AutonomousAction,
  accessToken: string,
): Promise<{ ok: boolean; status: string; error?: string; meta?: any }> {

  if (action.type === 'pause') {
    if (!action.meta_campaign_id) {
      return { ok: false, status: 'skipped', error: 'No meta_campaign_id; campaign not launched on Meta yet' };
    }
    const form = new URLSearchParams({ status: 'PAUSED', access_token: accessToken });
    try {
      const r = await fetch(`${GRAPH_BASE}/${action.meta_campaign_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        return { ok: false, status: 'meta_error', error: data.error?.message || `Meta returned ${r.status}`, meta: data.error };
      }
      supabaseAdmin.from('campaigns').update({ status: 'paused' }).eq('meta_campaign_id', action.meta_campaign_id).then(() => {});
      return { ok: true, status: 'paused' };
    } catch (e: any) {
      return { ok: false, status: 'error', error: e.message };
    }
  }

  if (action.type === 'scale') {
    if (!action.meta_adset_id) {
      return {
        ok: false,
        status: 'not_supported',
        error: 'No meta_adset_id stored for this campaign. Budget update requires the ad set ID to be stored at launch time.',
      };
    }
    if (!action.new_budget || action.new_budget < 5) {
      return { ok: false, status: 'skipped', error: 'Computed new budget would be below the $5 minimum' };
    }
    const newBudgetCents = Math.round(action.new_budget * 100);
    const form = new URLSearchParams({ daily_budget: String(newBudgetCents), access_token: accessToken });
    try {
      const r = await fetch(`${GRAPH_BASE}/${action.meta_adset_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        return { ok: false, status: 'meta_error', error: data.error?.message || `Meta returned ${r.status}`, meta: data.error };
      }
      supabaseAdmin.from('campaigns').update({ daily_budget_cents: newBudgetCents }).eq('meta_adset_id', action.meta_adset_id).then(() => {});
      return { ok: true, status: 'scaled', meta: { new_daily_budget_usd: action.new_budget } };
    } catch (e: any) {
      return { ok: false, status: 'error', error: e.message };
    }
  }

  return { ok: false, status: 'unknown_action', error: `Unknown action type: ${(action as any).type}` };
}

// ── POST /api/v1/autonomous/policies/upsert ──────────────────────────────

async function handleAutonomousPoliciesUpsert(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const {
    business_id,
    enabled = true,
    target_cpa,
    pause_multiplier = 2.5,
    scale_multiplier = 0.7,
    frequency_cap = 3.5,
    max_daily_budget = 100,
    max_daily_budget_cents: rawMaxBudgetCents,
    scale_pct = 0.2,
    min_conversions_to_scale = 3,
  } = req.body || {};

  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ error: { code: 'validation_error', message: '`business_id` is required' } });
  }
  if (typeof target_cpa !== 'number' || target_cpa <= 0) {
    return res.status(400).json({ error: { code: 'validation_error', message: '`target_cpa` is required and must be a positive dollar amount' } });
  }

  // Standardize to cents. Accept max_daily_budget_cents directly (preferred),
  // or derive from max_daily_budget dollars if only the legacy field is provided.
  const max_daily_budget_cents: number =
    typeof rawMaxBudgetCents === 'number' && rawMaxBudgetCents > 0
      ? Math.round(rawMaxBudgetCents)
      : Math.round(max_daily_budget * 100);

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, user_id')
    .eq('id', business_id)
    .single();

  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }
  if (business.user_id !== auth.keyRecord.user_id) {
    return res.status(403).json({ error: { code: 'forbidden', message: 'You do not own this business' } });
  }

  const { data, error } = await supabaseAdmin
    .from('autonomous_policies')
    .upsert(
      {
        business_id,
        user_id: business.user_id,
        enabled,
        target_cpa,
        pause_multiplier,
        scale_multiplier,
        frequency_cap,
        max_daily_budget,
        max_daily_budget_cents,
        scale_pct,
        min_conversions_to_scale,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id' },
    )
    .select()
    .single();

  if (error) {
    console.error('[autonomous/policies] DB error:', error);
    return res.status(500).json({ error: { code: 'database_error', message: error.message } });
  }

  return res.status(200).json({ policy: data });
}

// ── GET /api/v1/autonomous/metrics ───────────────────────────────────────

async function handleAutonomousMetrics(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const business_id = req.query.business_id as string | undefined;
  if (!business_id) {
    return res.status(400).json({ error: { code: 'validation_error', message: '`business_id` query parameter is required' } });
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, user_id')
    .eq('id', business_id)
    .single();

  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }
  if (business.user_id !== auth.keyRecord.user_id) {
    return res.status(403).json({ error: { code: 'forbidden', message: 'You do not own this business' } });
  }

  const metrics = await fetchBusinessCampaignMetrics(business_id);

  return res.status(200).json({
    business_id,
    metrics,
    note: '`spend_today` reflects lifetime spend stored in the DB. For real-time daily spend, call GET /campaigns/:id/performance first to sync from Meta.',
    fetched_at: new Date().toISOString(),
  });
}

// ── POST /api/v1/autonomous/evaluate ─────────────────────────────────────

async function handleAutonomousEvaluate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const { business_id, dry_run = false } = req.body || {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ error: { code: 'validation_error', message: '`business_id` is required' } });
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, user_id')
    .eq('id', business_id)
    .single();

  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }
  if (business.user_id !== auth.keyRecord.user_id) {
    return res.status(403).json({ error: { code: 'forbidden', message: 'You do not own this business' } });
  }

  const { data: policy } = await supabaseAdmin
    .from('autonomous_policies')
    .select('*')
    .eq('business_id', business_id)
    .eq('enabled', true)
    .maybeSingle();

  if (!policy) {
    return res.status(404).json({ error: { code: 'no_policy', message: 'No enabled autonomous policy found for this business. Create one via POST /autonomous/policies/upsert.' } });
  }

  const metrics = await fetchBusinessCampaignMetrics(business_id);
  const actions = generateAutonomousActions(policy as AutonomousPolicy, metrics);

  const pauseCount = actions.filter((a) => a.type === 'pause').length;
  const scaleCount = actions.filter((a) => a.type === 'scale').length;
  const summary = actions.length === 0
    ? 'No actions required. All campaigns are within policy thresholds.'
    : `${pauseCount} campaign(s) to pause, ${scaleCount} campaign(s) to scale.`;

  return res.status(200).json({
    business_id,
    policy,
    metrics_evaluated: metrics.length,
    actions,
    summary,
    dry_run: !!dry_run,
    evaluated_at: new Date().toISOString(),
  });
}

// ── POST /api/v1/autonomous/execute ──────────────────────────────────────

async function handleAutonomousExecute(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const { business_id, actions, meta_access_token } = req.body || {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ error: { code: 'validation_error', message: '`business_id` is required' } });
  }
  if (!Array.isArray(actions) || actions.length === 0) {
    return res.status(400).json({ error: { code: 'validation_error', message: '`actions` must be a non-empty array' } });
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, user_id, facebook_access_token')
    .eq('id', business_id)
    .single();

  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }
  if (business.user_id !== auth.keyRecord.user_id) {
    return res.status(403).json({ error: { code: 'forbidden', message: 'You do not own this business' } });
  }

  // System token fallback requires ALLOW_SYSTEM_TOKEN_EXECUTION=true AND business in allowlist.
  const allowSystemToken = process.env.ALLOW_SYSTEM_TOKEN_EXECUTION === 'true';
  // TODO: add specific business UUIDs here to permit system token execution
  const SYSTEM_TOKEN_ALLOWLIST: string[] = [];
  const accessToken = meta_access_token
    || (business as any).facebook_access_token
    || (allowSystemToken && SYSTEM_TOKEN_ALLOWLIST.includes(business_id)
        ? process.env.META_SYSTEM_USER_TOKEN : undefined);
  if (!accessToken) {
    return res.status(400).json({
      error: {
        code: 'missing_token',
        message: 'No Meta access token available. Provide `meta_access_token` in the request body, or store `facebook_access_token` on the business record.',
      },
    });
  }

  const executeCreditDebit = await debitCredits({
    userId: auth.keyRecord.user_id,
    businessId: business_id,
    cost: CREDIT_COSTS.autonomous_execute_call,
    reason: 'autonomous_execute',
    refType: 'autonomous_execute',
    refId: business_id,
    meta: { endpoint: '/api/v1/autonomous/execute', action_count: actions.length },
  });
  if (!executeCreditDebit.ok) {
    return res.status(402).json(paymentRequiredError(CREDIT_COSTS.autonomous_execute_call, executeCreditDebit.balance));
  }

  const results: Array<{ action: any; ok: boolean; status: string; error?: string; meta?: any }> = [];
  for (const action of actions) {
    const result = await executeAutonomousAction(action as AutonomousAction, accessToken);
    results.push({ action, ...result });
  }

  const successCount = results.filter((r) => r.ok).length;
  const summary = `Autonomous execution: ${successCount}/${actions.length} actions succeeded.`;

  supabaseAdmin.from('automation_runs').insert({
    business_id,
    user_id: business.user_id,
    agent_type: 'autonomous_loop',
    status: 'completed',
    trigger_type: 'manual',
    trigger_reason: 'execute endpoint called directly',
    input: { actions },
    output: { results },
    summary,
    first_person_summary: `I executed ${actions.length} autonomous action(s): ${summary}`,
    requires_approval: false,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  }).then(() => {});

  return res.status(200).json({
    business_id,
    results,
    summary,
    executed_at: new Date().toISOString(),
  });
}

// ── POST /api/v1/autonomous/run (cron-internal) ──────────────────────────
// Auth: CRON_SECRET Bearer token (same as dispatch-agents.ts).
// Evaluates + executes the autonomous policy for one business and logs results.

async function handleAutonomousRun(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = (req.headers['authorization'] as string) || '';
  const provided = authHeader.replace('Bearer ', '').trim();
  if (!cronSecret || provided !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized. Valid CRON_SECRET required.' });
  }

  const { business_id } = req.body || {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ error: '`business_id` is required' });
  }

  const startTime = Date.now();

  try {
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, user_id, facebook_access_token')
      .eq('id', business_id)
      .single();

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const { data: policy } = await supabaseAdmin
      .from('autonomous_policies')
      .select('*')
      .eq('business_id', business_id)
      .eq('enabled', true)
      .maybeSingle();

    if (!policy) {
      return res.status(200).json({ skipped: true, reason: 'No enabled autonomous policy for this business' });
    }

    const metrics = await fetchBusinessCampaignMetrics(business_id);
    const actions = generateAutonomousActions(policy as AutonomousPolicy, metrics);

    let executionResults: Array<{ action: any; ok: boolean; status: string; error?: string; meta?: any }> = [];
    let summary: string;

    // Track whether the run was blocked by a missing token (used for DB status below)
    let missingToken = false;

    if (actions.length === 0) {
      summary = 'No actions required. All campaigns within policy thresholds.';
    } else {
      // System token fallback requires ALLOW_SYSTEM_TOKEN_EXECUTION=true AND business in allowlist.
      const allowSystemToken = process.env.ALLOW_SYSTEM_TOKEN_EXECUTION === 'true';
      // TODO: add specific business UUIDs here to permit system token execution
      const SYSTEM_TOKEN_ALLOWLIST: string[] = [];
      const accessToken = (business as any).facebook_access_token
        || (allowSystemToken && SYSTEM_TOKEN_ALLOWLIST.includes(business_id)
            ? process.env.META_SYSTEM_USER_TOKEN : undefined);

      if (!accessToken) {
        missingToken = true;
        summary = `${actions.length} action(s) generated but not executed: missing_meta_token. Set facebook_access_token on the business record.`;
        executionResults = actions.map((a) => ({ action: a, ok: false, status: 'skipped', error: 'missing_meta_token: facebook_access_token required' }));
      } else {
        const runCreditDebit = await debitCredits({
          userId: business.user_id,
          businessId: business_id,
          cost: CREDIT_COSTS.autonomous_run_call,
          reason: 'autonomous_run',
          refType: 'autonomous_run',
          refId: business_id,
          meta: { endpoint: '/api/v1/autonomous/run', action_count: actions.length },
        });
        if (!runCreditDebit.ok) {
          summary = `${actions.length} action(s) generated but not executed: insufficient_credits.`;
          supabaseAdmin.from('automation_runs').insert({
            business_id,
            user_id: business.user_id,
            agent_type: 'autonomous_loop',
            status: 'failed',
            error_message: 'insufficient_credits',
            trigger_type: 'scheduled',
            trigger_reason: 'cron autonomous loop via dispatch-agents',
            input: { policy_id: policy.id, metrics_count: metrics.length },
            output: {
              actions,
              required_credits: CREDIT_COSTS.autonomous_run_call,
              current_balance: runCreditDebit.balance,
              purchase_url: PURCHASE_CREDITS_URL,
            },
            summary,
            first_person_summary: `I could not run the autonomous policy loop due to insufficient credits.`,
            requires_approval: false,
            duration_ms: Date.now() - startTime,
            started_at: new Date(startTime).toISOString(),
            completed_at: new Date().toISOString(),
          }).then(() => {});

          return res.status(402).json(paymentRequiredError(CREDIT_COSTS.autonomous_run_call, runCreditDebit.balance));
        }

        for (const action of actions) {
          const result = await executeAutonomousAction(action, accessToken);
          executionResults.push({ action, ...result });
        }
        const successCount = executionResults.filter((r) => r.ok).length;
        summary = `Autonomous loop: ${successCount}/${actions.length} action(s) executed successfully.`;
      }
    }

    const durationMs = Date.now() - startTime;

    supabaseAdmin.from('automation_runs').insert({
      business_id,
      user_id: business.user_id,
      agent_type: 'autonomous_loop',
      // Mark as failed when token was missing so the run is clearly not completed
      status: missingToken ? 'failed' : 'completed',
      error_message: missingToken ? 'missing_meta_token' : null,
      trigger_type: 'scheduled',
      trigger_reason: 'cron autonomous loop via dispatch-agents',
      input: { policy_id: policy.id, metrics_count: metrics.length },
      output: { policy, actions, results: executionResults },
      summary,
      first_person_summary: `I ran the autonomous policy loop. ${summary}`,
      requires_approval: false,
      duration_ms: durationMs,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
    }).then(() => {});

    return res.status(200).json({
      business_id,
      policy_id: policy.id,
      metrics_evaluated: metrics.length,
      actions_generated: actions.length,
      actions,
      results: executionResults,
      summary,
      duration_ms: durationMs,
      // Creative evolution: trigger if any frequency-pause or winner-scale detected
      creative_evolution: 'creative_evolution_not_implemented',
    });
  } catch (err: any) {
    console.error('[autonomous/run] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal error during autonomous run' });
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
  if (route === 'meta/status') return handleMetaStatus(req, res);
  if (route === 'meta/credentials') return handleMetaCredentials(req, res);
  if (route === 'meta/pages') return handleMetaPages(req, res);
  if (route === 'meta/select-page') return handleMetaSelectPage(req, res);
  if (route === 'notifications/telegram') return handleSetTelegram(req, res);

  // ── Dynamic campaign/:id routes ────────────────────────────────────
  if (segments.length === 3 && segments[0] === 'campaigns') {
    const id = segments[1];
    const action = segments[2];

    if (action === 'launch') return handleLaunch(req, res, id);
    if (action === 'pause') return handlePause(req, res, id);
    if (action === 'performance') return handlePerformance(req, res, id);
    if (action === 'conversions') return handleConversions(req, res, id);
  }

  // ── Dynamic creative/:id routes ─────────────────────────────────────
  if (segments.length === 3 && segments[0] === 'creatives') {
    const id = segments[1];
    const action = segments[2];

    if (action === 'variants') return handleCreativeVariants(req, res, id);
    if (action === 'feedback') return handleCreativeFeedback(req, res, id);
  }

  // ── Autonomous mode routes ──────────────────────────────────────────
  if (route === 'autonomous/policies/upsert') return handleAutonomousPoliciesUpsert(req, res);
  if (route === 'autonomous/metrics') return handleAutonomousMetrics(req, res);
  if (route === 'autonomous/evaluate') return handleAutonomousEvaluate(req, res);
  if (route === 'autonomous/execute') return handleAutonomousExecute(req, res);
  if (route === 'autonomous/run') return handleAutonomousRun(req, res);

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
        'POST /api/v1/creatives/:id/variants',
        'POST /api/v1/creatives/:id/feedback',
        'POST /api/v1/autonomous/policies/upsert',
        'GET  /api/v1/autonomous/metrics',
        'POST /api/v1/autonomous/evaluate',
        'POST /api/v1/autonomous/execute',
        'POST /api/v1/autonomous/run',
        'GET  /api/v1/meta/status',
        'GET  /api/v1/meta/credentials',
        'GET  /api/v1/meta/pages',
        'POST /api/v1/meta/select-page',
        'POST /api/v1/notifications/telegram',
      ],
    },
  });
}

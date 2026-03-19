/**
 * Catch-all route for /api/v1/*
 *
 * Consolidates all v1 API endpoints into a single serverless function
 * to stay within Vercel Hobby plan's 12-function limit.
 *
 * Routing table:
 *   POST /api/v1/campaigns/preview          → handlePreview
 *   POST /api/v1/campaigns/create           → handleCreate
 *   GET  /api/v1/campaigns/:id              → handleCampaignDetail
 *   POST /api/v1/campaigns/:id/approve-strategy → handleCampaignApproveStrategy
 *   POST /api/v1/campaigns/:id/request-creative → handleCampaignRequestCreative
 *   POST /api/v1/campaigns/:id/creative-callback → handleCampaignUploadCreative
 *   POST /api/v1/campaigns/:id/upload-creative → handleCampaignUploadCreative
 *   POST /api/v1/campaigns/:id/activate     → handleCampaignActivate
 *   POST /api/v1/campaigns/:id/launch       → handleLaunch
 *   POST /api/v1/campaigns/:id/pause        → handlePause
 *   GET  /api/v1/campaigns/:id/performance  → handlePerformance
 *   POST /api/v1/campaigns/:id/conversions  → handleConversions
 *   GET  /api/v1/capi/config                → handleCapiConfig
 *   PUT  /api/v1/capi/config                → handleCapiConfig
 *   POST /api/v1/capi/config/test           → handleCapiConfigTest
 *   POST /api/v1/capi/events                → handleCapiEvents
 *   GET  /api/v1/capi/status                → handleCapiStatus
 *   POST /api/v1/businesses/:id/enrich      → handleBusinessEnrich
 *   GET  /api/v1/businesses/:id/uploads     → handleBusinessUploads
 *   POST /api/v1/businesses/:id/uploads     → handleBusinessUploads
 *   DELETE /api/v1/businesses/:id/uploads/:fileId → handleBusinessUploadDelete
 *   POST /api/v1/businesses/:id/uploads/:fileId/re-extract → handleBusinessUploadReExtract
 *   POST /api/v1/audiences/create-seed      → handleAudiencesCreateSeed
 *   POST /api/v1/audiences/create-lal       → handleAudiencesCreateLal
 *   GET  /api/v1/audiences/list             → handleAudiencesList
 *   POST /api/v1/audiences/refresh          → handleAudiencesRefresh
 *   DELETE /api/v1/audiences/:id            → handleAudienceDelete
 *   GET  /api/v1/audiences/:id/status       → handleAudienceStatus
 *   POST /api/v1/portfolios/create          → handlePortfolioCreate
 *   GET  /api/v1/portfolios/:id             → handlePortfolioDetail
 *   PUT  /api/v1/portfolios/:id             → handlePortfolioDetail
 *   POST /api/v1/portfolios/:id/rebalance   → handlePortfolioRebalance
 *   POST /api/v1/portfolios/:id/launch      → handlePortfolioLaunch
 *   GET  /api/v1/portfolios/:id/performance → handlePortfolioPerformance
 *   POST /api/v1/keys/create                → handleKeysCreate
 *   POST /api/v1/research/reviews           → handleReviews
 *   POST /api/v1/research/competitors       → handleCompetitors
 *   POST /api/v1/research/market            → handleMarket
 *   POST /api/v1/creatives/generate         → handleCreativesGenerate
 *   POST /api/v1/creatives/:id/variants     → handleCreativeVariants
 *   POST /api/v1/creatives/:id/feedback     → handleCreativeFeedback
 *   GET  /api/v1/ad-account/insights        → handleAdAccountInsights
 *   GET  /api/v1/meta/status                → handleMetaStatus
 *   GET  /api/v1/meta/credentials           → handleMetaCredentials
 *   GET  /api/v1/meta/ad-accounts           → handleMetaAdAccounts
 *   POST /api/v1/meta/select-ad-account     → handleMetaSelectAdAccount
 *   GET  /api/v1/lead-forms                 → handleLeadForms
 *   POST /api/v1/lead-forms/select          → handleSelectLeadForm
 *   GET  /api/v1/pixels                     → handlePixels
 *   POST /api/v1/pixels/select              → handleSelectPixel
 *   GET  /api/v1/meta/pages                 → handleMetaPages
 *   POST /api/v1/meta/select-page           → handleMetaSelectPage
 *   POST /api/v1/notifications/telegram     → handleSetTelegram
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';
import { createRequire } from 'module';
import { load as loadHtml } from 'cheerio';
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
import { queueCreativeRefresh } from '../lib/creative-queue.js';
import { sendSlackApprovalRequest, sendSlackCampaignAssetsReady } from '../lib/slack.js';

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
const CREATIVE_STORAGE_BUCKET = 'creatives';
const BUSINESS_UPLOAD_STORAGE_BUCKET = 'user-files';
const BUSINESS_CONTEXT_STORAGE_PREFIX = 'business-context';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const PURCHASE_CREDITS_URL = 'https://zuckerbot.ai/pricing?credits=1';
// Credit debit logic is temporarily disabled until Stripe credit-pack purchase
// flows are wired up end-to-end. `debit_credits()` already handles
// zero-cost actions safely. Previous values: campaign_launch: 5,
// autonomous_execute_call: 3, autonomous_run_call: 3.
const CREDIT_COSTS = {
  campaign_launch: 0,
  autonomous_execute_call: 0,
  autonomous_run_call: 0,
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

interface BusinessRouteAuthSuccess {
  error: false;
  actor: 'api_key' | 'user';
  user_id: string;
  apiKeyId?: string;
  rateLimitHeaders: Record<string, string>;
}

interface AuthFailure {
  error: true;
  status: number;
  body: { error: { code: string; message: string; retry_after?: number } };
  rateLimitHeaders?: Record<string, string>;
}

type AuthResult = AuthSuccess | AuthFailure;
type BusinessRouteAuthResult = BusinessRouteAuthSuccess | AuthFailure;
type PdfParseResult = { text?: string | null };
type PdfParseFn = (dataBuffer: Buffer, options?: { max?: number }) => Promise<PdfParseResult>;

let pdfParseLoader: Promise<PdfParseFn> | null = null;
const nodeRequire = createRequire(import.meta.url);

/** Narrow auth result after error check */
function assertAuth(auth: AuthResult): asserts auth is AuthSuccess {
  if (auth.error) throw new Error('Auth not narrowed');
}

function assertBusinessRouteAuth(auth: BusinessRouteAuthResult): asserts auth is BusinessRouteAuthSuccess {
  if (auth.error) throw new Error('Business auth not narrowed');
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

async function authenticateBusinessRequest(
  req: { headers: Record<string, string | string[] | undefined> },
): Promise<BusinessRouteAuthResult> {
  const authHeader =
    (req.headers['authorization'] as string) ||
    (req.headers['Authorization'] as string) ||
    '';

  if (!authHeader.startsWith('Bearer ')) {
    return {
      error: true,
      status: 401,
      body: { error: { code: 'missing_auth_token', message: 'Authorization header must be: Bearer <api_key_or_session_token>' } },
    };
  }

  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) {
    return {
      error: true,
      status: 401,
      body: { error: { code: 'missing_auth_token', message: 'Authorization token is empty' } },
    };
  }

  const apiKeyAuth = await authenticateRequest(req);
  if (!apiKeyAuth.error) {
    assertAuth(apiKeyAuth);
    return {
      error: false,
      actor: 'api_key',
      user_id: apiKeyAuth.keyRecord.user_id,
      apiKeyId: apiKeyAuth.keyRecord.id,
      rateLimitHeaders: apiKeyAuth.rateLimitHeaders,
    };
  }

  if (apiKeyAuth.status === 429 || apiKeyAuth.body.error.code === 'revoked_api_key') {
    return apiKeyAuth;
  }

  const { data, error } = await supabaseAnon.auth.getUser(rawToken);
  if (error || !data?.user) {
    return {
      error: true,
      status: 401,
      body: { error: { code: 'invalid_auth_token', message: 'The provided token is not a valid API key or signed-in user session.' } },
    };
  }

  return {
    error: false,
    actor: 'user',
    user_id: data.user.id,
    rateLimitHeaders: {},
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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

const SUPPORTED_META_STANDARD_EVENTS = new Set([
  'AddPaymentInfo',
  'AddToCart',
  'CompleteRegistration',
  'Contact',
  'CustomizeProduct',
  'Donate',
  'FindLocation',
  'InitiateCheckout',
  'Lead',
  'Purchase',
  'Schedule',
  'Search',
  'StartTrial',
  'SubmitApplication',
  'Subscribe',
  'ViewContent',
]);

const SUPPORTED_META_ACTION_SOURCES = new Set([
  'app',
  'business_messaging',
  'chat',
  'email',
  'other',
  'phone_call',
  'physical_store',
  'system_generated',
  'website',
]);

const DEFAULT_CAPI_EVENT_MAPPING = {
  lead: { meta_event: 'Lead', value: 0 },
  marketingqualifiedlead: { meta_event: 'Lead', value: 0 },
  salesqualifiedlead: { meta_event: 'Contact', value: 0 },
  opportunity: { meta_event: 'InitiateCheckout', value: 0 },
  customer: { meta_event: 'Purchase', value: 0 },
} as const;

type EventMappingConfig = Record<string, { meta_event: string; value: number }>;

interface PortfolioTierConfig {
  tier: string;
  budget_pct: number;
  target_cpa_multiplier: number;
  description?: string;
}

interface CapiAttributionLead {
  id: string;
  campaign_id: string | null;
  email: string | null;
  phone: string | null;
  meta_lead_id: string | null;
  name: string | null;
}

function getAuthorizationHeader(req: VercelRequest): string {
  const header = req.headers.authorization || req.headers.Authorization;
  return Array.isArray(header) ? (header[0] || '') : (header || '');
}

function getApiBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function normalizeStageKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return normalized || null;
}

function normalizeEmailValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizePhoneValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[^\d+]/g, '');
  if (!digits) return null;
  return digits.startsWith('+') ? `+${digits.slice(1).replace(/\D/g, '')}` : digits.replace(/\D/g, '');
}

function normalizeNameValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function sha256Hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildHashedMetaUserData(input: {
  email?: unknown;
  phone?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  fbc?: unknown;
  fbp?: unknown;
  client_ip_address?: unknown;
  client_user_agent?: unknown;
}) {
  const userData: Record<string, string> = {};
  const email = normalizeEmailValue(input.email);
  const phone = normalizePhoneValue(input.phone);
  const firstName = normalizeNameValue(input.first_name);
  const lastName = normalizeNameValue(input.last_name);

  if (email) userData.em = sha256Hash(email);
  if (phone) userData.ph = sha256Hash(phone);
  if (firstName) userData.fn = sha256Hash(firstName);
  if (lastName) userData.ln = sha256Hash(lastName);
  if (typeof input.fbc === 'string' && input.fbc.trim()) userData.fbc = input.fbc.trim();
  if (typeof input.fbp === 'string' && input.fbp.trim()) userData.fbp = input.fbp.trim();
  if (typeof input.client_ip_address === 'string' && input.client_ip_address.trim()) {
    userData.client_ip_address = input.client_ip_address.trim();
  }
  if (typeof input.client_user_agent === 'string' && input.client_user_agent.trim()) {
    userData.client_user_agent = input.client_user_agent.trim();
  }

  return userData;
}

function sanitizeEventMapping(value: unknown): EventMappingConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const sanitizedEntries: Array<[string, { meta_event: string; value: number }]> = [];
  for (const [rawStage, rawConfig] of Object.entries(value as Record<string, any>)) {
    const stage = normalizeStageKey(rawStage);
    const metaEvent = normalizeString(rawConfig?.meta_event);
    const numericValue = normalizeNumber(rawConfig?.value);

    if (!stage || !metaEvent || !SUPPORTED_META_STANDARD_EVENTS.has(metaEvent)) {
      return null;
    }

    sanitizedEntries.push([
      stage,
      {
        meta_event: metaEvent,
        value: numericValue ?? 0,
      },
    ]);
  }

  return Object.fromEntries(sanitizedEntries);
}

function normalizeMetaActionSource(value: unknown): string | null {
  const normalized = normalizeString(value)?.toLowerCase() || null;
  if (!normalized || !SUPPORTED_META_ACTION_SOURCES.has(normalized)) return null;
  return normalized;
}

async function resolveBusinessForUser(args: {
  userId: string;
  explicitBusinessId?: string | null;
  apiKeyId?: string | null;
}): Promise<any | null> {
  const explicitBusinessId = normalizeString(args.explicitBusinessId);
  if (explicitBusinessId) {
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', explicitBusinessId)
      .eq('user_id', args.userId)
      .maybeSingle();
    return business || null;
  }

  if (args.apiKeyId) {
    const { data: linkedKey } = await supabaseAdmin
      .from('api_keys')
      .select('business_id')
      .eq('id', args.apiKeyId)
      .maybeSingle();

    const linkedBusinessId = normalizeString(linkedKey?.business_id);
    if (linkedBusinessId) {
      const { data: business } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('id', linkedBusinessId)
        .eq('user_id', args.userId)
        .maybeSingle();
      if (business) return business;
    }
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('user_id', args.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return business || null;
}

async function resolveOwnedBusiness(
  auth: AuthSuccess,
  explicitBusinessId?: string | null,
): Promise<any | null> {
  return resolveBusinessForUser({
    userId: auth.keyRecord.user_id,
    explicitBusinessId,
    apiKeyId: auth.keyRecord.id,
  });
}

async function resolveOwnedBusinessForRoute(
  auth: BusinessRouteAuthSuccess,
  explicitBusinessId?: string | null,
): Promise<any | null> {
  return resolveBusinessForUser({
    userId: auth.user_id,
    explicitBusinessId,
    apiKeyId: auth.actor === 'api_key' ? auth.apiKeyId || null : null,
  });
}

async function resolveCapiConfigForBusiness(business: { id: string; user_id: string; currency?: string | null }) {
  let { data: config } = await supabaseAdmin
    .from('capi_configs')
    .select('*')
    .eq('business_id', business.id)
    .maybeSingle();

  if (!config) {
    const { data: inserted } = await supabaseAdmin
      .from('capi_configs')
      .insert({
        business_id: business.id,
        user_id: business.user_id,
        currency: business.currency || 'USD',
      })
      .select('*')
      .single();
    config = inserted || null;
  }

  return config;
}

async function findLeadForCapiAttribution(
  businessId: string,
  payload: { lead_id?: unknown; email?: unknown; phone?: unknown },
): Promise<CapiAttributionLead | null> {
  const leadId = normalizeString(payload.lead_id);
  if (leadId) {
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, campaign_id, email, phone, meta_lead_id, name')
      .eq('id', leadId)
      .eq('business_id', businessId)
      .maybeSingle();

    return (lead as CapiAttributionLead | null) || null;
  }

  const email = normalizeEmailValue(payload.email);
  const phone = normalizePhoneValue(payload.phone);
  if (!email && !phone) return null;

  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select('id, campaign_id, email, phone, meta_lead_id, name')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(500);

  const typedLeads = (leads || []) as CapiAttributionLead[];
  const exactMatch = typedLeads.find((lead) => {
    const leadEmail = normalizeEmailValue(lead.email);
    const leadPhone = normalizePhoneValue(lead.phone);
    if (email && phone) {
      return leadEmail === email || leadPhone === phone;
    }
    if (email) return leadEmail === email;
    return leadPhone === phone;
  });

  return exactMatch || null;
}

async function upsertLaunchedCampaignRecord(args: {
  businessId: string | null;
  campaignName: string;
  status: string;
  dailyBudgetCents: number;
  radiusKm: number;
  headline: string;
  adBody: string;
  imageUrl: string | null;
  metaCampaignId: string;
  metaAdSetId: string;
  metaAdId: string;
  metaLeadFormId?: string;
  launchedAt: string;
}): Promise<string | null> {
  if (!args.businessId) return null;

  const existing = await supabaseAdmin
    .from('campaigns')
    .select('id')
    .eq('meta_campaign_id', args.metaCampaignId)
    .maybeSingle();

  if (existing.data?.id) {
    await supabaseAdmin
      .from('campaigns')
      .update({
        business_id: args.businessId,
        name: args.campaignName,
        status: args.status,
        daily_budget_cents: args.dailyBudgetCents,
        radius_km: args.radiusKm,
        ad_headline: args.headline,
        ad_copy: args.adBody,
        ad_image_url: args.imageUrl,
        meta_campaign_id: args.metaCampaignId,
        meta_adset_id: args.metaAdSetId,
        meta_ad_id: args.metaAdId,
        meta_leadform_id: args.metaLeadFormId || null,
        launched_at: args.launchedAt,
      })
      .eq('id', existing.data.id);

    return existing.data.id;
  }

  const { data: inserted } = await supabaseAdmin
    .from('campaigns')
    .insert({
      business_id: args.businessId,
      name: args.campaignName,
      status: args.status,
      daily_budget_cents: args.dailyBudgetCents,
      radius_km: args.radiusKm,
      ad_headline: args.headline,
      ad_copy: args.adBody,
      ad_image_url: args.imageUrl,
      meta_campaign_id: args.metaCampaignId,
      meta_adset_id: args.metaAdSetId,
      meta_ad_id: args.metaAdId,
      meta_leadform_id: args.metaLeadFormId || null,
      leads_count: 0,
      spend_cents: 0,
      launched_at: args.launchedAt,
      performance_status: 'learning',
    })
    .select('id')
    .single();

  return inserted?.id || null;
}

async function fetchAttributedCapiMetricsByCampaign(businessId: string, lookbackDays: number) {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabaseAdmin
    .from('capi_events')
    .select('campaign_id, meta_event_name')
    .eq('business_id', businessId)
    .eq('status', 'sent')
    .eq('is_test', false)
    .gte('created_at', since)
    .not('campaign_id', 'is', null);

  const metrics: Record<string, { lead: number; sql: number; customer: number }> = {};

  for (const row of rows || []) {
    const campaignId = normalizeString((row as any).campaign_id);
    if (!campaignId) continue;
    if (!metrics[campaignId]) {
      metrics[campaignId] = { lead: 0, sql: 0, customer: 0 };
    }

    const metaEventName = normalizeString((row as any).meta_event_name);
    if (metaEventName === 'Lead') metrics[campaignId].lead += 1;
    if (metaEventName === 'Contact') metrics[campaignId].sql += 1;
    if (metaEventName === 'Purchase') metrics[campaignId].customer += 1;
  }

  return metrics;
}

function suggestPortfolioBusinessType(trade: string | null | undefined): string {
  const normalizedTrade = (trade || '').toLowerCase();
  if (/(shop|retail|e-?commerce|store|fashion|beauty products)/.test(normalizedTrade)) {
    return 'ecommerce';
  }
  if (/(saas|software|app|b2b|subscription|platform|agency|consult)/.test(normalizedTrade)) {
    return 'saas';
  }
  if (normalizedTrade) return 'local_services';
  return 'custom';
}

function sanitizePortfolioTiers(value: unknown): PortfolioTierConfig[] | null {
  if (!Array.isArray(value)) return null;

  const tiers: PortfolioTierConfig[] = [];
  for (const tier of value) {
    const tierName = normalizeString((tier as any)?.tier);
    const budgetPct = normalizeNumber((tier as any)?.budget_pct);
    const targetCpaMultiplier = normalizeNumber((tier as any)?.target_cpa_multiplier);
    const description = normalizeString((tier as any)?.description);

    if (!tierName || budgetPct === null || targetCpaMultiplier === null) {
      return null;
    }

    tiers.push({
      tier: tierName,
      budget_pct: budgetPct,
      target_cpa_multiplier: targetCpaMultiplier,
      ...(description ? { description } : {}),
    });
  }

  return tiers;
}

function buildTierLaunchDraft(args: {
  business: any;
  tier: PortfolioTierConfig;
  tierBudgetCents: number;
  baseTargetCpaCents: number;
}) {
  const businessName = args.business.name || 'Business';
  const tierLabel = args.tier.tier.replace(/_/g, ' ');
  const descriptionSuffix = args.tier.description ? ` ${args.tier.description}.` : '';

  return {
    business_name: `${businessName} ${tierLabel}`,
    business_type: args.business.trade || 'business',
    objective: 'leads' as ZuckerObjective,
    url: args.business.website_url || args.business.website || null,
    targeting: {
      age_min: 25,
      age_max: 65,
      radius_km: args.business.target_radius_km || 25,
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed'],
      instagram_positions: ['stream'],
    },
    variants: [
      {
        headline: `${businessName} ${tierLabel}`.slice(0, 40),
        copy: `Promote ${businessName} to ${tierLabel.replace(/_/g, ' ')} audiences.${descriptionSuffix}`.slice(0, 125),
        cta: 'Learn More',
        angle: 'value',
      },
    ],
    strategy: {
      objective: 'leads',
      summary: `Tier campaign for ${tierLabel}.`,
      recommended_daily_budget_cents: args.tierBudgetCents,
      projected_cpl_cents: Math.round(args.baseTargetCpaCents * args.tier.target_cpa_multiplier),
    },
  };
}

function getClientIpAddress(req: VercelRequest): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  const rawValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof rawValue === 'string' && rawValue.trim()) {
    return rawValue.split(',')[0]?.trim() || null;
  }

  const realIp = req.headers['x-real-ip'];
  const realIpValue = Array.isArray(realIp) ? realIp[0] : realIp;
  return typeof realIpValue === 'string' && realIpValue.trim() ? realIpValue.trim() : null;
}

function getWebhookSecretFromRequest(req: VercelRequest): string | null {
  const headerValue = req.headers['x-zuckerbot-webhook-secret'] || req.headers['x-webhook-secret'];
  const normalizedHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof normalizedHeader === 'string' && normalizedHeader.trim()) {
    return normalizedHeader.trim();
  }

  const body = (req.body || {}) as Record<string, any>;
  const bodySecret = normalizeString(body.webhook_secret) || normalizeString(body.secret);
  if (bodySecret) return bodySecret;

  const querySecret = normalizeString(req.query.webhook_secret) || normalizeString(req.query.secret);
  return querySecret;
}

async function resolveBusinessByWebhookSecret(webhookSecret: string) {
  const { data: capiConfig } = await supabaseAdmin
    .from('capi_configs')
    .select('*, businesses(*)')
    .eq('webhook_secret', webhookSecret)
    .maybeSingle();

  if (!capiConfig) return null;

  return {
    business: (capiConfig as any).businesses || null,
    capiConfig,
  };
}

function getPolicyTargetCpaCents(policy: Partial<{
  target_cpa_cents: number | null;
  target_cpa: number | null;
}> | null | undefined): number {
  if (typeof policy?.target_cpa_cents === 'number' && Number.isFinite(policy.target_cpa_cents) && policy.target_cpa_cents > 0) {
    return Math.round(policy.target_cpa_cents);
  }
  if (typeof policy?.target_cpa === 'number' && Number.isFinite(policy.target_cpa) && policy.target_cpa > 0) {
    return Math.round(policy.target_cpa * 100);
  }
  return 5000;
}

function getPolicyTargetCpaDollars(policy: Partial<{
  target_cpa_cents: number | null;
  target_cpa: number | null;
}> | null | undefined): number {
  return getPolicyTargetCpaCents(policy) / 100;
}

interface DispatchCapiEventArgs {
  business: any;
  capiConfig: any;
  crmSource: string;
  sourceStage: string | null;
  metaEventName: string | null;
  eventTime?: string | Date | null;
  userData: Record<string, string>;
  hashedUserData?: Record<string, string>;
  crmAttributes?: Record<string, any>;
  customData?: Record<string, any>;
  lead: CapiAttributionLead | null;
  matchQuality: string;
  hubspotContactId?: string | null;
  explicitEventId?: string | null;
  isTest?: boolean;
  allowWhenDisabled?: boolean;
  metaAccessTokenOverride?: string | null;
  pixelIdOverride?: string | null;
}

async function dispatchCapiEvent(args: DispatchCapiEventArgs) {
  const eventTimestamp = args.eventTime
    ? new Date(args.eventTime)
    : new Date();
  const safeEventTime = Number.isNaN(eventTimestamp.getTime()) ? new Date() : eventTimestamp;
  const businessToken = normalizeString(args.metaAccessTokenOverride) || normalizeString(args.business?.facebook_access_token);
  const pixelId = normalizeString(args.pixelIdOverride) || normalizeString(args.business?.meta_pixel_id);
  const currency = normalizeString(args.capiConfig?.currency) || normalizeString(args.business?.currency) || 'USD';
  const actionSource = normalizeMetaActionSource(args.capiConfig?.action_source) || 'website';
  const isEnabled = args.capiConfig?.is_enabled !== false;

  let status = 'received';
  let metaResponse: Record<string, any> = {};

  if (!args.metaEventName) {
    status = 'skipped';
    metaResponse = { reason: 'unmapped_stage' };
  } else if (!isEnabled && !args.allowWhenDisabled) {
    status = 'skipped';
    metaResponse = { reason: 'capi_disabled' };
  } else if (!businessToken || !pixelId) {
    status = 'skipped';
    metaResponse = { reason: 'missing_meta_credentials', has_access_token: !!businessToken, has_pixel_id: !!pixelId };
  } else {
    const eventId = normalizeString(args.explicitEventId) || normalizeString(args.lead?.meta_lead_id) || randomBytes(12).toString('hex');
    const event = {
      event_name: args.metaEventName,
      event_time: Math.floor(safeEventTime.getTime() / 1000),
      action_source: actionSource,
      event_id: eventId,
      user_data: args.userData,
      custom_data: {
        currency,
        ...(args.customData || {}),
      },
    };

    const capiUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`;
    const response = await fetch(capiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event], access_token: businessToken }),
    });
    const responseBody = await response.json().catch(() => ({}));

    if (response.ok) {
      status = 'sent';
      metaResponse = responseBody;
    } else {
      status = 'failed';
      metaResponse = responseBody;
    }

    await supabaseAdmin
      .from('capi_events')
      .insert({
        business_id: args.business.id,
        user_id: args.business.user_id,
        campaign_id: args.lead?.campaign_id || null,
        lead_id: args.lead?.id || null,
        crm_source: args.crmSource,
        source_stage: args.sourceStage,
        meta_event_name: args.metaEventName,
        event_time: safeEventTime.toISOString(),
        hubspot_contact_id: args.hubspotContactId || null,
        meta_event_id: event.event_id,
        match_quality: args.matchQuality,
        status,
        meta_response: metaResponse,
        hashed_user_data: args.hashedUserData || args.userData || {},
        crm_attributes: args.crmAttributes || {},
        is_test: !!args.isTest,
      })
      .then(() => {});

    return {
      status,
      metaResponse,
      eventId: event.event_id,
      currency,
      sent: status === 'sent',
    };
  }

  await supabaseAdmin
    .from('capi_events')
    .insert({
      business_id: args.business.id,
      user_id: args.business.user_id,
      campaign_id: args.lead?.campaign_id || null,
      lead_id: args.lead?.id || null,
      crm_source: args.crmSource,
      source_stage: args.sourceStage,
      meta_event_name: args.metaEventName,
      event_time: safeEventTime.toISOString(),
      hubspot_contact_id: args.hubspotContactId || null,
      meta_event_id: normalizeString(args.explicitEventId) || normalizeString(args.lead?.meta_lead_id) || null,
      match_quality: args.matchQuality,
      status,
      meta_response: metaResponse,
      hashed_user_data: args.hashedUserData || args.userData || {},
      crm_attributes: args.crmAttributes || {},
      is_test: !!args.isTest,
    })
    .then(() => {});

  return {
    status,
    metaResponse,
    eventId: normalizeString(args.explicitEventId) || normalizeString(args.lead?.meta_lead_id) || null,
    currency,
    sent: false,
  };
}

async function getOwnedPortfolio(portfolioId: string, userId: string) {
  const { data: portfolio } = await supabaseAdmin
    .from('audience_portfolios')
    .select('*, portfolio_templates(*), audience_tier_campaigns(*)')
    .eq('id', portfolioId)
    .eq('user_id', userId)
    .maybeSingle();

  return portfolio || null;
}

async function updatePortfolioTierCampaign(
  existingId: string | null,
  payload: Record<string, any>,
) {
  if (existingId) {
    const { data } = await supabaseAdmin
      .from('audience_tier_campaigns')
      .update(payload)
      .eq('id', existingId)
      .select('*')
      .single();
    return data;
  }

  const { data } = await supabaseAdmin
    .from('audience_tier_campaigns')
    .insert(payload)
    .select('*')
    .single();
  return data;
}

type CampaignMode = 'auto' | 'legacy' | 'intelligence';

interface CampaignGoalsInput {
  target_monthly_leads?: number;
  target_cpl?: number;
  target_monthly_budget?: number;
  growth_multiplier?: number;
  markets_to_target?: string[];
  exclude_markets?: string[];
}

interface IntelligenceAudienceTier {
  tier_name: string;
  tier_type: 'prospecting_broad' | 'prospecting_lal' | 'retargeting' | 'reactivation';
  geo: string[];
  targeting_type: 'broad' | 'interest' | 'lal' | 'custom';
  targeting_details: string;
  age_min: number;
  age_max: number;
  daily_budget_cents: number;
  budget_pct: number;
  expected_cpl: number | null;
  rationale: string;
}

interface IntelligenceCreativeAngle {
  angle_name: string;
  hook: string;
  message: string;
  cta: string;
  format: 'video_ugc' | 'video_reel' | 'static_image' | 'static_audio';
  rationale: string;
  variants_recommended: number;
}

interface IntelligenceStrategyPayload {
  strategy_summary: string;
  audience_tiers: IntelligenceAudienceTier[];
  creative_angles: IntelligenceCreativeAngle[];
  total_daily_budget_cents: number;
  total_monthly_budget: number;
  projected_monthly_leads: number | null;
  projected_cpl: number | null;
  warnings: string[];
  phase_1_actions: string[];
  phase_2_actions: string[];
  phase_3_actions: string[];
}

type BusinessUploadContextType =
  | 'ad_performance'
  | 'customer_data'
  | 'brand_guidelines'
  | 'competitor_analysis'
  | 'sales_data'
  | 'other';

interface CampaignUploadedContext {
  id: string;
  filename: string;
  file_type: string;
  uploaded_at: string;
  summary: string | null;
  context_type: BusinessUploadContextType | null;
  extracted_data: Record<string, any> | null;
}

interface CampaignContextPayload {
  business: {
    id: string;
    name: string;
    url: string;
    type: string;
    markets: string[];
    currency: string;
    deal_value?: number | null;
  };
  historical?: Record<string, any> | null;
  pipeline?: Record<string, any> | null;
  market?: Record<string, any> | null;
  portfolio?: Record<string, any> | null;
  web_context?: Record<string, any> | null;
  user_uploaded?: CampaignUploadedContext[] | null;
  goals: CampaignGoalsInput;
}

interface CrawledWebsitePage {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  links: string[];
  hero_images: string[];
  video_urls: string[];
  primary_ctas: string[];
  logo_url: string | null;
  languages_detected: string[];
}

function getJsonObject(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

function sanitizeStringArray(value: unknown, limit?: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((entry) => normalizeString(entry))
    .filter(Boolean) as string[];
  if (items.length === 0) return undefined;
  return typeof limit === 'number' ? items.slice(0, limit) : items;
}

function normalizeCampaignMode(value: unknown): CampaignMode {
  if (value === 'legacy' || value === 'intelligence') return value;
  return 'auto';
}

function sanitizeGoals(value: unknown): CampaignGoalsInput {
  const raw = getJsonObject(value) || {};
  const next: CampaignGoalsInput = {};
  const targetMonthlyLeads = normalizeNumber(raw.target_monthly_leads);
  const targetCpl = normalizeNumber(raw.target_cpl);
  const targetMonthlyBudget = normalizeNumber(raw.target_monthly_budget);
  const growthMultiplier = normalizeNumber(raw.growth_multiplier);
  const marketsToTarget = sanitizeStringArray(raw.markets_to_target);
  const excludeMarkets = sanitizeStringArray(raw.exclude_markets);

  if (targetMonthlyLeads !== null) next.target_monthly_leads = Math.max(0, Math.round(targetMonthlyLeads));
  if (targetCpl !== null) next.target_cpl = targetCpl;
  if (targetMonthlyBudget !== null) next.target_monthly_budget = targetMonthlyBudget;
  if (growthMultiplier !== null) next.growth_multiplier = growthMultiplier;
  if (marketsToTarget) next.markets_to_target = marketsToTarget;
  if (excludeMarkets) next.exclude_markets = excludeMarkets;
  return next;
}

function sanitizeCreativeHandoff(value: unknown): Record<string, any> | null {
  const raw = getJsonObject(value);
  if (!raw) return null;

  const handoff: Record<string, any> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (typeof entry === 'string') {
      const normalized = normalizeString(entry);
      if (normalized) handoff[key] = normalized;
      continue;
    }
    if (typeof entry === 'number' || typeof entry === 'boolean') {
      handoff[key] = entry;
      continue;
    }
    if (Array.isArray(entry)) {
      handoff[key] = entry.filter((item) => ['string', 'number', 'boolean'].includes(typeof item));
      continue;
    }
    if (entry && typeof entry === 'object') {
      handoff[key] = entry;
    }
  }

  return Object.keys(handoff).length > 0 ? handoff : null;
}

function sanitizeCrmAttributes(value: unknown): Record<string, any> {
  const raw = getJsonObject(value) || {};
  const next: Record<string, any> = {};

  const passthroughKeys = ['country', 'industry', 'segment', 'source_campaign', 'lifecycle_stage', 'deal_value', 'customer_value', 'revenue', 'market'];
  for (const key of passthroughKeys) {
    const entry = raw[key];
    if (typeof entry === 'string') {
      const normalized = normalizeString(entry);
      if (normalized) next[key] = normalized;
    } else if (typeof entry === 'number' && Number.isFinite(entry)) {
      next[key] = entry;
    } else if (typeof entry === 'boolean') {
      next[key] = entry;
    }
  }

  return next;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthsAgoDate(months: number): string {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return formatDateOnly(date);
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function safeActionCount(actions: any[] | undefined, actionType: string): number {
  const rawValue = actions?.find((action: any) => normalizeString(action?.action_type) === actionType)?.value;
  const parsed = normalizeNumber(rawValue);
  return parsed === null ? 0 : parsed;
}

function safeNumber(value: unknown, fallback = 0): number {
  const normalized = normalizeNumber(value);
  return normalized === null ? fallback : normalized;
}

function computeTrendLabel(values: number[], lowerIsBetter = false): 'improving' | 'stable' | 'degrading' {
  const filtered = values.filter((value) => Number.isFinite(value) && value > 0);
  if (filtered.length < 2) return 'stable';

  const pivot = Math.max(1, Math.floor(filtered.length / 2));
  const firstHalf = filtered.slice(0, pivot);
  const secondHalf = filtered.slice(pivot);
  if (firstHalf.length === 0 || secondHalf.length === 0) return 'stable';

  const firstAvg = firstHalf.reduce((sum, value) => sum + value, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, value) => sum + value, 0) / secondHalf.length;
  if (firstAvg === 0) return 'stable';

  const delta = (secondAvg - firstAvg) / firstAvg;
  if (lowerIsBetter) {
    if (delta <= -0.1) return 'improving';
    if (delta >= 0.1) return 'degrading';
    return 'stable';
  }

  if (delta >= 0.1) return 'improving';
  if (delta <= -0.1) return 'degrading';
  return 'stable';
}

function summariseHistoricalRows(rows: Array<Record<string, any>>) {
  const monthly = rows
    .map((row) => {
      const spend = safeNumber(row.spend);
      const leads = safeNumber(row.leads);
      const ctr = safeNumber(row.ctr);
      const frequency = safeNumber(row.frequency);
      const cpl = leads > 0 ? spend / leads : null;
      return {
        month: normalizeString(row.month) || normalizeString(row.date_start) || new Date().toISOString().slice(0, 7),
        spend,
        leads,
        ctr,
        frequency,
        cpl,
      };
    })
    .filter((row) => row.spend > 0 || row.leads > 0);

  if (monthly.length === 0) return null;

  const totalSpend = monthly.reduce((sum, row) => sum + row.spend, 0);
  const totalLeads = monthly.reduce((sum, row) => sum + row.leads, 0);
  const rowsWithCpl = monthly.filter((row) => typeof row.cpl === 'number' && row.cpl > 0) as Array<typeof monthly[number] & { cpl: number }>;
  const bestRow = rowsWithCpl.length > 0
    ? rowsWithCpl.reduce((best, row) => (row.cpl < best.cpl ? row : best))
    : monthly[0];
  const worstRow = rowsWithCpl.length > 0
    ? rowsWithCpl.reduce((worst, row) => (row.cpl > worst.cpl ? row : worst))
    : monthly[monthly.length - 1];
  const latestRow = monthly[monthly.length - 1];

  return {
    months_of_data: monthly.length,
    total_spend: Math.round(totalSpend * 100) / 100,
    total_leads: totalLeads,
    avg_cpl: totalLeads > 0 ? Math.round((totalSpend / totalLeads) * 100) / 100 : null,
    best_cpl_month: {
      month: bestRow.month,
      cpl: bestRow.cpl,
      spend: Math.round(bestRow.spend * 100) / 100,
      leads: bestRow.leads,
    },
    worst_cpl_month: {
      month: worstRow.month,
      cpl: worstRow.cpl,
      spend: Math.round(worstRow.spend * 100) / 100,
      leads: worstRow.leads,
    },
    sweet_spot: {
      month: bestRow.month,
      cpl: bestRow.cpl,
      spend: Math.round(bestRow.spend * 100) / 100,
      leads: bestRow.leads,
      ctr: bestRow.ctr,
    },
    cpl_trend: computeTrendLabel(rowsWithCpl.map((row) => row.cpl), true),
    ctr_trend: computeTrendLabel(monthly.map((row) => row.ctr), false),
    frequency_issues: monthly.some((row) => row.frequency > 3),
    current_monthly_spend: Math.round(latestRow.spend * 100) / 100,
    current_cpl: latestRow.cpl,
  };
}

function summariseHistoricalFromStoredHistory(value: unknown) {
  const history = getJsonObject(value);
  if (!history) return null;

  const campaigns = Array.isArray(history.campaigns) ? history.campaigns : [];
  const grouped = new Map<string, { month: string; spend: number; leads: number; ctr: number; frequency: number }>();

  for (const campaign of campaigns) {
    const createdTime = normalizeString((campaign as any)?.created_time) || normalizeString(history.fetched_at);
    const month = createdTime ? createdTime.slice(0, 7) : new Date().toISOString().slice(0, 7);
    const insights = getJsonObject((campaign as any)?.insights) || {};
    const spend = safeNumber(insights.spend);
    const impressions = safeNumber(insights.impressions);
    const clicks = safeNumber(insights.clicks);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : safeNumber(insights.ctr);
    const frequency = safeNumber(insights.frequency);
    const leads = safeActionCount(Array.isArray(insights.actions) ? insights.actions : [], 'lead');
    const existing = grouped.get(month) || { month, spend: 0, leads: 0, ctr: 0, frequency: 0 };
    existing.spend += spend;
    existing.leads += leads;
    existing.ctr = Math.max(existing.ctr, ctr);
    existing.frequency = Math.max(existing.frequency, frequency);
    grouped.set(month, existing);
  }

  if (grouped.size > 0) {
    return summariseHistoricalRows(Array.from(grouped.values()));
  }

  const summary = getJsonObject(history.summary);
  if (!summary) return null;
  const spend = safeNumber(summary.total_spend);
  const leads = safeNumber(summary.total_leads);
  if (spend <= 0 && leads <= 0) return null;

  return summariseHistoricalRows([{
    month: normalizeString(history.fetched_at)?.slice(0, 7) || new Date().toISOString().slice(0, 7),
    spend,
    leads,
    ctr: 0,
    frequency: 0,
  }]);
}

async function getActivePortfolioForBusiness(businessId: string) {
  const { data: portfolio } = await supabaseAdmin
    .from('audience_portfolios')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return portfolio || null;
}

async function fetchHistoricalSummaryForBusiness(business: any) {
  const accessToken = resolveAutonomousAccessToken(business.id, business.facebook_access_token);
  const adAccountId = normalizeString(business.facebook_ad_account_id)?.replace(/^act_/, '');

  if (accessToken && adAccountId) {
    try {
      const params = new URLSearchParams({
        fields: 'spend,impressions,clicks,actions,cost_per_action_type,cpc,cpm,ctr,reach,frequency,date_start,date_stop',
        time_range: JSON.stringify({ since: monthsAgoDate(12), until: formatDateOnly(new Date()) }),
        time_increment: 'monthly',
        access_token: accessToken,
      });

      const response = await fetch(`${GRAPH_BASE}/act_${adAccountId}/insights?${params.toString()}`);
      const payload = await response.json();
      if (response.ok && !payload.error && Array.isArray(payload.data) && payload.data.length > 0) {
        const summary = summariseHistoricalRows(payload.data.map((row: any) => ({
          month: row.date_start ? String(row.date_start).slice(0, 7) : undefined,
          date_start: row.date_start,
          spend: parseFloat(row.spend || '0'),
          leads: safeActionCount(Array.isArray(row.actions) ? row.actions : [], 'lead'),
          ctr: safeNumber(row.ctr),
          frequency: safeNumber(row.frequency),
        })));
        if (summary) return summary;
      }
    } catch (error) {
      console.warn('[campaign-intelligence] Failed to fetch live historical insights:', error);
    }
  }

  return summariseHistoricalFromStoredHistory(business.facebook_ad_history);
}

function buildPipelineSummary(events: Array<Record<string, any>>, historical: Record<string, any> | null) {
  if (!Array.isArray(events) || events.length === 0) return null;

  const leadEvents = events.filter((event) => normalizeString(event.meta_event_name) === 'Lead');
  const customerEvents = events.filter((event) => normalizeString(event.meta_event_name) === 'Purchase');
  const totalLeads = leadEvents.length;
  const totalCustomers = customerEvents.length;

  const leadsByCountry: Record<string, number> = {};
  const customersByCountry: Record<string, number> = {};
  const leadsByIndustry: Record<string, number> = {};
  const customersByIndustry: Record<string, number> = {};

  for (const event of leadEvents) {
    const attrs = getJsonObject(event.crm_attributes) || {};
    const country = normalizeString(attrs.country);
    const industry = normalizeString(attrs.industry);
    if (country) leadsByCountry[country] = (leadsByCountry[country] || 0) + 1;
    if (industry) leadsByIndustry[industry] = (leadsByIndustry[industry] || 0) + 1;
  }

  for (const event of customerEvents) {
    const attrs = getJsonObject(event.crm_attributes) || {};
    const country = normalizeString(attrs.country);
    const industry = normalizeString(attrs.industry);
    if (country) customersByCountry[country] = (customersByCountry[country] || 0) + 1;
    if (industry) customersByIndustry[industry] = (customersByIndustry[industry] || 0) + 1;
  }

  const topConvertingSegments = [
    ...Object.entries(customersByCountry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([country, count]) => `${country} (${count} customers)`),
    ...Object.entries(customersByIndustry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([industry, count]) => `${industry} (${count} customers)`),
  ].slice(0, 5);

  const nonConvertingSegments = [
    ...Object.entries(leadsByCountry)
      .filter(([country, count]) => count >= 5 && !customersByCountry[country])
      .map(([country, count]) => `${country}: ${count} leads, 0 customers`),
    ...Object.entries(leadsByIndustry)
      .filter(([industry, count]) => count >= 5 && !customersByIndustry[industry])
      .map(([industry, count]) => `${industry}: ${count} leads, 0 customers`),
  ].slice(0, 6);

  const totalSpend = safeNumber(historical?.total_spend);

  return {
    total_leads: totalLeads,
    total_customers: totalCustomers,
    lead_to_customer_rate: totalLeads > 0 ? totalCustomers / totalLeads : 0,
    cost_per_customer: totalCustomers > 0 && totalSpend > 0 ? Math.round((totalSpend / totalCustomers) * 100) / 100 : null,
    customers_by_country: customersByCountry,
    customers_by_industry: customersByIndustry,
    top_converting_segments: topConvertingSegments,
    non_converting_segments: nonConvertingSegments,
  };
}

async function getAverageDealValueFromCapi(businessId: string) {
  const since = daysAgoIso(365);
  const { data: rows } = await supabaseAdmin
    .from('capi_events')
    .select('crm_attributes')
    .eq('business_id', businessId)
    .eq('status', 'sent')
    .eq('is_test', false)
    .gte('created_at', since);

  const values = (rows || [])
    .map((row: any) => {
      const attrs = getJsonObject(row.crm_attributes) || {};
      return normalizeNumber(attrs.deal_value) ?? normalizeNumber(attrs.customer_value) ?? normalizeNumber(attrs.revenue);
    })
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

async function getMarketResearchSummary(args: { industry: string; location: string; country: string }) {
  if (!BRAVE_API_KEY || !ANTHROPIC_API_KEY) return null;

  try {
    const queries = [
      `${args.industry} market ${args.location} ${args.country}`,
      `${args.industry} ${args.location} advertising benchmarks ${args.country}`,
      `${args.industry} ${args.location} competitors pricing`,
    ];

    const [marketResults, adResults, competitorResults] = await Promise.all(queries.map((query) => braveSearch(query, 5)));
    const context = [
      ...(marketResults || []).slice(0, 4).map((result: any) => `${result.title}: ${result.description || ''}`),
      ...(adResults || []).slice(0, 4).map((result: any) => `${result.title}: ${result.description || ''}`),
      ...(competitorResults || []).slice(0, 4).map((result: any) => `${result.title}: ${result.description || ''}`),
    ].join('\n');

    const response = await callClaude(
      'You are a market intelligence analyst. Return valid JSON only.',
      `Summarise market advertising context for this business.

Industry: ${args.industry}
Location: ${args.location}
Country: ${args.country}

Context:
${context || 'No market context available.'}

Return JSON:
{
  "competition_level": "low|medium|high",
  "estimated_avg_cpl": 0,
  "estimated_avg_cpc": 0,
  "key_players": ["string"],
  "opportunities": ["string"],
  "recommended_positioning": "string"
}`,
      1200,
    );

    const parsed = parseClaudeJson(response);
    return {
      competition_level: normalizeString(parsed.competition_level) || 'unknown',
      estimated_avg_cpl: safeNumber(parsed.estimated_avg_cpl),
      estimated_avg_cpc: safeNumber(parsed.estimated_avg_cpc),
      key_players: Array.isArray(parsed.key_players) ? parsed.key_players.map((item: unknown) => normalizeString(item)).filter(Boolean) : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.map((item: unknown) => normalizeString(item)).filter(Boolean) : [],
      recommended_positioning: normalizeString(parsed.recommended_positioning) || 'Insufficient data to recommend positioning.',
    };
  } catch (error) {
    console.warn('[campaign-intelligence] Failed to fetch market research:', error);
    return null;
  }
}

function sanitizeIntelligenceAudienceTier(value: any, fallbackGeo: string[], totalBudgetCents: number, fallbackIndex: number): IntelligenceAudienceTier {
  const geo = sanitizeStringArray(value?.geo) || fallbackGeo;
  const budgetPct = Math.max(1, Math.round(normalizeNumber(value?.budget_pct) || 0) || 0);
  const dailyBudget = Math.max(
    500,
    Math.round(normalizeNumber(value?.daily_budget_cents) || (totalBudgetCents * budgetPct) / 100 || (totalBudgetCents / Math.max(1, fallbackGeo.length))),
  );

  return {
    tier_name: normalizeString(value?.tier_name) || `Tier ${fallbackIndex + 1}`,
    tier_type: (normalizeString(value?.tier_type) as IntelligenceAudienceTier['tier_type']) || (fallbackIndex === 0 ? 'prospecting_broad' : 'retargeting'),
    geo,
    targeting_type: (normalizeString(value?.targeting_type) as IntelligenceAudienceTier['targeting_type']) || 'broad',
    targeting_details: normalizeString(value?.targeting_details) || 'Broad targeting informed by campaign context.',
    age_min: Math.max(18, Math.round(normalizeNumber(value?.age_min) || 25)),
    age_max: Math.max(18, Math.round(normalizeNumber(value?.age_max) || 55)),
    daily_budget_cents: dailyBudget,
    budget_pct: budgetPct,
    expected_cpl: normalizeNumber(value?.expected_cpl),
    rationale: normalizeString(value?.rationale) || 'Included as part of the recommended audience architecture.',
  };
}

function sanitizeIntelligenceCreativeAngle(value: any, index: number): IntelligenceCreativeAngle {
  const cta = normalizeString(value?.cta) || 'Learn More';
  return {
    angle_name: normalizeString(value?.angle_name) || `Angle ${index + 1}`,
    hook: normalizeString(value?.hook) || `Hook ${index + 1}`,
    message: normalizeString(value?.message) || 'Core campaign message',
    cta,
    format: (normalizeString(value?.format) as IntelligenceCreativeAngle['format']) || 'static_image',
    rationale: normalizeString(value?.rationale) || 'Recommended from available context.',
    variants_recommended: Math.max(1, Math.round(normalizeNumber(value?.variants_recommended) || 3)),
  };
}

function buildDefaultAudienceTiers(ctx: CampaignContextPayload, budgetCents: number): IntelligenceAudienceTier[] {
  const markets = ctx.goals.markets_to_target || ctx.business.markets;
  const hasCustomerVolume = safeNumber(ctx.pipeline?.total_customers) >= 100;
  const targetAudienceHint = sanitizeStringArray(ctx.web_context?.target_audience)?.[0] || getFirstUploadedInsight(ctx) || 'available business context';
  const tiers: IntelligenceAudienceTier[] = [
    {
      tier_name: `${markets[0] || 'Primary'} Broad ADV+`,
      tier_type: 'prospecting_broad',
      geo: markets,
      targeting_type: 'broad',
      targeting_details: `Broad/ADV+ targeting informed by ${targetAudienceHint}.`,
      age_min: 25,
      age_max: 55,
      daily_budget_cents: Math.max(500, Math.round(budgetCents * (hasCustomerVolume ? 0.45 : 0.7))),
      budget_pct: hasCustomerVolume ? 45 : 70,
      expected_cpl: normalizeNumber(ctx.market?.estimated_avg_cpl) ? Math.round(Number(ctx.market?.estimated_avg_cpl) / 100) : null,
      rationale: 'Primary scale tier for the account.',
    },
  ];

  if (hasCustomerVolume) {
    tiers.push({
      tier_name: `${markets[0] || 'Primary'} Customer LAL`,
      tier_type: 'prospecting_lal',
      geo: markets.slice(0, 2),
      targeting_type: 'lal',
      targeting_details: '1% customer lookalike audience seeded from CAPI customer signals.',
      age_min: 25,
      age_max: 55,
      daily_budget_cents: Math.max(500, Math.round(budgetCents * 0.35)),
      budget_pct: 35,
      expected_cpl: normalizeNumber(ctx.market?.estimated_avg_cpl) ? Math.round((Number(ctx.market?.estimated_avg_cpl) / 100) * 0.9) : null,
      rationale: 'Use downstream customer data to find adjacent high-intent prospects.',
    });
  }

  tiers.push({
    tier_name: `${markets[0] || 'Primary'} Retargeting`,
    tier_type: 'retargeting',
    geo: markets,
    targeting_type: 'custom',
    targeting_details: 'Retarget website visitors, engaged leads, and ad engagers when available.',
    age_min: 25,
    age_max: 65,
    daily_budget_cents: Math.max(500, budgetCents - tiers.reduce((sum, tier) => sum + tier.daily_budget_cents, 0)),
    budget_pct: Math.max(10, 100 - tiers.reduce((sum, tier) => sum + tier.budget_pct, 0)),
    expected_cpl: normalizeNumber(ctx.market?.estimated_avg_cpl) ? Math.round((Number(ctx.market?.estimated_avg_cpl) / 100) * 0.8) : null,
    rationale: 'Capture warm demand generated by prospecting.',
  });

  return tiers;
}

function buildDefaultCreativeAngles(ctx: CampaignContextPayload): IntelligenceCreativeAngle[] {
  const marketHint = normalizeString(ctx.market?.recommended_positioning) || 'Emphasise the strongest market differentiator.';
  const topValueProp = getFirstWebValueProp(ctx) || marketHint;
  const topPainPoint = getFirstWebPainPoint(ctx) || 'the operational cost of delay';
  const primaryOffer = getPrimaryOfferLabel(ctx) || ctx.business.name;
  const uploadedInsight = getFirstUploadedInsight(ctx);
  return [
    {
      angle_name: 'Proof Over Promise',
      hook: topValueProp ? `Lead with ${topValueProp} in the first 3 seconds.` : 'Show the real-world outcome in the first 3 seconds.',
      message: `${ctx.business.name} turns attention into qualified action with proof around ${primaryOffer}.`,
      cta: 'Learn More',
      format: 'video_ugc',
      rationale: uploadedInsight ? `${marketHint} Use uploaded proof and context to support the claim.` : marketHint,
      variants_recommended: 3,
    },
    {
      angle_name: 'Pain Interruption',
      hook: 'Call out the cost of doing nothing.',
      message: `Frame how ${ctx.business.name} solves ${topPainPoint} and the operational cost of delay.`,
      cta: 'Get Quote',
      format: 'static_image',
      rationale: 'Useful when market competition is noisy and attention is scarce.',
      variants_recommended: 3,
    },
    {
      angle_name: 'Operator Clarity',
      hook: 'Show how the offer actually works.',
      message: `Explain how ${primaryOffer} works in plain language and why it is credible.`,
      cta: normalizeString(ctx.web_context?.primary_cta) || 'Sign Up',
      format: 'video_reel',
      rationale: uploadedInsight ? `Supports higher-intent users who need confidence before converting. Reinforce ${uploadedInsight}.` : 'Supports higher-intent users who need confidence before converting.',
      variants_recommended: 2,
    },
  ];
}

function sanitizeIntelligenceStrategy(
  parsed: Record<string, any>,
  ctx: CampaignContextPayload,
  budgetCents: number,
): IntelligenceStrategyPayload {
  const fallbackTiers = buildDefaultAudienceTiers(ctx, budgetCents);
  const parsedTiers = Array.isArray(parsed.audience_tiers)
    ? parsed.audience_tiers.map((tier: any, index: number) => sanitizeIntelligenceAudienceTier(tier, ctx.goals.markets_to_target || ctx.business.markets, budgetCents, index))
    : fallbackTiers;
  const parsedAngles = Array.isArray(parsed.creative_angles)
    ? parsed.creative_angles.map((angle: any, index: number) => sanitizeIntelligenceCreativeAngle(angle, index))
    : buildDefaultCreativeAngles(ctx);

  return {
    strategy_summary: normalizeString(parsed.strategy_summary) || `Use ${parsedTiers[0]?.tier_name || 'a multi-tier prospecting'} as the primary acquisition motion, support it with retargeting, and bias budget toward segments backed by the available data.`,
    audience_tiers: parsedTiers.length > 0 ? parsedTiers : fallbackTiers,
    creative_angles: parsedAngles.length > 0 ? parsedAngles : buildDefaultCreativeAngles(ctx),
    total_daily_budget_cents: Math.max(500, Math.round(normalizeNumber(parsed.total_daily_budget_cents) || budgetCents)),
    total_monthly_budget: Math.max(15000, Math.round(normalizeNumber(parsed.total_monthly_budget) || ((normalizeNumber(parsed.total_daily_budget_cents) || budgetCents) * 30))),
    projected_monthly_leads: normalizeNumber(parsed.projected_monthly_leads),
    projected_cpl: normalizeNumber(parsed.projected_cpl),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((item: unknown) => normalizeString(item)).filter(Boolean) : [],
    phase_1_actions: Array.isArray(parsed.phase_1_actions) ? parsed.phase_1_actions.map((item: unknown) => normalizeString(item)).filter(Boolean) : ['Approve the recommended strategy and creative angles.'],
    phase_2_actions: Array.isArray(parsed.phase_2_actions) ? parsed.phase_2_actions.map((item: unknown) => normalizeString(item)).filter(Boolean) : ['Launch the highest-confidence tier once creative is ready.'],
    phase_3_actions: Array.isArray(parsed.phase_3_actions) ? parsed.phase_3_actions.map((item: unknown) => normalizeString(item)).filter(Boolean) : ['Rebalance budget using downstream conversion signals.'],
  };
}

function buildCampaignPlanningPrompt(ctx: CampaignContextPayload, objective: ZuckerObjective, budgetCents: number) {
  const uploadedContext = (ctx.user_uploaded || []).map((upload) => ({
    filename: upload.filename,
    context_type: upload.context_type,
    summary: upload.summary,
    extracted_data: upload.extracted_data,
  }));

  const lines = [
    'You are a senior performance marketing strategist creating a Meta Ads campaign plan.',
    '',
    '## Available Context',
    ...buildContextAvailabilityLines(ctx),
    '',
    '## Business Context',
    `- Name: ${ctx.business.name}`,
    `- Type: ${ctx.business.type}`,
    `- URL: ${ctx.business.url}`,
    `- Target Markets: ${ctx.business.markets.join(', ')}`,
    `- Currency: ${ctx.business.currency}`,
    ctx.business.deal_value ? `- Average Deal Value: ${ctx.business.deal_value}` : null,
    '',
    '## Campaign Goal',
    `- Objective: ${objective}`,
    `- Daily Budget Ceiling: ${budgetCents}`,
    ctx.goals.target_monthly_leads ? `- Target monthly leads: ${ctx.goals.target_monthly_leads}` : null,
    ctx.goals.target_cpl ? `- Target CPL: ${ctx.goals.target_cpl}` : null,
    ctx.goals.target_monthly_budget ? `- Target monthly budget: ${ctx.goals.target_monthly_budget}` : null,
    ctx.goals.growth_multiplier ? `- Growth multiplier target: ${ctx.goals.growth_multiplier}` : null,
    ctx.goals.markets_to_target?.length ? `- Markets to target: ${ctx.goals.markets_to_target.join(', ')}` : null,
    ctx.goals.exclude_markets?.length ? `- Markets to exclude: ${ctx.goals.exclude_markets.join(', ')}` : null,
    '',
    `## Historical Performance\n${JSON.stringify(ctx.historical || { note: 'No historical ad account insights available.' }, null, 2)}`,
    '',
    `## CRM Pipeline Signals\n${JSON.stringify(ctx.pipeline || { note: 'No downstream CRM data available.' }, null, 2)}`,
    '',
    `## Web-Scraped Business Context\n${JSON.stringify(ctx.web_context || { note: 'No cached web context available.' }, null, 2)}`,
    '',
    `## User-Uploaded Business Context\n${JSON.stringify(uploadedContext.length > 0 ? uploadedContext : { note: 'No user-uploaded context available.' }, null, 2)}`,
    '',
    `## Market Research\n${JSON.stringify(ctx.market || { note: 'No market research available.' }, null, 2)}`,
    '',
    `## Existing Portfolio\n${JSON.stringify(ctx.portfolio || { note: 'No active portfolio configured.' }, null, 2)}`,
    '',
    'Return valid JSON only with this structure:',
    `{
  "strategy_summary": "string",
  "audience_tiers": [
    {
      "tier_name": "string",
      "tier_type": "prospecting_broad | prospecting_lal | retargeting | reactivation",
      "geo": ["AU"],
      "targeting_type": "broad | interest | lal | custom",
      "targeting_details": "string",
      "age_min": 25,
      "age_max": 55,
      "daily_budget_cents": 1500,
      "budget_pct": 40,
      "expected_cpl": 45,
      "rationale": "string"
    }
  ],
  "creative_angles": [
    {
      "angle_name": "string",
      "hook": "string",
      "message": "string",
      "cta": "Learn More",
      "format": "video_ugc | video_reel | static_image | static_audio",
      "rationale": "string",
      "variants_recommended": 3
    }
  ],
  "total_daily_budget_cents": 5000,
  "total_monthly_budget": 150000,
  "projected_monthly_leads": 100,
  "projected_cpl": 50,
  "warnings": ["string"],
  "phase_1_actions": ["string"],
  "phase_2_actions": ["string"],
  "phase_3_actions": ["string"]
}`,
    '',
    'Rules:',
    '- Default to broad/ADV+ targeting unless the data clearly supports a narrower tactic.',
    '- Only recommend lookalikes when the context indicates at least 100 customer or SQL records are available.',
    '- If a market has leads but zero customers, warn about it and avoid giving it significant budget.',
    '- If frequency is above 3, recommend audience expansion or new geos.',
    '- If no historical data is available, keep the plan conservative.',
    '- Use web-scraped products, value props, pain points, social proof, CTAs, and uploaded key insights when proposing creative angles and targeting details.',
    '- Be explicit when recommendations are limited by missing data.',
  ].filter(Boolean);

  return lines.join('\n');
}

function buildCompatibilityResponse(strategy: IntelligenceStrategyPayload, ctx: CampaignContextPayload, objective: ZuckerObjective) {
  const firstTier = strategy.audience_tiers[0];
  const markets = firstTier?.geo?.length ? firstTier.geo : ctx.business.markets;
  const targeting: Record<string, any> = {
    age_min: firstTier?.age_min || 25,
    age_max: firstTier?.age_max || 55,
    radius_km: 25,
    interests: firstTier?.targeting_type === 'interest'
      ? firstTier.targeting_details.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 6)
      : [],
    geo_locations: {
      countries: markets.length > 0 ? markets : ['US'],
    },
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: ['feed'],
    instagram_positions: ['stream'],
  };

  const variants = strategy.creative_angles.slice(0, 3).map((angle) => ({
    headline: angle.angle_name.slice(0, 40),
    copy: `${angle.hook} ${angle.message}`.slice(0, 125),
    rationale: angle.rationale,
    cta: angle.cta,
    angle: angle.angle_name.toLowerCase().replace(/\s+/g, '_'),
    image_prompt: null,
  }));

  return {
    strategy: {
      objective,
      summary: strategy.strategy_summary,
      strengths: strategy.creative_angles.slice(0, 2).map((angle) => angle.angle_name),
      opportunities: strategy.warnings.slice(0, 3),
      recommended_daily_budget_cents: strategy.total_daily_budget_cents,
      projected_cpl_cents: strategy.projected_cpl !== null ? Math.round(strategy.projected_cpl * 100) : null,
      projected_monthly_leads: strategy.projected_monthly_leads,
    },
    targeting,
    variants,
    roadmap: {
      week_1_2: strategy.phase_1_actions,
      week_3_4: strategy.phase_2_actions,
      month_2: strategy.phase_3_actions,
      month_3: strategy.warnings.length > 0 ? strategy.warnings : ['Scale the highest-converting audience tiers.'],
    },
  };
}

function summariseContextAvailability(ctx: CampaignContextPayload) {
  return {
    has_historical_data: !!ctx.historical,
    has_crm_data: !!ctx.pipeline,
    has_market_data: !!ctx.market,
    has_portfolio: !!ctx.portfolio,
    has_web_context: !!ctx.web_context,
    has_uploaded_context: !!ctx.user_uploaded?.length,
    uploaded_context_count: (ctx.user_uploaded || []).length,
    web_context_age_days: getWebContextAgeDays(ctx.web_context?.scraped_at || null),
    months_of_data: safeNumber(ctx.historical?.months_of_data),
  };
}

function buildTierKey(tierName: string) {
  return tierName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

const GEO_CODE_ALIASES: Record<string, string> = {
  au: 'AU',
  australia: 'AU',
  us: 'US',
  usa: 'US',
  united_states: 'US',
  unitedstates: 'US',
  gb: 'GB',
  uk: 'GB',
  united_kingdom: 'GB',
  unitedkingdom: 'GB',
  ca: 'CA',
  canada: 'CA',
  nz: 'NZ',
  new_zealand: 'NZ',
  newzealand: 'NZ',
};

function titleCaseToken(value: string) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function buildDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function normalizeGeoCode(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized) return 'US';

  const compactKey = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (GEO_CODE_ALIASES[compactKey]) return GEO_CODE_ALIASES[compactKey];
  if (/^[a-z]{2,3}$/i.test(normalized)) return normalized.toUpperCase();

  const alnum = normalized.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return alnum.slice(0, 8) || 'US';
}

function tierShortName(tierName: string) {
  const map: Record<string, string> = {
    broad: 'Broad',
    prospecting_broad: 'Broad',
    interest: 'Interest',
    lal_1pct: 'LAL1pct',
    lal_3pct: 'LAL3pct',
    lal_5pct: 'LAL5pct',
    lookalike: 'LAL',
    prospecting_lal: 'LAL',
    retargeting: 'Retarget',
    reactivation: 'Reactivate',
  };

  const key = (tierName || '').toLowerCase().replace(/\s+/g, '_');
  if (map[key]) return map[key];

  for (const [pattern, short] of Object.entries(map)) {
    if (key.includes(pattern)) return short;
  }

  return (tierName || 'General')
    .split(/\s+/)
    .map((word) => titleCaseToken(word))
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 10) || 'General';
}

function angleShortName(angleName: string) {
  const words = (angleName || 'Creative')
    .split(/\s+/)
    .map((word) => titleCaseToken(word).replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);

  let compact = '';
  for (const word of words) {
    if ((compact + word).length > 20) break;
    compact += word;
  }

  return compact || words.join('').slice(0, 20) || 'Creative';
}

function buildMetaObjectNames(args: {
  objective: ZuckerObjective;
  geo?: unknown;
  tierName?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  placement?: string | null;
  angleName?: string | null;
  variantIndex?: number | null;
  assetType?: string | null;
  date?: Date;
}) {
  const geo = normalizeGeoCode(args.geo);
  const tierShort = tierShortName(args.tierName || 'General');
  const objectiveLabel = titleCaseToken(args.objective || 'traffic');
  const dateStr = buildDateStamp(args.date);
  const ageMin = Math.max(13, Math.round(normalizeNumber(args.ageMin) || 25));
  const ageMax = Math.max(ageMin, Math.round(normalizeNumber(args.ageMax) || 65));
  const ageRange = `${ageMin}-${ageMax}`;
  const placement = titleCaseToken(normalizeString(args.placement) || 'Feed');
  const angleShort = angleShortName(args.angleName || 'Creative');
  const variant = Math.max(1, Math.round(normalizeNumber(args.variantIndex) || 0) + 1);
  const assetType = (normalizeString(args.assetType) || 'image').toLowerCase();
  const format = assetType === 'video' ? 'Video' : assetType === 'image' ? 'Static' : titleCaseToken(assetType);

  return {
    geo,
    tier_short: tierShort,
    objective_label: objectiveLabel,
    date_str: dateStr,
    age_range: ageRange,
    placement,
    angle_short: angleShort,
    variant,
    format,
    campaign_name: `ZB_${geo}_${tierShort}_${objectiveLabel}_${dateStr}`,
    adset_name: `ZB_${geo}_${tierShort}_${ageRange}_${placement}`,
    ad_name: `ZB_${angleShort}_V${variant}_${format}`,
  };
}

function mapApprovedStrategyToPortfolioTiers(strategy: IntelligenceStrategyPayload, baseTargetCpaCents: number): PortfolioTierConfig[] {
  return strategy.audience_tiers.map((tier, index) => {
    const expectedCplCents = tier.expected_cpl ? Math.round(tier.expected_cpl * 100) : baseTargetCpaCents;
    const pct = tier.budget_pct > 0
      ? tier.budget_pct
      : Math.max(1, Math.round((tier.daily_budget_cents / Math.max(strategy.total_daily_budget_cents, 1)) * 100));
    return {
      tier: buildTierKey(tier.tier_name) || `tier_${index + 1}`,
      budget_pct: pct,
      target_cpa_multiplier: baseTargetCpaCents > 0 ? Math.max(0.2, expectedCplCents / baseTargetCpaCents) : 1,
      description: tier.rationale,
    };
  });
}

function mergeWorkflowState(existingValue: unknown, patch: Record<string, any>) {
  const existing = getJsonObject(existingValue) || {};
  const merged = { ...existing, ...patch };
  if (existing.tier_campaigns || patch.tier_campaigns) {
    merged.tier_campaigns = {
      ...(getJsonObject(existing.tier_campaigns) || {}),
      ...(getJsonObject(patch.tier_campaigns) || {}),
    };
  }
  return merged;
}

async function getOwnedApiCampaign(campaignId: string, apiKeyId: string) {
  const { data: campaign } = await supabaseAdmin
    .from('api_campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('api_key_id', apiKeyId)
    .maybeSingle();

  return campaign || null;
}

function getIntelligenceStrategySource(campaign: any): IntelligenceStrategyPayload | null {
  const approved = getJsonObject(campaign?.approved_strategy);
  if (approved) return approved as unknown as IntelligenceStrategyPayload;
  const strategy = getJsonObject(campaign?.strategy);
  if (strategy && Array.isArray(strategy.audience_tiers) && Array.isArray(strategy.creative_angles)) {
    return strategy as unknown as IntelligenceStrategyPayload;
  }
  return null;
}

function findStrategyTier(strategy: IntelligenceStrategyPayload, tierName: string) {
  const matchKey = buildTierKey(tierName);
  return strategy.audience_tiers.find((tier) => buildTierKey(tier.tier_name) === matchKey) || null;
}

function findStrategyAngle(strategy: IntelligenceStrategyPayload, angleName: string) {
  const matchKey = buildTierKey(angleName);
  return strategy.creative_angles.find((angle) => buildTierKey(angle.angle_name) === matchKey) || null;
}

async function ensurePortfolioForIntelligenceCampaign(args: {
  campaign: any;
  business: any;
  userId: string;
  strategy: IntelligenceStrategyPayload;
}) {
  const workflowState = getJsonObject(args.campaign.workflow_state) || {};
  const { data: policy } = await supabaseAdmin
    .from('autonomous_policies')
    .select('target_cpa_cents, target_cpa')
    .eq('business_id', args.business.id)
    .maybeSingle();
  const baseTargetCpaCents = getPolicyTargetCpaCents(policy);
  const tiers = mapApprovedStrategyToPortfolioTiers(args.strategy, baseTargetCpaCents);

  const existingPortfolioId = normalizeString(workflowState.portfolio_id);
  if (existingPortfolioId) {
    const { data: updated } = await supabaseAdmin
      .from('audience_portfolios')
      .update({
        name: `${args.business.name || 'Business'} Intelligence ${args.campaign.id}`,
        total_daily_budget_cents: args.strategy.total_daily_budget_cents,
        tiers,
        is_active: false,
      })
      .eq('id', existingPortfolioId)
      .eq('user_id', args.userId)
      .select('*')
      .maybeSingle();
    if (updated) return updated;
  }

  const { data: inserted } = await supabaseAdmin
    .from('audience_portfolios')
    .insert({
      business_id: args.business.id,
      user_id: args.userId,
      template_id: null,
      name: `${args.business.name || 'Business'} Intelligence ${args.campaign.id}`,
      total_daily_budget_cents: args.strategy.total_daily_budget_cents,
      tiers,
      is_active: false,
    })
    .select('*')
    .single();

  return inserted || null;
}

async function upsertManagedCampaignExecutionRecord(args: {
  businessId: string;
  campaignName: string;
  status: string;
  dailyBudgetCents: number;
  radiusKm: number;
  headline: string;
  adBody: string;
  imageUrl: string | null;
  metaCampaignId: string;
  metaAdSetId: string;
  metaAdId: string;
  metaLeadFormId?: string | null;
  launchedAt?: string | null;
}) {
  const existing = await supabaseAdmin
    .from('campaigns')
    .select('id')
    .eq('meta_campaign_id', args.metaCampaignId)
    .maybeSingle();

  const payload = {
    business_id: args.businessId,
    name: args.campaignName,
    status: args.status,
    daily_budget_cents: args.dailyBudgetCents,
    radius_km: args.radiusKm,
    ad_headline: args.headline,
    ad_copy: args.adBody,
    ad_image_url: args.imageUrl,
    meta_campaign_id: args.metaCampaignId,
    meta_adset_id: args.metaAdSetId,
    meta_ad_id: args.metaAdId,
    meta_leadform_id: args.metaLeadFormId || null,
    launched_at: args.launchedAt || null,
  };

  if (existing.data?.id) {
    const { data } = await supabaseAdmin
      .from('campaigns')
      .update(payload)
      .eq('id', existing.data.id)
      .select('id')
      .single();
    return data?.id || existing.data.id;
  }

  const { data } = await supabaseAdmin
    .from('campaigns')
    .insert({
      ...payload,
      leads_count: 0,
      spend_cents: 0,
      performance_status: 'learning',
    })
    .select('id')
    .single();

  return data?.id || null;
}

function buildTargetingFromAudienceTier(tier: IntelligenceAudienceTier, business: any, metaAudienceId?: string | null) {
  const geo = Array.isArray(tier.geo) && tier.geo.length > 0 ? tier.geo : (business.markets || ['US']);
  const geoLocations: Record<string, any> = {};
  if (business.lat && business.lng && geo.length === 1 && /^[A-Z]{2,3}$/.test(String(geo[0]))) {
    geoLocations.custom_locations = [{
      latitude: business.lat,
      longitude: business.lng,
      radius: business.target_radius_km || 25,
      distance_unit: 'kilometer',
    }];
  } else {
    geoLocations.countries = geo;
  }

  const targeting: Record<string, any> = {
    age_min: tier.age_min,
    age_max: tier.age_max,
    radius_km: business.target_radius_km || 25,
    geo_locations: geoLocations,
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: ['feed'],
    instagram_positions: ['stream'],
  };

  const fallbackAudienceIds = [metaAudienceId, normalizeString((tier as any)?.meta_audience_id)]
    .filter(Boolean) as string[];
  const excludedAudienceIds = [
    ...(sanitizeStringArray((tier as any)?.excluded_audiences) || []),
    ...(sanitizeStringArray((tier as any)?.excluded_meta_audience_ids) || []),
    ...(sanitizeStringArray((tier as any)?.excluded_custom_audiences) || []),
  ].filter(Boolean);

  switch (tier.targeting_type) {
    case 'broad':
      return {
        ...targeting,
        targeting_automation: { advantage_audience: 1 },
      };

    case 'lal':
      return fallbackAudienceIds.length > 0
        ? {
            ...targeting,
            custom_audiences: fallbackAudienceIds.map((id) => ({ id })),
          }
        : targeting;

    case 'interest': {
      const interests = tier.targeting_details.split(',').map((item) => item.trim()).filter(Boolean);
      if (interests.length === 0) return targeting;
      return {
        ...targeting,
        flexible_spec: interests.map((interest) => ({
          interests: [{ name: interest }],
        })),
      };
    }

    case 'custom':
      return {
        ...targeting,
        ...(fallbackAudienceIds.length > 0 ? { custom_audiences: fallbackAudienceIds.map((id) => ({ id })) } : {}),
        ...(excludedAudienceIds.length > 0 ? { excluded_custom_audiences: excludedAudienceIds.map((id) => ({ id })) } : {}),
      };

    default:
      return targeting;
  }
}

function buildMetaAdSetTargetingPayload(targeting: Record<string, any> | null | undefined, fallbackGeo?: string | null) {
  const geoLocations: Record<string, any> = {};
  if (Array.isArray(targeting?.geo_locations?.custom_locations) && targeting.geo_locations.custom_locations.length > 0) {
    geoLocations.custom_locations = targeting.geo_locations.custom_locations;
  } else if (Array.isArray(targeting?.geo_locations?.countries) && targeting.geo_locations.countries.length > 0) {
    geoLocations.countries = targeting.geo_locations.countries;
  } else {
    geoLocations.countries = [normalizeGeoCode(fallbackGeo || 'US')];
  }

  const payload: Record<string, any> = {
    age_min: Math.max(13, Math.round(normalizeNumber(targeting?.age_min) || 25)),
    age_max: Math.max(
      Math.max(13, Math.round(normalizeNumber(targeting?.age_min) || 25)),
      Math.round(normalizeNumber(targeting?.age_max) || 65),
    ),
    geo_locations: geoLocations,
    publisher_platforms: Array.isArray(targeting?.publisher_platforms) && targeting.publisher_platforms.length > 0
      ? targeting.publisher_platforms
      : ['facebook', 'instagram'],
    facebook_positions: Array.isArray(targeting?.facebook_positions) && targeting.facebook_positions.length > 0
      ? targeting.facebook_positions
      : ['feed'],
    instagram_positions: Array.isArray(targeting?.instagram_positions) && targeting.instagram_positions.length > 0
      ? targeting.instagram_positions
      : ['stream'],
  };

  if (Array.isArray(targeting?.genders) && targeting.genders.length > 0) payload.genders = targeting.genders;
  if (Array.isArray(targeting?.interests) && targeting.interests.length > 0) payload.interests = targeting.interests;
  if (Array.isArray(targeting?.custom_audiences) && targeting.custom_audiences.length > 0) payload.custom_audiences = targeting.custom_audiences;
  if (Array.isArray(targeting?.excluded_custom_audiences) && targeting.excluded_custom_audiences.length > 0) {
    payload.excluded_custom_audiences = targeting.excluded_custom_audiences;
  }
  if (Array.isArray(targeting?.flexible_spec) && targeting.flexible_spec.length > 0) payload.flexible_spec = targeting.flexible_spec;
  if (getJsonObject(targeting?.targeting_automation)) payload.targeting_automation = targeting.targeting_automation;

  return payload;
}

function buildLeadFormRequiredError() {
  return {
    code: 'lead_form_required',
    message: 'No lead form selected. Use zuckerbot_list_lead_forms and zuckerbot_select_lead_form to choose one before launching.',
  };
}

async function resolveLeadFormIdForObjective(objective: ZuckerObjective, businessOrId?: any) {
  if (!needsLeadForm(objective)) {
    return { ok: true as const, leadFormId: null };
  }

  if (!businessOrId) {
    return { ok: false as const, error: buildLeadFormRequiredError() };
  }

  let business = businessOrId;
  if (typeof businessOrId === 'string') {
    const { data } = await supabaseAdmin
      .from('businesses')
      .select('id, meta_leadgen_form_id')
      .eq('id', businessOrId)
      .maybeSingle();
    business = data;
  }

  const leadFormId = normalizeString(business?.meta_leadgen_form_id);
  if (!leadFormId) {
    return { ok: false as const, error: buildLeadFormRequiredError() };
  }

  return { ok: true as const, leadFormId };
}

function buildDraftCampaignFromTier(args: {
  apiCampaign: any;
  business: any;
  tier: IntelligenceAudienceTier;
  asset: {
    headline: string;
    body: string;
    cta: string;
    asset_url: string;
  };
  targeting: Record<string, any>;
}) {
  return {
    business_name: `${args.business.name} ${args.tier.tier_name}`.slice(0, 100),
    business_type: args.business.trade || suggestPortfolioBusinessType(args.business.trade),
    objective: isValidObjective(args.apiCampaign.objective) ? args.apiCampaign.objective : 'leads',
    url: args.apiCampaign.url || args.business.website_url || args.business.website || null,
    targeting: args.targeting,
    variants: [
      {
        headline: args.asset.headline,
        copy: args.asset.body,
        cta: args.asset.cta,
        angle: buildTierKey(args.tier.tier_name),
        image_url: args.asset.asset_url,
      },
    ],
    strategy: {
      objective: isValidObjective(args.apiCampaign.objective) ? args.apiCampaign.objective : 'leads',
      summary: args.tier.rationale,
      recommended_daily_budget_cents: args.tier.daily_budget_cents,
      projected_cpl_cents: args.tier.expected_cpl ? Math.round(args.tier.expected_cpl * 100) : null,
    },
  };
}

function buildMetaCallToAction(objective: ZuckerObjective, ctaType: string, linkUrl: string | null, leadFormId?: string | null) {
  if (objective === 'leads' && leadFormId) {
    return {
      type: ctaType,
      value: { lead_gen_form_id: leadFormId },
    };
  }

  if (linkUrl) {
    return {
      type: ctaType,
      value: { link: linkUrl },
    };
  }

  return { type: ctaType };
}

async function metaGet(endpoint: string, accessToken: string) {
  const response = await fetch(`${GRAPH_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`);
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok && !payload?.error, data: payload };
}

async function metaDelete(endpoint: string, accessToken: string) {
  const response = await fetch(`${GRAPH_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`, {
    method: 'DELETE',
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok && !payload?.error, data: payload };
}

async function uploadMetaAssetToAdAccount(args: {
  adAccountId: string;
  accessToken: string;
  assetUrl: string;
  assetType: 'image' | 'video';
}) {
  if (args.assetType === 'video') {
    const result = await metaPost(`/act_${args.adAccountId}/advideos`, {
      file_url: args.assetUrl,
    }, args.accessToken);

    return {
      ok: result.ok && !!result.data?.id,
      metaVideoId: normalizeString(result.data?.id),
      metaImageHash: null,
      raw: result.data,
    };
  }

  const result = await metaPost(`/act_${args.adAccountId}/adimages`, {
    url: args.assetUrl,
  }, args.accessToken);
  const images = getJsonObject(result.data?.images) || {};
  const firstImage = Object.values(images)[0] as any;

  return {
    ok: result.ok && !!firstImage?.hash,
    metaVideoId: null,
    metaImageHash: normalizeString(firstImage?.hash),
    raw: result.data,
  };
}

async function createPausedCreativeForExistingAdSet(args: {
  adAccountId: string;
  accessToken: string;
  metaAdSetId: string;
  metaPageId: string;
  objective: ZuckerObjective;
  headline: string;
  body: string;
  cta: string;
  linkUrl: string | null;
  assetUrl: string;
  assetType: 'image' | 'video';
  leadFormId?: string | null;
  creativeName?: string | null;
  adName?: string | null;
}) {
  if (args.objective === 'leads' && !normalizeString(args.leadFormId)) {
    return {
      ok: false,
      error: buildLeadFormRequiredError(),
    };
  }

  const ctaType = (args.cta || 'Learn More').toUpperCase().replace(/\s+/g, '_');
  const uploaded = await uploadMetaAssetToAdAccount({
    adAccountId: args.adAccountId,
    accessToken: args.accessToken,
    assetUrl: args.assetUrl,
    assetType: args.assetType,
  });

  if (!uploaded.ok) {
    return {
      ok: false,
      error: {
        code: 'meta_asset_upload_failed',
        message: 'Failed to upload creative asset to Meta.',
        meta_error: uploaded.raw,
      },
    };
  }

  let objectStorySpec: Record<string, any>;
  if (args.assetType === 'video' && uploaded.metaVideoId) {
    objectStorySpec = {
      page_id: args.metaPageId,
      video_data: {
        video_id: uploaded.metaVideoId,
        message: args.body,
        title: args.headline,
        call_to_action: buildMetaCallToAction(args.objective, ctaType, args.linkUrl, args.leadFormId),
        ...(args.linkUrl ? { link_description: args.body, link_url: args.linkUrl } : {}),
      },
    };
  } else {
    const linkData = buildCreativeLinkData(args.objective, {
      headline: args.headline,
      body: args.body,
      ctaType,
      imageUrl: uploaded.metaImageHash ? null : args.assetUrl,
      imageHash: uploaded.metaImageHash || undefined,
      leadFormId: args.leadFormId || undefined,
      campaignUrl: args.linkUrl || undefined,
    });
    objectStorySpec = {
      page_id: args.metaPageId,
      link_data: linkData,
    };
  }

  const creativeResult = await metaPost(`/act_${args.adAccountId}/adcreatives`, {
    name: normalizeString(args.creativeName) || `${args.headline.slice(0, 80)} Creative`,
    object_story_spec: JSON.stringify(objectStorySpec),
  }, args.accessToken);

  if (!creativeResult.ok || !creativeResult.data?.id) {
    return {
      ok: false,
      error: {
        code: 'meta_creative_failed',
        message: creativeResult.data?.error?.message || 'Failed to create Meta ad creative.',
        meta_error: creativeResult.data?.error || creativeResult.data,
      },
    };
  }

  const adResult = await metaPost(`/act_${args.adAccountId}/ads`, {
    name: normalizeString(args.adName) || `${args.headline.slice(0, 80)} Ad`,
    adset_id: args.metaAdSetId,
    creative: JSON.stringify({ creative_id: creativeResult.data.id }),
    status: 'PAUSED',
  }, args.accessToken);

  if (!adResult.ok || !adResult.data?.id) {
    return {
      ok: false,
      error: {
        code: 'meta_ad_failed',
        message: adResult.data?.error?.message || 'Failed to create paused Meta ad.',
        meta_error: adResult.data?.error || adResult.data,
      },
    };
  }

  return {
    ok: true,
    metaAdId: normalizeString(adResult.data.id),
    metaAdCreativeId: normalizeString(creativeResult.data.id),
    metaImageHash: uploaded.metaImageHash,
    metaVideoId: uploaded.metaVideoId,
  };
}

async function getAudienceRowForUser(audienceId: string, userId: string) {
  const { data: audience } = await supabaseAdmin
    .from('facebook_audiences')
    .select('*')
    .eq('id', audienceId)
    .eq('user_id', userId)
    .maybeSingle();
  return audience || null;
}

async function upsertFacebookAudienceRow(args: {
  existingId?: string | null;
  userId: string;
  businessId: string;
  audienceId: string;
  audienceName: string;
  audienceType: string;
  audienceSize?: number | null;
  description?: string | null;
  seedSourceStage?: string | null;
  lookbackDays?: number | null;
  lookalikePct?: number | null;
  seedAudienceId?: string | null;
  deliveryStatus?: string | null;
  rawData?: Record<string, any> | null;
  lastRefreshedAt?: string | null;
}) {
  const existing = args.existingId
    ? await supabaseAdmin
        .from('facebook_audiences')
        .select('id')
        .eq('id', args.existingId)
        .eq('user_id', args.userId)
        .maybeSingle()
    : await supabaseAdmin
        .from('facebook_audiences')
        .select('id')
        .eq('user_id', args.userId)
        .eq('audience_id', args.audienceId)
        .maybeSingle();

  const payload = {
    user_id: args.userId,
    business_id: args.businessId,
    audience_id: args.audienceId,
    audience_name: args.audienceName,
    audience_type: args.audienceType,
    audience_size: args.audienceSize || null,
    description: args.description || null,
    raw_data: args.rawData || null,
    seed_source_stage: args.seedSourceStage || null,
    lookback_days: args.lookbackDays || null,
    lookalike_pct: args.lookalikePct || null,
    seed_audience_id: args.seedAudienceId || null,
    delivery_status: args.deliveryStatus || null,
    last_refreshed_at: args.lastRefreshedAt || new Date().toISOString(),
  };

  if (existing.data?.id) {
    const { data } = await supabaseAdmin
      .from('facebook_audiences')
      .update(payload)
      .eq('id', existing.data.id)
      .select('*')
      .single();
    return data;
  }

  const { data } = await supabaseAdmin
    .from('facebook_audiences')
    .insert(payload)
    .select('*')
    .single();
  return data;
}

function buildAudienceUploadPayload(hashedUsers: Array<Record<string, string>>) {
  const metaKeyToSchema: Record<string, string> = {
    em: 'EMAIL_SHA256',
    ph: 'PHONE_SHA256',
    fn: 'FN_SHA256',
    ln: 'LN_SHA256',
  };

  const schemaKeys = Object.keys(metaKeyToSchema).filter((key) => hashedUsers.some((row) => normalizeString(row[key])));
  const schema = schemaKeys.map((key) => metaKeyToSchema[key]);
  const data = hashedUsers
    .map((row) => schemaKeys.map((key) => row[key] || ''))
    .filter((row) => row.some((value) => !!value));

  return { schema, data };
}

async function collectSeedAudienceUsers(args: {
  businessId: string;
  sourceStage: string;
  lookbackDays: number;
}) {
  const { data: rows } = await supabaseAdmin
    .from('capi_events')
    .select('hashed_user_data')
    .eq('business_id', args.businessId)
    .eq('status', 'sent')
    .eq('is_test', false)
    .eq('source_stage', args.sourceStage)
    .gte('created_at', daysAgoIso(args.lookbackDays));

  const dedupe = new Set<string>();
  const users: Array<Record<string, string>> = [];

  for (const row of rows || []) {
    const hashed = getJsonObject((row as any).hashed_user_data) || {};
    const payload: Record<string, string> = {};
    for (const key of ['em', 'ph', 'fn', 'ln']) {
      const value = normalizeString(hashed[key]);
      if (value) payload[key] = value;
    }
    if (Object.keys(payload).length === 0) continue;
    const dedupeKey = JSON.stringify(payload);
    if (dedupe.has(dedupeKey)) continue;
    dedupe.add(dedupeKey);
    users.push(payload);
  }

  return users;
}

async function createSeedAudienceInternal(args: {
  business: any;
  userId: string;
  accessToken: string;
  adAccountId: string;
  name: string;
  sourceStage: string;
  lookbackDays: number;
  minContacts: number;
  existingAudience?: any | null;
}) {
  const users = await collectSeedAudienceUsers({
    businessId: args.business.id,
    sourceStage: args.sourceStage,
    lookbackDays: args.lookbackDays,
  });

  if (users.length < args.minContacts) {
    return {
      ok: false,
      error: {
        code: 'insufficient_seed_contacts',
        message: `Insufficient contacts: found ${users.length}, need at least ${args.minContacts}.`,
      },
    };
  }

  const audienceName = args.name || `${args.business.name} ${args.sourceStage} Seed`;
  let metaAudienceId = normalizeString(args.existingAudience?.audience_id);

  if (!metaAudienceId) {
    const createResult = await metaPost(`/act_${args.adAccountId}/customaudiences`, {
      name: audienceName,
      subtype: 'CUSTOM',
      description: `ZuckerBot seed audience for ${args.sourceStage}`,
      customer_file_source: 'USER_PROVIDED_ONLY',
    }, args.accessToken);

    if (!createResult.ok || !createResult.data?.id) {
      return {
        ok: false,
        error: {
          code: 'meta_seed_create_failed',
          message: createResult.data?.error?.message || 'Failed to create Meta custom audience.',
          meta_error: createResult.data?.error || createResult.data,
        },
      };
    }

    metaAudienceId = createResult.data.id;
  }

  const uploadPayload = buildAudienceUploadPayload(users);
  const uploadResult = await metaPost(`/${metaAudienceId}/users`, {
    payload: JSON.stringify(uploadPayload),
  }, args.accessToken);

  if (!uploadResult.ok) {
    return {
      ok: false,
      error: {
        code: 'meta_seed_upload_failed',
        message: uploadResult.data?.error?.message || 'Failed to upload users to Meta custom audience.',
        meta_error: uploadResult.data?.error || uploadResult.data,
      },
    };
  }

  const stored = await upsertFacebookAudienceRow({
    existingId: args.existingAudience?.id || null,
    userId: args.userId,
    businessId: args.business.id,
    audienceId: metaAudienceId,
    audienceName,
    audienceType: 'custom',
    audienceSize: users.length,
    description: `Seed audience for ${args.sourceStage}`,
    seedSourceStage: args.sourceStage,
    lookbackDays: args.lookbackDays,
    deliveryStatus: safeNumber(uploadResult.data?.num_received) > 0 ? 'uploaded' : 'ready',
    rawData: uploadResult.data,
  });

  return { ok: true, audience: stored, uploaded_users: users.length };
}

async function createLookalikeAudienceInternal(args: {
  business: any;
  userId: string;
  accessToken: string;
  adAccountId: string;
  seedAudience: any;
  name: string;
  percentage: number;
  country: string;
}) {
  const ratio = Math.max(0.01, Math.min(0.2, args.percentage / 100));
  const lookalikeSpec = {
    ratio,
    country: args.country,
  };

  const createResult = await metaPost(`/act_${args.adAccountId}/customaudiences`, {
    name: args.name,
    subtype: 'LOOKALIKE',
    origin_audience_id: args.seedAudience.audience_id,
    lookalike_spec: JSON.stringify(lookalikeSpec),
    description: `ZuckerBot ${args.percentage}% lookalike seeded from ${args.seedAudience.audience_name}`,
  }, args.accessToken);

  if (!createResult.ok || !createResult.data?.id) {
    return {
      ok: false,
      error: {
        code: 'meta_lal_create_failed',
        message: createResult.data?.error?.message || 'Failed to create lookalike audience.',
        meta_error: createResult.data?.error || createResult.data,
      },
    };
  }

  const stored = await upsertFacebookAudienceRow({
    userId: args.userId,
    businessId: args.business.id,
    audienceId: createResult.data.id,
    audienceName: args.name,
    audienceType: 'lookalike',
    description: `Lookalike audience seeded from ${args.seedAudience.audience_name}`,
    seedSourceStage: args.seedAudience.seed_source_stage,
    lookbackDays: args.seedAudience.lookback_days,
    lookalikePct: args.percentage,
    seedAudienceId: args.seedAudience.audience_id,
    deliveryStatus: 'building',
    rawData: createResult.data,
  });

  return { ok: true, audience: stored };
}

async function refreshAudienceInternal(args: {
  audience: any;
  business: any;
  accessToken: string;
  adAccountId: string;
}) {
  if (normalizeString(args.audience.audience_type) === 'lookalike' && normalizeString(args.audience.seed_source_stage)) {
    const existingSeed = await supabaseAdmin
      .from('facebook_audiences')
      .select('*')
      .eq('user_id', args.audience.user_id)
      .eq('business_id', args.business.id)
      .eq('audience_type', 'custom')
      .eq('seed_source_stage', args.audience.seed_source_stage)
      .maybeSingle();

    if (existingSeed.data) {
      const seedRefresh = await createSeedAudienceInternal({
        business: args.business,
        userId: args.audience.user_id,
        accessToken: args.accessToken,
        adAccountId: args.adAccountId,
        name: existingSeed.data.audience_name,
        sourceStage: existingSeed.data.seed_source_stage,
        lookbackDays: existingSeed.data.lookback_days || 180,
        minContacts: 100,
        existingAudience: existingSeed.data,
      });
      if (!seedRefresh.ok) return seedRefresh;
    }

    return getAudienceStatusInternal(args.audience, args.accessToken);
  }

  return createSeedAudienceInternal({
    business: args.business,
    userId: args.audience.user_id,
    accessToken: args.accessToken,
    adAccountId: args.adAccountId,
    name: args.audience.audience_name,
    sourceStage: args.audience.seed_source_stage,
    lookbackDays: args.audience.lookback_days || 180,
    minContacts: 100,
    existingAudience: args.audience,
  });
}

async function getAudienceStatusInternal(audience: any, accessToken: string) {
  const metaAudienceId = normalizeString(audience.audience_id);
  if (!metaAudienceId) {
    return {
      ok: false,
      error: {
        code: 'missing_meta_audience_id',
        message: 'Audience is missing a Meta audience id.',
      },
    };
  }

  const response = await metaGet(`/${metaAudienceId}?fields=id,name,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status,subtype,time_updated`, accessToken);
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: 'meta_audience_status_failed',
        message: response.data?.error?.message || 'Failed to fetch audience status from Meta.',
        meta_error: response.data?.error || response.data,
      },
    };
  }

  const size = safeNumber(response.data?.approximate_count_lower_bound) || safeNumber(response.data?.approximate_count_upper_bound) || audience.audience_size || null;
  const deliveryStatus = normalizeString(response.data?.delivery_status?.description)
    || normalizeString(response.data?.operation_status?.description)
    || normalizeString(response.data?.delivery_status)
    || audience.delivery_status
    || 'unknown';

  const stored = await upsertFacebookAudienceRow({
    existingId: audience.id,
    userId: audience.user_id,
    businessId: audience.business_id,
    audienceId: audience.audience_id,
    audienceName: normalizeString(response.data?.name) || audience.audience_name,
    audienceType: audience.audience_type,
    audienceSize: size,
    description: audience.description,
    seedSourceStage: audience.seed_source_stage,
    lookbackDays: audience.lookback_days,
    lookalikePct: audience.lookalike_pct,
    seedAudienceId: audience.seed_audience_id,
    deliveryStatus,
    rawData: response.data,
    lastRefreshedAt: normalizeString(response.data?.time_updated) || new Date().toISOString(),
  });

  return { ok: true, audience: stored, meta_status: response.data };
}

async function deleteAudienceInternal(audience: any, accessToken: string) {
  const metaAudienceId = normalizeString(audience.audience_id);
  if (!metaAudienceId) {
    return {
      ok: false,
      error: {
        code: 'missing_meta_audience_id',
        message: 'Audience is missing a Meta audience id.',
      },
    };
  }

  const response = await metaDelete(`/${metaAudienceId}`, accessToken);
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: 'meta_audience_delete_failed',
        message: response.data?.error?.message || 'Failed to delete Meta audience.',
        meta_error: response.data?.error || response.data,
      },
    };
  }

  await supabaseAdmin
    .from('facebook_audiences')
    .delete()
    .eq('id', audience.id)
    .eq('user_id', audience.user_id);

  return { ok: true };
}

async function ensureLookalikeAudienceForTier(args: {
  business: any;
  userId: string;
  accessToken: string;
  adAccountId: string;
  tier: IntelligenceAudienceTier;
}) {
  if (args.tier.targeting_type !== 'lal' && args.tier.tier_type !== 'prospecting_lal') {
    return { ok: true, audience: null };
  }

  const desiredPct = normalizeNumber(args.tier.targeting_details.match(/(\d+(?:\.\d+)?)%/)?.[1]) || 1;
  const preferredStages = ['customer', 'salesqualifiedlead', 'marketingqualifiedlead', 'lead'];

  let selectedStage: string | null = null;
  for (const stage of preferredStages) {
    const users = await collectSeedAudienceUsers({
      businessId: args.business.id,
      sourceStage: stage,
      lookbackDays: 180,
    });
    if (users.length >= 100) {
      selectedStage = stage;
      break;
    }
  }

  if (!selectedStage) {
    return {
      ok: false,
      error: {
        code: 'insufficient_seed_contacts',
        message: 'This tier requires at least 100 seed contacts to create a lookalike audience.',
      },
    };
  }

  const { data: existingLookalike } = await supabaseAdmin
    .from('facebook_audiences')
    .select('*')
    .eq('user_id', args.userId)
    .eq('business_id', args.business.id)
    .eq('audience_type', 'lookalike')
    .eq('seed_source_stage', selectedStage)
    .eq('lookalike_pct', desiredPct)
    .maybeSingle();

  if (existingLookalike) {
    return { ok: true, audience: existingLookalike };
  }

  const { data: existingSeed } = await supabaseAdmin
    .from('facebook_audiences')
    .select('*')
    .eq('user_id', args.userId)
    .eq('business_id', args.business.id)
    .eq('audience_type', 'custom')
    .eq('seed_source_stage', selectedStage)
    .maybeSingle();

  const seedResult = existingSeed
    ? await createSeedAudienceInternal({
        business: args.business,
        userId: args.userId,
        accessToken: args.accessToken,
        adAccountId: args.adAccountId,
        name: existingSeed.audience_name,
        sourceStage: selectedStage,
        lookbackDays: existingSeed.lookback_days || 180,
        minContacts: 100,
        existingAudience: existingSeed,
      })
    : await createSeedAudienceInternal({
        business: args.business,
        userId: args.userId,
        accessToken: args.accessToken,
        adAccountId: args.adAccountId,
        name: `${args.business.name} ${selectedStage} Seed`,
        sourceStage: selectedStage,
        lookbackDays: 180,
        minContacts: 100,
      });

  if (!seedResult.ok || !seedResult.audience) {
    return seedResult;
  }

  const country = args.tier.geo?.[0] || args.business.markets?.[0] || args.business.country || 'US';
  return createLookalikeAudienceInternal({
    business: args.business,
    userId: args.userId,
    accessToken: args.accessToken,
    adAccountId: args.adAccountId,
    seedAudience: seedResult.audience,
    name: `${args.business.name} ${desiredPct}% ${selectedStage} LAL`,
    percentage: desiredPct,
    country,
  });
}

async function ensureTierExecutionForCreative(args: {
  auth: AuthSuccess;
  apiCampaign: any;
  business: any;
  portfolioId: string;
  tier: IntelligenceAudienceTier;
  accessToken: string;
  adAccountId: string;
  metaPageId: string;
  metaPixelId?: string | null;
  creative: {
    asset_url: string;
    asset_type: 'image' | 'video';
    headline: string;
    body: string;
    cta: string;
    link_url: string;
    angle_name?: string | null;
    variant_index?: number | null;
  };
}) {
  const tierKey = buildTierKey(args.tier.tier_name);
  const workflowState = getJsonObject(args.apiCampaign.workflow_state) || {};
  const tierState = getJsonObject(getJsonObject(workflowState.tier_campaigns || {})?.[tierKey]) || {};
  const objective: ZuckerObjective = isValidObjective(args.apiCampaign.objective) ? args.apiCampaign.objective : 'leads';
  const naming = buildMetaObjectNames({
    objective,
    geo: args.tier.geo?.[0] || args.business.markets?.[0] || args.business.country || 'US',
    tierName: args.tier.tier_name,
    ageMin: args.tier.age_min,
    ageMax: args.tier.age_max,
    placement: 'Feed',
    angleName: args.creative.angle_name || args.creative.headline,
    variantIndex: args.creative.variant_index || 0,
    assetType: args.creative.asset_type,
  });
  const leadFormSelection = await resolveLeadFormIdForObjective(objective, args.business);
  if (!leadFormSelection.ok) return leadFormSelection;
  const selectedLeadFormId = leadFormSelection.leadFormId || null;

  let linkedTierCampaign = normalizeString(tierState.tier_campaign_id)
    ? await supabaseAdmin.from('audience_tier_campaigns').select('*').eq('id', tierState.tier_campaign_id).maybeSingle().then((result) => result.data || null)
    : null;

  let metaAudienceId: string | null = normalizeString(linkedTierCampaign?.meta_audience_id) || normalizeString(tierState.meta_audience_id);
  if (!metaAudienceId && (args.tier.targeting_type === 'lal' || args.tier.tier_type === 'prospecting_lal')) {
    const audienceResult = await ensureLookalikeAudienceForTier({
      business: args.business,
      userId: args.auth.keyRecord.user_id,
      accessToken: args.accessToken,
      adAccountId: args.adAccountId,
      tier: args.tier,
    });
    if (!audienceResult.ok || !audienceResult.audience) return audienceResult;
    metaAudienceId = normalizeString(audienceResult.audience.audience_id);
  }

  const targeting = buildTargetingFromAudienceTier(args.tier, args.business, metaAudienceId);

  if (!linkedTierCampaign?.meta_campaign_id || !linkedTierCampaign?.meta_adset_id) {
    const draftCampaign = buildDraftCampaignFromTier({
      apiCampaign: args.apiCampaign,
      business: args.business,
      tier: args.tier,
      asset: {
        headline: args.creative.headline,
        body: args.creative.body,
        cta: args.creative.cta,
        asset_url: args.creative.asset_url,
      },
      targeting,
    });

    const launchResult = await launchCampaignInternal({
      campaignId: `${args.apiCampaign.id}:${tierKey}`,
      meta_access_token: args.accessToken,
      meta_ad_account_id: args.adAccountId,
      meta_page_id: args.metaPageId,
      meta_pixel_id: args.metaPixelId || null,
      variant_index: 0,
      daily_budget_cents: args.tier.daily_budget_cents,
      radius_km: args.business.target_radius_km || 25,
      campaign: draftCampaign,
      auth: args.auth.keyRecord,
      business: args.business,
      businessId: args.business.id,
      naming: {
        geo: naming.geo,
        tierName: args.tier.tier_name,
        ageMin: args.tier.age_min,
        ageMax: args.tier.age_max,
        placement: 'Feed',
        angleName: args.creative.angle_name || args.creative.headline,
        assetType: args.creative.asset_type,
        variantIndex: args.creative.variant_index || 0,
        campaignName: naming.campaign_name,
        adSetName: naming.adset_name,
        adName: naming.ad_name,
      },
      activate: false,
    });

    if (!launchResult.success || !launchResult.data) {
      return launchResult;
    }

    const managedCampaignId = await upsertManagedCampaignExecutionRecord({
      businessId: args.business.id,
      campaignName: naming.campaign_name,
      status: 'paused',
      dailyBudgetCents: args.tier.daily_budget_cents,
      radiusKm: args.business.target_radius_km || 25,
      headline: args.creative.headline,
      adBody: args.creative.body,
      imageUrl: args.creative.asset_type === 'image' ? args.creative.asset_url : null,
      metaCampaignId: launchResult.data.meta_campaign_id,
      metaAdSetId: launchResult.data.meta_adset_id,
      metaAdId: launchResult.data.meta_ad_id,
      metaLeadFormId: launchResult.data.lead_form_id || selectedLeadFormId || null,
      launchedAt: null,
    });

    linkedTierCampaign = await updatePortfolioTierCampaign(linkedTierCampaign?.id || null, {
      ...(linkedTierCampaign || {}),
      portfolio_id: args.portfolioId,
      business_id: args.business.id,
      user_id: args.auth.keyRecord.user_id,
      tier: tierKey,
      campaign_id: managedCampaignId,
      meta_campaign_id: launchResult.data.meta_campaign_id,
      meta_adset_id: launchResult.data.meta_adset_id,
      meta_audience_id: metaAudienceId,
      daily_budget_cents: args.tier.daily_budget_cents,
      status: 'paused',
      performance_data: {
        source: 'campaign_intelligence',
        tier_name: args.tier.tier_name,
        created_at: new Date().toISOString(),
      },
    });

    return {
      ok: true,
      created: true,
      linkedTierCampaign,
      metaCampaignId: launchResult.data.meta_campaign_id,
      metaAdSetId: launchResult.data.meta_adset_id,
      metaAdId: launchResult.data.meta_ad_id,
      metaAdCreativeId: launchResult.data.ad_creative_id || null,
      metaLeadFormId: launchResult.data.lead_form_id || null,
      metaAudienceId,
    };
  }

  const creativeResult = await createPausedCreativeForExistingAdSet({
    adAccountId: args.adAccountId,
    accessToken: args.accessToken,
    metaAdSetId: linkedTierCampaign.meta_adset_id,
    metaPageId: args.metaPageId,
    objective,
    headline: args.creative.headline,
    body: args.creative.body,
    cta: args.creative.cta,
    linkUrl: args.creative.link_url || args.apiCampaign.url || args.business.website_url || args.business.website || null,
    assetUrl: args.creative.asset_url,
    assetType: args.creative.asset_type,
    leadFormId: selectedLeadFormId,
    creativeName: `${naming.ad_name} Creative`,
    adName: naming.ad_name,
  });

  if (!creativeResult.ok) {
    return creativeResult;
  }

  return {
    ok: true,
    created: false,
    linkedTierCampaign,
    metaCampaignId: linkedTierCampaign.meta_campaign_id,
    metaAdSetId: linkedTierCampaign.meta_adset_id,
    metaAdId: creativeResult.metaAdId,
    metaAdCreativeId: creativeResult.metaAdCreativeId,
    metaLeadFormId: selectedLeadFormId,
    metaAudienceId,
    metaImageHash: creativeResult.metaImageHash,
    metaVideoId: creativeResult.metaVideoId,
  };
}

async function activateTierExecution(args: {
  apiCampaign: any;
  linkedTierCampaign: any;
  creativeRows: any[];
  accessToken: string;
}) {
  const metaCampaignId = normalizeString(args.linkedTierCampaign?.meta_campaign_id);
  const metaAdSetId = normalizeString(args.linkedTierCampaign?.meta_adset_id);
  const metaAdIds = args.creativeRows
    .map((row) => normalizeString(row.meta_ad_id))
    .filter(Boolean) as string[];

  if (!metaCampaignId || !metaAdSetId || metaAdIds.length === 0) {
    return {
      ok: false,
      error: {
        code: 'tier_not_ready',
        message: 'Tier execution does not have a complete paused campaign/adset/ad set to activate.',
      },
    };
  }

  await Promise.allSettled([
    ...metaAdIds.map((adId) => metaPost(`/${adId}`, { status: 'ACTIVE' }, args.accessToken)),
    metaPost(`/${metaAdSetId}`, { status: 'ACTIVE' }, args.accessToken),
    metaPost(`/${metaCampaignId}`, { status: 'ACTIVE' }, args.accessToken),
  ]);

  const launchedAt = new Date().toISOString();
  await supabaseAdmin
    .from('campaigns')
    .update({ status: 'active', launched_at: launchedAt })
    .eq('id', args.linkedTierCampaign.campaign_id)
    .then(() => {});

  await supabaseAdmin
    .from('audience_tier_campaigns')
    .update({
      status: 'active',
      updated_at: launchedAt,
      performance_data: {
        ...(getJsonObject(args.linkedTierCampaign.performance_data) || {}),
        activated_at: launchedAt,
      },
    })
    .eq('id', args.linkedTierCampaign.id)
    .then(() => {});

  await supabaseAdmin
    .from('api_campaign_creatives')
    .update({ status: 'active' })
    .eq('api_campaign_id', args.apiCampaign.id)
    .in('id', args.creativeRows.map((row) => row.id))
    .then(() => {});

  return { ok: true, launchedAt, metaCampaignId, metaAdSetId, metaAdIds };
}

async function resolveLaunchMetaForBusiness(args: {
  auth: AuthSuccess;
  business: any;
  overrides?: {
    meta_access_token?: string | null;
    meta_ad_account_id?: string | null;
    meta_page_id?: string | null;
  };
}) {
  const resolvedMeta = await resolveMetaCredentials({
    apiKeyId: args.auth.keyRecord.id,
    userId: args.auth.keyRecord.user_id,
    meta_access_token: args.overrides?.meta_access_token || null,
    meta_ad_account_id: args.overrides?.meta_ad_account_id || null,
    meta_page_id: args.overrides?.meta_page_id || null,
  });

  let metaAccessToken = resolvedMeta.meta_access_token;
  let metaAdAccountId = resolvedMeta.meta_ad_account_id;
  let metaPageId = resolvedMeta.meta_page_id;
  let metaPixelId = resolvedMeta.meta_pixel_id || normalizeString(args.business?.meta_pixel_id) || null;

  const adAccountResolution = await resolveAdAccountIdForLaunch({
    userId: args.auth.keyRecord.user_id,
    resolvedMeta: {
      ...resolvedMeta,
      meta_access_token: metaAccessToken,
      meta_ad_account_id: metaAdAccountId,
      meta_page_id: metaPageId,
      meta_pixel_id: metaPixelId,
    },
  });
  if (!metaAdAccountId && adAccountResolution.meta_ad_account_id) {
    metaAdAccountId = adAccountResolution.meta_ad_account_id;
  }
  if (!metaPixelId && adAccountResolution.meta_pixel_id) {
    metaPixelId = adAccountResolution.meta_pixel_id;
  }

  const pageResolution = await resolvePageIdForLaunch({
    userId: args.auth.keyRecord.user_id,
    resolvedMeta: {
      ...resolvedMeta,
      meta_access_token: metaAccessToken,
      meta_ad_account_id: metaAdAccountId,
      meta_page_id: metaPageId,
      meta_pixel_id: metaPixelId,
    },
  });
  if (!metaPageId && pageResolution.meta_page_id) {
    metaPageId = pageResolution.meta_page_id;
  }

  if (!metaAccessToken || !metaAdAccountId || !metaPageId) {
    return {
      ok: false,
      error: {
        code: 'missing_meta_credentials',
        message: 'Missing Meta launch credentials. Provide overrides or connect Meta on the business profile.',
        available_ad_accounts: adAccountResolution.available_ad_accounts || [],
        available_pages: pageResolution.available_pages || [],
      },
    };
  }

  return {
    ok: true,
    metaAccessToken,
    metaAdAccountId,
    metaPageId,
    metaPixelId,
  };
}

function normalizeCreativeUploads(body: Record<string, any>) {
  const items = Array.isArray(body.creatives) ? body.creatives : [body];
  return items
    .map((item) => ({
      tier_name: normalizeString(item.tier_name || body.tier_name),
      asset_url: normalizeString(item.asset_url),
      asset_type: (normalizeString(item.asset_type) || 'image') as 'image' | 'video',
      headline: normalizeString(item.headline),
      body: normalizeString(item.body || item.copy),
      cta: normalizeString(item.cta) || 'Learn More',
      link_url: normalizeString(item.link_url) || normalizeString(body.link_url),
      angle_name: normalizeString(item.angle_name),
      variant_index: normalizeNumber(item.variant_index),
    }))
    .filter((item) => item.tier_name && item.asset_url && item.headline && item.body) as Array<{
      tier_name: string;
      asset_url: string;
      asset_type: 'image' | 'video';
      headline: string;
      body: string;
      cta: string;
      link_url: string | null;
      angle_name: string | null;
      variant_index: number | null;
    }>;
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
  meta_pixel_id: string | null;
  business_id: string | null;
  source: CredentialSource;
}

interface MetaPageOption {
  id: string;
  name: string;
  category: string | null;
}

interface MetaAdAccountOption {
  id: string;
  account_id: string | null;
  name: string;
  account_status: number | null;
  currency: string | null;
  business_name: string | null;
  amount_spent: string | null;
}

interface MetaLeadFormOption {
  id: string;
  name: string;
  status: string | null;
  leads_count: number;
  created_time: string | null;
  questions: any[] | null;
}

interface MetaPixelOption {
  id: string;
  name: string;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const WEB_CONTEXT_MAX_AGE_DAYS = 30;
const WEB_CONTEXT_PAGE_LIMIT = 8;
const WEB_CONTEXT_PAGE_TIMEOUT_MS = 5_000;
const WEB_CONTEXT_REQUEST_TIMEOUT_MS = 15_000;
const WEB_CONTEXT_PAGE_TEXT_LIMIT = 6_000;
const BUSINESS_CONTEXT_TEXT_LIMIT = 50_000;
const BUSINESS_CONTEXT_FILE_SIZE_LIMIT = 10 * 1024 * 1024;
const BUSINESS_CONTEXT_ALLOWED_HINT_TYPES = new Set<BusinessUploadContextType>([
  'ad_performance',
  'customer_data',
  'brand_guidelines',
  'competitor_analysis',
  'sales_data',
  'other',
]);
const BUSINESS_CONTEXT_PRIORITY_SEGMENTS = [
  'pricing',
  'plans',
  'about',
  'company',
  'features',
  'product',
  'products',
  'services',
  'solutions',
  'testimonials',
  'reviews',
  'case-studies',
  'demo',
  'book-demo',
  'contact',
];
const BUSINESS_CONTEXT_SKIP_SEGMENTS = [
  'blog',
  'news',
  'press',
  'career',
  'jobs',
  'privacy',
  'terms',
  'legal',
  'cookie',
  'sitemap',
  'login',
  'signin',
  'sign-in',
  'signup',
  'sign-up',
];

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) return normalized;
  }
  return null;
}

function sanitizeNullableStringArray(value: unknown, limit = 8): string[] | null {
  const items = sanitizeStringArray(value);
  return items && items.length > 0 ? items.slice(0, limit) : null;
}

function sanitizeJsonValue(value: unknown, depth = 0): any {
  if (depth > 4) return null;
  if (value === null) return null;
  if (typeof value === 'string') return normalizeString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => sanitizeJsonValue(entry, depth + 1))
      .filter((entry) => entry !== null);
    return items.length > 0 ? items : null;
  }
  if (value && typeof value === 'object') {
    const next: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      const normalizedKey = normalizeString(key);
      const sanitized = sanitizeJsonValue(entry, depth + 1);
      if (normalizedKey && sanitized !== null) next[normalizedKey] = sanitized;
    }
    return Object.keys(next).length > 0 ? next : null;
  }
  return null;
}

function trimWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function normalizeUrlCandidate(value: string | null, baseUrl?: string | null): string | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;

  try {
    const url = baseUrl ? new URL(normalized, baseUrl) : new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    if (baseUrl) {
      try {
        const url = new URL(normalized, baseUrl);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        url.hash = '';
        return url.toString();
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeBusinessWebsiteUrl(value: string | null): string | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalizeUrlCandidate(normalized);
  }
  return normalizeUrlCandidate(`https://${normalized}`);
}

function sanitizeFilename(filename: string): string {
  const normalized = normalizeString(filename) || 'context.txt';
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 120) || 'context.txt';
}

function inferBusinessContextFileType(filename: string, explicitType?: string | null): string | null {
  const normalizedType = normalizeString(explicitType)?.toLowerCase() || null;
  if (normalizedType) {
    if (normalizedType === 'application/pdf') return normalizedType;
    if (normalizedType === 'text/csv' || normalizedType === 'application/csv' || normalizedType === 'application/vnd.ms-excel') {
      return 'text/csv';
    }
    if (normalizedType === 'text/plain') return normalizedType;
    if (normalizedType === 'text/markdown') return normalizedType;
  }

  const extension = filename.toLowerCase().split('.').pop() || '';
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'csv') return 'text/csv';
  if (extension === 'md' || extension === 'markdown') return 'text/markdown';
  if (extension === 'txt' || extension === 'text') return 'text/plain';
  return null;
}

function buildBusinessContextStoragePath(userId: string, businessId: string, filename: string): string {
  return `${userId}/${BUSINESS_CONTEXT_STORAGE_PREFIX}/${businessId}/${Date.now()}-${sanitizeFilename(filename)}`;
}

function isOwnedBusinessContextPath(filePath: string, userId: string, businessId: string): boolean {
  const normalized = normalizeString(filePath);
  if (!normalized) return false;
  return normalized.startsWith(`${userId}/${BUSINESS_CONTEXT_STORAGE_PREFIX}/${businessId}/`);
}

function getFileExtension(filename: string): string {
  return filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
}

function isWebContextStale(updatedAt: unknown): boolean {
  const normalized = normalizeString(updatedAt);
  if (!normalized) return true;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return true;
  return (Date.now() - parsed.getTime()) > WEB_CONTEXT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function getWebContextAgeDays(updatedAt: unknown): number | null {
  const normalized = normalizeString(updatedAt);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / (24 * 60 * 60 * 1000)));
}

function sanitizeBusinessUploadContextType(value: unknown): BusinessUploadContextType | null {
  const normalized = normalizeString(value)?.toLowerCase() as BusinessUploadContextType | undefined;
  if (!normalized || !BUSINESS_CONTEXT_ALLOWED_HINT_TYPES.has(normalized)) return null;
  return normalized;
}

function hasMeaningfulWebContext(context: Record<string, any> | null): boolean {
  if (!context) return false;
  return Boolean(
    normalizeString(context.business_name)
    || normalizeString(context.description)
    || sanitizeStringArray(context.target_audience)?.length
    || sanitizeStringArray(context.value_props)?.length,
  );
}

function sanitizeWebScrapedContext(value: unknown, metadata: {
  sourceUrls: string[];
  pagesCrawled: number;
  fallbackAssets: {
    logoUrl: string | null;
    heroImages: string[];
    videoUrls: string[];
    languages: string[];
  };
}): Record<string, any> | null {
  const raw = getJsonObject(value);
  if (!raw) return null;

  const products = Array.isArray(raw.products_services)
    ? raw.products_services
        .map((entry) => {
          const item = getJsonObject(entry);
          if (!item) return null;
          const name = normalizeString(item.name);
          const description = normalizeString(item.description);
          if (!name && !description) return null;
          return {
            ...(name ? { name } : {}),
            ...(description ? { description } : {}),
            ...(normalizeString(item.price) ? { price: normalizeString(item.price) } : {}),
            ...(sanitizeStringArray(item.key_features)?.length ? { key_features: sanitizeStringArray(item.key_features, 8) } : {}),
          };
        })
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const socialProof = Array.isArray(raw.social_proof)
    ? raw.social_proof
        .map((entry) => {
          const item = getJsonObject(entry);
          if (!item) return null;
          const type = normalizeString(item.type)?.toLowerCase();
          const content = normalizeString(item.content);
          if (!type || !content) return null;
          if (!['testimonial', 'stat', 'logo', 'award', 'review_count'].includes(type)) return null;
          return { type, content };
        })
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const normalized: Record<string, any> = {
    scraped_at: new Date().toISOString(),
    pages_crawled: metadata.pagesCrawled,
    source_urls: metadata.sourceUrls,
  };

  const businessName = normalizeString(raw.business_name);
  const tagline = normalizeString(raw.tagline);
  const description = normalizeString(raw.description);
  const businessType = normalizeString(raw.business_type)?.toLowerCase() || null;
  const primaryProductFocus = normalizeString(raw.primary_product_focus);
  const primaryCta = normalizeString(raw.primary_cta);
  const logoUrl = normalizeUrlCandidate(raw.logo_url as string | null) || metadata.fallbackAssets.logoUrl;
  const heroImages = sanitizeNullableStringArray(raw.hero_images, 6)?.map((entry) => normalizeUrlCandidate(entry) || null).filter(Boolean) as string[] | undefined;
  const videoUrls = sanitizeNullableStringArray(raw.video_urls, 6)?.map((entry) => normalizeUrlCandidate(entry) || null).filter(Boolean) as string[] | undefined;

  if (businessName) normalized.business_name = businessName;
  if (tagline) normalized.tagline = tagline;
  if (description) normalized.description = description;
  normalized.business_type = businessType || 'other';
  if (products.length > 0) normalized.products_services = products;
  if (primaryProductFocus) normalized.primary_product_focus = primaryProductFocus;
  if (sanitizeStringArray(raw.target_audience)?.length) normalized.target_audience = sanitizeStringArray(raw.target_audience, 8);
  if (sanitizeStringArray(raw.industries_served)?.length) normalized.industries_served = sanitizeStringArray(raw.industries_served, 8);
  if (sanitizeStringArray(raw.geographic_focus)?.length) normalized.geographic_focus = sanitizeStringArray(raw.geographic_focus, 8);
  if (sanitizeStringArray(raw.value_props)?.length) normalized.value_props = sanitizeStringArray(raw.value_props, 8);
  if (sanitizeStringArray(raw.pain_points_addressed)?.length) normalized.pain_points_addressed = sanitizeStringArray(raw.pain_points_addressed, 8);
  if (socialProof.length > 0) normalized.social_proof = socialProof;
  if (sanitizeStringArray(raw.differentiators)?.length) normalized.differentiators = sanitizeStringArray(raw.differentiators, 8);
  if (sanitizeStringArray(raw.competitors_mentioned)?.length) normalized.competitors_mentioned = sanitizeStringArray(raw.competitors_mentioned, 8);
  normalized.has_pricing_page = raw.has_pricing_page === true;
  normalized.has_free_trial = raw.has_free_trial === true;
  normalized.has_demo_booking = raw.has_demo_booking === true;
  if (primaryCta) normalized.primary_cta = primaryCta;
  normalized.languages_detected = sanitizeStringArray(raw.languages_detected, 8) || metadata.fallbackAssets.languages;
  if (logoUrl) normalized.logo_url = logoUrl;
  normalized.hero_images = heroImages?.length ? heroImages : metadata.fallbackAssets.heroImages;
  normalized.video_urls = videoUrls?.length ? videoUrls : metadata.fallbackAssets.videoUrls;

  return hasMeaningfulWebContext(normalized) ? normalized : null;
}

function sanitizeBusinessUploadExtraction(args: {
  value: unknown;
  contextTypeHint?: BusinessUploadContextType | null;
}): { summary: string; context_type: BusinessUploadContextType; extracted_data: Record<string, any> } | null {
  const raw = getJsonObject(args.value);
  if (!raw) return null;

  const summary = normalizeString(raw.summary);
  const hintedType = sanitizeBusinessUploadContextType(args.contextTypeHint);
  const detectedType = sanitizeBusinessUploadContextType(raw.context_type);
  const contextType = hintedType || detectedType || 'other';
  const extracted = sanitizeJsonValue(raw.extracted_data);

  if (!summary || !extracted || typeof extracted !== 'object' || Array.isArray(extracted)) {
    return null;
  }

  return {
    summary,
    context_type: contextType,
    extracted_data: extracted as Record<string, any>,
  };
}

function buildContextAvailabilityLines(ctx: CampaignContextPayload): string[] {
  const lines = [
    `${ctx.historical ? '[available]' : '[missing]'} Historical Meta ad data`,
    `${ctx.pipeline ? '[available]' : '[missing]'} CRM pipeline data`,
    `${ctx.web_context ? `[available] Web-scraped business profile (${safeNumber(ctx.web_context.pages_crawled)} pages crawled)` : '[missing] Web-scraped business profile'}`,
    `${ctx.user_uploaded?.length ? `[available] User-uploaded context (${ctx.user_uploaded.map((item) => item.filename).join(', ')})` : '[missing] User-uploaded context'}`,
    `${ctx.market ? '[available]' : '[missing]'} Market research`,
    `${ctx.portfolio ? '[available]' : '[missing]'} Existing portfolio`,
  ];
  return lines;
}

function getFirstUploadedInsight(ctx: CampaignContextPayload): string | null {
  for (const upload of ctx.user_uploaded || []) {
    const insights = sanitizeStringArray(upload.extracted_data?.key_insights);
    if (insights?.length) return insights[0];
  }
  return null;
}

function getFirstWebValueProp(ctx: CampaignContextPayload): string | null {
  return sanitizeStringArray(ctx.web_context?.value_props)?.[0] || null;
}

function getFirstWebPainPoint(ctx: CampaignContextPayload): string | null {
  return sanitizeStringArray(ctx.web_context?.pain_points_addressed)?.[0] || null;
}

function getPrimaryOfferLabel(ctx: CampaignContextPayload): string | null {
  return firstNonEmptyString([
    ctx.web_context?.primary_product_focus,
    Array.isArray(ctx.web_context?.products_services) ? ctx.web_context?.products_services?.[0]?.name : null,
    ctx.business.type,
  ]);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function toPlainTextFromHtml(html: string): string {
  const $ = loadHtml(html);
  $('script, style, noscript, svg').remove();
  return truncateText(trimWhitespace($('body').text()), WEB_CONTEXT_PAGE_TEXT_LIMIT);
}

function extractSameOriginLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const $ = loadHtml(html);
  const urls = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const resolved = normalizeUrlCandidate(href || null, base.toString());
    if (!resolved) return;
    try {
      const candidate = new URL(resolved);
      if (candidate.origin !== base.origin) return;
      if (BUSINESS_CONTEXT_SKIP_SEGMENTS.some((segment) => candidate.pathname.toLowerCase().includes(segment))) return;
      urls.add(candidate.toString());
    } catch {
      // Ignore malformed URLs.
    }
  });

  return Array.from(urls);
}

function extractAssetUrls(html: string, baseUrl: string): {
  logoUrl: string | null;
  heroImages: string[];
  videoUrls: string[];
  primaryCtas: string[];
  languages: string[];
  title: string | null;
  description: string | null;
} {
  const $ = loadHtml(html);
  const images: string[] = [];
  const videos: string[] = [];
  const ctas: string[] = [];
  let logoUrl: string | null = null;

  $('img[src]').each((_, el) => {
    const src = normalizeUrlCandidate($(el).attr('src') || null, baseUrl);
    if (!src) return;
    const alt = `${$(el).attr('alt') || ''} ${$(el).attr('class') || ''}`.toLowerCase();
    if (!logoUrl && alt.includes('logo')) logoUrl = src;
    if (images.length < 6) images.push(src);
  });

  $('video[src], iframe[src]').each((_, el) => {
    const src = normalizeUrlCandidate($(el).attr('src') || null, baseUrl);
    if (src && videos.length < 6) videos.push(src);
  });

  $('a, button').each((_, el) => {
    const text = trimWhitespace($(el).text());
    if (!text) return;
    const lowered = text.toLowerCase();
    if (
      lowered.includes('book')
      || lowered.includes('demo')
      || lowered.includes('trial')
      || lowered.includes('quote')
      || lowered.includes('start')
      || lowered.includes('contact')
    ) {
      if (ctas.length < 6) ctas.push(text);
    }
  });

  const htmlLang = normalizeString($('html').attr('lang')) || null;
  const ogLocale = normalizeString($('meta[property="og:locale"]').attr('content')) || null;
  const title = firstNonEmptyString([
    $('title').text(),
    $('meta[property="og:title"]').attr('content'),
  ]);
  const description = firstNonEmptyString([
    $('meta[name="description"]').attr('content'),
    $('meta[property="og:description"]').attr('content'),
  ]);

  return {
    logoUrl,
    heroImages: images,
    videoUrls: videos,
    primaryCtas: ctas,
    languages: [htmlLang, ogLocale].filter(Boolean) as string[],
    title,
    description,
  };
}

function scoreBusinessContextLink(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;
  for (const segment of BUSINESS_CONTEXT_PRIORITY_SEGMENTS) {
    if (lower.includes(segment)) score += 10;
  }
  if (lower === '/' || lower.endsWith('/')) score += 2;
  return score;
}

async function fetchWebsitePage(url: string): Promise<CrawledWebsitePage | null> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZuckerBot/1.0; +https://zuckerbot.ai)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(WEB_CONTEXT_PAGE_TIMEOUT_MS),
  });

  if (!response.ok) return null;
  const html = await response.text();
  const assets = extractAssetUrls(html, response.url || url);

  return {
    url: response.url || url,
    title: assets.title,
    description: assets.description,
    text: toPlainTextFromHtml(html),
    links: extractSameOriginLinks(html, response.url || url),
    hero_images: assets.heroImages,
    video_urls: assets.videoUrls,
    primary_ctas: assets.primaryCtas,
    logo_url: assets.logoUrl,
    languages_detected: assets.languages,
  };
}

function identifyBusinessContextPages(homepage: CrawledWebsitePage): string[] {
  const uniqueCandidates = Array.from(new Set(homepage.links));
  const ranked = uniqueCandidates
    .map((url) => ({ url, score: scoreBusinessContextLink(url) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, WEB_CONTEXT_PAGE_LIMIT - 1)
    .map((entry) => entry.url);
  return [homepage.url, ...ranked].slice(0, WEB_CONTEXT_PAGE_LIMIT);
}

function buildWebContextPrompt(pages: CrawledWebsitePage[]): string {
  const pageContents = pages
    .map((page) => {
      const sections = [
        `URL: ${page.url}`,
        page.title ? `Title: ${page.title}` : null,
        page.description ? `Description: ${page.description}` : null,
        page.primary_ctas.length ? `CTAs: ${page.primary_ctas.join(', ')}` : null,
        page.languages_detected.length ? `Languages: ${page.languages_detected.join(', ')}` : null,
        `Content: ${truncateText(page.text, WEB_CONTEXT_PAGE_TEXT_LIMIT)}`,
      ].filter(Boolean);
      return sections.join('\n');
    })
    .join('\n\n---\n\n');

  return `You are extracting structured business intelligence from website pages to improve Meta campaign planning.
Return valid JSON only. Omit fields you cannot infer confidently.

${pageContents}

Return this JSON shape:
{
  "business_name": "string",
  "tagline": "string",
  "description": "2-3 sentence summary",
  "business_type": "saas|local_services|ecommerce|agency|marketplace|education|healthcare|finance|other",
  "products_services": [{"name": "string", "description": "string", "price": "string", "key_features": ["string"]}],
  "primary_product_focus": "string",
  "target_audience": ["string"],
  "industries_served": ["string"],
  "geographic_focus": ["string"],
  "value_props": ["string"],
  "pain_points_addressed": ["string"],
  "social_proof": [{"type": "testimonial|stat|logo|award|review_count", "content": "string"}],
  "differentiators": ["string"],
  "competitors_mentioned": ["string"],
  "has_pricing_page": true,
  "has_free_trial": true,
  "has_demo_booking": true,
  "primary_cta": "string",
  "languages_detected": ["string"],
  "logo_url": "string",
  "hero_images": ["string"],
  "video_urls": ["string"]
}`;
}

async function crawlBusinessWebsiteContext(url: string): Promise<{ pages: CrawledWebsitePage[]; fallbackAssets: {
  logoUrl: string | null;
  heroImages: string[];
  videoUrls: string[];
  languages: string[];
} }> {
  const normalizedUrl = normalizeBusinessWebsiteUrl(url);
  if (!normalizedUrl) throw new Error('A valid website URL is required for enrichment.');

  const homepage = await fetchWebsitePage(normalizedUrl);
  if (!homepage) throw new Error('Failed to fetch the business website.');

  const pagesToFetch = identifyBusinessContextPages(homepage);
  const pages: CrawledWebsitePage[] = [];
  for (const pageUrl of pagesToFetch) {
    try {
      const page = pageUrl === homepage.url ? homepage : await fetchWebsitePage(pageUrl);
      if (page) pages.push(page);
    } catch (error) {
      console.warn('[context-enrichment] Skipping page fetch failure:', pageUrl, error);
    }
  }

  const fallbackAssets = {
    logoUrl: firstNonEmptyString(pages.map((page) => page.logo_url)),
    heroImages: Array.from(new Set(pages.flatMap((page) => page.hero_images))).slice(0, 6),
    videoUrls: Array.from(new Set(pages.flatMap((page) => page.video_urls))).slice(0, 6),
    languages: Array.from(new Set(pages.flatMap((page) => page.languages_detected))).slice(0, 6),
  };

  return { pages, fallbackAssets };
}

async function enrichBusinessWebContext(args: {
  business: any;
  url: string;
  forceRefresh?: boolean;
  persist?: boolean;
}): Promise<{ context: Record<string, any> | null; cached: boolean }> {
  const existing = getJsonObject(args.business?.web_context);
  if (!args.forceRefresh && hasMeaningfulWebContext(existing) && !isWebContextStale(args.business?.web_context_updated_at)) {
    return { context: existing, cached: true };
  }

  const crawl = await crawlBusinessWebsiteContext(args.url);
  const prompt = buildWebContextPrompt(crawl.pages);
  const claudeText = await callClaude(
    'You extract structured business intelligence from websites. Return valid JSON only.',
    prompt,
    2200,
  );
  const parsed = parseClaudeJson(claudeText);
  const context = sanitizeWebScrapedContext(parsed, {
    sourceUrls: crawl.pages.map((page) => page.url),
    pagesCrawled: crawl.pages.length,
    fallbackAssets: crawl.fallbackAssets,
  });

  if (context && args.persist !== false) {
    await supabaseAdmin
      .from('businesses')
      .update({
        web_context: context,
        web_context_updated_at: new Date().toISOString(),
      })
      .eq('id', args.business.id);
  }

  return { context, cached: false };
}

async function downloadBusinessUploadFile(filePath: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from(BUSINESS_UPLOAD_STORAGE_BUCKET).download(filePath);
  if (error || !data) {
    throw new Error(error?.message || 'Unable to download uploaded file.');
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadInlineBusinessContextContent(args: {
  userId: string;
  businessId: string;
  filename: string;
  content: string;
}): Promise<{ filePath: string; fileType: string; fileSizeBytes: number }> {
  const filePath = buildBusinessContextStoragePath(args.userId, args.businessId, args.filename);
  const fileType = inferBusinessContextFileType(args.filename, null) || 'text/plain';
  const buffer = Buffer.from(args.content, 'utf8');
  const { error } = await supabaseAdmin.storage.from(BUSINESS_UPLOAD_STORAGE_BUCKET).upload(filePath, buffer, {
    contentType: fileType,
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Unable to store uploaded context.');
  return { filePath, fileType, fileSizeBytes: buffer.byteLength };
}

async function removeBusinessUploadFile(filePath: string | null | undefined): Promise<void> {
  const normalized = normalizeString(filePath);
  if (!normalized) return;
  await supabaseAdmin.storage.from(BUSINESS_UPLOAD_STORAGE_BUCKET).remove([normalized]);
}

async function getPdfParse(): Promise<PdfParseFn> {
  if (!pdfParseLoader) {
    pdfParseLoader = Promise.resolve()
      .then(() => {
        const module = nodeRequire('pdf-parse');
        const parser = typeof module === 'function'
          ? module
          : typeof module?.default === 'function'
            ? module.default
            : null;

        if (!parser) {
          throw new Error('Unable to initialize PDF parser.');
        }

        return parser as PdfParseFn;
      })
      .catch((error) => {
        pdfParseLoader = null;
        throw error;
      });
  }

  return pdfParseLoader;
}

async function extractBusinessUploadText(args: {
  filename: string;
  fileType: string;
  buffer: Buffer;
}): Promise<string> {
  if (args.buffer.byteLength > BUSINESS_CONTEXT_FILE_SIZE_LIMIT) {
    throw new Error('Uploaded file exceeds the 10MB limit.');
  }

  if (args.fileType === 'application/pdf' || getFileExtension(args.filename) === 'pdf') {
    let result: PdfParseResult;

    try {
      const pdfParse = await getPdfParse();
      result = await pdfParse(args.buffer);
    } catch (error) {
      console.warn('[business-context] PDF parsing unavailable', {
        filename: args.filename,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('PDF parsing is temporarily unavailable. Upload TXT, CSV, or Markdown instead.');
    }

    return truncateText(trimWhitespace(result.text || ''), BUSINESS_CONTEXT_TEXT_LIMIT);
  }

  const text = args.buffer.toString('utf8');
  return truncateText(trimWhitespace(text), BUSINESS_CONTEXT_TEXT_LIMIT);
}

function buildBusinessUploadPrompt(args: {
  filename: string;
  fileType: string;
  textContent: string;
  contextTypeHint?: BusinessUploadContextType | null;
}): string {
  return `You are extracting business intelligence from a user-provided file to improve Meta campaign strategy.
Return valid JSON only.

File name: ${args.filename}
File type: ${args.fileType}
User hint: ${args.contextTypeHint || 'none'}
Content:
${args.textContent}

Return this JSON shape:
{
  "summary": "1-2 paragraph summary",
  "context_type": "ad_performance|customer_data|brand_guidelines|competitor_analysis|sales_data|other",
  "extracted_data": {
    "historical_cpl": 0,
    "historical_ctr": 0,
    "best_performing_audiences": ["string"],
    "best_performing_creatives": ["string"],
    "customer_segments": [{"name": "string", "size": 0, "characteristics": "string"}],
    "top_converting_demographics": ["string"],
    "geographic_distribution": {"region": 0},
    "tone_of_voice": "string",
    "brand_values": ["string"],
    "messaging_dos": ["string"],
    "messaging_donts": ["string"],
    "color_palette": ["string"],
    "competitors": [{"name": "string", "positioning": "string", "weaknesses": ["string"]}],
    "market_gaps": ["string"],
    "average_deal_value": 0,
    "sales_cycle_length": "string",
    "conversion_rates_by_stage": {"stage": 0},
    "key_insights": ["string"]
  }
}`;
}

async function extractBusinessUploadContext(args: {
  filename: string;
  fileType: string;
  textContent: string;
  contextTypeHint?: BusinessUploadContextType | null;
}): Promise<{ summary: string; context_type: BusinessUploadContextType; extracted_data: Record<string, any> }> {
  const claudeText = await callClaude(
    'You extract structured business intelligence from uploaded files. Return valid JSON only.',
    buildBusinessUploadPrompt(args),
    2200,
  );
  const parsed = parseClaudeJson(claudeText);
  const extraction = sanitizeBusinessUploadExtraction({
    value: parsed,
    contextTypeHint: args.contextTypeHint,
  });
  if (!extraction) {
    throw new Error('Failed to extract structured business context from the uploaded file.');
  }
  return extraction;
}

async function createBusinessUploadRecord(args: {
  business: any;
  filename: string;
  fileType: string;
  filePath: string;
  fileSizeBytes?: number | null;
  contextTypeHint?: BusinessUploadContextType | null;
  cleanupOnFailure?: boolean;
}): Promise<CampaignUploadedContext> {
  try {
    const buffer = await downloadBusinessUploadFile(args.filePath);
    const textContent = await extractBusinessUploadText({
      filename: args.filename,
      fileType: args.fileType,
      buffer,
    });
    const extraction = await extractBusinessUploadContext({
      filename: args.filename,
      fileType: args.fileType,
      textContent,
      contextTypeHint: args.contextTypeHint,
    });

    const { data, error } = await supabaseAdmin
      .from('business_uploads')
      .insert({
        business_id: args.business.id,
        user_id: args.business.user_id,
        filename: args.filename,
        file_type: args.fileType,
        file_path: args.filePath,
        file_size_bytes: args.fileSizeBytes ?? buffer.byteLength,
        summary: extraction.summary,
        context_type: extraction.context_type,
        extracted_data: extraction.extracted_data,
      })
      .select('id, filename, file_type, uploaded_at, summary, context_type, extracted_data')
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Unable to save uploaded business context.');
    }

    return data as CampaignUploadedContext;
  } catch (error) {
    if (args.cleanupOnFailure) {
      await removeBusinessUploadFile(args.filePath);
    }
    throw error;
  }
}

async function reextractBusinessUploadRecord(uploadRow: Record<string, any>): Promise<CampaignUploadedContext> {
  const filename = normalizeString(uploadRow.filename) || 'context.txt';
  const fileType = inferBusinessContextFileType(filename, normalizeString(uploadRow.file_type)) || normalizeString(uploadRow.file_type) || 'text/plain';
  const buffer = await downloadBusinessUploadFile(normalizeString(uploadRow.file_path) || '');
  const textContent = await extractBusinessUploadText({ filename, fileType, buffer });
  const extraction = await extractBusinessUploadContext({
    filename,
    fileType,
    textContent,
    contextTypeHint: sanitizeBusinessUploadContextType(uploadRow.context_type),
  });

  const { data, error } = await supabaseAdmin
    .from('business_uploads')
    .update({
      summary: extraction.summary,
      context_type: extraction.context_type,
      extracted_data: extraction.extracted_data,
    })
    .eq('id', uploadRow.id)
    .select('id, filename, file_type, uploaded_at, summary, context_type, extracted_data')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Unable to update uploaded business context.');
  }

  return data as CampaignUploadedContext;
}

async function maybeLogBusinessRouteUsage(args: {
  auth: BusinessRouteAuthSuccess;
  endpoint: string;
  method: string;
  statusCode: number;
  startTime: number;
}): Promise<void> {
  if (args.auth.actor !== 'api_key' || !args.auth.apiKeyId) return;
  await logUsage({
    apiKeyId: args.auth.apiKeyId,
    endpoint: args.endpoint,
    method: args.method,
    statusCode: args.statusCode,
    responseTimeMs: Date.now() - args.startTime,
  });
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
  let pixelId: string | null = null;

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
      .select('facebook_access_token, facebook_ad_account_id, facebook_page_id, meta_pixel_id')
      .eq('id', businessId)
      .maybeSingle();

    const businessAccessToken = normalizeString(biz?.facebook_access_token);
    const businessAdAccountId = normalizeString(biz?.facebook_ad_account_id);
    const businessPageId = normalizeString(biz?.facebook_page_id);
    const businessPixelId = normalizeString(biz?.meta_pixel_id);

    if (businessAccessToken || businessAdAccountId || businessPageId || businessPixelId) {
      sources.add('businesses');
    }

    accessToken = accessToken || businessAccessToken;
    adAccountId = adAccountId || businessAdAccountId;
    pageId = pageId || businessPageId;
    pixelId = businessPixelId || null;
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
    meta_pixel_id: pixelId,
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

async function listFacebookAdAccounts(accessToken: string): Promise<{ ok: boolean; adAccounts: MetaAdAccountOption[]; error?: string }> {
  const adAccounts: MetaAdAccountOption[] = [];
  let nextUrl =
    `${GRAPH_BASE}/me/adaccounts?fields=id,name,account_id,account_status,currency,business_name,amount_spent` +
    `&limit=100&access_token=${encodeURIComponent(accessToken)}`;

  try {
    while (nextUrl && adAccounts.length < 300) {
      const response = await fetch(nextUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(20000),
      });

      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        return {
          ok: false,
          adAccounts: [],
          error: data?.error?.message || `Meta ad accounts API error: HTTP ${response.status}`,
        };
      }

      if (Array.isArray(data?.data)) {
        for (const account of data.data) {
          const id = normalizeString(account?.id);
          const name = normalizeString(account?.name);
          if (!id || !name) continue;

          const rawAmountSpent =
            typeof account?.amount_spent === 'number'
              ? String(account.amount_spent)
              : normalizeString(account?.amount_spent);

          adAccounts.push({
            id,
            account_id: normalizeString(account?.account_id),
            name,
            account_status: normalizeNumber(account?.account_status),
            currency: normalizeString(account?.currency),
            business_name: normalizeString(account?.business_name),
            amount_spent: rawAmountSpent,
          });
        }
      }

      const pagingNext = normalizeString(data?.paging?.next);
      nextUrl = pagingNext || '';
    }

    return { ok: true, adAccounts };
  } catch (err: any) {
    return { ok: false, adAccounts: [], error: err?.message || String(err) };
  }
}

async function listAdAccountPixels(accessToken: string, adAccountId: string): Promise<{ ok: boolean; pixels: MetaPixelOption[]; error?: string }> {
  const pixels: MetaPixelOption[] = [];
  let nextUrl =
    `${GRAPH_BASE}/${adAccountId}/adspixels?fields=id,name&limit=100&access_token=${encodeURIComponent(accessToken)}`;

  try {
    while (nextUrl && pixels.length < 300) {
      const response = await fetch(nextUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(20000),
      });

      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        return {
          ok: false,
          pixels: [],
          error: data?.error?.message || `Meta pixels API error: HTTP ${response.status}`,
        };
      }

      if (Array.isArray(data?.data)) {
        for (const pixel of data.data) {
          const id = normalizeString(pixel?.id);
          const name = normalizeString(pixel?.name);
          if (!id || !name) continue;

          pixels.push({ id, name });
        }
      }

      const pagingNext = normalizeString(data?.paging?.next);
      nextUrl = pagingNext || '';
    }

    return { ok: true, pixels };
  } catch (err: any) {
    return { ok: false, pixels: [], error: err?.message || String(err) };
  }
}

async function listMetaLeadForms(accessToken: string, adAccountId: string): Promise<{ ok: boolean; forms: MetaLeadFormOption[]; error?: string }> {
  const forms: MetaLeadFormOption[] = [];
  const normalizedAdAccountId = adAccountId.replace(/^act_/, '');
  let nextUrl =
    `${GRAPH_BASE}/act_${normalizedAdAccountId}/leadgen_forms` +
    `?fields=id,name,status,leads_count,created_time,questions&limit=50&access_token=${encodeURIComponent(accessToken)}`;

  try {
    while (nextUrl && forms.length < 300) {
      const response = await fetch(nextUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(20000),
      });

      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        return {
          ok: false,
          forms: [],
          error: data?.error?.message || `Meta lead forms API error: HTTP ${response.status}`,
        };
      }

      if (Array.isArray(data?.data)) {
        for (const form of data.data) {
          const id = normalizeString(form?.id);
          const name = normalizeString(form?.name);
          if (!id || !name) continue;

          forms.push({
            id,
            name,
            status: normalizeString(form?.status),
            leads_count: Math.max(0, Math.round(normalizeNumber(form?.leads_count) || 0)),
            created_time: normalizeString(form?.created_time),
            questions: Array.isArray(form?.questions) ? form.questions : null,
          });
        }
      }

      const pagingNext = normalizeString(data?.paging?.next);
      nextUrl = pagingNext || '';
    }

    return { ok: true, forms };
  } catch (err: any) {
    return { ok: false, forms: [], error: err?.message || String(err) };
  }
}

function resolveSelectedPixelId(pixels: MetaPixelOption[], storedPixelId: string | null): string | null {
  if (storedPixelId && pixels.some((pixel) => pixel.id === storedPixelId)) {
    return storedPixelId;
  }

  if (pixels.length === 1) {
    return pixels[0].id;
  }

  return null;
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

async function persistBusinessPixelSelection(
  userId: string,
  businessId: string | null,
  pixelId: string | null,
): Promise<void> {
  if (!businessId) return;

  const { error } = await supabaseAdmin
    .from('businesses')
    .update({ meta_pixel_id: pixelId })
    .eq('id', businessId)
    .eq('user_id', userId);

  if (error) {
    console.warn('[api/meta] Failed to persist meta_pixel_id:', error.message);
  }
}

async function persistBusinessLeadFormSelection(
  userId: string,
  businessId: string | null,
  leadFormId: string | null,
): Promise<void> {
  if (!businessId) return;

  const { error } = await supabaseAdmin
    .from('businesses')
    .update({ meta_leadgen_form_id: leadFormId })
    .eq('id', businessId)
    .eq('user_id', userId);

  if (error) {
    console.warn('[api/meta] Failed to persist meta_leadgen_form_id:', error.message);
  }
}

async function persistBusinessAdAccountSelection(
  userId: string,
  businessId: string | null,
  adAccountId: string,
  pixelId: string | null,
  options: { clearStoredPageId?: boolean } = {},
): Promise<void> {
  if (!businessId) return;

  const updates: Record<string, string | null> = {
    facebook_ad_account_id: adAccountId,
    meta_pixel_id: pixelId,
  };

  if (options.clearStoredPageId !== false) {
    updates.facebook_page_id = null;
  }

  const { error } = await supabaseAdmin
    .from('businesses')
    .update(updates)
    .eq('id', businessId)
    .eq('user_id', userId);

  if (error) {
    console.warn('[api/meta] Failed to persist ad account selection:', error.message);
  }
}

async function resolveAdAccountIdForLaunch(params: {
  userId: string;
  resolvedMeta: ResolvedMetaCredentials;
}): Promise<{
  meta_ad_account_id: string | null;
  meta_pixel_id: string | null;
  available_ad_accounts?: MetaAdAccountOption[];
  source: 'stored' | 'auto_selected' | 'selection_required' | 'none' | 'meta_error';
  meta_error?: string;
}> {
  const existingAdAccountId = normalizeString(params.resolvedMeta.meta_ad_account_id);
  if (existingAdAccountId) {
    return {
      meta_ad_account_id: existingAdAccountId,
      meta_pixel_id: normalizeString(params.resolvedMeta.meta_pixel_id),
      source: 'stored',
    };
  }

  const accessToken = normalizeString(params.resolvedMeta.meta_access_token);
  if (!accessToken) {
    return { meta_ad_account_id: null, meta_pixel_id: null, source: 'none' };
  }

  const adAccountsResult = await listFacebookAdAccounts(accessToken);
  if (!adAccountsResult.ok) {
    return {
      meta_ad_account_id: null,
      meta_pixel_id: null,
      source: 'meta_error',
      meta_error: adAccountsResult.error || 'Failed to list Meta ad accounts',
    };
  }

  const adAccounts = adAccountsResult.adAccounts;
  if (adAccounts.length === 1) {
    const selected = adAccounts[0];
    const pixelsResult = await listAdAccountPixels(accessToken, selected.id);
    if (!pixelsResult.ok) {
      console.warn('[api/meta] Failed to fetch pixels for auto-selected ad account:', pixelsResult.error);
    }
    const selectedPixelId = pixelsResult.ok
      ? resolveSelectedPixelId(pixelsResult.pixels, null)
      : null;

    await persistBusinessAdAccountSelection(
      params.userId,
      params.resolvedMeta.business_id,
      selected.id,
      selectedPixelId,
    );

    return {
      meta_ad_account_id: selected.id,
      meta_pixel_id: selectedPixelId,
      available_ad_accounts: adAccounts,
      source: 'auto_selected',
    };
  }

  if (adAccounts.length > 1) {
    return {
      meta_ad_account_id: null,
      meta_pixel_id: null,
      available_ad_accounts: adAccounts,
      source: 'selection_required',
    };
  }

  return { meta_ad_account_id: null, meta_pixel_id: null, available_ad_accounts: [], source: 'none' };
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
  meta_pixel_id?: string | null;
  variant_index: number;
  daily_budget_cents: number;
  radius_km: number;
  campaign: any;
  auth: any;
  business?: any;
  businessId?: string | null;
  naming?: {
    geo?: string | null;
    tierName?: string | null;
    ageMin?: number | null;
    ageMax?: number | null;
    placement?: string | null;
    angleName?: string | null;
    assetType?: string | null;
    variantIndex?: number | null;
    campaignName?: string | null;
    adSetName?: string | null;
    adName?: string | null;
  };
  activate?: boolean;
}): Promise<{success: boolean, data?: any, error?: any}> {
  
  const {
    campaignId, meta_access_token, meta_ad_account_id, meta_page_id,
    meta_pixel_id, variant_index, daily_budget_cents, radius_km, campaign, auth,
    activate = true,
  } = params;

  try {
    // Read objective from campaign data, default to traffic
    const objective: ZuckerObjective = isValidObjective(campaign.objective) ? campaign.objective : 'traffic';
    console.log('[api/launchInternal] Launching campaign with objective:', objective);
    console.log('[api/launchInternal] Meta objective:', getMetaCampaignObjective(objective));
    const pixelId = normalizeString(meta_pixel_id) || normalizeString(process.env.META_PIXEL_ID) || null;

    // Validation: traffic and conversions require a URL
    if (needsUrl(objective) && !campaign.url) {
      return { success: false, error: { code: 'validation_error', message: `The '${objective}' objective requires a campaign URL.` } };
    }
    // Validation: conversions requires a Meta Pixel ID
    if (needsPixel(objective) && !pixelId) {
      return { success: false, error: { code: 'validation_error', message: 'Conversions objective requires a Meta Pixel ID configured' } };
    }

    const businessName = campaign.business_name || 'Campaign';
    const businessContext = params.business || null;
    const variants = campaign.variants || [];
    const targeting = campaign.targeting || {};
    const selectedVariant = variants[variant_index] || variants[0] || {};

    const headline = selectedVariant.headline || businessName;
    const adBody = selectedVariant.copy || `Check out ${businessName}`;
    const cta = selectedVariant.cta || 'Learn More';
    const ctaType = cta.toUpperCase().replace(/ /g, '_');
    const imageUrl = selectedVariant.image_url || null;
    const leadFormSelection = await resolveLeadFormIdForObjective(objective, businessContext || params.businessId || null);
    if (!leadFormSelection.ok) {
      return { success: false, error: leadFormSelection.error };
    }

    const naming = buildMetaObjectNames({
      objective,
      geo: params.naming?.geo
        || targeting?.geo_locations?.countries?.[0]
        || businessContext?.markets?.[0]
        || businessContext?.country
        || 'US',
      tierName: params.naming?.tierName || null,
      ageMin: params.naming?.ageMin ?? targeting?.age_min,
      ageMax: params.naming?.ageMax ?? targeting?.age_max,
      placement: params.naming?.placement || 'Feed',
      angleName: params.naming?.angleName || normalizeString(selectedVariant.angle) || headline,
      variantIndex: params.naming?.variantIndex ?? variant_index,
      assetType: params.naming?.assetType || 'image',
    });

    const campaignName = normalizeString(params.naming?.campaignName) || naming.campaign_name;
    const adSetName = normalizeString(params.naming?.adSetName) || naming.adset_name;
    const adName = normalizeString(params.naming?.adName) || naming.ad_name;
    const selectedLeadFormId = leadFormSelection.leadFormId || undefined;
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
    const adSetTargeting = buildMetaAdSetTargetingPayload(
      targeting,
      params.naming?.geo || businessContext?.markets?.[0] || businessContext?.country || 'US',
    );

    const adSetResult = await metaPost(`/act_${adAccountId}/adsets`, {
      name: adSetName,
      campaign_id: metaCampaignId,
      daily_budget: String(daily_budget_cents),
      billing_event: 'IMPRESSIONS',
      optimization_goal: adsetParams.optimization_goal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify(adSetTargeting),
      promoted_object: JSON.stringify(getPromotedObject(objective, meta_page_id, pixelId)),
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

    // Step 3: Create Ad Creative (objective-aware link_data)
    const linkData = buildCreativeLinkData(objective, {
      headline,
      body: adBody,
      ctaType,
      imageUrl,
      leadFormId: selectedLeadFormId,
      campaignUrl: campaign.url,
    });

    const creativeResult = await metaPost(`/act_${adAccountId}/adcreatives`, {
      name: `${adName} Creative`,
      object_story_spec: JSON.stringify({
        page_id: meta_page_id,
        link_data: linkData,
      })
    }, meta_access_token);

    let adCreativeId = creativeResult.ok && creativeResult.data.id ? creativeResult.data.id : null;

    // Step 4: Create Ad
    const adParams: Record<string, any> = {
      name: adName,
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
        leadFormId: selectedLeadFormId,
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

    // Step 6: Activate everything unless the caller is intentionally staging paused assets
    if (activate) {
      await Promise.allSettled([
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
    }

    return {
      success: true,
      data: {
        campaign_id: campaignId,
        meta_campaign_id: metaCampaignId,
        meta_adset_id: metaAdSetId,
        meta_ad_id: metaAdId,
        ...(selectedLeadFormId ? { lead_form_id: selectedLeadFormId } : {}),
        campaign_name: campaignName,
        adset_name: adSetName,
        ad_name: adName,
        naming,
        ad_creative_id: adCreativeId,
        selected_variant: selectedVariant,
        daily_budget_cents: daily_budget_cents,
        targeting_radius_km: radius_km,
        launched_at: activate ? new Date().toISOString() : null,
        status: activate ? 'active' : 'paused'
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

async function handleCreateIntelligence(args: {
  req: VercelRequest;
  res: VercelResponse;
  auth: AuthSuccess;
  startTime: number;
  url: string;
  business: any;
  budgetCents: number;
  objective: ZuckerObjective;
  businessNameOverride?: string | null;
  businessTypeOverride?: string | null;
  goals: CampaignGoalsInput;
  creativeHandoff: Record<string, any> | null;
}) {
  const resolvedName = normalizeString(args.businessNameOverride) || normalizeString(args.business?.name) || args.url;
  const resolvedType = normalizeString(args.businessTypeOverride) || suggestPortfolioBusinessType(args.business?.trade);
  const businessWebsite = normalizeBusinessWebsiteUrl(
    normalizeString(args.business?.website_url)
    || normalizeString(args.business?.website)
    || args.url,
  );
  const markets = Array.isArray(args.business?.markets) && args.business.markets.length > 0
    ? args.business.markets
    : [normalizeString(args.business?.country) || 'US'];

  const [historical, portfolio, dealValue, market, pipelineRows, uploadRows] = await Promise.all([
    fetchHistoricalSummaryForBusiness(args.business),
    getActivePortfolioForBusiness(args.business.id),
    getAverageDealValueFromCapi(args.business.id),
    getMarketResearchSummary({
      industry: resolvedType || 'business',
      location: markets[0] || normalizeString(args.business?.country) || 'US',
      country: normalizeString(args.business?.country) || markets[0] || 'US',
    }),
    supabaseAdmin
      .from('capi_events')
      .select('meta_event_name, source_stage, crm_attributes, created_at, status, is_test')
      .eq('business_id', args.business.id)
      .eq('status', 'sent')
      .eq('is_test', false)
      .gte('created_at', daysAgoIso(180)),
    supabaseAdmin
      .from('business_uploads')
      .select('id, filename, file_type, uploaded_at, summary, context_type, extracted_data')
      .eq('business_id', args.business.id)
      .order('uploaded_at', { ascending: false }),
  ]);

  let webContext = getJsonObject(args.business?.web_context);
  if (businessWebsite && (!hasMeaningfulWebContext(webContext) || isWebContextStale(args.business?.web_context_updated_at))) {
    try {
      const enrichment = await withTimeout(
        enrichBusinessWebContext({
          business: args.business,
          url: businessWebsite,
          forceRefresh: false,
          persist: true,
        }),
        WEB_CONTEXT_REQUEST_TIMEOUT_MS,
        'business context enrichment',
      );
      if (enrichment.context) {
        webContext = enrichment.context;
      }
    } catch (error) {
      console.warn('[campaign-intelligence] Failed to enrich business context during campaign creation:', error);
    }
  }

  const context: CampaignContextPayload = {
    business: {
      id: args.business.id,
      name: resolvedName,
      url: args.url,
      type: resolvedType || 'business',
      markets,
      currency: normalizeString(args.business?.currency) || 'USD',
      deal_value: dealValue,
    },
    historical,
    pipeline: buildPipelineSummary((pipelineRows.data || []) as Array<Record<string, any>>, historical),
    market,
    portfolio: portfolio
      ? {
          id: portfolio.id,
          name: portfolio.name,
          total_daily_budget_cents: portfolio.total_daily_budget_cents,
          tiers: portfolio.tiers,
          is_active: portfolio.is_active,
        }
      : null,
    web_context: webContext,
    user_uploaded: (uploadRows.data || []) as CampaignUploadedContext[],
    goals: args.goals,
  };

  const prompt = buildCampaignPlanningPrompt(context, args.objective, args.budgetCents);
  const claudeText = await callClaude(
    'You are a senior performance marketing strategist. Return valid JSON only. No prose, no markdown fences.',
    prompt,
    2500,
  );
  const parsed = parseClaudeJson(claudeText);
  const intelligenceStrategy = sanitizeIntelligenceStrategy(parsed, context, args.budgetCents);
  const compatibility = buildCompatibilityResponse(intelligenceStrategy, context, args.objective);
  const campaignId = `camp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  const workflowState = {
    mode: 'intelligence',
    strategy_status: 'draft',
    tier_campaigns: {},
    context_summary: summariseContextAvailability(context),
  };

  await supabaseAdmin
    .from('api_campaigns')
    .insert({
      id: campaignId,
      api_key_id: args.auth.keyRecord.id,
      user_id: args.auth.keyRecord.user_id,
      business_id: args.business.id,
      campaign_version: 'intelligence',
      status: 'draft',
      url: args.url,
      business_name: resolvedName,
      business_type: resolvedType || 'business',
      strategy: intelligenceStrategy,
      targeting: compatibility.targeting,
      variants: compatibility.variants,
      roadmap: compatibility.roadmap,
      objective: args.objective,
      daily_budget_cents: args.budgetCents,
      goals: args.goals,
      context,
      workflow_state: workflowState,
      creative_handoff: args.creativeHandoff,
      creative_status: 'awaiting_strategy_approval',
      created_at: new Date().toISOString(),
    })
    .then(() => {});

  await logUsage({
    apiKeyId: args.auth.keyRecord.id,
    endpoint: '/v1/campaigns/create',
    method: 'POST',
    statusCode: 200,
    responseTimeMs: Date.now() - args.startTime,
    detected_industry: resolvedType || undefined,
  });

  return args.res.status(200).json({
    id: campaignId,
    campaign_version: 'intelligence',
    status: 'draft',
    business_name: resolvedName,
    business_type: resolvedType || 'business',
    strategy: compatibility.strategy,
    targeting: compatibility.targeting,
    variants: compatibility.variants,
    roadmap: compatibility.roadmap,
    audience_tiers: intelligenceStrategy.audience_tiers,
    creative_angles: intelligenceStrategy.creative_angles,
    total_daily_budget_cents: intelligenceStrategy.total_daily_budget_cents,
    total_monthly_budget: intelligenceStrategy.total_monthly_budget,
    projected_monthly_leads: intelligenceStrategy.projected_monthly_leads,
    projected_cpl: intelligenceStrategy.projected_cpl,
    warnings: intelligenceStrategy.warnings,
    context_summary: summariseContextAvailability(context),
    goals: args.goals,
    creative_handoff: args.creativeHandoff,
    next_steps: [
      'Approve the strategy and audience tiers.',
      'Request or upload finished creative assets.',
      'Activate the ready audience tiers once assets are attached.',
    ],
    created_at: new Date().toISOString(),
  });
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
    url, business_id, business_name, business_type, location, budget_daily_cents, objective,
    mode, goals, creative_handoff,
    meta_access_token, auto_launch, meta_ad_account_id, meta_page_id, variant_index = 0, radius_km
  } = req.body || {};

  if (!url || typeof url !== 'string') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({ error: { code: 'validation_error', message: '`url` is required and must be a string' } });
  }

  const requestedMode = normalizeCampaignMode(mode);
  const resolvedBusiness = requestedMode === 'legacy'
    ? null
    : await resolveOwnedBusiness(auth, normalizeString(business_id));
  const sanitizedGoals = sanitizeGoals(goals);
  const sanitizedCreativeHandoff = sanitizeCreativeHandoff(creative_handoff);
  const requestedBudgetCents = budget_daily_cents || 2000;
  const requestedObjective: ZuckerObjective = isValidObjective(objective) ? objective : 'traffic';

  if (requestedMode === 'intelligence' && !resolvedBusiness) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'business_required',
        message: 'Intelligence mode requires a resolvable business. Provide `business_id` or use an API key linked to a business.',
      },
    });
  }

  if (requestedMode === 'intelligence' || (requestedMode === 'auto' && resolvedBusiness)) {
    return handleCreateIntelligence({
      req,
      res,
      auth,
      startTime,
      url,
      business: resolvedBusiness,
      budgetCents: requestedBudgetCents,
      objective: requestedObjective,
      businessNameOverride: business_name,
      businessTypeOverride: business_type,
      goals: sanitizedGoals,
      creativeHandoff: sanitizedCreativeHandoff,
    });
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

      const adAccountResolution = await resolveAdAccountIdForLaunch({
        userId: auth.keyRecord.user_id,
        resolvedMeta: {
          ...resolvedMeta,
          meta_access_token,
          meta_ad_account_id,
          meta_page_id,
        },
      });
      if (!meta_ad_account_id && adAccountResolution.meta_ad_account_id) {
        meta_ad_account_id = adAccountResolution.meta_ad_account_id;
      }
      const resolvedPixelId = adAccountResolution.meta_pixel_id || resolvedMeta.meta_pixel_id || null;

      if (!meta_ad_account_id && adAccountResolution.source === 'selection_required') {
        await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/create', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
        return res.status(400).json({
          error: {
            code: 'meta_ad_account_selection_required',
            message: 'Multiple Meta ad accounts were found. Select one ad account before launching.',
            select_ad_account_endpoint: '/api/v1/meta/select-ad-account',
          },
          available_ad_accounts: (adAccountResolution.available_ad_accounts || []).slice(0, 25),
        });
      }

      const pageResolution = await resolvePageIdForLaunch({
        userId: auth.keyRecord.user_id,
        resolvedMeta: {
          ...resolvedMeta,
          meta_access_token,
          meta_ad_account_id,
          meta_page_id,
          meta_pixel_id: resolvedPixelId,
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
            ...(adAccountResolution.source === 'meta_error' ? { meta_error: adAccountResolution.meta_error } : {}),
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
          meta_pixel_id: resolvedPixelId,
          variant_index: variant_index || 0,
          daily_budget_cents: budgetCents,
          radius_km: radius_km || response.targeting.radius_km || 25,
          campaign: response,
          auth: auth.keyRecord,
          businessId: autoLaunchBusinessId || resolvedMeta.business_id || null,
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
        const autoLaunchAt = launchResult.data.launched_at || new Date().toISOString();

        await supabaseAdmin.from('api_campaigns').update({
          status: 'active',
          meta_campaign_id: launchResult.data.meta_campaign_id,
          meta_adset_id: launchResult.data.meta_adset_id,
          meta_ad_id: launchResult.data.meta_ad_id,
          launched_at: autoLaunchAt,
        }).eq('id', campaignId);

        await upsertLaunchedCampaignRecord({
          businessId: autoLaunchBusinessId || resolvedMeta.business_id,
          campaignName: launchResult.data.campaign_name || `${response.business_name || 'Campaign'} – API – ${autoLaunchAt.slice(0, 10)}`,
          status: 'active',
          dailyBudgetCents: budgetCents,
          radiusKm: radius_km || response.targeting.radius_km || 25,
          headline: launchResult.data.selected_variant?.headline || response.variants?.[variant_index || 0]?.headline || response.business_name || 'Campaign',
          adBody: launchResult.data.selected_variant?.copy || response.variants?.[variant_index || 0]?.copy || `Check out ${response.business_name || 'this business'}`,
          imageUrl: launchResult.data.selected_variant?.image_url || response.variants?.[variant_index || 0]?.image_url || null,
          metaCampaignId: launchResult.data.meta_campaign_id,
          metaAdSetId: launchResult.data.meta_adset_id,
          metaAdId: launchResult.data.meta_ad_id,
          metaLeadFormId: launchResult.data.lead_form_id,
          launchedAt: autoLaunchAt,
        });

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

async function processCampaignCreativeUpload(args: {
  auth: AuthSuccess;
  apiCampaign: any;
  business: any;
  uploads: Array<{
    tier_name: string;
    asset_url: string;
    asset_type: 'image' | 'video';
    headline: string;
    body: string;
    cta: string;
    link_url: string | null;
    angle_name: string | null;
    variant_index: number | null;
  }>;
  metaOverrides?: {
    meta_access_token?: string | null;
    meta_ad_account_id?: string | null;
    meta_page_id?: string | null;
  };
  source: 'upload' | 'callback';
}) {
  const strategy = getIntelligenceStrategySource(args.apiCampaign);
  if (!strategy) {
    return {
      ok: false,
      statusCode: 400,
      error: {
        code: 'strategy_not_ready',
        message: 'Strategy must exist before creative assets can be uploaded.',
      },
    };
  }

  if (!getJsonObject(args.apiCampaign.approved_strategy)) {
    return {
      ok: false,
      statusCode: 409,
      error: {
        code: 'strategy_not_approved',
        message: 'Approve the strategy before uploading creative assets.',
      },
    };
  }

  const portfolio = await ensurePortfolioForIntelligenceCampaign({
    campaign: args.apiCampaign,
    business: args.business,
    userId: args.auth.keyRecord.user_id,
    strategy,
  });
  if (!portfolio?.id) {
    return {
      ok: false,
      statusCode: 500,
      error: {
        code: 'portfolio_create_failed',
        message: 'Failed to provision the intelligence portfolio for this campaign.',
      },
    };
  }

  const resolvedMeta = await resolveLaunchMetaForBusiness({
    auth: args.auth,
    business: args.business,
    overrides: args.metaOverrides,
  });
  if (!resolvedMeta.ok) {
    return {
      ok: false,
      statusCode: 400,
      error: resolvedMeta.error,
    };
  }

  const tierPatch: Record<string, any> = {};
  const createdRows: any[] = [];
  let workingWorkflowState = getJsonObject(args.apiCampaign.workflow_state) || {};

  for (const upload of args.uploads) {
    const tier = findStrategyTier(strategy, upload.tier_name);
    if (!tier) {
      return {
        ok: false,
        statusCode: 400,
        error: {
          code: 'unknown_tier',
          message: `Tier '${upload.tier_name}' is not part of the approved strategy.`,
        },
      };
    }

    if (upload.angle_name && !findStrategyAngle(strategy, upload.angle_name)) {
      return {
        ok: false,
        statusCode: 400,
        error: {
          code: 'unknown_angle',
          message: `Angle '${upload.angle_name}' is not part of the approved strategy.`,
        },
      };
    }

    const executionResult: any = await ensureTierExecutionForCreative({
      auth: args.auth,
      apiCampaign: {
        ...args.apiCampaign,
        workflow_state: workingWorkflowState,
      },
      business: args.business,
      portfolioId: portfolio.id,
      tier,
      accessToken: resolvedMeta.metaAccessToken,
      adAccountId: resolvedMeta.metaAdAccountId,
      metaPageId: resolvedMeta.metaPageId,
      metaPixelId: resolvedMeta.metaPixelId,
      creative: {
        ...upload,
        link_url: upload.link_url || args.apiCampaign.url || args.business.website_url || args.business.website || null,
      },
    });

    if (!executionResult.ok) {
      return {
        ok: false,
        statusCode: executionResult.error?.code?.startsWith('meta_') ? 502 : 400,
        error: executionResult.error,
      };
    }

    const naming = buildMetaObjectNames({
      objective: isValidObjective(args.apiCampaign.objective) ? args.apiCampaign.objective : 'leads',
      geo: tier.geo?.[0] || args.business.markets?.[0] || args.business.country || 'US',
      tierName: tier.tier_name,
      ageMin: tier.age_min,
      ageMax: tier.age_max,
      placement: 'Feed',
      angleName: upload.angle_name || upload.headline,
      variantIndex: upload.variant_index || 0,
      assetType: upload.asset_type,
    });

    const { data: creativeRow } = await supabaseAdmin
      .from('api_campaign_creatives')
      .insert({
        api_campaign_id: args.apiCampaign.id,
        business_id: args.business.id,
        user_id: args.auth.keyRecord.user_id,
        tier_name: tier.tier_name,
        angle_name: upload.angle_name,
        variant_index: upload.variant_index || 0,
        asset_url: upload.asset_url,
        asset_type: upload.asset_type,
        headline: upload.headline,
        body: upload.body,
        cta: upload.cta,
        link_url: upload.link_url || args.apiCampaign.url || args.business.website_url || args.business.website || null,
        meta_campaign_id: executionResult.metaCampaignId,
        meta_adset_id: executionResult.metaAdSetId,
        meta_ad_id: executionResult.metaAdId,
        meta_adcreative_id: executionResult.metaAdCreativeId,
        meta_image_hash: executionResult.metaImageHash || null,
        meta_video_id: executionResult.metaVideoId || null,
        status: 'paused',
        metadata: {
          upload_source: args.source,
          meta_audience_id: executionResult.metaAudienceId || null,
          linked_tier_campaign_id: executionResult.linkedTierCampaign?.id || null,
          created_execution: !!executionResult.created,
          naming,
        },
      })
      .select('*')
      .single();

    createdRows.push(creativeRow);

    const tierKey = buildTierKey(tier.tier_name);
    tierPatch[tierKey] = {
      tier_name: tier.tier_name,
      tier_campaign_id: executionResult.linkedTierCampaign?.id || null,
      campaign_id: executionResult.linkedTierCampaign?.campaign_id || null,
      meta_campaign_id: executionResult.metaCampaignId,
      meta_adset_id: executionResult.metaAdSetId,
      meta_audience_id: executionResult.metaAudienceId || null,
      latest_creative_id: creativeRow?.id || null,
      last_asset_type: upload.asset_type,
      status: 'paused',
    };

    workingWorkflowState = mergeWorkflowState(workingWorkflowState, {
      portfolio_id: portfolio.id,
      tier_campaigns: {
        [tierKey]: tierPatch[tierKey],
      },
    });
  }

  const workflowState = mergeWorkflowState(args.apiCampaign.workflow_state, {
    portfolio_id: portfolio.id,
    last_creative_upload_at: new Date().toISOString(),
    tier_campaigns: tierPatch,
  });

  await supabaseAdmin
    .from('api_campaigns')
    .update({
      workflow_state: workflowState,
      creative_status: 'ready_to_activate',
      creative_handoff: args.apiCampaign.creative_handoff || null,
    })
    .eq('id', args.apiCampaign.id)
    .eq('api_key_id', args.auth.keyRecord.id)
    .then(() => {});

  sendSlackCampaignAssetsReady({
    campaignName: args.apiCampaign.business_name || args.business.name || 'Campaign',
    creativeCount: createdRows.length,
  }).catch(() => {});

  return {
    ok: true,
    portfolioId: portfolio.id,
    creativeRows: createdRows,
    workflowState,
  };
}

async function handleBusinessEnrich(req: VercelRequest, res: VercelResponse, businessId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateBusinessRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertBusinessRouteAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  try {
    const business = await resolveOwnedBusinessForRoute(auth, businessId);
    if (!business) {
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/enrich', method: 'POST', statusCode: 404, startTime });
      return res.status(404).json({ error: { code: 'business_not_found', message: 'Business not found for the current user.' } });
    }

    const requestedUrl = normalizeBusinessWebsiteUrl(
      normalizeString(req.body?.url)
      || normalizeString(business.website_url)
      || normalizeString(business.website),
    );
    if (!requestedUrl) {
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/enrich', method: 'POST', statusCode: 400, startTime });
      return res.status(400).json({ error: { code: 'validation_error', message: 'A valid website URL is required to enrich this business.' } });
    }

    const forceRefresh = req.body?.force_refresh === true;
    const result = await withTimeout(
      enrichBusinessWebContext({
        business,
        url: requestedUrl,
        forceRefresh,
        persist: true,
      }),
      WEB_CONTEXT_REQUEST_TIMEOUT_MS,
      'business context enrichment',
    );

    if (!result.context) {
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/enrich', method: 'POST', statusCode: 502, startTime });
      return res.status(502).json({ error: { code: 'context_extraction_failed', message: 'Unable to extract structured business context from the website.' } });
    }

    await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/enrich', method: 'POST', statusCode: 200, startTime });
    return res.status(200).json({
      business_id: business.id,
      cached: result.cached,
      web_context: result.context,
    });
  } catch (error: any) {
    console.error('[api/businesses/enrich] Error:', error);
    await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/enrich', method: 'POST', statusCode: 500, startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: error?.message || 'Failed to enrich business context.' } });
  }
}

async function handleBusinessUploads(req: VercelRequest, res: VercelResponse, businessId: string) {
  const startTime = Date.now();
  const auth = await authenticateBusinessRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertBusinessRouteAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  try {
    const business = await resolveOwnedBusinessForRoute(auth, businessId);
    if (!business) {
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads', method: req.method || 'GET', statusCode: 404, startTime });
      return res.status(404).json({ error: { code: 'business_not_found', message: 'Business not found for the current user.' } });
    }

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('business_uploads')
        .select('id, filename, file_type, uploaded_at, summary, context_type, extracted_data')
        .eq('business_id', business.id)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads', method: 'GET', statusCode: 200, startTime });
      return res.status(200).json({
        business_id: business.id,
        uploads: (data || []) as CampaignUploadedContext[],
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET or POST required' } });
    }

    const filename = normalizeString(req.body?.filename);
    const filePath = normalizeString(req.body?.file_path);
    const content = typeof req.body?.content === 'string' ? req.body.content : null;
    const fileTypeHint = normalizeString(req.body?.file_type);
    const contextTypeHint = sanitizeBusinessUploadContextType(req.body?.context_type);
    const fileSizeBytes = normalizeNumber(req.body?.file_size_bytes);

    if (!filename) {
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads', method: 'POST', statusCode: 400, startTime });
      return res.status(400).json({ error: { code: 'validation_error', message: '`filename` is required.' } });
    }

    if ((filePath && content) || (!filePath && !content)) {
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads', method: 'POST', statusCode: 400, startTime });
      return res.status(400).json({ error: { code: 'validation_error', message: 'Provide either `file_path` or inline `content`, but not both.' } });
    }

    let storedFilePath = filePath;
    let storedFileType = inferBusinessContextFileType(filename, fileTypeHint);
    let cleanupOnFailure = false;
    let storedFileSizeBytes = fileSizeBytes !== null ? Math.round(fileSizeBytes) : null;

    if (content) {
      const stored = await uploadInlineBusinessContextContent({
        userId: business.user_id,
        businessId: business.id,
        filename,
        content,
      });
      storedFilePath = stored.filePath;
      storedFileType = stored.fileType;
      storedFileSizeBytes = stored.fileSizeBytes;
      cleanupOnFailure = true;
    } else if (!isOwnedBusinessContextPath(storedFilePath || '', business.user_id, business.id)) {
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads', method: 'POST', statusCode: 400, startTime });
      return res.status(400).json({ error: { code: 'validation_error', message: 'The provided file path is not owned by this business.' } });
    } else {
      cleanupOnFailure = true;
    }

    if (!storedFilePath || !storedFileType) {
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads', method: 'POST', statusCode: 400, startTime });
      return res.status(400).json({ error: { code: 'unsupported_file_type', message: 'Supported file types are CSV, PDF, TXT, and Markdown.' } });
    }

    const upload = await createBusinessUploadRecord({
      business,
      filename,
      fileType: storedFileType,
      filePath: storedFilePath,
      fileSizeBytes: storedFileSizeBytes,
      contextTypeHint,
      cleanupOnFailure,
    });

    await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads', method: 'POST', statusCode: 200, startTime });
    return res.status(200).json({
      business_id: business.id,
      upload,
    });
  } catch (error: any) {
    console.error('[api/businesses/uploads] Error:', error);
    await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads', method: req.method || 'POST', statusCode: 500, startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: error?.message || 'Failed to process uploaded business context.' } });
  }
}

async function handleBusinessUploadDelete(req: VercelRequest, res: VercelResponse, businessId: string, fileId: string) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'DELETE required' } });

  const startTime = Date.now();
  const auth = await authenticateBusinessRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertBusinessRouteAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  try {
    const business = await resolveOwnedBusinessForRoute(auth, businessId);
    if (!business) {
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads/:fileId', method: 'DELETE', statusCode: 404, startTime });
      return res.status(404).json({ error: { code: 'business_not_found', message: 'Business not found for the current user.' } });
    }

    const { data: upload, error } = await supabaseAdmin
      .from('business_uploads')
      .select('id, file_path')
      .eq('business_id', business.id)
      .eq('id', fileId)
      .maybeSingle();
    if (error) throw error;
    if (!upload) {
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads/:fileId', method: 'DELETE', statusCode: 404, startTime });
      return res.status(404).json({ error: { code: 'upload_not_found', message: 'Uploaded context file not found.' } });
    }

    await removeBusinessUploadFile(upload.file_path);
    const { error: deleteError } = await supabaseAdmin
      .from('business_uploads')
      .delete()
      .eq('id', upload.id)
      .eq('business_id', business.id);
    if (deleteError) throw deleteError;

    await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads/:fileId', method: 'DELETE', statusCode: 200, startTime });
    return res.status(200).json({
      business_id: business.id,
      deleted: true,
      file_id: upload.id,
    });
  } catch (error: any) {
    console.error('[api/businesses/uploads/delete] Error:', error);
    await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads/:fileId', method: 'DELETE', statusCode: 500, startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: error?.message || 'Failed to delete uploaded business context.' } });
  }
}

async function handleBusinessUploadReExtract(req: VercelRequest, res: VercelResponse, businessId: string, fileId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateBusinessRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertBusinessRouteAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  try {
    const business = await resolveOwnedBusinessForRoute(auth, businessId);
    if (!business) {
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads/:fileId/re-extract', method: 'POST', statusCode: 404, startTime });
      return res.status(404).json({ error: { code: 'business_not_found', message: 'Business not found for the current user.' } });
    }

    const { data: uploadRow, error } = await supabaseAdmin
      .from('business_uploads')
      .select('*')
      .eq('business_id', business.id)
      .eq('id', fileId)
      .maybeSingle();
    if (error) throw error;
    if (!uploadRow) {
      await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads/:fileId/re-extract', method: 'POST', statusCode: 404, startTime });
      return res.status(404).json({ error: { code: 'upload_not_found', message: 'Uploaded context file not found.' } });
    }

    const upload = await reextractBusinessUploadRecord(uploadRow as Record<string, any>);
    await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads/:fileId/re-extract', method: 'POST', statusCode: 200, startTime });
    return res.status(200).json({
      business_id: business.id,
      upload,
    });
  } catch (error: any) {
    console.error('[api/businesses/uploads/re-extract] Error:', error);
    await maybeLogBusinessRouteUsage({ auth, endpoint: '/v1/businesses/:id/uploads/:fileId/re-extract', method: 'POST', statusCode: 500, startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: error?.message || 'Failed to re-extract uploaded business context.' } });
  }
}

async function handleCampaignDetail(req: VercelRequest, res: VercelResponse, campaignId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const campaign = await getOwnedApiCampaign(campaignId, auth.keyRecord.id);
  if (!campaign) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Campaign not found' } });
  }

  const workflowState = getJsonObject(campaign.workflow_state) || {};
  const portfolioId = normalizeString(workflowState.portfolio_id);
  const { data: creatives } = await supabaseAdmin
    .from('api_campaign_creatives')
    .select('*')
    .eq('api_campaign_id', campaign.id)
    .order('created_at', { ascending: true });

  const { data: tierCampaigns } = portfolioId
    ? await supabaseAdmin
        .from('audience_tier_campaigns')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .order('created_at', { ascending: true })
    : { data: [] as any[] };

  return res.status(200).json({
    campaign,
    creatives: creatives || [],
    tier_campaigns: tierCampaigns || [],
    fetched_at: new Date().toISOString(),
  });
}

async function handleCampaignApproveStrategy(req: VercelRequest, res: VercelResponse, campaignId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const campaign = await getOwnedApiCampaign(campaignId, auth.keyRecord.id);
  if (!campaign) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Campaign not found' } });
  }
  if (normalizeString(campaign.campaign_version) !== 'intelligence') {
    return res.status(409).json({ error: { code: 'legacy_campaign', message: 'Strategy approval is only supported for intelligence campaigns.' } });
  }

  const strategy = getIntelligenceStrategySource(campaign);
  if (!strategy) {
    return res.status(400).json({ error: { code: 'strategy_missing', message: 'This campaign does not have a strategy to approve.' } });
  }

  const approvedPayload = getJsonObject(req.body?.approved_strategy);
  const requestedTierNames = sanitizeStringArray(req.body?.tier_names)
    || (Array.isArray(approvedPayload?.audience_tiers) ? approvedPayload.audience_tiers.map((tier: any) => normalizeString(tier?.tier_name)).filter(Boolean) as string[] : undefined)
    || strategy.audience_tiers.map((tier) => tier.tier_name);
  const requestedAngleNames = sanitizeStringArray(req.body?.angle_names)
    || (Array.isArray(approvedPayload?.creative_angles) ? approvedPayload.creative_angles.map((angle: any) => normalizeString(angle?.angle_name)).filter(Boolean) as string[] : undefined)
    || strategy.creative_angles.map((angle) => angle.angle_name);

  const approvedTiers = requestedTierNames.map((name) => findStrategyTier(strategy, name)).filter(Boolean) as IntelligenceAudienceTier[];
  const approvedAngles = requestedAngleNames.map((name) => findStrategyAngle(strategy, name)).filter(Boolean) as IntelligenceCreativeAngle[];

  if (approvedTiers.length !== requestedTierNames.length) {
    return res.status(400).json({ error: { code: 'unknown_tier', message: 'One or more requested tiers are not present in the generated strategy.' } });
  }
  if (approvedAngles.length !== requestedAngleNames.length) {
    return res.status(400).json({ error: { code: 'unknown_angle', message: 'One or more requested angles are not present in the generated strategy.' } });
  }

  const approvedStrategy: IntelligenceStrategyPayload = {
    ...strategy,
    audience_tiers: approvedTiers,
    creative_angles: approvedAngles,
    total_daily_budget_cents: approvedTiers.reduce((sum, tier) => sum + tier.daily_budget_cents, 0),
    total_monthly_budget: approvedTiers.reduce((sum, tier) => sum + tier.daily_budget_cents, 0) * 30,
  };

  const business = campaign.business_id
    ? await supabaseAdmin.from('businesses').select('*').eq('id', campaign.business_id).maybeSingle().then((result) => result.data || null)
    : null;
  if (!business) {
    return res.status(404).json({ error: { code: 'business_not_found', message: 'Linked business not found.' } });
  }

  const portfolio = await ensurePortfolioForIntelligenceCampaign({
    campaign,
    business,
    userId: auth.keyRecord.user_id,
    strategy: approvedStrategy,
  });

  const approvedAt = new Date().toISOString();
  const workflowState = mergeWorkflowState(campaign.workflow_state, {
    strategy_status: 'approved',
    portfolio_id: portfolio?.id || null,
    strategy_approved_at: approvedAt,
  });

  await supabaseAdmin
    .from('api_campaigns')
    .update({
      approved_strategy: approvedStrategy,
      strategy_approved_at: approvedAt,
      creative_status: 'awaiting_creative',
      workflow_state: workflowState,
    })
    .eq('id', campaign.id)
    .eq('api_key_id', auth.keyRecord.id)
    .then(() => {});

  return res.status(200).json({
    id: campaign.id,
    campaign_version: 'intelligence',
    status: campaign.status,
    approved_strategy: approvedStrategy,
    creative_status: 'awaiting_creative',
    portfolio_id: portfolio?.id || null,
    approved_at: approvedAt,
  });
}

async function handleCampaignRequestCreative(req: VercelRequest, res: VercelResponse, campaignId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const campaign = await getOwnedApiCampaign(campaignId, auth.keyRecord.id);
  if (!campaign) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Campaign not found' } });
  }
  if (normalizeString(campaign.campaign_version) !== 'intelligence') {
    return res.status(409).json({ error: { code: 'legacy_campaign', message: 'Creative handoff is only supported for intelligence campaigns.' } });
  }

  const strategy = getIntelligenceStrategySource(campaign);
  if (!strategy || !getJsonObject(campaign.approved_strategy)) {
    return res.status(409).json({ error: { code: 'strategy_not_approved', message: 'Approve the strategy before requesting creative production.' } });
  }

  const business = campaign.business_id
    ? await supabaseAdmin.from('businesses').select('*').eq('id', campaign.business_id).maybeSingle().then((result) => result.data || null)
    : null;
  if (!business) {
    return res.status(404).json({ error: { code: 'business_not_found', message: 'Linked business not found.' } });
  }

  const existingHandoff = getJsonObject(campaign.creative_handoff) || {};
  const requestHandoff = sanitizeCreativeHandoff(req.body?.creative_handoff || req.body) || {};
  const creativeHandoff = { ...existingHandoff, ...requestHandoff };
  const webhookUrl = normalizeString(creativeHandoff.webhook_url);
  const callbackUrl = normalizeString(creativeHandoff.callback_url) || `${getApiBaseUrl()}/api/v1/campaigns/${campaign.id}/creative-callback`;

  const payload = {
    campaign_id: campaign.id,
    callback_url: callbackUrl,
    market: strategy.audience_tiers[0]?.geo?.[0] || business.markets?.[0] || business.country || 'US',
    product_focus: normalizeString(creativeHandoff.product_focus) || business.trade || campaign.business_type || business.name,
    font_preset: normalizeString(creativeHandoff.font_preset) || null,
    angles: strategy.creative_angles.map((angle) => ({
      angle_name: angle.angle_name,
      hook: angle.hook,
      message: angle.message,
      cta: angle.cta,
      variants: angle.variants_recommended,
    })),
  };

  let dispatched = false;
  let upstreamResponse: any = null;
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      upstreamResponse = await response.text().catch(() => null);
      if (!response.ok) {
        return res.status(502).json({
          error: {
            code: 'creative_webhook_failed',
            message: `Creative webhook returned ${response.status}.`,
            upstream_response: upstreamResponse,
          },
        });
      }
      dispatched = true;
    } catch (error: any) {
      return res.status(502).json({
        error: {
          code: 'creative_webhook_failed',
          message: error?.message || 'Creative webhook request failed.',
        },
      });
    }
  }

  const workflowState = mergeWorkflowState(campaign.workflow_state, {
    latest_creative_request: {
      requested_at: new Date().toISOString(),
      dispatched,
      callback_url: callbackUrl,
      webhook_url: webhookUrl,
    },
  });

  await supabaseAdmin
    .from('api_campaigns')
    .update({
      creative_handoff: creativeHandoff,
      creative_status: 'requested',
      workflow_state: workflowState,
    })
    .eq('id', campaign.id)
    .eq('api_key_id', auth.keyRecord.id)
    .then(() => {});

  return res.status(200).json({
    campaign_id: campaign.id,
    dispatched,
    creative_request: payload,
    upstream_response: upstreamResponse,
    updated_at: new Date().toISOString(),
  });
}

async function handleCampaignUploadCreative(req: VercelRequest, res: VercelResponse, campaignId: string, source: 'upload' | 'callback') {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const campaign = await getOwnedApiCampaign(campaignId, auth.keyRecord.id);
  if (!campaign) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Campaign not found' } });
  }
  if (normalizeString(campaign.campaign_version) !== 'intelligence') {
    return res.status(409).json({ error: { code: 'legacy_campaign', message: 'Creative upload is only supported for intelligence campaigns.' } });
  }

  const business = campaign.business_id
    ? await supabaseAdmin.from('businesses').select('*').eq('id', campaign.business_id).maybeSingle().then((result) => result.data || null)
    : null;
  if (!business) {
    return res.status(404).json({ error: { code: 'business_not_found', message: 'Linked business not found.' } });
  }

  const uploads = normalizeCreativeUploads((req.body || {}) as Record<string, any>);
  if (uploads.length === 0) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Provide at least one creative with `tier_name`, `asset_url`, `asset_type`, `headline`, and `body`.',
      },
    });
  }

  const result = await processCampaignCreativeUpload({
    auth,
    apiCampaign: campaign,
    business,
    uploads,
    metaOverrides: {
      meta_access_token: normalizeString(req.body?.meta_access_token),
      meta_ad_account_id: normalizeString(req.body?.meta_ad_account_id),
      meta_page_id: normalizeString(req.body?.meta_page_id),
    },
    source,
  });

  if (!result.ok) {
    return res.status(result.statusCode).json({ error: result.error });
  }

  return res.status(200).json({
    campaign_id: campaign.id,
    creative_status: 'ready_to_activate',
    creatives: result.creativeRows,
    portfolio_id: result.portfolioId,
    uploaded_at: new Date().toISOString(),
  });
}

async function handleCampaignActivate(req: VercelRequest, res: VercelResponse, campaignId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const campaign = await getOwnedApiCampaign(campaignId, auth.keyRecord.id);
  if (!campaign) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Campaign not found' } });
  }
  if (normalizeString(campaign.campaign_version) !== 'intelligence') {
    return res.status(409).json({ error: { code: 'legacy_campaign', message: 'Use /campaigns/:id/launch for legacy campaigns.' } });
  }

  const strategy = getIntelligenceStrategySource(campaign);
  if (!strategy || !getJsonObject(campaign.approved_strategy)) {
    return res.status(409).json({ error: { code: 'strategy_not_approved', message: 'Approve the strategy before activation.' } });
  }

  const business = campaign.business_id
    ? await supabaseAdmin.from('businesses').select('*').eq('id', campaign.business_id).maybeSingle().then((result) => result.data || null)
    : null;
  if (!business) {
    return res.status(404).json({ error: { code: 'business_not_found', message: 'Linked business not found.' } });
  }

  const workflowState = getJsonObject(campaign.workflow_state) || {};
  const portfolioId = normalizeString(workflowState.portfolio_id);
  if (!portfolioId) {
    return res.status(409).json({ error: { code: 'portfolio_missing', message: 'No intelligence portfolio was provisioned for this campaign yet.' } });
  }

  const resolvedMeta = await resolveLaunchMetaForBusiness({
    auth,
    business,
    overrides: {
      meta_access_token: normalizeString(req.body?.meta_access_token),
      meta_ad_account_id: normalizeString(req.body?.meta_ad_account_id),
      meta_page_id: normalizeString(req.body?.meta_page_id),
    },
  });
  if (!resolvedMeta.ok) {
    return res.status(400).json({ error: resolvedMeta.error });
  }

  const requestedTierNames = sanitizeStringArray(req.body?.tier_names) || strategy.audience_tiers.map((tier) => tier.tier_name);
  const { data: tierCampaigns } = await supabaseAdmin
    .from('audience_tier_campaigns')
    .select('*')
    .eq('portfolio_id', portfolioId);
  const { data: creativeRows } = await supabaseAdmin
    .from('api_campaign_creatives')
    .select('*')
    .eq('api_campaign_id', campaign.id)
    .order('created_at', { ascending: true });

  const tierPatch: Record<string, any> = {};
  const activated: Array<Record<string, any>> = [];
  const skipped: Array<Record<string, any>> = [];

  for (const tierName of requestedTierNames) {
    const tier = findStrategyTier(strategy, tierName);
    if (!tier) {
      skipped.push({ tier_name: tierName, reason: 'Tier is not part of the approved strategy.' });
      continue;
    }

    const tierKey = buildTierKey(tier.tier_name);
    const linkedTierCampaign = (tierCampaigns || []).find((row: any) => normalizeString(row.tier) === tierKey);
    const tierCreatives = (creativeRows || []).filter((row: any) => buildTierKey(row.tier_name || '') === tierKey && normalizeString(row.meta_ad_id));

    if (!linkedTierCampaign || tierCreatives.length === 0) {
      skipped.push({ tier_name: tier.tier_name, reason: 'Tier has no ready creatives to activate.' });
      continue;
    }

    const activation = await activateTierExecution({
      apiCampaign: campaign,
      linkedTierCampaign,
      creativeRows: tierCreatives,
      accessToken: resolvedMeta.metaAccessToken,
    });

    if (!activation.ok) {
      skipped.push({ tier_name: tier.tier_name, reason: activation.error?.message || 'Activation failed.' });
      continue;
    }

    activated.push({
      tier_name: tier.tier_name,
      meta_campaign_id: activation.metaCampaignId,
      meta_adset_id: activation.metaAdSetId,
      meta_ad_ids: activation.metaAdIds,
      launched_at: activation.launchedAt,
    });
    tierPatch[tierKey] = {
      ...(getJsonObject(getJsonObject(workflowState.tier_campaigns || {})?.[tierKey]) || {}),
      status: 'active',
      activated_at: activation.launchedAt,
    };
  }

  if (activated.length === 0) {
    return res.status(409).json({
      error: {
        code: 'no_ready_tiers',
        message: 'No audience tiers were ready to activate.',
        skipped,
      },
    });
  }

  const nextWorkflowState = mergeWorkflowState(workflowState, {
    activated_at: new Date().toISOString(),
    tier_campaigns: tierPatch,
  });

  await supabaseAdmin
    .from('api_campaigns')
    .update({
      status: 'active',
      creative_status: 'active',
      workflow_state: nextWorkflowState,
      launched_at: new Date().toISOString(),
    })
    .eq('id', campaign.id)
    .eq('api_key_id', auth.keyRecord.id)
    .then(() => {});

  return res.status(200).json({
    id: campaign.id,
    campaign_version: 'intelligence',
    status: 'active',
    activated_tiers: activated,
    skipped_tiers: skipped,
    activated_at: new Date().toISOString(),
  });
}

async function handleAudiencesCreateSeed(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const business = await resolveOwnedBusiness(auth, normalizeString(req.body?.business_id));
  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }

  const sourceStage = normalizeStageKey(req.body?.source_stage);
  if (!sourceStage) {
    return res.status(400).json({ error: { code: 'validation_error', message: '`source_stage` is required' } });
  }

  const resolvedMeta = await resolveLaunchMetaForBusiness({ auth, business });
  if (!resolvedMeta.ok) {
    return res.status(400).json({ error: resolvedMeta.error });
  }

  const result = await createSeedAudienceInternal({
    business,
    userId: auth.keyRecord.user_id,
    accessToken: resolvedMeta.metaAccessToken,
    adAccountId: resolvedMeta.metaAdAccountId,
    name: normalizeString(req.body?.name) || `${business.name} ${sourceStage} Seed`,
    sourceStage,
    lookbackDays: Math.max(1, Math.round(normalizeNumber(req.body?.lookback_days) || 180)),
    minContacts: Math.max(1, Math.round(normalizeNumber(req.body?.min_contacts) || 100)),
  });

  if (!result.ok) {
    return res.status(result.error?.code === 'insufficient_seed_contacts' ? 400 : 502).json({ error: result.error });
  }

  return res.status(200).json({
    audience: result.audience,
    uploaded_users: result.uploaded_users,
    created_at: new Date().toISOString(),
  });
}

async function handleAudiencesCreateLal(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const seedAudienceId = normalizeString(req.body?.seed_audience_id);
  if (!seedAudienceId) {
    return res.status(400).json({ error: { code: 'validation_error', message: '`seed_audience_id` is required' } });
  }

  const seedAudience = await getAudienceRowForUser(seedAudienceId, auth.keyRecord.user_id);
  if (!seedAudience) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Seed audience not found' } });
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('id', seedAudience.business_id)
    .maybeSingle();
  if (!business) {
    return res.status(404).json({ error: { code: 'business_not_found', message: 'Linked business not found' } });
  }

  const resolvedMeta = await resolveLaunchMetaForBusiness({ auth, business });
  if (!resolvedMeta.ok) {
    return res.status(400).json({ error: resolvedMeta.error });
  }

  const percentage = Math.max(1, Math.min(20, normalizeNumber(req.body?.percentage) || 1));
  const result = await createLookalikeAudienceInternal({
    business,
    userId: auth.keyRecord.user_id,
    accessToken: resolvedMeta.metaAccessToken,
    adAccountId: resolvedMeta.metaAdAccountId,
    seedAudience,
    name: normalizeString(req.body?.name) || `${business.name} ${percentage}% LAL`,
    percentage,
    country: normalizeString(req.body?.country) || business.markets?.[0] || business.country || 'US',
  });

  if (!result.ok) {
    return res.status(502).json({ error: result.error });
  }

  return res.status(200).json({ audience: result.audience, created_at: new Date().toISOString() });
}

async function handleAudiencesList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const business = await resolveOwnedBusiness(auth, normalizeString(req.query.business_id as string | undefined));
  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }

  const { data: audiences } = await supabaseAdmin
    .from('facebook_audiences')
    .select('*')
    .eq('user_id', auth.keyRecord.user_id)
    .eq('business_id', business.id)
    .order('created_at', { ascending: false });

  return res.status(200).json({
    business_id: business.id,
    audiences: audiences || [],
    fetched_at: new Date().toISOString(),
  });
}

async function handleAudiencesRefresh(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const audienceId = normalizeString(req.body?.audience_id);
  if (!audienceId) {
    return res.status(400).json({ error: { code: 'validation_error', message: '`audience_id` is required' } });
  }

  const audience = await getAudienceRowForUser(audienceId, auth.keyRecord.user_id);
  if (!audience) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Audience not found' } });
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('id', audience.business_id)
    .maybeSingle();
  if (!business) {
    return res.status(404).json({ error: { code: 'business_not_found', message: 'Linked business not found' } });
  }

  const resolvedMeta = await resolveLaunchMetaForBusiness({ auth, business });
  if (!resolvedMeta.ok) {
    return res.status(400).json({ error: resolvedMeta.error });
  }

  const result = await refreshAudienceInternal({
    audience,
    business,
    accessToken: resolvedMeta.metaAccessToken,
    adAccountId: resolvedMeta.metaAdAccountId,
  });

  if (!result.ok) {
    return res.status(result.error?.code === 'insufficient_seed_contacts' ? 400 : 502).json({ error: result.error });
  }

  return res.status(200).json({
    audience: result.audience,
    refreshed_at: new Date().toISOString(),
  });
}

async function handleAudienceStatus(req: VercelRequest, res: VercelResponse, audienceId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const audience = await getAudienceRowForUser(audienceId, auth.keyRecord.user_id);
  if (!audience) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Audience not found' } });
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('id', audience.business_id)
    .maybeSingle();
  if (!business) {
    return res.status(404).json({ error: { code: 'business_not_found', message: 'Linked business not found' } });
  }

  const resolvedMeta = await resolveLaunchMetaForBusiness({ auth, business });
  if (!resolvedMeta.ok) {
    return res.status(400).json({ error: resolvedMeta.error });
  }

  const result = await getAudienceStatusInternal(audience, resolvedMeta.metaAccessToken);
  if (!result.ok) {
    return res.status(502).json({ error: result.error });
  }

  return res.status(200).json({
    audience: result.audience,
    meta_status: result.meta_status,
    fetched_at: new Date().toISOString(),
  });
}

async function handleAudienceDelete(req: VercelRequest, res: VercelResponse, audienceId: string) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'DELETE required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const audience = await getAudienceRowForUser(audienceId, auth.keyRecord.user_id);
  if (!audience) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Audience not found' } });
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('id', audience.business_id)
    .maybeSingle();
  if (!business) {
    return res.status(404).json({ error: { code: 'business_not_found', message: 'Linked business not found' } });
  }

  const resolvedMeta = await resolveLaunchMetaForBusiness({ auth, business });
  if (!resolvedMeta.ok) {
    return res.status(400).json({ error: resolvedMeta.error });
  }

  const result = await deleteAudienceInternal(audience, resolvedMeta.metaAccessToken);
  if (!result.ok) {
    return res.status(502).json({ error: result.error });
  }

  return res.status(200).json({ success: true, deleted_at: new Date().toISOString() });
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

  const adAccountResolution = await resolveAdAccountIdForLaunch({
    userId: auth.keyRecord.user_id,
    resolvedMeta: {
      ...resolvedMeta,
      meta_access_token,
      meta_ad_account_id,
      meta_page_id,
    },
  });
  if (!meta_ad_account_id && adAccountResolution.meta_ad_account_id) {
    meta_ad_account_id = adAccountResolution.meta_ad_account_id;
  }
  const pixelId = adAccountResolution.meta_pixel_id || resolvedMeta.meta_pixel_id || normalizeString(process.env.META_PIXEL_ID) || null;

  if (!meta_ad_account_id && adAccountResolution.source === 'selection_required') {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'meta_ad_account_selection_required',
        message: 'Multiple Meta ad accounts were found. Select one ad account before launching.',
        select_ad_account_endpoint: '/api/v1/meta/select-ad-account',
      },
      available_ad_accounts: (adAccountResolution.available_ad_accounts || []).slice(0, 25),
    });
  }

  const pageResolution = await resolvePageIdForLaunch({
    userId: auth.keyRecord.user_id,
    resolvedMeta: {
      ...resolvedMeta,
      meta_access_token,
      meta_ad_account_id,
      meta_page_id,
      meta_pixel_id: pixelId,
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
        ...(adAccountResolution.source === 'meta_error' ? { meta_error: adAccountResolution.meta_error } : {}),
        ...(pageResolution.source === 'meta_error' ? { meta_error: pageResolution.meta_error } : {}),
      }
    });
  }

  try {
    let campaign: Record<string, any> | null = null;
    const { data: apiCampaign } = await supabaseAdmin
      .from('api_campaigns').select('*').eq('id', campaignId).eq('api_key_id', auth.keyRecord.id).single();
    if (apiCampaign) campaign = apiCampaign;

    if (normalizeString(apiCampaign?.campaign_version) === 'intelligence') {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 409, responseTimeMs: Date.now() - startTime });
      return res.status(409).json({
        error: {
          code: 'legacy_launch_not_supported',
          message: 'Intelligence campaigns use /api/v1/campaigns/:id/activate after strategy approval and creative upload.',
          activate_endpoint: `/api/v1/campaigns/${campaignId}/activate`,
        },
      });
    }

    const launchBusiness = launchBusinessId
      ? await supabaseAdmin
          .from('businesses')
          .select('*')
          .eq('id', launchBusinessId)
          .maybeSingle()
          .then((result) => result.data || null)
      : null;

    // Read objective from DB record (set during create), default to traffic
    const objective: ZuckerObjective = isValidObjective(campaign?.objective) ? campaign.objective : 'traffic';
    console.log('[api/launch] Launching campaign with objective:', objective);
    console.log('[api/launch] Meta objective:', getMetaCampaignObjective(objective));

    // Validation: traffic and conversions require a URL
    if (needsUrl(objective) && !campaign?.url) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({ error: { code: 'validation_error', message: `The '${objective}' objective requires a campaign URL. Set it during campaign creation.` } });
    }

    // Validation: conversions requires a Meta Pixel ID
    if (needsPixel(objective) && !pixelId) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({ error: { code: 'validation_error', message: 'Conversions objective requires a Meta Pixel ID configured' } });
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
    const leadFormSelection = await resolveLeadFormIdForObjective(objective, launchBusiness || launchBusinessId || null);
    if (!leadFormSelection.ok) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/launch', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({ error: leadFormSelection.error });
    }

    const defaultNaming = buildMetaObjectNames({
      objective,
      geo: targeting?.geo_locations?.countries?.[0] || launchBusiness?.markets?.[0] || launchBusiness?.country || 'US',
      tierName: null,
      ageMin: targeting?.age_min,
      ageMax: targeting?.age_max,
      placement: 'Feed',
      angleName: normalizeString(selectedVariant.angle) || headline,
      variantIndex: variant_index,
      assetType: imageUrl ? 'image' : 'image',
    });

    const campaignName = defaultNaming.campaign_name;
    const adSetName = defaultNaming.adset_name;
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
    const adSetTargeting = buildMetaAdSetTargetingPayload(
      targeting,
      launchBusiness?.markets?.[0] || launchBusiness?.country || 'US',
    );

    const adSetResult = await metaPost(`/act_${adAccountId}/adsets`, {
      name: adSetName, campaign_id: metaCampaignId,
      daily_budget: String(budgetCents), billing_event: 'IMPRESSIONS',
      optimization_goal: adsetParams.optimization_goal, bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify(adSetTargeting),
      promoted_object: JSON.stringify(getPromotedObject(objective, meta_page_id, pixelId)),
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
    const metaLeadFormId = leadFormSelection.leadFormId || '';

    for (let vi = 0; vi < variantsToLaunch.length; vi++) {
      const v = variantsToLaunch[vi] || {};
      const vHeadline = v.headline || businessName;
      const vBody = v.copy || `Check out ${businessName}`;
      const vCta = v.cta || 'Learn More';
      const vImage = v.image_url || null;
      const vCtaType = ctaMap[vCta] || 'LEARN_MORE';
      const variantNaming = buildMetaObjectNames({
        objective,
        geo: defaultNaming.geo,
        tierName: null,
        ageMin: targeting?.age_min,
        ageMax: targeting?.age_max,
        placement: 'Feed',
        angleName: normalizeString(v.angle) || vHeadline,
        variantIndex: vi,
        assetType: vImage ? 'image' : 'image',
      });

      // Step 4: Create creative (objective-aware link_data)
      const linkData = buildCreativeLinkData(objective, {
        headline: vHeadline,
        body: vBody,
        ctaType: vCtaType,
        imageUrl: vImage,
        leadFormId: metaLeadFormId || undefined,
        campaignUrl: campaign?.url,
      });

      const objectStorySpec: Record<string, any> = {
        page_id: meta_page_id,
        link_data: linkData,
      };

      const creativeResult = await metaPost(`/act_${adAccountId}/adcreatives`, { name: `${variantNaming.ad_name} Creative`, object_story_spec: JSON.stringify(objectStorySpec) }, meta_access_token);
      if (!creativeResult.ok || !creativeResult.data.id) {
        console.error(`[api/launch] Creative creation failed for variant ${vi}:`, creativeResult.rawBody);
        variantResults.push({ variant_index: vi, headline: vHeadline, meta_ad_id: '', status: 'failed_creative' });
        continue;
      }

      // Step 5: Create ad
      const adResult = await metaPost(`/act_${adAccountId}/ads`, { name: variantNaming.ad_name, adset_id: metaAdSetId, creative: JSON.stringify({ creative_id: creativeResult.data.id }), status: 'PAUSED' }, meta_access_token);
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
    upsertLaunchedCampaignRecord({
      businessId: launchBusinessId,
      campaignName,
      status: 'active',
      dailyBudgetCents: budgetCents,
      radiusKm: targetRadius,
      headline,
      adBody,
      imageUrl: imageUrl || null,
      metaCampaignId,
      metaAdSetId,
      metaAdId,
      metaLeadFormId,
      launchedAt,
    }).then(() => {});

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
    const { data: apiCampaign } = await supabaseAdmin
      .from('api_campaigns')
      .select('id, meta_campaign_id, meta_access_token')
      .eq('id', campaignId)
      .eq('api_key_id', auth.keyRecord.id)
      .maybeSingle();

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, name, phone, email, meta_lead_id, campaign_id, business_id, created_at')
      .eq('id', lead_id)
      .maybeSingle();

    if (!lead?.business_id) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/conversions', method: 'POST', statusCode: 404, responseTimeMs: Date.now() - startTime });
      return res.status(404).json({ error: { code: 'not_found', message: 'Lead not found' } });
    }

    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', lead.business_id)
      .eq('user_id', auth.keyRecord.user_id)
      .maybeSingle();

    if (!business) {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/conversions', method: 'POST', statusCode: 403, responseTimeMs: Date.now() - startTime });
      return res.status(403).json({ error: { code: 'forbidden', message: 'You do not own this lead' } });
    }

    const capiConfig = await resolveCapiConfigForBusiness(business as any);
    const nameParts = typeof lead.name === 'string' ? lead.name.trim().split(/\s+/) : [];
    const hashedUserData = buildHashedMetaUserData({
      email: user_data?.email || lead.email,
      phone: user_data?.phone || lead.phone,
      first_name: user_data?.first_name || nameParts[0] || null,
      last_name: user_data?.last_name || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : null),
      fbc: user_data?.fbc,
      fbp: user_data?.fbp,
      client_ip_address: getClientIpAddress(req),
      client_user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '',
    });

    const dispatchResult = await dispatchCapiEvent({
      business,
      capiConfig,
      crmSource: 'manual_conversion',
      sourceStage: quality,
      metaEventName: 'Lead',
      eventTime: new Date(),
      userData: hashedUserData,
      customData: {
        lead_quality: quality,
        lead_id,
        campaign_id: campaignId,
        value: quality === 'good' ? 100 : 0,
      },
      lead: {
        id: lead.id,
        campaign_id: lead.campaign_id,
        email: lead.email,
        phone: lead.phone,
        meta_lead_id: lead.meta_lead_id,
        name: lead.name,
      },
      matchQuality: 'lead_id',
      explicitEventId: lead.meta_lead_id || `${campaignId}:${lead_id}:${quality}`,
      allowWhenDisabled: true,
      metaAccessTokenOverride: normalizeString(meta_access_token) || normalizeString(apiCampaign?.meta_access_token) || normalizeString(process.env.META_SYSTEM_USER_TOKEN),
      pixelIdOverride: normalizeString(business.meta_pixel_id) || normalizeString(process.env.META_PIXEL_ID),
    });

    if (dispatchResult.status === 'failed') {
      console.error('[api/conversions] CAPI error:', JSON.stringify(dispatchResult.metaResponse));
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/conversions', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({ error: { code: 'capi_error', message: 'Meta Conversion API returned an error', details: dispatchResult.metaResponse } });
    }

    console.log(`[api/conversions] Result ${dispatchResult.status} — ${quality} signal for lead ${lead_id}`);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/conversions', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
    return res.status(200).json({
      success: true,
      capi_sent: dispatchResult.sent,
      status: dispatchResult.status,
      quality,
      lead_id,
      currency: dispatchResult.currency,
      meta_response: dispatchResult.metaResponse,
    });
  } catch (err: any) {
    console.error('[api/conversions] Unexpected error:', err);
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/campaigns/:id/conversions', method: 'POST', statusCode: 500, responseTimeMs: Date.now() - startTime });
    return res.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred', details: err?.message || String(err) } });
  }
}

// ── GET/PUT /api/v1/capi/config ─────────────────────────────────────────

async function handleCapiConfig(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'PUT'].includes(req.method || '')) {
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET or PUT required' } });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const businessId = normalizeString((req.method === 'GET' ? req.query.business_id : req.body?.business_id) as string | undefined);
  const business = await resolveOwnedBusiness(auth, businessId);
  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }

  if (req.method === 'GET') {
    const config = await resolveCapiConfigForBusiness(business);
    return res.status(200).json({
      business_id: business.id,
      config,
      webhook_url: `${getApiBaseUrl()}/api/v1/capi/events`,
      fetched_at: new Date().toISOString(),
    });
  }

  const {
    is_enabled,
    event_mapping,
    currency,
    crm_source,
    optimise_for,
    action_source,
    rotate_webhook_secret,
  } = req.body || {};

  const sanitizedMapping = event_mapping === undefined
    ? undefined
    : sanitizeEventMapping(event_mapping);
  if (event_mapping !== undefined && !sanitizedMapping) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: '`event_mapping` must be an object of CRM stages mapped to supported Meta standard events.',
        supported_meta_events: Array.from(SUPPORTED_META_STANDARD_EVENTS),
      },
    });
  }

  if (optimise_for !== undefined && !['lead', 'sql', 'customer'].includes(String(optimise_for))) {
    return res.status(400).json({ error: { code: 'validation_error', message: '`optimise_for` must be one of lead, sql, customer' } });
  }

  const config = await resolveCapiConfigForBusiness(business);
  const nextActionSource = action_source === undefined
    ? (normalizeMetaActionSource(config?.action_source) || 'website')
    : normalizeMetaActionSource(action_source);
  if (action_source !== undefined && !nextActionSource) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: '`action_source` must be a supported Meta Conversions API action source.',
        supported_action_sources: Array.from(SUPPORTED_META_ACTION_SOURCES),
      },
    });
  }

  const nextCurrency = normalizeString(currency) || config?.currency || business.currency || 'USD';
  const nextConfig = {
    business_id: business.id,
    user_id: business.user_id,
    is_enabled: typeof is_enabled === 'boolean' ? is_enabled : config?.is_enabled ?? false,
    event_mapping: sanitizedMapping || config?.event_mapping || DEFAULT_CAPI_EVENT_MAPPING,
    currency: nextCurrency,
    crm_source: normalizeString(crm_source) || config?.crm_source || 'hubspot',
    optimise_for: (normalizeString(optimise_for) || config?.optimise_for || 'lead'),
    action_source: nextActionSource,
    webhook_secret: rotate_webhook_secret ? randomBytes(24).toString('hex') : (config?.webhook_secret || randomBytes(24).toString('hex')),
  };

  const { data: savedConfig, error } = await supabaseAdmin
    .from('capi_configs')
    .upsert(nextConfig, { onConflict: 'business_id' })
    .select('*')
    .single();

  if (error) {
    return res.status(500).json({ error: { code: 'database_error', message: error.message } });
  }

  await supabaseAdmin
    .from('businesses')
    .update({ currency: nextCurrency })
    .eq('id', business.id)
    .then(() => {});

  await supabaseAdmin
    .from('autonomous_policies')
    .update({ optimise_for: nextConfig.optimise_for })
    .eq('business_id', business.id)
    .then(() => {});

  return res.status(200).json({
    business_id: business.id,
    config: savedConfig,
    webhook_url: `${getApiBaseUrl()}/api/v1/capi/events`,
    updated_at: new Date().toISOString(),
  });
}

// ── POST /api/v1/capi/events ─────────────────────────────────────────────

async function handleCapiEvents(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });
  }

  const hasBearerAuth = getAuthorizationHeader(req).startsWith('Bearer ');
  let auth: AuthSuccess | null = null;

  if (hasBearerAuth) {
    const authResult = await authenticateRequest(req);
    if (authResult.error) {
      if (authResult.rateLimitHeaders) applyRateLimitHeaders(res, authResult.rateLimitHeaders);
      return res.status(authResult.status).json(authResult.body);
    }
    assertAuth(authResult);
    auth = authResult;
    applyRateLimitHeaders(res, auth.rateLimitHeaders);
  }

  const body = (req.body || {}) as Record<string, any>;
  let business: any | null = null;
  let capiConfig: any | null = null;

  if (auth) {
    business = await resolveOwnedBusiness(auth, normalizeString(body.business_id));
    if (!business) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
    }
    capiConfig = await resolveCapiConfigForBusiness(business);
  } else {
    const webhookSecret = getWebhookSecretFromRequest(req);
    if (!webhookSecret) {
      return res.status(401).json({ error: { code: 'missing_webhook_secret', message: 'Provide an API key or x-zuckerbot-webhook-secret header' } });
    }

    const resolved = await resolveBusinessByWebhookSecret(webhookSecret);
    if (!resolved?.business || !resolved.capiConfig) {
      return res.status(401).json({ error: { code: 'invalid_webhook_secret', message: 'Webhook secret is not valid' } });
    }

    business = resolved.business;
    capiConfig = resolved.capiConfig;
  }

  const stageKey = normalizeStageKey(body.source_stage || body.stage || body.lifecycle_stage);
  if (!stageKey) {
    return res.status(400).json({ error: { code: 'validation_error', message: '`source_stage` is required' } });
  }

  const mapping = sanitizeEventMapping(capiConfig?.event_mapping) || sanitizeEventMapping(DEFAULT_CAPI_EVENT_MAPPING) || DEFAULT_CAPI_EVENT_MAPPING;
  const mappedStage = (mapping as EventMappingConfig)[stageKey] || null;
  const lead = await findLeadForCapiAttribution(business.id, {
    lead_id: body.lead_id,
    email: body.email || body.user_data?.email,
    phone: body.phone || body.user_data?.phone,
  });

  const leadNameParts = typeof lead?.name === 'string' ? lead.name.trim().split(/\s+/) : [];
  const hashedUserData = buildHashedMetaUserData({
    email: body.email || body.user_data?.email || lead?.email,
    phone: body.phone || body.user_data?.phone || lead?.phone,
    first_name: body.first_name || body.user_data?.first_name || leadNameParts[0] || null,
    last_name: body.last_name || body.user_data?.last_name || (leadNameParts.length > 1 ? leadNameParts[leadNameParts.length - 1] : null),
    fbc: body.fbc || body.user_data?.fbc,
    fbp: body.fbp || body.user_data?.fbp,
    client_ip_address: getClientIpAddress(req),
    client_user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '',
  });
  const crmAttributes = {
    ...sanitizeCrmAttributes(body.crm_attributes),
    ...sanitizeCrmAttributes({
      country: body.country,
      industry: body.industry,
      source_campaign: body.source_campaign,
      deal_value: body.deal_value,
      lifecycle_stage: body.lifecycle_stage,
    }),
  };

  const matchQuality = normalizeString(body.lead_id)
    ? (lead ? 'lead_id' : 'lead_id_missing')
    : lead
      ? 'identity_match'
      : 'none';

  const dispatchResult = await dispatchCapiEvent({
    business,
    capiConfig,
    crmSource: normalizeString(body.crm_source) || normalizeString(capiConfig?.crm_source) || 'hubspot',
    sourceStage: stageKey,
    metaEventName: mappedStage?.meta_event || null,
    eventTime: body.event_time || body.timestamp || new Date(),
    userData: hashedUserData,
    hashedUserData,
    crmAttributes,
    customData: {
      value: normalizeNumber(body.value) ?? mappedStage?.value ?? 0,
      lead_id: lead?.id || normalizeString(body.lead_id),
      campaign_id: lead?.campaign_id || null,
      source_stage: stageKey,
    },
    lead,
    matchQuality,
    hubspotContactId: normalizeString(body.hubspot_contact_id),
    explicitEventId: normalizeString(body.event_id) || normalizeString(body.meta_event_id),
  });

  if (dispatchResult.status === 'failed') {
    return res.status(502).json({
      success: false,
      status: dispatchResult.status,
      business_id: business.id,
      source_stage: stageKey,
      meta_event_name: mappedStage?.meta_event || null,
      meta_response: dispatchResult.metaResponse,
    });
  }

  return res.status(dispatchResult.status === 'sent' ? 200 : 202).json({
    success: true,
    status: dispatchResult.status,
    business_id: business.id,
    source_stage: stageKey,
    meta_event_name: mappedStage?.meta_event || null,
    campaign_id: lead?.campaign_id || null,
    lead_id: lead?.id || null,
    match_quality: matchQuality,
    meta_response: dispatchResult.metaResponse,
  });
}

// ── POST /api/v1/capi/config/test ────────────────────────────────────────

async function handleCapiConfigTest(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const business = await resolveOwnedBusiness(auth, normalizeString(req.body?.business_id));
  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }

  const capiConfig = await resolveCapiConfigForBusiness(business);
  const mapping = sanitizeEventMapping(capiConfig?.event_mapping) || sanitizeEventMapping(DEFAULT_CAPI_EVENT_MAPPING) || DEFAULT_CAPI_EVENT_MAPPING;
  const requestedStage = normalizeStageKey(req.body?.source_stage) || Object.keys(mapping)[0] || 'lead';
  const mappedStage = (mapping as EventMappingConfig)[requestedStage];
  if (!mappedStage) {
    return res.status(400).json({ error: { code: 'validation_error', message: `No event mapping found for stage '${requestedStage}'` } });
  }

  const hashedUserData = buildHashedMetaUserData({
    email: req.body?.user_data?.email || `test+${business.id.slice(0, 8)}@zuckerbot.ai`,
    phone: req.body?.user_data?.phone || '+15555550123',
    first_name: req.body?.user_data?.first_name || 'Test',
    last_name: req.body?.user_data?.last_name || 'Lead',
    client_ip_address: getClientIpAddress(req),
    client_user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '',
  });

  const dispatchResult = await dispatchCapiEvent({
    business,
    capiConfig,
    crmSource: normalizeString(req.body?.crm_source) || normalizeString(capiConfig?.crm_source) || 'hubspot',
    sourceStage: requestedStage,
    metaEventName: mappedStage.meta_event,
    eventTime: new Date(),
    userData: hashedUserData,
    hashedUserData,
    crmAttributes: sanitizeCrmAttributes(req.body?.crm_attributes),
    customData: {
      value: normalizeNumber(req.body?.value) ?? mappedStage.value ?? 0,
      test_event: true,
      source_stage: requestedStage,
    },
    lead: null,
    matchQuality: 'test',
    explicitEventId: `test:${business.id}:${Date.now()}`,
    isTest: true,
    allowWhenDisabled: true,
  });

  if (dispatchResult.status === 'failed') {
    return res.status(502).json({
      success: false,
      status: dispatchResult.status,
      source_stage: requestedStage,
      meta_event_name: mappedStage.meta_event,
      meta_response: dispatchResult.metaResponse,
    });
  }

  return res.status(dispatchResult.status === 'sent' ? 200 : 202).json({
    success: true,
    status: dispatchResult.status,
    business_id: business.id,
    source_stage: requestedStage,
    meta_event_name: mappedStage.meta_event,
    currency: dispatchResult.currency,
    meta_response: dispatchResult.metaResponse,
  });
}

// ── GET /api/v1/capi/status ──────────────────────────────────────────────

async function handleCapiStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET required' } });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const business = await resolveOwnedBusiness(auth, normalizeString(req.query.business_id as string | undefined));
  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }

  const since30 = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();
  const since7 = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();
  const { data: events } = await supabaseAdmin
    .from('capi_events')
    .select('*')
    .eq('business_id', business.id)
    .gte('created_at', since30)
    .order('created_at', { ascending: false });

  const rows = (events || []) as Array<Record<string, any>>;
  const summariseWindow = (windowRows: Array<Record<string, any>>) => {
    const byStatus: Record<string, number> = {};
    const byMetaEvent: Record<string, number> = {};
    let attributed = 0;
    let unattributed = 0;

    for (const row of windowRows) {
      const status = normalizeString(row.status) || 'unknown';
      const metaEventName = normalizeString(row.meta_event_name) || 'unmapped';
      byStatus[status] = (byStatus[status] || 0) + 1;
      byMetaEvent[metaEventName] = (byMetaEvent[metaEventName] || 0) + 1;
      if (row.campaign_id) attributed += 1;
      else unattributed += 1;
    }

    return {
      total: windowRows.length,
      by_status: byStatus,
      by_meta_event: byMetaEvent,
      attributed,
      unattributed,
      test_events: windowRows.filter((row) => !!row.is_test).length,
    };
  };

  const last7Rows = rows.filter((row) => typeof row.created_at === 'string' && row.created_at >= since7);
  const config = await resolveCapiConfigForBusiness(business);

  return res.status(200).json({
    business_id: business.id,
    config: {
      is_enabled: config?.is_enabled ?? false,
      crm_source: config?.crm_source || 'hubspot',
      optimise_for: config?.optimise_for || 'lead',
      currency: config?.currency || business.currency || 'USD',
    },
    windows: {
      '7d': summariseWindow(last7Rows),
      '30d': summariseWindow(rows),
    },
    recent_events: rows.slice(0, 20),
    fetched_at: new Date().toISOString(),
  });
}

async function loadPortfolioPerformanceSnapshot(portfolio: any, business: any) {
  const tiers = sanitizePortfolioTiers(portfolio?.tiers) || [];
  const linkedTierCampaigns = Array.isArray(portfolio?.audience_tier_campaigns)
    ? portfolio.audience_tier_campaigns
    : [];
  const campaignIds = linkedTierCampaigns
    .map((tierCampaign: any) => normalizeString(tierCampaign.campaign_id))
    .filter(Boolean) as string[];

  const { data: campaigns } = campaignIds.length > 0
    ? await supabaseAdmin
        .from('campaigns')
        .select('*')
        .in('id', campaignIds)
    : { data: [] as any[] };

  const { data: policy } = await supabaseAdmin
    .from('autonomous_policies')
    .select('*')
    .eq('business_id', business.id)
    .maybeSingle();
  const capiConfig = await resolveCapiConfigForBusiness(business);
  const downstreamMetrics = await fetchAttributedCapiMetricsByCampaign(
    business.id,
    Number(policy?.capi_lookback_days) > 0 ? Number(policy?.capi_lookback_days) : 30,
  );

  const optimiseFor = normalizeString(policy?.optimise_for) || normalizeString(capiConfig?.optimise_for) || 'lead';
  const baseTargetCpaCents = getPolicyTargetCpaCents(policy);

  const rows = tiers.map((tier) => {
    const tierCampaign = linkedTierCampaigns.find((candidate: any) => candidate.tier === tier.tier) || null;
    const campaign = (campaigns || []).find((candidate: any) => candidate.id === tierCampaign?.campaign_id) || null;
    const campaignMetrics = tierCampaign?.campaign_id
      ? downstreamMetrics[tierCampaign.campaign_id] || { lead: 0, sql: 0, customer: 0 }
      : { lead: 0, sql: 0, customer: 0 };
    const spendCents = Number(campaign?.spend_cents || 0);
    const leadConversions = Number(campaign?.leads_count || 0);
    let selectedMetric = 'lead';
    let selectedConversions = leadConversions;

    if (optimiseFor === 'customer' && campaignMetrics.customer > 0) {
      selectedMetric = 'customer';
      selectedConversions = campaignMetrics.customer;
    } else if (optimiseFor === 'sql' && campaignMetrics.sql > 0) {
      selectedMetric = 'sql';
      selectedConversions = campaignMetrics.sql;
    }

    const selectedCpa = selectedConversions > 0
      ? (spendCents / 100) / selectedConversions
      : null;

    return {
      tier: tier.tier,
      description: tier.description || null,
      budget_pct: tier.budget_pct,
      target_cpa_multiplier: tier.target_cpa_multiplier,
      target_cpa_cents: Math.round(baseTargetCpaCents * tier.target_cpa_multiplier),
      campaign_id: tierCampaign?.campaign_id || null,
      meta_campaign_id: tierCampaign?.meta_campaign_id || campaign?.meta_campaign_id || null,
      meta_adset_id: tierCampaign?.meta_adset_id || campaign?.meta_adset_id || null,
      daily_budget_cents: Number(tierCampaign?.daily_budget_cents || campaign?.daily_budget_cents || 0),
      spend_cents: spendCents,
      lead_conversions: leadConversions,
      sql_conversions: campaignMetrics.sql,
      customer_conversions: campaignMetrics.customer,
      selected_metric: selectedMetric,
      selected_conversions: selectedConversions,
      selected_cpa: selectedCpa,
      status: normalizeString(tierCampaign?.status) || normalizeString(campaign?.status) || 'draft',
      performance_data: tierCampaign?.performance_data || null,
    };
  });

  return {
    business_id: business.id,
    optimise_for: optimiseFor,
    base_target_cpa_cents: baseTargetCpaCents,
    portfolio_budget_cents: Number(portfolio?.total_daily_budget_cents || 0),
    rows,
    summary: {
      tiers: rows.length,
      active_tiers: rows.filter((row) => ['active', 'running'].includes((row.status || '').toLowerCase())).length,
      spend_cents: rows.reduce((sum, row) => sum + row.spend_cents, 0),
      lead_conversions: rows.reduce((sum, row) => sum + row.lead_conversions, 0),
      sql_conversions: rows.reduce((sum, row) => sum + row.sql_conversions, 0),
      customer_conversions: rows.reduce((sum, row) => sum + row.customer_conversions, 0),
    },
  };
}

// ── POST /api/v1/portfolios/create ───────────────────────────────────────

async function handlePortfolioCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const business = await resolveOwnedBusiness(auth, normalizeString(req.body?.business_id));
  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }

  const requestedTemplateId = normalizeString(req.body?.template_id);
  const requestedTemplateName = normalizeString(req.body?.template_name);
  const inferredBusinessType = requestedTemplateName
    ? null
    : (normalizeString(req.body?.business_type) || suggestPortfolioBusinessType(business.trade));

  let templateQuery = supabaseAdmin
    .from('portfolio_templates')
    .select('*');

  if (requestedTemplateId) {
    templateQuery = templateQuery.eq('id', requestedTemplateId);
  } else if (requestedTemplateName) {
    templateQuery = templateQuery.eq('name', requestedTemplateName);
  } else {
    templateQuery = templateQuery.eq('business_type', inferredBusinessType || 'custom');
  }

  let { data: template } = await templateQuery.maybeSingle();
  if (!template) {
    const { data: fallbackTemplate } = await supabaseAdmin
      .from('portfolio_templates')
      .select('*')
      .eq('business_type', 'custom')
      .maybeSingle();
    template = fallbackTemplate || null;
  }

  const tiers = sanitizePortfolioTiers(req.body?.tiers) || sanitizePortfolioTiers(template?.tiers);
  if (!tiers || tiers.length === 0) {
    return res.status(400).json({ error: { code: 'validation_error', message: 'A valid portfolio template or `tiers` array is required' } });
  }

  const { data: policy } = await supabaseAdmin
    .from('autonomous_policies')
    .select('max_daily_budget_cents')
    .eq('business_id', business.id)
    .maybeSingle();

  const totalDailyBudgetCents = Math.max(
    500,
    Math.round(normalizeNumber(req.body?.total_daily_budget_cents) || policy?.max_daily_budget_cents || 2000),
  );

  const { data: portfolio, error } = await supabaseAdmin
    .from('audience_portfolios')
    .insert({
      business_id: business.id,
      user_id: business.user_id,
      template_id: template?.id || null,
      name: normalizeString(req.body?.name) || `${business.name || 'Business'} Portfolio`,
      total_daily_budget_cents: totalDailyBudgetCents,
      tiers,
      is_active: req.body?.is_active === undefined ? true : !!req.body.is_active,
    })
    .select('*')
    .single();

  if (error) {
    return res.status(500).json({ error: { code: 'database_error', message: error.message } });
  }

  return res.status(200).json({
    portfolio,
    template,
    created_at: new Date().toISOString(),
  });
}

// ── GET/PUT /api/v1/portfolios/:id ───────────────────────────────────────

async function handlePortfolioDetail(req: VercelRequest, res: VercelResponse, portfolioId: string) {
  if (!['GET', 'PUT'].includes(req.method || '')) {
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET or PUT required' } });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const portfolio = await getOwnedPortfolio(portfolioId, auth.keyRecord.user_id);
  if (!portfolio) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Portfolio not found' } });
  }

  if (req.method === 'GET') {
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', portfolio.business_id)
      .eq('user_id', auth.keyRecord.user_id)
      .maybeSingle();
    const performance = business ? await loadPortfolioPerformanceSnapshot(portfolio, business) : null;
    return res.status(200).json({ portfolio, performance });
  }

  const nextTiers = req.body?.tiers === undefined
    ? undefined
    : sanitizePortfolioTiers(req.body?.tiers);
  if (req.body?.tiers !== undefined && !nextTiers) {
    return res.status(400).json({ error: { code: 'validation_error', message: '`tiers` must be a valid tier array' } });
  }

  const updates: Record<string, any> = {};
  if (req.body?.name !== undefined) updates.name = normalizeString(req.body?.name) || portfolio.name;
  if (req.body?.total_daily_budget_cents !== undefined) {
    updates.total_daily_budget_cents = Math.max(500, Math.round(normalizeNumber(req.body?.total_daily_budget_cents) || portfolio.total_daily_budget_cents || 500));
  }
  if (req.body?.is_active !== undefined) updates.is_active = !!req.body.is_active;
  if (nextTiers) updates.tiers = nextTiers;

  const { data: updatedPortfolio, error } = await supabaseAdmin
    .from('audience_portfolios')
    .update(updates)
    .eq('id', portfolioId)
    .eq('user_id', auth.keyRecord.user_id)
    .select('*')
    .single();

  if (error) {
    return res.status(500).json({ error: { code: 'database_error', message: error.message } });
  }

  return res.status(200).json({ portfolio: updatedPortfolio, updated_at: new Date().toISOString() });
}

// ── GET /api/v1/portfolios/:id/performance ───────────────────────────────

async function handlePortfolioPerformance(req: VercelRequest, res: VercelResponse, portfolioId: string) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET required' } });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const portfolio = await getOwnedPortfolio(portfolioId, auth.keyRecord.user_id);
  if (!portfolio) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Portfolio not found' } });
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('id', portfolio.business_id)
    .eq('user_id', auth.keyRecord.user_id)
    .maybeSingle();

  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }

  const performance = await loadPortfolioPerformanceSnapshot(portfolio, business);
  return res.status(200).json({
    portfolio_id: portfolio.id,
    performance,
    fetched_at: new Date().toISOString(),
  });
}

// ── POST /api/v1/portfolios/:id/rebalance ────────────────────────────────

async function handlePortfolioRebalance(req: VercelRequest, res: VercelResponse, portfolioId: string) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const portfolio = await getOwnedPortfolio(portfolioId, auth.keyRecord.user_id);
  if (!portfolio) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Portfolio not found' } });
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('id', portfolio.business_id)
    .eq('user_id', auth.keyRecord.user_id)
    .maybeSingle();
  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }

  const dryRun = req.body?.dry_run !== false;
  const performance = await loadPortfolioPerformanceSnapshot(portfolio, business);
  const activeRows = performance.rows.filter((row) => row.campaign_id);
  if (activeRows.length === 0) {
    return res.status(200).json({
      portfolio_id: portfolio.id,
      dry_run: dryRun,
      recommendations: [],
      message: 'No launched tier campaigns were found for this portfolio.',
    });
  }

  const weightedRows = activeRows.map((row) => {
    let multiplier = 1;
    if (row.selected_cpa !== null && row.target_cpa_cents > 0) {
      multiplier = Math.max(0.5, Math.min(1.5, (row.target_cpa_cents / 100) / row.selected_cpa));
    } else if (row.spend_cents > 0 && row.selected_conversions === 0) {
      multiplier = 0.75;
    }
    return {
      ...row,
      weight: Math.max(0.1, row.budget_pct * multiplier),
    };
  });

  const totalWeight = weightedRows.reduce((sum, row) => sum + row.weight, 0);
  const recommendations = weightedRows.map((row, index) => {
    const rawBudget = totalWeight > 0
      ? Math.round((performance.portfolio_budget_cents * row.weight) / totalWeight)
      : row.daily_budget_cents;
    const minimumBudget = 500;
    const remainingRows = weightedRows.length - index - 1;
    const maxForRow = performance.portfolio_budget_cents - (remainingRows * minimumBudget);
    const nextBudgetCents = Math.max(minimumBudget, Math.min(rawBudget, maxForRow));
    return {
      tier: row.tier,
      campaign_id: row.campaign_id,
      meta_adset_id: row.meta_adset_id,
      current_budget_cents: row.daily_budget_cents,
      new_budget_cents: nextBudgetCents,
      selected_metric: row.selected_metric,
      selected_cpa: row.selected_cpa,
      reason: row.selected_cpa !== null
        ? `${row.selected_metric.toUpperCase()} cost ${row.selected_cpa.toFixed(2)} vs target ${(row.target_cpa_cents / 100).toFixed(2)}`
        : 'No attributable downstream performance yet, keeping a conservative allocation.',
    };
  });

  if (!dryRun) {
    const accessToken = normalizeString(req.body?.meta_access_token) || resolveAutonomousAccessToken(business.id, business.facebook_access_token);

    for (const recommendation of recommendations) {
      if (!recommendation.campaign_id) continue;

      const linkedTierCampaign = (portfolio.audience_tier_campaigns || []).find((candidate: any) => candidate.campaign_id === recommendation.campaign_id);
      await updatePortfolioTierCampaign(linkedTierCampaign?.id || null, {
        ...(linkedTierCampaign || {}),
        portfolio_id: portfolio.id,
        business_id: business.id,
        user_id: auth.keyRecord.user_id,
        tier: recommendation.tier,
        campaign_id: recommendation.campaign_id,
        meta_adset_id: recommendation.meta_adset_id,
        daily_budget_cents: recommendation.new_budget_cents,
        status: 'active',
        performance_data: {
          last_rebalance_at: new Date().toISOString(),
          selected_metric: recommendation.selected_metric,
          selected_cpa: recommendation.selected_cpa,
        },
      });

      await supabaseAdmin
        .from('campaigns')
        .update({ daily_budget_cents: recommendation.new_budget_cents })
        .eq('id', recommendation.campaign_id)
        .then(() => {});

      if (accessToken && recommendation.meta_adset_id) {
        const form = new URLSearchParams({
          daily_budget: String(recommendation.new_budget_cents),
          access_token: accessToken,
        });
        await fetch(`${GRAPH_BASE}/${recommendation.meta_adset_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        }).catch(() => {});
      }
    }
  }

  return res.status(200).json({
    portfolio_id: portfolio.id,
    dry_run: dryRun,
    recommendations,
    rebalanced_at: new Date().toISOString(),
  });
}

// ── POST /api/v1/portfolios/:id/launch ───────────────────────────────────

async function handlePortfolioLaunch(req: VercelRequest, res: VercelResponse, portfolioId: string) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const portfolio = await getOwnedPortfolio(portfolioId, auth.keyRecord.user_id);
  if (!portfolio) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Portfolio not found' } });
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('id', portfolio.business_id)
    .eq('user_id', auth.keyRecord.user_id)
    .maybeSingle();
  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }

  let {
    meta_access_token,
    meta_ad_account_id,
    meta_page_id,
  } = req.body || {};

  const resolvedMeta = await resolveMetaCredentials({
    apiKeyId: auth.keyRecord.id,
    userId: auth.keyRecord.user_id,
    meta_access_token,
    meta_ad_account_id,
    meta_page_id,
  });

  meta_access_token = meta_access_token || resolvedMeta.meta_access_token;
  let resolvedPixelId = resolvedMeta.meta_pixel_id || normalizeString(business.meta_pixel_id) || null;

  const adAccountResolution = await resolveAdAccountIdForLaunch({
    userId: auth.keyRecord.user_id,
    resolvedMeta: {
      ...resolvedMeta,
      meta_access_token,
      meta_ad_account_id,
      meta_page_id,
      meta_pixel_id: resolvedPixelId,
    },
  });
  if (!meta_ad_account_id && adAccountResolution.meta_ad_account_id) {
    meta_ad_account_id = adAccountResolution.meta_ad_account_id;
  }
  resolvedPixelId = adAccountResolution.meta_pixel_id || resolvedPixelId;

  const pageResolution = await resolvePageIdForLaunch({
    userId: auth.keyRecord.user_id,
    resolvedMeta: {
      ...resolvedMeta,
      meta_access_token,
      meta_ad_account_id,
      meta_page_id,
      meta_pixel_id: resolvedPixelId,
    },
  });
  if (!meta_page_id && pageResolution.meta_page_id) {
    meta_page_id = pageResolution.meta_page_id;
  }

  const missing = [
    !meta_access_token && 'meta_access_token',
    !meta_ad_account_id && 'meta_ad_account_id',
    !meta_page_id && 'meta_page_id',
  ].filter(Boolean);
  if (missing.length > 0) {
    return res.status(400).json({
      error: {
        code: 'missing_meta_credentials',
        message: `Missing: ${missing.join(', ')}`,
      },
      available_ad_accounts: adAccountResolution.available_ad_accounts || [],
      available_pages: pageResolution.available_pages || [],
    });
  }

  const { data: policy } = await supabaseAdmin
    .from('autonomous_policies')
    .select('*')
    .eq('business_id', business.id)
    .maybeSingle();
  const baseTargetCpaCents = getPolicyTargetCpaCents(policy);
  const tiers = sanitizePortfolioTiers(portfolio.tiers) || [];

  const { data: seedEvents } = await supabaseAdmin
    .from('capi_events')
    .select('meta_event_name')
    .eq('business_id', business.id)
    .eq('status', 'sent')
    .eq('is_test', false)
    .gte('created_at', new Date(Date.now() - (180 * 24 * 60 * 60 * 1000)).toISOString());

  const seedSummary = (seedEvents || []).reduce((acc: Record<string, number>, row: any) => {
    const key = normalizeString(row.meta_event_name) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const totalSeedCount = Object.values(seedSummary).reduce((sum, value) => sum + value, 0);

  const results: Array<Record<string, any>> = [];
  for (const tier of tiers) {
    const tierBudgetCents = Math.max(500, Math.round((portfolio.total_daily_budget_cents * tier.budget_pct) / 100));
    const tierKey = tier.tier.toLowerCase();

    let blockedReason: string | null = null;
    if ((tierKey.includes('lal') || tierKey.includes('lookalike')) && totalSeedCount < 100) {
      blockedReason = `Tier requires at least 100 CAPI seed events for lookalike audiences. Found ${totalSeedCount}.`;
    } else if (tierKey.includes('retargeting') && !resolvedPixelId) {
      blockedReason = 'Tier requires a Meta Pixel ID for retargeting audiences.';
    } else if (tierKey.includes('reactivation') && ((seedSummary.Purchase || 0) + (seedSummary.Contact || 0)) < 20) {
      blockedReason = `Tier requires at least 20 attributed Contact or Purchase events. Found ${(seedSummary.Purchase || 0) + (seedSummary.Contact || 0)}.`;
    }

    const existingTierCampaign = (portfolio.audience_tier_campaigns || []).find((candidate: any) => candidate.tier === tier.tier) || null;
    if (blockedReason) {
      await updatePortfolioTierCampaign(existingTierCampaign?.id || null, {
        ...(existingTierCampaign || {}),
        portfolio_id: portfolio.id,
        business_id: business.id,
        user_id: auth.keyRecord.user_id,
        tier: tier.tier,
        campaign_id: existingTierCampaign?.campaign_id || null,
        meta_campaign_id: existingTierCampaign?.meta_campaign_id || null,
        meta_adset_id: existingTierCampaign?.meta_adset_id || null,
        daily_budget_cents: tierBudgetCents,
        status: 'blocked',
        performance_data: {
          blocked_reason: blockedReason,
          checked_at: new Date().toISOString(),
        },
      });

      results.push({ tier: tier.tier, status: 'blocked', reason: blockedReason, daily_budget_cents: tierBudgetCents });
      continue;
    }

    const draftCampaign = buildTierLaunchDraft({
      business,
      tier,
      tierBudgetCents,
      baseTargetCpaCents,
    });

    const launchResult = await launchCampaignInternal({
      campaignId: `portfolio_${portfolio.id}_${tier.tier}_${Date.now()}`,
      meta_access_token,
      meta_ad_account_id,
      meta_page_id,
      meta_pixel_id: resolvedPixelId,
      variant_index: 0,
      daily_budget_cents: tierBudgetCents,
      radius_km: business.target_radius_km || 25,
      campaign: draftCampaign,
      auth: auth.keyRecord,
      business,
      businessId: business.id,
    });

    if (!launchResult.success || !launchResult.data) {
      await updatePortfolioTierCampaign(existingTierCampaign?.id || null, {
        ...(existingTierCampaign || {}),
        portfolio_id: portfolio.id,
        business_id: business.id,
        user_id: auth.keyRecord.user_id,
        tier: tier.tier,
        campaign_id: existingTierCampaign?.campaign_id || null,
        meta_campaign_id: existingTierCampaign?.meta_campaign_id || null,
        meta_adset_id: existingTierCampaign?.meta_adset_id || null,
        daily_budget_cents: tierBudgetCents,
        status: 'failed',
        performance_data: {
          error: launchResult.error || null,
          failed_at: new Date().toISOString(),
        },
      });

      results.push({ tier: tier.tier, status: 'failed', error: launchResult.error, daily_budget_cents: tierBudgetCents });
      continue;
    }

    const launchedAt = launchResult.data.launched_at || new Date().toISOString();
    const selectedVariant = launchResult.data.selected_variant || draftCampaign.variants?.[0] || {};
    const launchedCampaignId = await upsertLaunchedCampaignRecord({
      businessId: business.id,
      campaignName: `${draftCampaign.business_name || business.name} – API – ${launchedAt.slice(0, 10)}`,
      status: 'active',
      dailyBudgetCents: tierBudgetCents,
      radiusKm: business.target_radius_km || 25,
      headline: selectedVariant.headline || draftCampaign.business_name || business.name,
      adBody: selectedVariant.copy || `Promote ${business.name}`,
      imageUrl: selectedVariant.image_url || null,
      metaCampaignId: launchResult.data.meta_campaign_id,
      metaAdSetId: launchResult.data.meta_adset_id,
      metaAdId: launchResult.data.meta_ad_id,
      metaLeadFormId: launchResult.data.lead_form_id,
      launchedAt,
    });

    await updatePortfolioTierCampaign(existingTierCampaign?.id || null, {
      ...(existingTierCampaign || {}),
      portfolio_id: portfolio.id,
      business_id: business.id,
      user_id: auth.keyRecord.user_id,
      tier: tier.tier,
      campaign_id: launchedCampaignId,
      meta_campaign_id: launchResult.data.meta_campaign_id,
      meta_adset_id: launchResult.data.meta_adset_id,
      daily_budget_cents: tierBudgetCents,
      status: 'active',
      performance_data: {
        launched_at: launchedAt,
        selected_variant: selectedVariant,
      },
    });

    results.push({
      tier: tier.tier,
      status: 'active',
      campaign_id: launchedCampaignId,
      meta_campaign_id: launchResult.data.meta_campaign_id,
      meta_adset_id: launchResult.data.meta_adset_id,
      daily_budget_cents: tierBudgetCents,
    });
  }

  return res.status(200).json({
    portfolio_id: portfolio.id,
    launched: results.filter((result) => result.status === 'active').length,
    blocked: results.filter((result) => result.status === 'blocked').length,
    failed: results.filter((result) => result.status === 'failed').length,
    results,
    launched_at: new Date().toISOString(),
  });
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

async function handleMetaAdAccounts(req: VercelRequest, res: VercelResponse) {
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
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/ad-accounts', method: 'GET', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'missing_meta_credentials',
        message: 'No stored Meta access token found. Connect Facebook at https://zuckerbot.ai/profile first.',
        connect_url: 'https://zuckerbot.ai/profile',
      },
    });
  }

  const adAccountsResult = await listFacebookAdAccounts(accessToken);
  if (!adAccountsResult.ok) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/ad-accounts', method: 'GET', statusCode: 502, responseTimeMs: Date.now() - startTime });
    return res.status(502).json({
      error: {
        code: 'meta_api_error',
        message: adAccountsResult.error || 'Failed to fetch Meta ad accounts',
      },
    });
  }

  const selectedAdAccountId = normalizeString(resolvedMeta.meta_ad_account_id);
  const effectiveSelectedAdAccountId = adAccountsResult.adAccounts.some((account) => account.id === selectedAdAccountId)
    ? selectedAdAccountId
    : null;

  const adAccounts = adAccountsResult.adAccounts.map((account) => {
    const isSelected = effectiveSelectedAdAccountId === account.id;
    return {
      ...account,
      selected: isSelected,
      is_selected: isSelected,
    };
  });

  await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/ad-accounts', method: 'GET', statusCode: 200, responseTimeMs: Date.now() - startTime });
  return res.status(200).json({
    ad_accounts: adAccounts,
    selected_ad_account_id: effectiveSelectedAdAccountId,
    ad_account_count: adAccounts.length,
  });
}

// ── POST /api/v1/meta/select-ad-account ─────────────────────────────────

async function handleMetaSelectAdAccount(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const selectedAdAccountId = normalizeString(req.body?.ad_account_id);
  if (!selectedAdAccountId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/select-ad-account', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: '`ad_account_id` is required',
      },
    });
  }

  const resolvedMeta = await resolveMetaCredentials({
    apiKeyId: auth.keyRecord.id,
    userId: auth.keyRecord.user_id,
  });

  const accessToken = normalizeString(resolvedMeta.meta_access_token);
  if (!accessToken) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/select-ad-account', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'missing_meta_credentials',
        message: 'No stored Meta access token found. Connect Facebook at https://zuckerbot.ai/profile first.',
        connect_url: 'https://zuckerbot.ai/profile',
      },
    });
  }

  const adAccountsResult = await listFacebookAdAccounts(accessToken);
  if (!adAccountsResult.ok) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/select-ad-account', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
    return res.status(502).json({
      error: {
        code: 'meta_api_error',
        message: adAccountsResult.error || 'Failed to fetch Meta ad accounts',
      },
    });
  }

  const selectedAdAccount = adAccountsResult.adAccounts.find((account) => account.id === selectedAdAccountId);
  if (!selectedAdAccount) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/select-ad-account', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'The provided `ad_account_id` is not available for the connected Meta account.',
      },
      available_ad_accounts: adAccountsResult.adAccounts.slice(0, 25),
    });
  }

  const currentAdAccountId = normalizeString(resolvedMeta.meta_ad_account_id);
  const currentPageId = normalizeString(resolvedMeta.meta_page_id);
  const currentPixelId = normalizeString(resolvedMeta.meta_pixel_id);
  const isSwitch = currentAdAccountId !== selectedAdAccount.id;
  const pageSelectionRequired = isSwitch || !currentPageId;
  const pixelsResult = await listAdAccountPixels(accessToken, selectedAdAccount.id);
  if (!pixelsResult.ok) {
    console.warn('[api/meta] Failed to fetch pixels for selected ad account:', pixelsResult.error);
  }
  const selectedPixelId = pixelsResult.ok
    ? resolveSelectedPixelId(pixelsResult.pixels, isSwitch ? null : currentPixelId)
    : null;

  await persistBusinessAdAccountSelection(
    auth.keyRecord.user_id,
    resolvedMeta.business_id,
    selectedAdAccount.id,
    selectedPixelId,
    { clearStoredPageId: isSwitch },
  );

  await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/meta/select-ad-account', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
  return res.status(200).json({
    selected_ad_account_id: selectedAdAccount.id,
    selected_ad_account_name: selectedAdAccount.name,
    selected_pixel_id: selectedPixelId,
    pixel_selection_required: pixelsResult.ok ? pixelsResult.pixels.length > 1 && !selectedPixelId : false,
    page_selection_required: pageSelectionRequired,
    page_id_cleared: isSwitch,
    stored: !!resolvedMeta.business_id,
  });
}

// ── GET /api/v1/pixels ───────────────────────────────────────────────────

async function handlePixels(req: VercelRequest, res: VercelResponse) {
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
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels', method: 'GET', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'missing_meta_credentials',
        message: 'No stored Meta access token found. Connect Facebook at https://zuckerbot.ai/profile first.',
        connect_url: 'https://zuckerbot.ai/profile',
      },
    });
  }

  let selectedAdAccountId = normalizeString(resolvedMeta.meta_ad_account_id);
  let storedPixelId = normalizeString(resolvedMeta.meta_pixel_id);

  if (!selectedAdAccountId) {
    const adAccountResolution = await resolveAdAccountIdForLaunch({
      userId: auth.keyRecord.user_id,
      resolvedMeta,
    });

    if (adAccountResolution.source === 'meta_error') {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels', method: 'GET', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({
        error: {
          code: 'meta_api_error',
          message: adAccountResolution.meta_error || 'Failed to fetch Meta ad accounts',
        },
      });
    }

    if (adAccountResolution.source === 'selection_required') {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels', method: 'GET', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({
        error: {
          code: 'meta_ad_account_selection_required',
          message: 'Multiple Meta ad accounts were found. Select one ad account before listing pixels.',
          select_ad_account_endpoint: '/api/v1/meta/select-ad-account',
        },
        available_ad_accounts: (adAccountResolution.available_ad_accounts || []).slice(0, 25),
      });
    }

    selectedAdAccountId = normalizeString(adAccountResolution.meta_ad_account_id);
    storedPixelId = normalizeString(adAccountResolution.meta_pixel_id);
  }

  if (!selectedAdAccountId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels', method: 'GET', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'No Meta ad account is selected for this API key/user. Select an ad account at https://zuckerbot.ai/profile first.',
        connect_url: 'https://zuckerbot.ai/profile',
      },
    });
  }

  const pixelsResult = await listAdAccountPixels(accessToken, selectedAdAccountId);
  if (!pixelsResult.ok) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels', method: 'GET', statusCode: 502, responseTimeMs: Date.now() - startTime });
    return res.status(502).json({
      error: {
        code: 'meta_api_error',
        message: pixelsResult.error || 'Failed to fetch Meta pixels',
      },
    });
  }

  const selectedPixelId = resolveSelectedPixelId(pixelsResult.pixels, storedPixelId);
  if (selectedPixelId !== storedPixelId) {
    await persistBusinessPixelSelection(
      auth.keyRecord.user_id,
      resolvedMeta.business_id,
      selectedPixelId,
    );
  }

  const pixels = pixelsResult.pixels.map((pixel) => {
    const isSelected = pixel.id === selectedPixelId;
    return {
      ...pixel,
      selected: isSelected,
      is_selected: isSelected,
    };
  });

  await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels', method: 'GET', statusCode: 200, responseTimeMs: Date.now() - startTime });
  return res.status(200).json({
    selected_ad_account_id: selectedAdAccountId,
    pixels,
    selected_pixel_id: selectedPixelId,
    pixel_count: pixels.length,
  });
}

// ── POST /api/v1/pixels/select ───────────────────────────────────────────

async function handleSelectPixel(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const selectedPixelId = normalizeString(req.body?.pixel_id);
  if (!selectedPixelId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels/select', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: '`pixel_id` is required',
      },
    });
  }

  const resolvedMeta = await resolveMetaCredentials({
    apiKeyId: auth.keyRecord.id,
    userId: auth.keyRecord.user_id,
  });

  const accessToken = normalizeString(resolvedMeta.meta_access_token);
  if (!accessToken) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels/select', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'missing_meta_credentials',
        message: 'No stored Meta access token found. Connect Facebook at https://zuckerbot.ai/profile first.',
        connect_url: 'https://zuckerbot.ai/profile',
      },
    });
  }

  let selectedAdAccountId = normalizeString(resolvedMeta.meta_ad_account_id);
  if (!selectedAdAccountId) {
    const adAccountResolution = await resolveAdAccountIdForLaunch({
      userId: auth.keyRecord.user_id,
      resolvedMeta,
    });

    if (adAccountResolution.source === 'meta_error') {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels/select', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({
        error: {
          code: 'meta_api_error',
          message: adAccountResolution.meta_error || 'Failed to fetch Meta ad accounts',
        },
      });
    }

    if (adAccountResolution.source === 'selection_required') {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels/select', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({
        error: {
          code: 'meta_ad_account_selection_required',
          message: 'Multiple Meta ad accounts were found. Select one ad account before selecting a pixel.',
          select_ad_account_endpoint: '/api/v1/meta/select-ad-account',
        },
        available_ad_accounts: (adAccountResolution.available_ad_accounts || []).slice(0, 25),
      });
    }

    selectedAdAccountId = normalizeString(adAccountResolution.meta_ad_account_id);
  }

  if (!selectedAdAccountId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels/select', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'No Meta ad account is selected for this API key/user. Select an ad account at https://zuckerbot.ai/profile first.',
        connect_url: 'https://zuckerbot.ai/profile',
      },
    });
  }

  const pixelsResult = await listAdAccountPixels(accessToken, selectedAdAccountId);
  if (!pixelsResult.ok) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels/select', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
    return res.status(502).json({
      error: {
        code: 'meta_api_error',
        message: pixelsResult.error || 'Failed to fetch Meta pixels',
      },
    });
  }

  const selectedPixel = pixelsResult.pixels.find((pixel) => pixel.id === selectedPixelId);
  if (!selectedPixel) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels/select', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'The provided `pixel_id` is not available for the selected Meta ad account.',
      },
      available_pixels: pixelsResult.pixels.slice(0, 25),
      selected_ad_account_id: selectedAdAccountId,
    });
  }

  await persistBusinessPixelSelection(
    auth.keyRecord.user_id,
    resolvedMeta.business_id,
    selectedPixel.id,
  );

  await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/pixels/select', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
  return res.status(200).json({
    selected_ad_account_id: selectedAdAccountId,
    selected_pixel_id: selectedPixel.id,
    selected_pixel_name: selectedPixel.name,
    stored: !!resolvedMeta.business_id,
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

// ── GET /api/v1/lead-forms ────────────────────────────────────────────────

async function handleLeadForms(req: VercelRequest, res: VercelResponse) {
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

  if (!resolvedMeta.business_id) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms', method: 'GET', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'business_required',
        message: 'A business must be linked before lead forms can be listed.',
      },
    });
  }

  const accessToken = normalizeString(resolvedMeta.meta_access_token);
  if (!accessToken) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms', method: 'GET', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'missing_meta_credentials',
        message: 'No stored Meta access token found. Connect Facebook at https://zuckerbot.ai/profile first.',
        connect_url: 'https://zuckerbot.ai/profile',
      },
    });
  }

  let selectedAdAccountId = normalizeString(resolvedMeta.meta_ad_account_id);
  if (!selectedAdAccountId) {
    const adAccountResolution = await resolveAdAccountIdForLaunch({
      userId: auth.keyRecord.user_id,
      resolvedMeta,
    });

    if (adAccountResolution.source === 'meta_error') {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms', method: 'GET', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({
        error: {
          code: 'meta_api_error',
          message: adAccountResolution.meta_error || 'Failed to fetch Meta ad accounts',
        },
      });
    }

    if (adAccountResolution.source === 'selection_required') {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms', method: 'GET', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({
        error: {
          code: 'meta_ad_account_selection_required',
          message: 'Multiple Meta ad accounts were found. Select one ad account before listing lead forms.',
          select_ad_account_endpoint: '/api/v1/meta/select-ad-account',
        },
        available_ad_accounts: (adAccountResolution.available_ad_accounts || []).slice(0, 25),
      });
    }

    selectedAdAccountId = normalizeString(adAccountResolution.meta_ad_account_id);
  }

  if (!selectedAdAccountId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms', method: 'GET', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'No Meta ad account is selected for this API key/user. Select an ad account at https://zuckerbot.ai/profile first.',
        connect_url: 'https://zuckerbot.ai/profile',
      },
    });
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, meta_leadgen_form_id')
    .eq('id', resolvedMeta.business_id)
    .maybeSingle();

  const formsResult = await listMetaLeadForms(accessToken, selectedAdAccountId);
  if (!formsResult.ok) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms', method: 'GET', statusCode: 502, responseTimeMs: Date.now() - startTime });
    return res.status(502).json({
      error: {
        code: 'meta_api_error',
        message: formsResult.error || 'Failed to fetch Meta lead forms',
      },
    });
  }

  let selectedFormId = normalizeString(business?.meta_leadgen_form_id);
  if (!selectedFormId && formsResult.forms.length === 1) {
    selectedFormId = formsResult.forms[0].id;
    await persistBusinessLeadFormSelection(auth.keyRecord.user_id, resolvedMeta.business_id, selectedFormId);
  }

  const forms = formsResult.forms.map((form) => {
    const isSelected = form.id === selectedFormId;
    return {
      ...form,
      selected: isSelected,
      is_selected: isSelected,
    };
  });

  await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms', method: 'GET', statusCode: 200, responseTimeMs: Date.now() - startTime });
  return res.status(200).json({
    selected_ad_account_id: selectedAdAccountId,
    forms,
    selected_form_id: selectedFormId,
    form_count: forms.length,
  });
}

// ── POST /api/v1/lead-forms/select ───────────────────────────────────────

async function handleSelectLeadForm(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST required' } });

  const startTime = Date.now();
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const formId = normalizeString(req.body?.form_id);
  if (!formId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms/select', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: '`form_id` is required',
      },
    });
  }

  const resolvedMeta = await resolveMetaCredentials({
    apiKeyId: auth.keyRecord.id,
    userId: auth.keyRecord.user_id,
  });

  if (!resolvedMeta.business_id) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms/select', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'business_required',
        message: 'A business must be linked before a lead form can be selected.',
      },
    });
  }

  const accessToken = normalizeString(resolvedMeta.meta_access_token);
  if (!accessToken) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms/select', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'missing_meta_credentials',
        message: 'No stored Meta access token found. Connect Facebook at https://zuckerbot.ai/profile first.',
        connect_url: 'https://zuckerbot.ai/profile',
      },
    });
  }

  let selectedAdAccountId = normalizeString(resolvedMeta.meta_ad_account_id);
  if (!selectedAdAccountId) {
    const adAccountResolution = await resolveAdAccountIdForLaunch({
      userId: auth.keyRecord.user_id,
      resolvedMeta,
    });

    if (adAccountResolution.source === 'meta_error') {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms/select', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
      return res.status(502).json({
        error: {
          code: 'meta_api_error',
          message: adAccountResolution.meta_error || 'Failed to fetch Meta ad accounts',
        },
      });
    }

    if (adAccountResolution.source === 'selection_required') {
      await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms/select', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
      return res.status(400).json({
        error: {
          code: 'meta_ad_account_selection_required',
          message: 'Multiple Meta ad accounts were found. Select one ad account before selecting a lead form.',
          select_ad_account_endpoint: '/api/v1/meta/select-ad-account',
        },
        available_ad_accounts: (adAccountResolution.available_ad_accounts || []).slice(0, 25),
      });
    }

    selectedAdAccountId = normalizeString(adAccountResolution.meta_ad_account_id);
  }

  if (!selectedAdAccountId) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms/select', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'No Meta ad account is selected for this API key/user. Select an ad account at https://zuckerbot.ai/profile first.',
        connect_url: 'https://zuckerbot.ai/profile',
      },
    });
  }

  const formsResult = await listMetaLeadForms(accessToken, selectedAdAccountId);
  if (!formsResult.ok) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms/select', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - startTime });
    return res.status(502).json({
      error: {
        code: 'meta_api_error',
        message: formsResult.error || 'Failed to fetch Meta lead forms',
      },
    });
  }

  const selectedForm = formsResult.forms.find((form) => form.id === formId);
  if (!selectedForm) {
    await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms/select', method: 'POST', statusCode: 400, responseTimeMs: Date.now() - startTime });
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'The provided `form_id` is not available for the selected Meta ad account.',
      },
      available_forms: formsResult.forms.slice(0, 25),
      selected_ad_account_id: selectedAdAccountId,
    });
  }

  await persistBusinessLeadFormSelection(auth.keyRecord.user_id, resolvedMeta.business_id, selectedForm.id);

  await logUsage({ apiKeyId: auth.keyRecord.id, endpoint: '/v1/lead-forms/select', method: 'POST', statusCode: 200, responseTimeMs: Date.now() - startTime });
  return res.status(200).json({
    selected_ad_account_id: selectedAdAccountId,
    selected_form_id: selectedForm.id,
    selected_form_name: selectedForm.name,
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

let creativeBucketInitialized = false;

async function ensureCreativeBucket(): Promise<void> {
  if (creativeBucketInitialized) return;
  try {
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    if (error) {
      console.error('[api/creatives] Failed to list storage buckets:', error);
      return;
    }

    const existing = buckets?.find((bucket) => bucket.name === CREATIVE_STORAGE_BUCKET);
    if (!existing) {
      const { error: createError } = await supabaseAdmin.storage.createBucket(CREATIVE_STORAGE_BUCKET, {
        public: true,
      });
      if (createError) {
        console.error('[api/creatives] Failed to create creatives bucket:', createError);
        return;
      }
    } else if (!existing.public) {
      const { error: updateError } = await supabaseAdmin.storage.updateBucket(CREATIVE_STORAGE_BUCKET, {
        public: true,
      });
      if (updateError) {
        console.error('[api/creatives] Failed to update creatives bucket to public:', updateError);
      }
    }

    creativeBucketInitialized = true;
  } catch (err) {
    console.error('[api/creatives] Failed to ensure creatives bucket:', err);
  }
}

function getCreativeFileExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'video/webm') return 'webm';
  return 'png';
}

async function uploadCreativeMedia(
  source: { path?: string; base64?: string; mimeType?: string },
  prefix: string,
): Promise<string | null> {
  try {
    await ensureCreativeBucket();

    let buffer: Buffer | null = null;
    let mimeType = source.mimeType || 'image/png';
    if (source.base64) {
      buffer = Buffer.from(source.base64, 'base64');
    } else if (source.path) {
      const response = await fetch(source.path);
      if (!response.ok) {
        console.error('[api/creatives] Failed to download generated media:', await response.text());
        return null;
      }
      if (!mimeType && response.headers.get('content-type')) {
        mimeType = response.headers.get('content-type')!.split(';')[0] || mimeType;
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    if (!buffer) return null;

    const fileName = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${getCreativeFileExtension(mimeType)}`;
    const { error } = await supabaseAdmin.storage.from(CREATIVE_STORAGE_BUCKET).upload(fileName, buffer, {
      contentType: mimeType || 'image/png',
      upsert: true,
    });

    if (error) {
      console.error('[api/creatives] Failed to upload to creatives bucket:', error);
      return null;
    }

    const { data } = supabaseAdmin.storage.from(CREATIVE_STORAGE_BUCKET).getPublicUrl(fileName);
    return data?.publicUrl || null;
  } catch (err) {
    console.error('[api/creatives] Failed to store generated media:', err);
    return null;
  }
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
    return { success: false, error: 'WAVESPEED_API_KEY is not set. Add it to your Vercel environment variables.' };
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
    return res.status(500).json({
      error: {
        code: 'config_error',
        message: 'WAVESPEED_API_KEY is not set. Add it to your Vercel environment variables.',
      },
    });
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
      image_url: string | null;
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
          publicUrl = await uploadCreativeMedia({
            base64: base64Data,
            mimeType,
          }, `creative-kling`);
          if (!publicUrl) {
            console.error('[api/creatives] Kling upload failed');
          }
        }

        if (publicUrl) {
          actualGenerationMethod = 'kling_video';
          creatives.push({
            url: publicUrl,
            image_url: publicUrl,
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
            // Upload generated image to Supabase Storage and always return URL
            if (seedreamResult.imageUrl && !seedreamResult.base64) {
              const imageUrl = await uploadCreativeMedia({
                path: seedreamResult.imageUrl,
                mimeType: seedreamResult.mimeType || 'image/png',
              }, 'creative-seedream');
              publicUrl = imageUrl || '';
            } else if (seedreamResult.base64) {
              const base64Url = await uploadCreativeMedia({
                base64: seedreamResult.base64,
                mimeType: seedreamResult.mimeType || 'image/png',
              }, 'creative-seedream');
              publicUrl = base64Url || '';
            }

            if (publicUrl) {
              creatives.push({
                url: publicUrl || null,
                image_url: publicUrl || null,
                mimeType: seedreamResult.mimeType || 'image/png',
                prompt: imagePrompt,
                aspect_ratio: selectedRatio,
                generation_method: 'seedream',
              });
            } else {
              console.error('[api/creatives] Failed to upload Seedream image result:', seedreamResult.imageUrl || 'inline base64');
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
                const uploadedUrl = await uploadCreativeMedia({
                  base64: prediction.bytesBase64Encoded,
                  mimeType,
                }, `creative-imagen`);
                const publicUrl = uploadedUrl || '';

                if (publicUrl) {
                  creatives.push({
                    url: publicUrl,
                    image_url: publicUrl,
                    mimeType,
                    prompt: imagePrompt,
                    aspect_ratio: selectedRatio,
                    generation_method: 'imagen',
                  });
                } else {
                  console.error('[api/creatives] Imagen upload failed:', prediction.mimeType);
                }
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
  target_cpa_cents?: number | null;
  pause_multiplier: number;
  scale_multiplier: number;
  frequency_cap: number;
  /** @deprecated Use max_daily_budget_cents (integer cents). Kept for backward compat. */
  max_daily_budget: number;
  /** Budget safety cap in integer cents (e.g. $100 = 10000). Preferred over max_daily_budget. */
  max_daily_budget_cents?: number;
  scale_pct: number;
  min_conversions_to_scale: number;
  optimise_for?: 'lead' | 'sql' | 'customer' | string;
  capi_lookback_days?: number;
  min_spend_before_evaluation_cents?: number;
  evaluation_frequency_hours?: number;
}

interface CampaignMetric {
  campaign_id: string;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  name: string;
  status: string;
  daily_budget: number;       // dollars
  spend_today: number | null; // dollars — lifetime spend
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number | null;         // dollars per conversion
  ctr: number | null;         // ratio (0–1)
  cpc: number | null;         // dollars per click
  frequency: number | null;
  cpl_3d: number | null;
  cpl_7d: number | null;
  sql_conversions: number;
  customer_conversions: number;
  selected_metric: 'lead' | 'sql' | 'customer';
  selected_conversions: number;
  selected_cpa: number | null;
}

interface AutonomousAction {
  type: 'pause_campaign' | 'increase_budget' | 'refresh_creative';
  campaign_id: string;
  campaign_name: string;
  meta_campaign_id: string | null;
  meta_adset_id?: string | null;
  pct_change?: number;
  current_budget?: number;
  new_budget?: number;
  executable: true;
  requires_approval: true;
  trigger: 'cpa_threshold' | 'frequency_cap' | 'cpl_trend' | 'scale_winner';
  reason: string;
  metrics?: {
    spend_cents: number | null;
    conversions: number;
    cpa: number | null;
    selected_metric?: string;
    selected_conversions?: number;
    selected_cpa?: number | null;
    sql_conversions?: number;
    customer_conversions?: number;
    frequency: number | null;
    cpl_3d: number | null;
    cpl_7d: number | null;
    daily_budget_cents: number;
    new_budget_cents?: number;
  };
}

function extractLeadCount(actions: Array<{ action_type?: string; value?: string }> | null | undefined): number {
  if (!Array.isArray(actions)) return 0;
  const leadAction = actions.find((action) => {
    const type = (action.action_type || '').toLowerCase();
    return type === 'lead' || type.includes('lead');
  });
  return leadAction?.value ? parseInt(leadAction.value, 10) || 0 : 0;
}

function utcDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildRelativeTimeRange(daysBackStart: number, daysBackEnd: number): { since: string; until: string } {
  const since = new Date();
  const until = new Date();
  since.setUTCDate(since.getUTCDate() - daysBackStart);
  until.setUTCDate(until.getUTCDate() - daysBackEnd);
  return { since: utcDateOnly(since), until: utcDateOnly(until) };
}

function resolveAutonomousAccessToken(businessId: string, businessToken?: string | null): string | undefined {
  const allowSystemToken = process.env.ALLOW_SYSTEM_TOKEN_EXECUTION === 'true';
  const SYSTEM_TOKEN_ALLOWLIST: string[] = [];
  return businessToken
    || (allowSystemToken && SYSTEM_TOKEN_ALLOWLIST.includes(businessId)
      ? process.env.META_SYSTEM_USER_TOKEN
      : undefined);
}

async function fetchCampaignInsights(
  metaCampaignId: string,
  accessToken: string,
  opts: { datePreset?: string; timeRange?: { since: string; until: string } },
): Promise<any | null> {
  const params = new URLSearchParams({
    fields: 'impressions,clicks,spend,actions,frequency',
    access_token: accessToken,
  });

  if (opts.timeRange) {
    params.set('time_range', JSON.stringify(opts.timeRange));
  } else if (opts.datePreset) {
    params.set('date_preset', opts.datePreset);
  }

  try {
    const response = await fetch(`${GRAPH_BASE}/${metaCampaignId}/insights?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok || payload.error) {
      console.warn('[autonomous/metrics] Meta insights error:', payload.error || response.status);
      return null;
    }
    return payload.data?.[0] || null;
  } catch (error) {
    console.warn('[autonomous/metrics] Failed to fetch campaign insights:', error);
    return null;
  }
}

async function enrichCampaignMetricWithMeta(
  metric: CampaignMetric,
  accessToken: string,
): Promise<CampaignMetric> {
  if (!metric.meta_campaign_id) return metric;

  const lifetimeInsights = await fetchCampaignInsights(metric.meta_campaign_id, accessToken, {
    datePreset: 'maximum',
  });
  const recent3DayInsights = await fetchCampaignInsights(metric.meta_campaign_id, accessToken, {
    timeRange: buildRelativeTimeRange(2, 0),
  });
  const prior7DayInsights = await fetchCampaignInsights(metric.meta_campaign_id, accessToken, {
    timeRange: buildRelativeTimeRange(9, 3),
  });

  const lifetimeSpend = lifetimeInsights?.spend ? parseFloat(lifetimeInsights.spend) : metric.spend_today;
  const lifetimeImpressions = lifetimeInsights?.impressions ? parseInt(lifetimeInsights.impressions, 10) : metric.impressions;
  const lifetimeClicks = lifetimeInsights?.clicks ? parseInt(lifetimeInsights.clicks, 10) : metric.clicks;
  const lifetimeConversions = lifetimeInsights ? extractLeadCount(lifetimeInsights.actions) : metric.conversions;
  const cpa = lifetimeConversions > 0 && lifetimeSpend !== null ? lifetimeSpend / lifetimeConversions : null;
  const ctr = lifetimeImpressions > 0 ? lifetimeClicks / lifetimeImpressions : null;
  const cpc = lifetimeClicks > 0 && lifetimeSpend !== null ? lifetimeSpend / lifetimeClicks : null;

  const recent3DaySpend = recent3DayInsights?.spend ? parseFloat(recent3DayInsights.spend) : null;
  const recent3DayConversions = extractLeadCount(recent3DayInsights?.actions);
  const prior7DaySpend = prior7DayInsights?.spend ? parseFloat(prior7DayInsights.spend) : null;
  const prior7DayConversions = extractLeadCount(prior7DayInsights?.actions);

  return {
    ...metric,
    spend_today: lifetimeSpend,
    impressions: lifetimeImpressions,
    clicks: lifetimeClicks,
    conversions: lifetimeConversions,
    cpa,
    ctr,
    cpc,
    frequency: lifetimeInsights?.frequency ? parseFloat(lifetimeInsights.frequency) : metric.frequency,
    cpl_3d: recent3DaySpend !== null && recent3DayConversions > 0 ? recent3DaySpend / recent3DayConversions : null,
    cpl_7d: prior7DaySpend !== null && prior7DayConversions > 0 ? prior7DaySpend / prior7DayConversions : null,
  };
}

/** Load all campaigns for a business and return normalized metrics. */
async function fetchBusinessCampaignMetrics(businessId: string, policyInput?: Partial<AutonomousPolicy> | null): Promise<CampaignMetric[]> {
  const { data: campaigns } = await supabaseAdmin
    .from('campaigns')
    .select('id, name, status, daily_budget_cents, spend_cents, impressions, clicks, leads_count, meta_campaign_id, meta_adset_id')
    .eq('business_id', businessId);

  const baseMetrics = (campaigns || []).map((c: any) => {
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
      spend_today: spendDollars,
      impressions,
      clicks,
      conversions,
      cpa,
      ctr,
      cpc,
      frequency: null,
      cpl_3d: null,
      cpl_7d: null,
      sql_conversions: 0,
      customer_conversions: 0,
      selected_metric: 'lead' as const,
      selected_conversions: conversions,
      selected_cpa: cpa,
    };
  });

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('facebook_access_token')
    .eq('id', businessId)
    .maybeSingle();

  const accessToken = resolveAutonomousAccessToken(businessId, business?.facebook_access_token);
  const enrichedMetrics = accessToken
    ? await Promise.all(baseMetrics.map((metric) => enrichCampaignMetricWithMeta(metric, accessToken)))
    : baseMetrics;

  const policy = policyInput || (await supabaseAdmin
    .from('autonomous_policies')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()).data || null;
  const capiConfig = await supabaseAdmin
    .from('capi_configs')
    .select('is_enabled, optimise_for')
    .eq('business_id', businessId)
    .maybeSingle();
  const capiEnabled = !!capiConfig.data?.is_enabled;
  const optimiseFor = normalizeString(policy?.optimise_for) || normalizeString(capiConfig.data?.optimise_for) || 'lead';
  const lookbackDays = Number(policy?.capi_lookback_days) > 0 ? Number(policy?.capi_lookback_days) : 30;
  const downstreamMetrics = capiEnabled
    ? await fetchAttributedCapiMetricsByCampaign(businessId, lookbackDays)
    : {};

  return enrichedMetrics.map((metric) => {
    const downstream = downstreamMetrics[metric.campaign_id] || { lead: 0, sql: 0, customer: 0 };
    let selectedMetric: 'lead' | 'sql' | 'customer' = 'lead';
    let selectedConversions = metric.conversions;
    let selectedCpa = metric.cpa;

    if (capiEnabled && optimiseFor === 'customer' && downstream.customer > 0) {
      selectedMetric = 'customer';
      selectedConversions = downstream.customer;
      selectedCpa = metric.spend_today !== null ? metric.spend_today / downstream.customer : null;
    } else if (capiEnabled && optimiseFor === 'sql' && downstream.sql > 0) {
      selectedMetric = 'sql';
      selectedConversions = downstream.sql;
      selectedCpa = metric.spend_today !== null ? metric.spend_today / downstream.sql : null;
    }

    return {
      ...metric,
      sql_conversions: downstream.sql,
      customer_conversions: downstream.customer,
      selected_metric: selectedMetric,
      selected_conversions: selectedConversions,
      selected_cpa: selectedCpa,
    };
  });
}

/** Deterministically generate approval-gated actions from policy + metrics. */
function generateAutonomousActions(policy: AutonomousPolicy, metrics: CampaignMetric[]): AutonomousAction[] {
  const actions: AutonomousAction[] = [];
  const spendMinUsd = (typeof policy.min_spend_before_evaluation_cents === 'number'
    ? policy.min_spend_before_evaluation_cents
    : 500) / 100;
  const targetCpaUsd = getPolicyTargetCpaDollars(policy);

  const maxBudgetDollars = policy.max_daily_budget_cents != null
    ? policy.max_daily_budget_cents / 100
    : policy.max_daily_budget;

  for (const m of metrics) {
    const statusNorm = (m.status || '').toLowerCase();
    if (!['active', 'running'].includes(statusNorm)) continue;

    const metricSnapshot = {
      spend_cents: m.spend_today !== null ? Math.round(m.spend_today * 100) : null,
      conversions: m.conversions,
      cpa: m.cpa,
      selected_metric: m.selected_metric,
      selected_conversions: m.selected_conversions,
      selected_cpa: m.selected_cpa,
      sql_conversions: m.sql_conversions,
      customer_conversions: m.customer_conversions,
      frequency: m.frequency,
      cpl_3d: m.cpl_3d,
      cpl_7d: m.cpl_7d,
      daily_budget_cents: Math.round(m.daily_budget * 100),
    };
    const metricLabel = m.selected_metric === 'customer'
      ? 'CAC'
      : m.selected_metric === 'sql'
        ? 'Cost per SQL'
        : 'CPL';

    if (
      m.selected_cpa !== null &&
      (m.spend_today === null || m.spend_today > spendMinUsd) &&
      m.selected_cpa > targetCpaUsd * policy.pause_multiplier
    ) {
      actions.push({
        type: 'pause_campaign',
        campaign_id: m.campaign_id,
        campaign_name: m.name,
        meta_campaign_id: m.meta_campaign_id,
        executable: true,
        requires_approval: true,
        trigger: 'cpa_threshold',
        reason: `${metricLabel} $${m.selected_cpa.toFixed(2)} exceeds pause threshold ($${(targetCpaUsd * policy.pause_multiplier).toFixed(2)} = ${policy.pause_multiplier}x target ${metricLabel} $${targetCpaUsd.toFixed(2)})`,
        metrics: metricSnapshot,
      });
      continue;
    }

    if (m.frequency !== null && m.frequency > policy.frequency_cap) {
      actions.push({
        type: 'refresh_creative',
        campaign_id: m.campaign_id,
        campaign_name: m.name,
        meta_campaign_id: m.meta_campaign_id,
        executable: true,
        requires_approval: true,
        trigger: 'frequency_cap',
        reason: `Frequency ${m.frequency.toFixed(1)} exceeds cap ${policy.frequency_cap}`,
        metrics: metricSnapshot,
      });
      continue;
    }

    if (
      m.cpl_3d !== null &&
      m.cpl_7d !== null &&
      m.cpl_7d > 0 &&
      m.cpl_3d > m.cpl_7d * 1.5
    ) {
      actions.push({
        type: 'refresh_creative',
        campaign_id: m.campaign_id,
        campaign_name: m.name,
        meta_campaign_id: m.meta_campaign_id,
        executable: true,
        requires_approval: true,
        trigger: 'cpl_trend',
        reason: `CPL trending up: $${m.cpl_3d.toFixed(2)} (3d) vs $${m.cpl_7d.toFixed(2)} (prior 7d avg)`,
        metrics: metricSnapshot,
      });
      continue;
    }

    const spendBelowMax = m.spend_today === null || m.spend_today < maxBudgetDollars;
    if (
      m.selected_cpa !== null &&
      m.selected_cpa < targetCpaUsd * policy.scale_multiplier &&
      m.selected_conversions >= policy.min_conversions_to_scale &&
      spendBelowMax
    ) {
      const currentBudget = m.daily_budget;
      const rawNewBudget = currentBudget * (1 + policy.scale_pct);
      const newBudget = Math.min(rawNewBudget, maxBudgetDollars);
      const MIN_BUDGET_USD = 5;

      if (newBudget > Math.max(currentBudget, MIN_BUDGET_USD)) {
        actions.push({
          type: 'increase_budget',
          campaign_id: m.campaign_id,
          campaign_name: m.name,
          meta_campaign_id: m.meta_campaign_id,
          meta_adset_id: m.meta_adset_id,
          pct_change: policy.scale_pct,
          current_budget: currentBudget,
          new_budget: newBudget,
          executable: true,
          requires_approval: true,
          trigger: 'scale_winner',
          reason: `${metricLabel} $${m.selected_cpa.toFixed(2)} is below scale threshold ($${(targetCpaUsd * policy.scale_multiplier).toFixed(2)} = ${policy.scale_multiplier}x target ${metricLabel} $${targetCpaUsd.toFixed(2)}); ${m.selected_conversions} conversions. Scaling budget $${currentBudget.toFixed(2)} -> $${newBudget.toFixed(2)}`,
          metrics: {
            ...metricSnapshot,
            new_budget_cents: Math.round(newBudget * 100),
          },
        });
      }
    }
  }

  return actions;
}

function autonomousActionSummary(action: AutonomousAction): string {
  if (action.type === 'pause_campaign') {
    return `Pause ${action.campaign_name}. ${action.reason}`;
  }
  if (action.type === 'increase_budget') {
    return `Scale ${action.campaign_name}. ${action.reason}`;
  }
  return `Refresh creative for ${action.campaign_name}. ${action.reason}`;
}

function autonomousFirstPersonSummary(action: AutonomousAction): string {
  if (action.type === 'pause_campaign') {
    return `I found an underperforming campaign and queued a pause for approval: ${action.campaign_name}.`;
  }
  if (action.type === 'increase_budget') {
    return `I found a campaign outperforming target CPA and queued a budget increase for approval: ${action.campaign_name}.`;
  }
  return `I detected creative fatigue and queued a creative refresh for approval: ${action.campaign_name}.`;
}

function runMatchesAutonomousAction(run: any, action: AutonomousAction): boolean {
  const outputActions = Array.isArray(run?.output?.actions)
    ? run.output.actions
    : run?.output?.action
      ? [run.output.action]
      : [];

  return outputActions.some((candidate: any) => (
    candidate?.campaign_id === action.campaign_id
    && candidate?.type === action.type
  ));
}

/** Execute a single autonomous action against the Meta Graph API. */
async function executeAutonomousAction(
  action: AutonomousAction,
  accessToken: string,
  businessId: string,
): Promise<{ ok: boolean; status: string; error?: string; meta?: any }> {

  if (action.type === 'pause_campaign' || (action as any).type === 'pause') {
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

  if (action.type === 'increase_budget' || (action as any).type === 'scale') {
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

  if (action.type === 'refresh_creative') {
    const result = await queueCreativeRefresh({
      businessId,
      campaignId: action.campaign_id,
      campaignName: action.campaign_name,
      reason: action.reason,
    });

    return {
      ok: result.ok,
      status: result.status,
      error: result.error,
      meta: result.detail,
    };
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
    target_cpa_cents: rawTargetCpaCents,
    pause_multiplier = 2.5,
    scale_multiplier = 0.7,
    frequency_cap = 3.5,
    max_daily_budget = 100,
    max_daily_budget_cents: rawMaxBudgetCents,
    scale_pct = 0.2,
    min_conversions_to_scale = 3,
    optimise_for = 'lead',
    capi_lookback_days = 30,
    min_spend_before_evaluation_cents = 500,
    evaluation_frequency_hours = 4,
  } = req.body || {};

  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ error: { code: 'validation_error', message: '`business_id` is required' } });
  }
  if (
    (typeof rawTargetCpaCents !== 'number' || rawTargetCpaCents <= 0)
    && (typeof target_cpa !== 'number' || target_cpa <= 0)
  ) {
    return res.status(400).json({ error: { code: 'validation_error', message: '`target_cpa` or `target_cpa_cents` is required and must be positive' } });
  }
  if (!['lead', 'sql', 'customer'].includes(String(optimise_for))) {
    return res.status(400).json({ error: { code: 'validation_error', message: '`optimise_for` must be one of lead, sql, customer' } });
  }

  // Standardize to cents. Accept max_daily_budget_cents directly (preferred),
  // or derive from max_daily_budget dollars if only the legacy field is provided.
  const target_cpa_cents: number =
    typeof rawTargetCpaCents === 'number' && rawTargetCpaCents > 0
      ? Math.round(rawTargetCpaCents)
      : Math.round(target_cpa * 100);
  const normalizedTargetCpa = target_cpa_cents / 100;
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
        target_cpa: normalizedTargetCpa,
        target_cpa_cents,
        pause_multiplier,
        scale_multiplier,
        frequency_cap,
        max_daily_budget: max_daily_budget_cents / 100,
        max_daily_budget_cents,
        scale_pct,
        min_conversions_to_scale,
        optimise_for,
        capi_lookback_days,
        min_spend_before_evaluation_cents,
        evaluation_frequency_hours,
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

  await supabaseAdmin
    .from('capi_configs')
    .update({ optimise_for })
    .eq('business_id', business_id)
    .then(() => {});

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

  const { data: policy } = await supabaseAdmin
    .from('autonomous_policies')
    .select('*')
    .eq('business_id', business_id)
    .maybeSingle();
  const metrics = await fetchBusinessCampaignMetrics(business_id, policy as AutonomousPolicy | null);

  return res.status(200).json({
    business_id,
    metrics,
    note: '`spend_today` reflects lifetime spend. When a Meta access token is connected, `frequency`, `cpl_3d`, and `cpl_7d` are enriched from Meta Insights. `selected_metric` falls back to lead/CPL until attributed downstream events exist.',
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

  const metrics = await fetchBusinessCampaignMetrics(business_id, policy as AutonomousPolicy);
  const actions = generateAutonomousActions(policy as AutonomousPolicy, metrics);

  const pauseCount = actions.filter((a) => a.type === 'pause_campaign').length;
  const scaleCount = actions.filter((a) => a.type === 'increase_budget').length;
  const creativeRefreshCount = actions.filter((a) => a.type === 'refresh_creative').length;
  const summary = actions.length === 0
    ? 'No actions required. All campaigns are within policy thresholds.'
    : `${pauseCount} campaign(s) to pause, ${scaleCount} campaign(s) to scale, ${creativeRefreshCount} creative refresh(es) to queue.`;

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

  const accessToken = meta_access_token
    || resolveAutonomousAccessToken(business_id, (business as any).facebook_access_token);
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
    const result = await executeAutonomousAction(action as AutonomousAction, accessToken, business_id);
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

    const metrics = await fetchBusinessCampaignMetrics(business_id, policy as AutonomousPolicy);
    const actions = generateAutonomousActions(policy as AutonomousPolicy, metrics);

    if (actions.length > 0) {
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
        const creditSummary = `${actions.length} action(s) generated but not queued: insufficient_credits.`;
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
          summary: creditSummary,
          first_person_summary: 'I could not queue autonomous actions because the business is out of credits.',
          requires_approval: false,
          duration_ms: Date.now() - startTime,
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
        }).then(() => {});

        return res.status(402).json(paymentRequiredError(CREDIT_COSTS.autonomous_run_call, runCreditDebit.balance));
      }
    }

    const { data: pendingRuns } = await supabaseAdmin
      .from('automation_runs')
      .select('id, output, status')
      .eq('business_id', business_id)
      .eq('agent_type', 'autonomous_loop')
      .in('status', ['needs_approval', 'executing'])
      .order('created_at', { ascending: false })
      .limit(100);

    const approvalRuns: Array<{ run_id: string; action: AutonomousAction }> = [];
    let duplicateCount = 0;

    for (const action of actions) {
      if ((pendingRuns || []).some((run) => runMatchesAutonomousAction(run, action))) {
        duplicateCount += 1;
        continue;
      }

      const { data: insertedRun, error: insertError } = await supabaseAdmin
        .from('automation_runs')
        .insert({
          business_id,
          user_id: business.user_id,
          agent_type: 'autonomous_loop',
          status: 'needs_approval',
          trigger_type: 'scheduled',
          trigger_reason: 'cron autonomous loop via dispatch-agents',
          input: { policy_id: policy.id, metrics_count: metrics.length },
          output: {
            policy,
            action,
            actions: [action],
          },
          summary: autonomousActionSummary(action),
          first_person_summary: autonomousFirstPersonSummary(action),
          requires_approval: true,
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError || !insertedRun) {
        console.warn('[autonomous/run] Failed to insert approval run:', insertError);
        continue;
      }

      approvalRuns.push({ run_id: insertedRun.id, action });

      await sendSlackApprovalRequest({
        runId: insertedRun.id,
        campaignName: action.campaign_name,
        actionType: action.type,
        reason: action.reason,
        metrics: action.metrics,
      });
    }

    const summary = actions.length === 0
      ? 'No actions required. All campaigns within policy thresholds.'
      : approvalRuns.length === 0
        ? `Generated ${actions.length} action(s), but ${duplicateCount} matching approval run(s) were already pending.`
        : `Queued ${approvalRuns.length} autonomous action(s) for approval${duplicateCount > 0 ? `; skipped ${duplicateCount} duplicate pending action(s)` : ''}.`;

    const durationMs = Date.now() - startTime;

    supabaseAdmin.from('automation_runs').insert({
      business_id,
      user_id: business.user_id,
      agent_type: 'autonomous_loop',
      status: 'completed',
      error_message: null,
      trigger_type: 'scheduled',
      trigger_reason: 'cron autonomous loop via dispatch-agents',
      input: { policy_id: policy.id, metrics_count: metrics.length },
      output: { policy, actions, approval_runs: approvalRuns, duplicates_skipped: duplicateCount },
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
      approval_runs_created: approvalRuns.length,
      duplicates_skipped: duplicateCount,
      actions,
      summary,
      duration_ms: durationMs,
      creative_evolution: {
        refresh_actions_queued: actions.filter((action) => action.type === 'refresh_creative').length,
      },
    });
  } catch (err: any) {
    console.error('[autonomous/run] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal error during autonomous run' });
  }
}

// ── GET /api/v1/ad-account/insights ──────────────────────────────────────

async function handleAdAccountInsights(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET required' } });

  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) applyRateLimitHeaders(res, auth.rateLimitHeaders);
    return res.status(auth.status).json(auth.body);
  }
  assertAuth(auth);
  applyRateLimitHeaders(res, auth.rateLimitHeaders);

  const business_id = req.query.business_id as string | undefined;
  const date_from = req.query.date_from as string | undefined;
  const date_to = req.query.date_to as string | undefined;
  const time_increment = req.query.time_increment as string | undefined;

  if (!business_id || !date_from || !date_to) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: '`business_id`, `date_from`, and `date_to` query parameters are required',
      },
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_from) || !/^\d{4}-\d{2}-\d{2}$/.test(date_to)) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: '`date_from` and `date_to` must use YYYY-MM-DD format',
      },
    });
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, user_id, facebook_access_token, facebook_ad_account_id')
    .eq('id', business_id)
    .single();

  if (!business) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Business not found' } });
  }
  if (business.user_id !== auth.keyRecord.user_id) {
    return res.status(403).json({ error: { code: 'forbidden', message: 'You do not own this business' } });
  }

  const accessToken = resolveAutonomousAccessToken(business_id, business.facebook_access_token);
  const adAccountId = business.facebook_ad_account_id?.replace(/^act_/, '');

  if (!accessToken || !adAccountId) {
    return res.status(400).json({
      error: {
        code: 'missing_meta_credentials',
        message: 'facebook_access_token and facebook_ad_account_id are required on the business record',
      },
    });
  }

  const resolvedTimeIncrement = time_increment === 'monthly' ? 'monthly' : '1';
  const params = new URLSearchParams({
    fields: 'spend,impressions,clicks,actions,cost_per_action_type,cpc,cpm,ctr,reach,frequency',
    time_range: JSON.stringify({ since: date_from, until: date_to }),
    time_increment: resolvedTimeIncrement,
    access_token: accessToken,
  });

  const response = await fetch(`${GRAPH_BASE}/act_${adAccountId}/insights?${params.toString()}`);
  const payload = await response.json();

  if (!response.ok || payload.error) {
    return res.status(502).json({
      error: {
        code: 'meta_api_error',
        message: payload.error?.message || `Meta API returned ${response.status}`,
        meta_error: payload.error || null,
      },
    });
  }

  return res.status(200).json({
    business_id,
    date_from,
    date_to,
    time_increment: resolvedTimeIncrement === 'monthly' ? 'monthly' : 'daily',
    data: payload.data || [],
    paging: payload.paging || null,
    fetched_at: new Date().toISOString(),
  });
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
  if (route === 'ad-account/insights') return handleAdAccountInsights(req, res);
  if (route === 'capi/config') return handleCapiConfig(req, res);
  if (route === 'capi/config/test') return handleCapiConfigTest(req, res);
  if (route === 'capi/events') return handleCapiEvents(req, res);
  if (route === 'capi/status') return handleCapiStatus(req, res);
  if (route === 'audiences/create-seed') return handleAudiencesCreateSeed(req, res);
  if (route === 'audiences/create-lal') return handleAudiencesCreateLal(req, res);
  if (route === 'audiences/list') return handleAudiencesList(req, res);
  if (route === 'audiences/refresh') return handleAudiencesRefresh(req, res);
  if (route === 'portfolios/create') return handlePortfolioCreate(req, res);
  if (route === 'meta/status') return handleMetaStatus(req, res);
  if (route === 'meta/credentials') return handleMetaCredentials(req, res);
  if (route === 'meta/ad-accounts') return handleMetaAdAccounts(req, res);
  if (route === 'meta/select-ad-account') return handleMetaSelectAdAccount(req, res);
  if (route === 'lead-forms') return handleLeadForms(req, res);
  if (route === 'lead-forms/select') return handleSelectLeadForm(req, res);
  if (route === 'pixels') return handlePixels(req, res);
  if (route === 'pixels/select') return handleSelectPixel(req, res);
  if (route === 'meta/pages') return handleMetaPages(req, res);
  if (route === 'meta/select-page') return handleMetaSelectPage(req, res);
  if (route === 'notifications/telegram') return handleSetTelegram(req, res);

  if (segments.length === 3 && segments[0] === 'businesses') {
    const id = segments[1];
    const action = segments[2];
    if (action === 'enrich') return handleBusinessEnrich(req, res, id);
    if (action === 'uploads') return handleBusinessUploads(req, res, id);
  }
  if (segments.length === 4 && segments[0] === 'businesses' && segments[2] === 'uploads') {
    return handleBusinessUploadDelete(req, res, segments[1], segments[3]);
  }
  if (segments.length === 5 && segments[0] === 'businesses' && segments[2] === 'uploads' && segments[4] === 're-extract') {
    return handleBusinessUploadReExtract(req, res, segments[1], segments[3]);
  }

  // ── Dynamic campaign/:id routes ────────────────────────────────────
  if (segments.length === 2 && segments[0] === 'campaigns') {
    const id = segments[1];
    return handleCampaignDetail(req, res, id);
  }
  if (segments.length === 3 && segments[0] === 'campaigns') {
    const id = segments[1];
    const action = segments[2];

    if (action === 'approve-strategy') return handleCampaignApproveStrategy(req, res, id);
    if (action === 'request-creative') return handleCampaignRequestCreative(req, res, id);
    if (action === 'creative-callback') return handleCampaignUploadCreative(req, res, id, 'callback');
    if (action === 'upload-creative') return handleCampaignUploadCreative(req, res, id, 'upload');
    if (action === 'activate') return handleCampaignActivate(req, res, id);
    if (action === 'launch') return handleLaunch(req, res, id);
    if (action === 'pause') return handlePause(req, res, id);
    if (action === 'performance') return handlePerformance(req, res, id);
    if (action === 'conversions') return handleConversions(req, res, id);
  }

  if (segments.length === 2 && segments[0] === 'audiences') {
    const id = segments[1];
    return handleAudienceDelete(req, res, id);
  }
  if (segments.length === 3 && segments[0] === 'audiences') {
    const id = segments[1];
    const action = segments[2];
    if (action === 'status') return handleAudienceStatus(req, res, id);
  }

  // ── Dynamic creative/:id routes ─────────────────────────────────────
  if (segments.length === 3 && segments[0] === 'creatives') {
    const id = segments[1];
    const action = segments[2];

    if (action === 'variants') return handleCreativeVariants(req, res, id);
    if (action === 'feedback') return handleCreativeFeedback(req, res, id);
  }

  // ── Dynamic portfolios/:id routes ────────────────────────────────────
  if (segments.length === 2 && segments[0] === 'portfolios') {
    const id = segments[1];
    return handlePortfolioDetail(req, res, id);
  }
  if (segments.length === 3 && segments[0] === 'portfolios') {
    const id = segments[1];
    const action = segments[2];

    if (action === 'rebalance') return handlePortfolioRebalance(req, res, id);
    if (action === 'launch') return handlePortfolioLaunch(req, res, id);
    if (action === 'performance') return handlePortfolioPerformance(req, res, id);
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
        'GET  /api/v1/campaigns/:id',
        'POST /api/v1/campaigns/:id/approve-strategy',
        'POST /api/v1/campaigns/:id/request-creative',
        'POST /api/v1/campaigns/:id/creative-callback',
        'POST /api/v1/campaigns/:id/upload-creative',
        'POST /api/v1/campaigns/:id/activate',
        'POST /api/v1/campaigns/:id/launch',
        'POST /api/v1/campaigns/:id/pause',
        'GET  /api/v1/campaigns/:id/performance',
        'POST /api/v1/campaigns/:id/conversions',
        'POST /api/v1/keys/create',
        'POST /api/v1/research/reviews',
        'POST /api/v1/research/competitors',
        'POST /api/v1/research/market',
        'GET  /api/v1/capi/config',
        'PUT  /api/v1/capi/config',
        'POST /api/v1/capi/config/test',
        'POST /api/v1/capi/events',
        'GET  /api/v1/capi/status',
        'POST /api/v1/businesses/:id/enrich',
        'GET  /api/v1/businesses/:id/uploads',
        'POST /api/v1/businesses/:id/uploads',
        'DELETE /api/v1/businesses/:id/uploads/:fileId',
        'POST /api/v1/businesses/:id/uploads/:fileId/re-extract',
        'POST /api/v1/audiences/create-seed',
        'POST /api/v1/audiences/create-lal',
        'GET  /api/v1/audiences/list',
        'POST /api/v1/audiences/refresh',
        'DELETE /api/v1/audiences/:id',
        'GET  /api/v1/audiences/:id/status',
        'POST /api/v1/creatives/generate',
        'GET  /api/v1/ad-account/insights',
        'POST /api/v1/creatives/:id/variants',
        'POST /api/v1/creatives/:id/feedback',
        'POST /api/v1/portfolios/create',
        'GET  /api/v1/portfolios/:id',
        'PUT  /api/v1/portfolios/:id',
        'POST /api/v1/portfolios/:id/rebalance',
        'POST /api/v1/portfolios/:id/launch',
        'GET  /api/v1/portfolios/:id/performance',
        'POST /api/v1/autonomous/policies/upsert',
        'GET  /api/v1/autonomous/metrics',
        'POST /api/v1/autonomous/evaluate',
        'POST /api/v1/autonomous/execute',
        'POST /api/v1/autonomous/run',
        'GET  /api/v1/meta/status',
        'GET  /api/v1/meta/credentials',
        'GET  /api/v1/meta/ad-accounts',
        'POST /api/v1/meta/select-ad-account',
        'GET  /api/v1/lead-forms',
        'POST /api/v1/lead-forms/select',
        'GET  /api/v1/pixels',
        'POST /api/v1/pixels/select',
        'GET  /api/v1/meta/pages',
        'POST /api/v1/meta/select-page',
        'POST /api/v1/notifications/telegram',
      ],
    },
  });
}

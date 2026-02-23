/**
 * POST /api/v1/campaigns/:id/launch
 *
 * Launch a draft campaign on Meta. This is the money endpoint — it actually
 * creates Meta Campaign, Ad Set, Lead Form, Creative, and Ad objects, then
 * activates them. Real ad dollars get spent after this call.
 *
 * Wraps the core logic from: launch-campaign edge function.
 *
 * The edge function expects a business_id with stored Meta credentials.
 * The API layer accepts Meta credentials directly in the request body,
 * making it stateless and suitable for agent-driven workflows.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest, logUsage, supabaseAdmin } from '../../_utils/auth';

export const config = { maxDuration: 60 };

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://bqqmkiocynvlaianwisd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ── Meta Graph API ──────────────────────────────────────────────────
const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function metaPost(
  path: string,
  params: Record<string, string>,
  accessToken: string,
): Promise<{ ok: boolean; data: any; rawBody: string }> {
  const form = new URLSearchParams(params);
  form.set('access_token', accessToken);

  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const rawBody = await res.text();
  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch {
    data = { error: { message: `Non-JSON response: ${rawBody.slice(0, 500)}`, type: 'ParseError', code: -1 } };
  }
  return { ok: res.ok, data, rawBody };
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

  // ── Auth ───────────────────────────────────────────────────────────
  const auth = await authenticateRequest(req);
  if (auth.error) {
    if (auth.rateLimitHeaders) {
      for (const [k, v] of Object.entries(auth.rateLimitHeaders)) res.setHeader(k, v);
    }
    return res.status(auth.status).json(auth.body);
  }
  for (const [k, v] of Object.entries(auth.rateLimitHeaders)) res.setHeader(k, v);

  // ── Extract campaign ID from URL ───────────────────────────────────
  const campaignId = req.query.id as string;
  if (!campaignId) {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/launch',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: 'Campaign ID is required in URL path' },
    });
  }

  // ── Validate request body ──────────────────────────────────────────
  const {
    meta_access_token,
    meta_ad_account_id,
    meta_page_id,
    variant_index = 0,
    daily_budget_cents,
    radius_km,
  } = req.body || {};

  if (!meta_access_token || typeof meta_access_token !== 'string') {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/launch',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: '`meta_access_token` is required' },
    });
  }

  if (!meta_ad_account_id || typeof meta_ad_account_id !== 'string') {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/launch',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: '`meta_ad_account_id` is required (e.g. "act_123456789")' },
    });
  }

  if (!meta_page_id || typeof meta_page_id !== 'string') {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/launch',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: '`meta_page_id` is required (Facebook Page ID for lead form)' },
    });
  }

  try {
    // ── Look up draft campaign ───────────────────────────────────────
    // Try api_campaigns table first (created via API), then fall back to campaigns
    let campaign: Record<string, any> | null = null;

    const { data: apiCampaign } = await supabaseAdmin
      .from('api_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('api_key_id', auth.keyRecord.id)
      .single();

    if (apiCampaign) {
      campaign = apiCampaign;
    }

    // Build campaign context from draft or use defaults
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

    // ── Step 1: Create Meta Campaign ─────────────────────────────────
    const campaignResult = await metaPost(
      `/act_${adAccountId}/campaigns`,
      {
        name: campaignName,
        objective: 'OUTCOME_LEADS',
        status: 'PAUSED',
        special_ad_categories: JSON.stringify([]),
      },
      meta_access_token,
    );

    if (!campaignResult.ok || !campaignResult.data.id) {
      const errMsg = campaignResult.data.error?.message || 'Failed to create campaign on Meta';
      console.error('[api/launch] Campaign creation failed:', campaignResult.rawBody);
      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/launch',
        method: 'POST',
        statusCode: 502,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(502).json({
        error: {
          code: 'meta_api_error',
          message: errMsg,
          meta_error: campaignResult.data.error,
          step: 'campaign',
        },
      });
    }

    const metaCampaignId = campaignResult.data.id;

    // ── Step 2: Create Ad Set ────────────────────────────────────────
    const geoLocations: Record<string, any> = {};
    if (targeting?.geo_locations?.custom_locations?.length) {
      geoLocations.custom_locations = targeting.geo_locations.custom_locations;
    } else {
      // Default: use radius around a generic location
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

    const adSetResult = await metaPost(
      `/act_${adAccountId}/adsets`,
      {
        name: `${campaignName} – Ad Set`,
        campaign_id: metaCampaignId,
        daily_budget: String(budgetCents),
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LEAD_GENERATION',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting: JSON.stringify(adSetTargeting),
        promoted_object: JSON.stringify({ page_id: meta_page_id }),
        destination_type: 'ON_AD',
        status: 'PAUSED',
        start_time: new Date().toISOString(),
      },
      meta_access_token,
    );

    if (!adSetResult.ok || !adSetResult.data.id) {
      const errMsg = adSetResult.data.error?.message || 'Failed to create ad set on Meta';
      console.error('[api/launch] Ad set creation failed:', adSetResult.rawBody);
      // Cleanup: delete the campaign
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/launch',
        method: 'POST',
        statusCode: 502,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(502).json({
        error: {
          code: 'meta_api_error',
          message: errMsg,
          meta_error: adSetResult.data.error,
          step: 'adset',
        },
      });
    }

    const metaAdSetId = adSetResult.data.id;

    // ── Step 3: Create Lead Form ─────────────────────────────────────
    const leadFormResult = await metaPost(
      `/${meta_page_id}/leadgen_forms`,
      {
        name: `${businessName} Lead Form – ${Date.now()}`,
        questions: JSON.stringify([
          { type: 'FULL_NAME' },
          { type: 'PHONE' },
          { type: 'EMAIL' },
          { type: 'CUSTOM', key: 'location', label: 'What area are you in?' },
        ]),
        privacy_policy: JSON.stringify({
          url: 'https://zuckerbot.ai/privacy',
          link_text: 'Privacy Policy',
        }),
        thank_you_page: JSON.stringify({
          title: 'Thanks for your enquiry!',
          body: `${businessName} will be in touch shortly.`,
          button_type: 'NONE',
        }),
      },
      meta_access_token,
    );

    if (!leadFormResult.ok || !leadFormResult.data.id) {
      const errMsg = leadFormResult.data.error?.message || 'Failed to create lead form';
      console.error('[api/launch] Lead form creation failed:', leadFormResult.rawBody);
      // Cleanup
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/launch',
        method: 'POST',
        statusCode: 502,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(502).json({
        error: {
          code: 'meta_api_error',
          message: errMsg,
          meta_error: leadFormResult.data.error,
          step: 'leadform',
        },
      });
    }

    const metaLeadFormId = leadFormResult.data.id;

    // ── Step 4: Create Ad Creative ───────────────────────────────────
    let ctaType = 'LEARN_MORE';
    const ctaMap: Record<string, string> = {
      'Get Quote': 'GET_QUOTE',
      'Call Now': 'CALL_NOW',
      'Learn More': 'LEARN_MORE',
      'Sign Up': 'SIGN_UP',
      'Book Now': 'BOOK_NOW',
      'Contact Us': 'CONTACT_US',
    };
    ctaType = ctaMap[cta] || 'LEARN_MORE';

    const objectStorySpec: Record<string, any> = {
      page_id: meta_page_id,
      link_data: {
        message: adBody,
        name: headline,
        link: 'https://zuckerbot.ai/',
        call_to_action: {
          type: ctaType,
          value: { lead_gen_form_id: metaLeadFormId },
        },
        ...(imageUrl ? { picture: imageUrl } : {}),
      },
    };

    const creativeResult = await metaPost(
      `/act_${adAccountId}/adcreatives`,
      {
        name: `${campaignName} – Creative`,
        object_story_spec: JSON.stringify(objectStorySpec),
      },
      meta_access_token,
    );

    if (!creativeResult.ok || !creativeResult.data.id) {
      const errMsg = creativeResult.data.error?.message || 'Failed to create ad creative';
      console.error('[api/launch] Creative creation failed:', creativeResult.rawBody);
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/launch',
        method: 'POST',
        statusCode: 502,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(502).json({
        error: {
          code: 'meta_api_error',
          message: errMsg,
          meta_error: creativeResult.data.error,
          step: 'creative',
        },
      });
    }

    const metaCreativeId = creativeResult.data.id;

    // ── Step 5: Create Ad ────────────────────────────────────────────
    const adResult = await metaPost(
      `/act_${adAccountId}/ads`,
      {
        name: `${campaignName} – Ad`,
        adset_id: metaAdSetId,
        creative: JSON.stringify({ creative_id: metaCreativeId }),
        status: 'PAUSED',
      },
      meta_access_token,
    );

    if (!adResult.ok || !adResult.data.id) {
      const errMsg = adResult.data.error?.message || 'Failed to create ad';
      console.error('[api/launch] Ad creation failed:', adResult.rawBody);
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/launch',
        method: 'POST',
        statusCode: 502,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(502).json({
        error: {
          code: 'meta_api_error',
          message: errMsg,
          meta_error: adResult.data.error,
          step: 'ad',
        },
      });
    }

    const metaAdId = adResult.data.id;

    // ── Step 6: Activate everything ──────────────────────────────────
    const activateAd = await metaPost(`/${metaAdId}`, { status: 'ACTIVE' }, meta_access_token);
    if (!activateAd.ok) {
      console.error('[api/launch] Failed to activate ad:', activateAd.rawBody);
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${meta_access_token}`, { method: 'DELETE' }).catch(() => {});
      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/launch',
        method: 'POST',
        statusCode: 502,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(502).json({
        error: {
          code: 'meta_api_error',
          message: activateAd.data.error?.message || 'Failed to activate ad',
          meta_error: activateAd.data.error,
          step: 'activate',
        },
      });
    }

    await metaPost(`/${metaAdSetId}`, { status: 'ACTIVE' }, meta_access_token);
    await metaPost(`/${metaCampaignId}`, { status: 'ACTIVE' }, meta_access_token);

    // ── Step 7: Update campaign record ───────────────────────────────
    const launchedAt = new Date().toISOString();

    // Try to update api_campaigns
    await supabaseAdmin
      .from('api_campaigns')
      .update({
        status: 'active',
        meta_campaign_id: metaCampaignId,
        meta_adset_id: metaAdSetId,
        meta_ad_id: metaAdId,
        meta_leadform_id: metaLeadFormId,
        launched_at: launchedAt,
      })
      .eq('id', campaignId)
      .then(() => {});

    // Also insert into the main campaigns table for performance tracking
    await supabaseAdmin
      .from('campaigns')
      .insert({
        business_id: null, // API-created campaigns don't have a business_id
        name: campaignName,
        status: 'active',
        daily_budget_cents: budgetCents,
        radius_km: targetRadius,
        ad_headline: headline,
        ad_copy: adBody,
        ad_image_url: imageUrl || null,
        meta_campaign_id: metaCampaignId,
        meta_adset_id: metaAdSetId,
        meta_ad_id: metaAdId,
        meta_leadform_id: metaLeadFormId,
        leads_count: 0,
        spend_cents: 0,
        launched_at: launchedAt,
      })
      .then(() => {});

    // ── Return success ───────────────────────────────────────────────
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/launch',
      method: 'POST',
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    });

    return res.status(200).json({
      id: campaignId,
      status: 'active',
      meta_campaign_id: metaCampaignId,
      meta_adset_id: metaAdSetId,
      meta_ad_id: metaAdId,
      meta_leadform_id: metaLeadFormId,
      daily_budget_cents: budgetCents,
      launched_at: launchedAt,
    });
  } catch (err: any) {
    console.error('[api/launch] Unexpected error:', err);
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/launch',
      method: 'POST',
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(500).json({
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred while launching the campaign',
        details: err?.message || String(err),
      },
    });
  }
}

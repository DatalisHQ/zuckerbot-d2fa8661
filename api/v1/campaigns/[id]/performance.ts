/**
 * GET /api/v1/campaigns/:id/performance
 *
 * Pull real-time performance metrics from Meta Marketing API.
 * Syncs fresh data on every call.
 *
 * Wraps: sync-performance edge function logic.
 *
 * The existing edge function looks up the business's stored facebook_access_token.
 * The API layer accepts meta_access_token as a query parameter or uses a stored
 * token from the campaign.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest, logUsage, supabaseAdmin } from '../../_utils/auth';

export const config = { maxDuration: 30 };

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function determinePerformanceStatus(
  status: string,
  launchedAt: string | null,
  createdAt: string | null,
  impressions: number,
  spendCents: number,
  leadsCount: number,
  cplCents: number | null,
): string {
  if (status === 'paused') return 'paused';

  const refTime = launchedAt || createdAt;
  const hoursSinceLaunch = refTime
    ? (Date.now() - new Date(refTime).getTime()) / (1000 * 60 * 60)
    : 0;

  if (hoursSinceLaunch < 48 || impressions < 500) return 'learning';
  if (cplCents !== null && cplCents >= 3000) return 'underperforming';
  if (spendCents > 5000 && leadsCount === 0) return 'underperforming';
  if (cplCents !== null && cplCents < 3000 && leadsCount >= 1) return 'healthy';

  return 'learning';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: { code: 'method_not_allowed', message: 'GET required' },
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
      endpoint: '/v1/campaigns/:id/performance',
      method: 'GET',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: 'Campaign ID is required in URL path' },
    });
  }

  // Optional meta_access_token from query string
  const queryToken = req.query.meta_access_token as string | undefined;

  try {
    // ── Look up the campaign ─────────────────────────────────────────
    let metaCampaignId: string | null = null;
    let campaignStatus = 'unknown';
    let launchedAt: string | null = null;
    let createdAt: string | null = null;
    let storedAccessToken: string | null = null;
    let businessId: string | null = null;

    // Try api_campaigns first
    const { data: apiCampaign } = await supabaseAdmin
      .from('api_campaigns')
      .select('id, meta_campaign_id, meta_access_token, status, launched_at, created_at')
      .eq('id', campaignId)
      .eq('api_key_id', auth.keyRecord.id)
      .single();

    if (apiCampaign?.meta_campaign_id) {
      metaCampaignId = apiCampaign.meta_campaign_id;
      campaignStatus = apiCampaign.status || 'unknown';
      launchedAt = apiCampaign.launched_at;
      createdAt = apiCampaign.created_at;
      storedAccessToken = apiCampaign.meta_access_token;
    }

    // Fall back: try campaigns table
    if (!metaCampaignId) {
      const { data: dbCampaign } = await supabaseAdmin
        .from('campaigns')
        .select('id, business_id, meta_campaign_id, status, launched_at, created_at')
        .or(`meta_campaign_id.eq.${campaignId},id.eq.${campaignId}`)
        .single();

      if (dbCampaign?.meta_campaign_id) {
        metaCampaignId = dbCampaign.meta_campaign_id;
        campaignStatus = dbCampaign.status || 'unknown';
        launchedAt = dbCampaign.launched_at;
        createdAt = dbCampaign.created_at;
        businessId = dbCampaign.business_id;

        // Try to get access token from the business
        if (businessId) {
          const { data: biz } = await supabaseAdmin
            .from('businesses')
            .select('facebook_access_token')
            .eq('id', businessId)
            .single();
          if (biz?.facebook_access_token) {
            storedAccessToken = biz.facebook_access_token;
          }
        }
      }
    }

    if (!metaCampaignId) {
      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/performance',
        method: 'GET',
        statusCode: 404,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(404).json({
        error: {
          code: 'not_found',
          message: 'Campaign not found or has not been launched on Meta yet',
        },
      });
    }

    // ── Determine the access token ───────────────────────────────────
    const accessToken = queryToken || storedAccessToken || process.env.META_SYSTEM_USER_TOKEN;

    if (!accessToken) {
      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/performance',
        method: 'GET',
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(400).json({
        error: {
          code: 'missing_token',
          message:
            'A Meta access token is required. Pass `meta_access_token` as a query parameter.',
        },
      });
    }

    // ── Call Meta Insights API ────────────────────────────────────────
    const insightsUrl =
      `${GRAPH_BASE}/${metaCampaignId}/insights` +
      `?fields=impressions,clicks,spend,actions` +
      `&date_preset=lifetime` +
      `&access_token=${accessToken}`;

    const metaResponse = await fetch(insightsUrl);
    const metaData = await metaResponse.json();

    if (!metaResponse.ok || metaData.error) {
      const errMsg = metaData.error?.message || `Meta API returned ${metaResponse.status}`;
      console.error('[api/performance] Meta Insights error:', JSON.stringify(metaData));

      // Check for expired token
      if (metaResponse.status === 401 || metaData.error?.code === 190) {
        await logUsage({
          apiKeyId: auth.keyRecord.id,
          endpoint: '/v1/campaigns/:id/performance',
          method: 'GET',
          statusCode: 401,
          responseTimeMs: Date.now() - startTime,
        });
        return res.status(401).json({
          error: {
            code: 'token_expired',
            message: 'Meta access token has expired. Please provide a fresh token.',
          },
        });
      }

      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/performance',
        method: 'GET',
        statusCode: 502,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(502).json({
        error: {
          code: 'meta_api_error',
          message: errMsg,
          meta_error: metaData.error,
        },
      });
    }

    // ── Parse insights ───────────────────────────────────────────────
    const insights = metaData.data?.[0];

    const impressions = insights?.impressions ? parseInt(insights.impressions, 10) : 0;
    const clicks = insights?.clicks ? parseInt(insights.clicks, 10) : 0;
    const spendDollars = insights?.spend ? parseFloat(insights.spend) : 0;
    const spendCents = Math.round(spendDollars * 100);

    // Find lead actions
    const leadAction = insights?.actions?.find((a: any) => a.action_type === 'lead');
    const leadsCount = leadAction ? parseInt(leadAction.value, 10) : 0;

    // Calculated metrics
    const cplCents = leadsCount > 0 ? Math.round(spendCents / leadsCount) : null;
    const ctrPct = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;

    const hoursSinceLaunch = launchedAt
      ? (Date.now() - new Date(launchedAt).getTime()) / (1000 * 60 * 60)
      : createdAt
        ? (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60)
        : 0;

    const performanceStatus = determinePerformanceStatus(
      campaignStatus,
      launchedAt,
      createdAt,
      impressions,
      spendCents,
      leadsCount,
      cplCents,
    );

    // ── Update DB with fresh metrics (fire-and-forget) ───────────────
    const updatePayload = {
      impressions,
      clicks,
      spend_cents: spendCents,
      leads_count: leadsCount,
      cpl_cents: cplCents,
      performance_status: performanceStatus,
      last_synced_at: new Date().toISOString(),
    };

    // Update whichever table has the record
    supabaseAdmin
      .from('campaigns')
      .update(updatePayload)
      .eq('meta_campaign_id', metaCampaignId)
      .then(() => {});

    // ── Return response ──────────────────────────────────────────────
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/performance',
      method: 'GET',
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    });

    return res.status(200).json({
      campaign_id: campaignId,
      status: campaignStatus,
      performance_status: performanceStatus,
      metrics: {
        impressions,
        clicks,
        spend_cents: spendCents,
        leads_count: leadsCount,
        cpl_cents: cplCents,
        ctr_pct: ctrPct,
      },
      hours_since_launch: Math.round(hoursSinceLaunch * 10) / 10,
      last_synced_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[api/performance] Unexpected error:', err);
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/performance',
      method: 'GET',
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(500).json({
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred',
        details: err?.message || String(err),
      },
    });
  }
}

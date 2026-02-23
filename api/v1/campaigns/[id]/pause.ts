/**
 * POST /api/v1/campaigns/:id/pause
 *
 * Pause or resume a live campaign on Meta.
 *
 * Wraps: pause-campaign edge function logic.
 *
 * The existing edge function uses a system user token from env.
 * The API layer accepts the action in the request body and looks up
 * the Meta campaign ID from the campaign record, then calls Meta directly.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest, logUsage, supabaseAdmin } from '../../_utils/auth';

export const config = { maxDuration: 30 };

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

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
      endpoint: '/v1/campaigns/:id/pause',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: 'Campaign ID is required in URL path' },
    });
  }

  // ── Parse request body ─────────────────────────────────────────────
  const { action = 'pause', meta_access_token } = req.body || {};

  if (!['pause', 'resume'].includes(action)) {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/pause',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: '`action` must be "pause" or "resume"' },
    });
  }

  try {
    // ── Look up the campaign to get meta_campaign_id ──────────────────
    // Check api_campaigns first, then fall back to campaigns table
    let metaCampaignId: string | null = null;
    let source: 'api_campaigns' | 'campaigns' | null = null;
    let recordId: string | null = null;

    // Try api_campaigns
    const { data: apiCampaign } = await supabaseAdmin
      .from('api_campaigns')
      .select('id, meta_campaign_id, meta_access_token, status')
      .eq('id', campaignId)
      .eq('api_key_id', auth.keyRecord.id)
      .single();

    if (apiCampaign?.meta_campaign_id) {
      metaCampaignId = apiCampaign.meta_campaign_id;
      source = 'api_campaigns';
      recordId = apiCampaign.id;
    }

    // Fall back: try campaigns table by meta_campaign_id directly
    // (in case the campaignId IS the meta campaign ID)
    if (!metaCampaignId) {
      const { data: dbCampaign } = await supabaseAdmin
        .from('campaigns')
        .select('id, meta_campaign_id, status')
        .eq('meta_campaign_id', campaignId)
        .single();

      if (dbCampaign?.meta_campaign_id) {
        metaCampaignId = dbCampaign.meta_campaign_id;
        source = 'campaigns';
        recordId = dbCampaign.id;
      }
    }

    if (!metaCampaignId) {
      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/pause',
        method: 'POST',
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

    // ── Determine the access token to use ────────────────────────────
    const accessToken =
      meta_access_token ||
      (apiCampaign?.meta_access_token as string) ||
      process.env.META_SYSTEM_USER_TOKEN;

    if (!accessToken) {
      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/pause',
        method: 'POST',
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(400).json({
        error: {
          code: 'missing_token',
          message: '`meta_access_token` is required — either in the request body or stored with the campaign',
        },
      });
    }

    // ── Call Meta API to pause/resume ─────────────────────────────────
    const metaStatus = action === 'pause' ? 'PAUSED' : 'ACTIVE';

    const form = new URLSearchParams({
      status: metaStatus,
      access_token: accessToken,
    });

    const metaResponse = await fetch(`${GRAPH_BASE}/${metaCampaignId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const metaData = await metaResponse.json();

    if (!metaResponse.ok || metaData.error) {
      const errMsg = metaData.error?.message || `Meta API returned ${metaResponse.status}`;
      console.error('[api/pause] Meta API error:', JSON.stringify(metaData));
      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/pause',
        method: 'POST',
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

    // ── Update DB status ─────────────────────────────────────────────
    const newStatus = action === 'pause' ? 'paused' : 'active';

    if (source === 'api_campaigns' && recordId) {
      await supabaseAdmin
        .from('api_campaigns')
        .update({ status: newStatus })
        .eq('id', recordId)
        .then(() => {});
    }

    if (source === 'campaigns' && recordId) {
      await supabaseAdmin
        .from('campaigns')
        .update({ status: newStatus })
        .eq('id', recordId)
        .then(() => {});
    }

    // ── Return success ───────────────────────────────────────────────
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/pause',
      method: 'POST',
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    });

    return res.status(200).json({
      campaign_id: campaignId,
      status: newStatus,
      meta_campaign_id: metaCampaignId,
    });
  } catch (err: any) {
    console.error('[api/pause] Unexpected error:', err);
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/pause',
      method: 'POST',
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

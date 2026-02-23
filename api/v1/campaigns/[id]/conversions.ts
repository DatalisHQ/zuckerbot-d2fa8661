/**
 * POST /api/v1/campaigns/:id/conversions
 *
 * Submit conversion feedback (good/bad lead) that feeds back into Meta's
 * algorithm via the Conversion API (CAPI). When a lead converts or doesn't,
 * this tells Meta to optimize for better quality leads.
 *
 * Wraps: sync-conversions edge function logic.
 *
 * Good leads → "Lead" event to CAPI with value=100
 * Bad leads → "Other" event with value=0 (deprioritize similar profiles)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest, logUsage, supabaseAdmin } from '../../_utils/auth';

export const config = { maxDuration: 30 };

const GRAPH_VERSION = 'v21.0';

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
      endpoint: '/v1/campaigns/:id/conversions',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: 'Campaign ID is required in URL path' },
    });
  }

  // ── Validate request body ──────────────────────────────────────────
  const { lead_id, quality, meta_access_token, user_data } = req.body || {};

  if (!lead_id || typeof lead_id !== 'string') {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/conversions',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: '`lead_id` is required' },
    });
  }

  if (!quality || !['good', 'bad'].includes(quality)) {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/conversions',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: '`quality` must be "good" or "bad"' },
    });
  }

  try {
    // ── Look up campaign for Meta pixel + access token ────────────────
    let storedAccessToken: string | null = null;
    let pixelId: string | null = process.env.META_PIXEL_ID || null;

    // Try api_campaigns first
    const { data: apiCampaign } = await supabaseAdmin
      .from('api_campaigns')
      .select('id, meta_campaign_id, meta_access_token')
      .eq('id', campaignId)
      .eq('api_key_id', auth.keyRecord.id)
      .single();

    if (apiCampaign) {
      storedAccessToken = apiCampaign.meta_access_token;
    }

    // Also try to look up lead from the leads table if it exists
    let leadData: Record<string, any> | null = null;
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, name, phone, email, meta_lead_id, campaign_id, business_id, created_at')
      .eq('id', lead_id)
      .single();

    if (lead) {
      leadData = lead;

      // Try to get business's access token and pixel
      if (lead.business_id) {
        const { data: biz } = await supabaseAdmin
          .from('businesses')
          .select('facebook_access_token, facebook_page_id')
          .eq('id', lead.business_id)
          .single();
        if (biz?.facebook_access_token) {
          storedAccessToken = storedAccessToken || biz.facebook_access_token;
        }
      }
    }

    // ── Determine access token to use ────────────────────────────────
    const accessToken =
      meta_access_token ||
      storedAccessToken ||
      process.env.META_SYSTEM_USER_TOKEN;

    if (!accessToken || !pixelId) {
      // If no token or pixel, we can still record the quality — just can't send to CAPI
      console.log('[api/conversions] No Meta access token or pixel ID — skipping CAPI call');

      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/conversions',
        method: 'POST',
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
      });

      return res.status(200).json({
        success: true,
        capi_sent: false,
        message: 'Conversion quality recorded but Meta CAPI not configured (missing access token or pixel ID)',
        quality,
        lead_id,
      });
    }

    // ── Build CAPI event ─────────────────────────────────────────────
    const eventTime = Math.floor(Date.now() / 1000);

    // Build user_data for matching
    const capiUserData: Record<string, string> = {};

    // From the user_data provided in the request
    if (user_data?.email) {
      capiUserData.em = user_data.email.toLowerCase().trim();
    }
    if (user_data?.phone) {
      let phone = user_data.phone.replace(/\s+/g, '');
      if (phone.startsWith('0')) phone = '+61' + phone.slice(1);
      capiUserData.ph = phone;
    }
    if (user_data?.first_name) {
      capiUserData.fn = user_data.first_name.toLowerCase().trim();
    }
    if (user_data?.last_name) {
      capiUserData.ln = user_data.last_name.toLowerCase().trim();
    }

    // Augment with lead data from DB if available
    if (leadData) {
      if (leadData.email && !capiUserData.em) {
        capiUserData.em = leadData.email.toLowerCase().trim();
      }
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
      custom_data: {
        lead_quality: quality,
        lead_id,
        campaign_id: campaignId,
        value: quality === 'good' ? 100 : 0,
        currency: 'USD',
      },
    };

    // Dedup with Meta lead ID if available
    if (leadData?.meta_lead_id) {
      event.event_id = leadData.meta_lead_id;
    }

    // ── Send to Conversion API ───────────────────────────────────────
    const capiUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`;

    const capiResponse = await fetch(capiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [event],
        access_token: accessToken,
      }),
    });

    const capiResult = await capiResponse.json();

    if (!capiResponse.ok) {
      console.error('[api/conversions] CAPI error:', JSON.stringify(capiResult));
      await logUsage({
        apiKeyId: auth.keyRecord.id,
        endpoint: '/v1/campaigns/:id/conversions',
        method: 'POST',
        statusCode: 502,
        responseTimeMs: Date.now() - startTime,
      });
      return res.status(502).json({
        error: {
          code: 'capi_error',
          message: 'Meta Conversion API returned an error',
          details: capiResult,
        },
      });
    }

    console.log(`[api/conversions] CAPI success — ${quality} signal for lead ${lead_id}`);

    // ── Return success ───────────────────────────────────────────────
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/conversions',
      method: 'POST',
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    });

    return res.status(200).json({
      success: true,
      capi_sent: true,
      events_received: capiResult.events_received || 1,
      quality,
      lead_id,
    });
  } catch (err: any) {
    console.error('[api/conversions] Unexpected error:', err);
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/:id/conversions',
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

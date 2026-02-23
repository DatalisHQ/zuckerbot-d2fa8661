/**
 * POST /api/v1/campaigns/preview
 *
 * Generate a campaign preview from a business URL.
 * Wraps the existing `generate-preview` Supabase edge function.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest, logUsage } from '../_utils/auth';

export const config = { maxDuration: 120 };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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
      for (const [k, v] of Object.entries(auth.rateLimitHeaders)) {
        res.setHeader(k, v);
      }
    }
    return res.status(auth.status).json(auth.body);
  }

  // Set rate-limit headers on success too
  for (const [k, v] of Object.entries(auth.rateLimitHeaders)) {
    res.setHeader(k, v);
  }

  // ── Validate request body ────────────────────────────────────────
  const { url, ad_count, review_data, competitor_data } = req.body || {};

  if (!url || typeof url !== 'string') {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/preview',
      method: 'POST',
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: { code: 'validation_error', message: '`url` is required and must be a string' },
    });
  }

  // ── Call existing Supabase edge function ──────────────────────────
  try {
    const edgeResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/generate-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          url,
          ad_count: ad_count ?? 2,
          review_data: review_data ?? undefined,
          competitor_data: competitor_data ?? undefined,
        }),
      },
    );

    const data = await edgeResponse.json();

    const statusCode = edgeResponse.ok ? 200 : edgeResponse.status;

    // Log usage
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/preview',
      method: 'POST',
      statusCode,
      responseTimeMs: Date.now() - startTime,
    });

    if (!edgeResponse.ok) {
      return res.status(statusCode).json({
        error: {
          code: 'upstream_error',
          message: data?.error || 'The preview generation service returned an error',
          details: data,
        },
      });
    }

    // ── Transform response to public API format ──────────────────
    const previewId = `prev_${Date.now().toString(36)}`;

    const response: Record<string, any> = {
      id: previewId,
      business_name: data.business_name || data.businessName || null,
      description: data.description || null,
      ads: Array.isArray(data.ads)
        ? data.ads.map((ad: any, idx: number) => ({
            headline: ad.headline || ad.title || '',
            copy: ad.copy || ad.primary_text || ad.text || '',
            rationale: ad.rationale || ad.reasoning || '',
            image_url: ad.image_url || ad.imageUrl || null,
            // Omit base64 from API responses to keep payloads small
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

    return res.status(200).json(response);
  } catch (err: any) {
    await logUsage({
      apiKeyId: auth.keyRecord.id,
      endpoint: '/v1/campaigns/preview',
      method: 'POST',
      statusCode: 502,
      responseTimeMs: Date.now() - startTime,
    });

    return res.status(502).json({
      error: {
        code: 'upstream_error',
        message: 'Failed to reach the preview generation service',
        details: err?.message || String(err),
      },
    });
  }
}

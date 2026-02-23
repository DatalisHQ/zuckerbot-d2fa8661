/**
 * POST /api/v1/keys/create
 *
 * Create a new API key for the authenticated user.
 * Requires a valid Supabase auth JWT (existing user session).
 *
 * The full plaintext key is returned ONCE in the response.
 * Only the SHA-256 hash is stored in the database.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Anon client for JWT validation
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Admin client for DB writes (bypasses RLS)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Rate limits per tier
const TIER_DEFAULTS: Record<string, { perMin: number; perDay: number }> = {
  free:       { perMin: 10,  perDay: 100   },
  pro:        { perMin: 60,  perDay: 5_000 },
  enterprise: { perMin: 300, perDay: 50_000 },
};

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

  // ── Authenticate via Supabase JWT ───────────────────────────────
  const authHeader =
    (req.headers['authorization'] as string) ||
    (req.headers['Authorization'] as string) ||
    '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'unauthorized',
        message: 'Authorization header with Supabase JWT required',
      },
    });
  }

  const jwt = authHeader.slice(7).trim();

  // Use anon client to validate the JWT (per AGENTS.md lesson)
  const { data: userData, error: authError } = await supabaseAnon.auth.getUser(jwt);

  if (authError || !userData?.user) {
    return res.status(401).json({
      error: {
        code: 'invalid_jwt',
        message: 'Invalid or expired Supabase auth token',
      },
    });
  }

  const userId = userData.user.id;

  // ── Parse body ───────────────────────────────────────────────────
  const {
    name = 'Default',
    is_live = true,
    tier = 'free',
  } = req.body || {};

  // Validate tier
  const validTiers = ['free', 'pro', 'enterprise'];
  const safeTier = validTiers.includes(tier) ? tier : 'free';

  // ── Generate key ─────────────────────────────────────────────────
  const prefix = is_live ? 'zb_live_' : 'zb_test_';
  const randomPart = randomBytes(16).toString('hex'); // 32 hex chars
  const fullKey = `${prefix}${randomPart}`;
  const keyHash = createHash('sha256').update(fullKey).digest('hex');
  const keyPrefix = fullKey.slice(0, 16); // e.g. "zb_live_a1b2c3d4"

  const defaults = TIER_DEFAULTS[safeTier] || TIER_DEFAULTS.free;

  // ── Store in DB (hash only) ──────────────────────────────────────
  const { data: insertedKey, error: insertError } = await supabaseAdmin
    .from('api_keys')
    .insert({
      user_id: userId,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      name,
      tier: safeTier,
      is_live: !!is_live,
      rate_limit_per_min: defaults.perMin,
      rate_limit_per_day: defaults.perDay,
    })
    .select('id, name, tier, is_live, rate_limit_per_min, rate_limit_per_day, created_at')
    .single();

  if (insertError) {
    console.error('Failed to create API key:', insertError);
    return res.status(500).json({
      error: {
        code: 'internal_error',
        message: 'Failed to create API key',
      },
    });
  }

  // ── Return the full key ONCE ─────────────────────────────────────
  return res.status(201).json({
    key: fullKey,  // ⚠️ This is the ONLY time the full key is returned
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

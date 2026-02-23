/**
 * ZuckerBot API — Auth middleware
 *
 * Extracts an API key from the Authorization header, validates it against the
 * `api_keys` table, checks rate limits, and returns the key record so
 * downstream handlers can use `user_id`, `tier`, etc.
 *
 * Usage in a Vercel route:
 *   const auth = await authenticateRequest(req);
 *   if (auth.error) return res.status(auth.status).json(auth.body);
 *   // auth.keyRecord is the validated key
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Admin client — bypasses RLS
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Tier rate limits ──────────────────────────────────────────────
const TIER_LIMITS: Record<string, { perMinute: number; perDay: number }> = {
  free:       { perMinute: 10,  perDay: 100   },
  pro:        { perMinute: 60,  perDay: 5_000 },
  enterprise: { perMinute: 300, perDay: 50_000 },
};

export interface ApiKeyRecord {
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

export type AuthResult = AuthSuccess | AuthFailure;

/**
 * Hash a raw API key with SHA-256 (hex).
 */
function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Main auth function.  Call this at the top of every /api/v1/* handler.
 */
export async function authenticateRequest(
  req: { headers: Record<string, string | string[] | undefined> },
): Promise<AuthResult> {
  // 1. Extract bearer token
  const authHeader =
    (req.headers['authorization'] as string) ||
    (req.headers['Authorization'] as string) ||
    '';

  if (!authHeader.startsWith('Bearer ')) {
    return {
      error: true,
      status: 401,
      body: {
        error: {
          code: 'missing_api_key',
          message: 'Authorization header must be: Bearer <api_key>',
        },
      },
    };
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    return {
      error: true,
      status: 401,
      body: {
        error: {
          code: 'missing_api_key',
          message: 'API key is empty',
        },
      },
    };
  }

  // 2. Hash and look up
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
      body: {
        error: {
          code: 'invalid_api_key',
          message: 'The provided API key is not valid',
        },
      },
    };
  }

  // 3. Check revocation
  if (keyRecord.revoked_at) {
    return {
      error: true,
      status: 401,
      body: {
        error: {
          code: 'revoked_api_key',
          message: 'This API key has been revoked',
        },
      },
    };
  }

  // 4. Rate-limit check (per-minute window, backed by api_usage table)
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
    const retryAfter = 60; // seconds until the window slides
    return {
      error: true,
      status: 429,
      body: {
        error: {
          code: 'rate_limit_exceeded',
          message: `Rate limit exceeded. You may make ${perMin} requests per minute on the ${tier} tier.`,
          retry_after: retryAfter,
        },
      },
      rateLimitHeaders,
    };
  }

  // 5. Update last_used_at (fire-and-forget)
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

/**
 * Log a request to the api_usage table. Call AFTER the handler finishes so
 * we can record the real status_code and response_time_ms.
 */
export async function logUsage(opts: {
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

/**
 * Re-export the admin Supabase client for use in handlers that need
 * direct DB access (e.g. key creation).
 */
export { supabaseAdmin };

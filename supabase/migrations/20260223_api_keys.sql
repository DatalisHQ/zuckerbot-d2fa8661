-- API Keys table for ZuckerBot API authentication
-- Keys are stored as SHA-256 hashes; the plaintext key is NEVER persisted.

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_prefix text NOT NULL,                    -- e.g. "zb_live_a1b2c3d4" (first 16 chars for display)
  key_hash text NOT NULL UNIQUE,               -- SHA-256 hex digest of the full key
  name text NOT NULL DEFAULT 'Default',        -- developer-chosen label
  tier text NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'pro', 'enterprise')),
  is_live boolean NOT NULL DEFAULT true,       -- true = production, false = test/sandbox
  rate_limit_per_min integer NOT NULL DEFAULT 10,
  rate_limit_per_day integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz                       -- soft-delete / revocation timestamp
);

-- Fast lookup by hash (the hot path for every authenticated request)
CREATE INDEX idx_api_keys_key_hash ON public.api_keys (key_hash);

-- Developer-scoped queries (list my keys, etc.)
CREATE INDEX idx_api_keys_user_id ON public.api_keys (user_id);

-- Row-Level Security
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Users can read/manage their own keys
CREATE POLICY "Users can view own keys"
  ON public.api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own keys"
  ON public.api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own keys"
  ON public.api_keys FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role (used by the API middleware) bypasses RLS automatically.

-- ──────────────────────────────────────────────────────────────────
-- API Usage / metering table
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  endpoint text NOT NULL,           -- e.g. '/v1/campaigns/preview'
  method text NOT NULL,             -- 'GET', 'POST', etc.
  status_code integer NOT NULL DEFAULT 0,
  response_time_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Query pattern: "how many requests has this key made in the last N minutes?"
CREATE INDEX idx_api_usage_key_time ON public.api_usage (api_key_id, created_at DESC);

-- RLS: usage is internal / service-role only; no user-facing reads for now
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage (via key ownership)
CREATE POLICY "Users can view own usage"
  ON public.api_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.api_keys
      WHERE public.api_keys.id = api_usage.api_key_id
        AND public.api_keys.user_id = auth.uid()
    )
  );

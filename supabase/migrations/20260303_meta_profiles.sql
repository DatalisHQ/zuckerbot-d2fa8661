-- ── meta_profiles: per-user Meta connection state ────────────────────────
-- One row per user_id. All fields upsertable. user_id is the PK.

CREATE TABLE IF NOT EXISTS meta_profiles (
  user_id       text        PRIMARY KEY,
  meta_access_token  text,
  meta_user_id  text,
  ad_account_id text,
  page_id       text,
  pixel_id      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS: each user can only touch their own row
ALTER TABLE meta_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_profiles_self" ON meta_profiles
  FOR ALL
  USING  (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Keep updated_at in sync automatically
CREATE OR REPLACE FUNCTION update_meta_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meta_profiles_updated_at
  BEFORE UPDATE ON meta_profiles
  FOR EACH ROW EXECUTE FUNCTION update_meta_profiles_updated_at();

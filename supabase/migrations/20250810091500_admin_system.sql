-- 1. role column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('user','admin'));

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 2. admin helper
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = uid AND p.role = 'admin'
  );
$$;

-- 3. Admin RPCs (SECURITY DEFINER; check is_admin)
CREATE OR REPLACE FUNCTION public.admin_list_users(
  search text DEFAULT NULL,
  limit_count int DEFAULT 50,
  offset_count int DEFAULT 0
)
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  role text,
  subscription_tier text,
  onboarding_completed boolean,
  facebook_connected boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.email, p.full_name, p.role, p.subscription_tier,
         p.onboarding_completed, p.facebook_connected, p.created_at
  FROM public.profiles p
  WHERE (search IS NULL OR p.email ILIKE '%'||search||'%' OR p.full_name ILIKE '%'||search||'%')
  ORDER BY p.created_at DESC
  LIMIT limit_count OFFSET offset_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_role(target_user uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF new_role NOT IN ('user','admin') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;
  UPDATE public.profiles SET role = new_role WHERE user_id = target_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_tier(target_user uuid, new_tier text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.profiles SET subscription_tier = new_tier WHERE user_id = target_user;
END;
$$;

-- optional: soft delete user (mark inactive) to avoid auth.users hard delete
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.admin_deactivate_user(target_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.profiles
  SET is_active = false
  WHERE user_id = target_user;
  -- Optionally revoke tokens / null sensitive columns
  UPDATE public.profiles
  SET facebook_access_token = NULL
  WHERE user_id = target_user;
END;
$$;

-- 4. RLS: allow admins full access, users only their own
-- Example shown for profiles; replicate pattern for other tables if needed.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_user_select ON public.profiles;
CREATE POLICY profiles_user_select ON public.profiles
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS profiles_user_update ON public.profiles;
CREATE POLICY profiles_user_update ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 5. Make me admin (replace email)
-- UPDATE public.profiles
-- SET role='admin', subscription_tier='agency'
-- WHERE email='YOUR_EMAIL';



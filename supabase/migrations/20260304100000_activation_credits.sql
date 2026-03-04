-- Credits system for execution-only billing (activation upgrade v1)

CREATE TABLE IF NOT EXISTS public.credit_balances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NULL REFERENCES public.businesses(id) ON DELETE SET NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  ref_type text NOT NULL,
  ref_id text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
  ON public.credit_ledger(user_id, created_at DESC);

ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_balances_select_own" ON public.credit_balances;
CREATE POLICY "credit_balances_select_own"
  ON public.credit_balances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "credit_ledger_select_own" ON public.credit_ledger;
CREATE POLICY "credit_ledger_select_own"
  ON public.credit_ledger
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "credit_balances_service_role_all" ON public.credit_balances;
CREATE POLICY "credit_balances_service_role_all"
  ON public.credit_balances
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "credit_ledger_service_role_all" ON public.credit_ledger;
CREATE POLICY "credit_ledger_service_role_all"
  ON public.credit_ledger
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.debit_credits(
  p_user_id uuid,
  p_business_id uuid,
  p_cost integer,
  p_reason text,
  p_ref_type text,
  p_ref_id text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(ok boolean, balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  INSERT INTO public.credit_balances (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  IF COALESCE(p_cost, 0) <= 0 THEN
    SELECT cb.balance INTO v_balance
    FROM public.credit_balances cb
    WHERE cb.user_id = p_user_id;

    RETURN QUERY SELECT true, COALESCE(v_balance, 0);
    RETURN;
  END IF;

  UPDATE public.credit_balances cb
  SET balance = cb.balance - p_cost,
      updated_at = now()
  WHERE cb.user_id = p_user_id
    AND cb.balance >= p_cost
  RETURNING cb.balance INTO v_balance;

  IF FOUND THEN
    INSERT INTO public.credit_ledger (
      user_id,
      business_id,
      delta,
      reason,
      ref_type,
      ref_id,
      meta
    ) VALUES (
      p_user_id,
      p_business_id,
      -p_cost,
      p_reason,
      p_ref_type,
      p_ref_id,
      COALESCE(p_meta, '{}'::jsonb)
    );

    RETURN QUERY SELECT true, v_balance;
    RETURN;
  END IF;

  SELECT cb.balance INTO v_balance
  FROM public.credit_balances cb
  WHERE cb.user_id = p_user_id;

  RETURN QUERY SELECT false, COALESCE(v_balance, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.debit_credits(uuid, uuid, integer, text, text, text, jsonb)
  TO authenticated, service_role;

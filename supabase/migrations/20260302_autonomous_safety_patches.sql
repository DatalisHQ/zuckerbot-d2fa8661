-- Autonomous Mode Safety Patches
-- Created: 2026-03-02
-- Patch B: add executing_started_at to automation_runs for retryable execution audit
-- Patch D: add max_daily_budget_cents to autonomous_policies to standardize on cents

-- ── Patch B: executing_started_at ────────────────────────────────────────────
-- Tracks when approval execution actually began. Enables distinguishing between:
--   approved (user approved, not yet executing)
--   executing (execution in progress)
--   completed (execution finished successfully)
--   failed    (execution failed; can be retried by re-approving from needs_approval)
ALTER TABLE public.automation_runs
  ADD COLUMN IF NOT EXISTS executing_started_at timestamptz;

-- ── Patch D: max_daily_budget_cents ──────────────────────────────────────────
-- Adds an integer-cents column to avoid floating-point dollar comparisons.
-- $100 default = 10000 cents. All code should read this field going forward.
ALTER TABLE public.autonomous_policies
  ADD COLUMN IF NOT EXISTS max_daily_budget_cents integer;

-- Backfill from existing dollar amounts (round to nearest cent)
UPDATE public.autonomous_policies
  SET max_daily_budget_cents = ROUND(max_daily_budget * 100)::integer
  WHERE max_daily_budget_cents IS NULL;

-- Enforce NOT NULL with $100 (10000 cents) default for new rows
ALTER TABLE public.autonomous_policies
  ALTER COLUMN max_daily_budget_cents SET DEFAULT 10000;
ALTER TABLE public.autonomous_policies
  ALTER COLUMN max_daily_budget_cents SET NOT NULL;

-- Deprecate the old dollars column. Kept for backward compatibility only.
-- Code must use max_daily_budget_cents going forward.
COMMENT ON COLUMN public.autonomous_policies.max_daily_budget IS
  'DEPRECATED: Use max_daily_budget_cents (integer cents) instead. Kept for backward compatibility.';
COMMENT ON COLUMN public.autonomous_policies.max_daily_budget_cents IS
  'Budget safety cap in integer cents (e.g. $100 = 10000). Always use this field in code. The $5 minimum floor is 500 cents.';

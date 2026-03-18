-- Add configurable Meta Conversions API action_source
-- Created: 2026-03-19

ALTER TABLE public.capi_configs
  ADD COLUMN IF NOT EXISTS action_source text;

UPDATE public.capi_configs
SET action_source = 'website'
WHERE action_source IS NULL OR btrim(action_source) = '';

ALTER TABLE public.capi_configs
  ALTER COLUMN action_source SET DEFAULT 'website';

ALTER TABLE public.capi_configs
  ALTER COLUMN action_source SET NOT NULL;

COMMENT ON COLUMN public.capi_configs.action_source IS 'Meta Conversions API action_source value used for server-side CRM events. Defaults to website.';

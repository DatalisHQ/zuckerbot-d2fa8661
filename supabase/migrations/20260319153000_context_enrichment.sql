ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS web_context jsonb,
  ADD COLUMN IF NOT EXISTS web_context_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.business_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_type text NOT NULL,
  file_path text NOT NULL,
  file_size_bytes integer,
  summary text,
  context_type text,
  extracted_data jsonb,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_uploads_business_id
  ON public.business_uploads (business_id);

CREATE INDEX IF NOT EXISTS idx_business_uploads_user_id
  ON public.business_uploads (user_id);

ALTER TABLE public.business_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_uploads_select_own" ON public.business_uploads;
CREATE POLICY "business_uploads_select_own"
ON public.business_uploads
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "business_uploads_insert_own" ON public.business_uploads;
CREATE POLICY "business_uploads_insert_own"
ON public.business_uploads
FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "business_uploads_delete_own" ON public.business_uploads;
CREATE POLICY "business_uploads_delete_own"
ON public.business_uploads
FOR DELETE
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "business_uploads_update_own" ON public.business_uploads;
CREATE POLICY "business_uploads_update_own"
ON public.business_uploads
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

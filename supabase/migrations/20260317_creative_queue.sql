CREATE TABLE IF NOT EXISTS public.creative_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  variant_data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  launched_at timestamptz,
  meta_ad_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creative_queue_status
  ON public.creative_queue(status);

CREATE INDEX IF NOT EXISTS idx_creative_queue_campaign
  ON public.creative_queue(campaign_id);

ALTER TABLE public.creative_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creative_queue_select_own"
  ON public.creative_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.businesses b ON b.id = c.business_id
      WHERE c.id = creative_queue.campaign_id
        AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "creative_queue_update_own"
  ON public.creative_queue
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.businesses b ON b.id = c.business_id
      WHERE c.id = creative_queue.campaign_id
        AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "creative_queue_insert_service"
  ON public.creative_queue
  FOR INSERT
  WITH CHECK (true);

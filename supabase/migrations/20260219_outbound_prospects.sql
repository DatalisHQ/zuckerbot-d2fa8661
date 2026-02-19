CREATE TABLE IF NOT EXISTS public.outbound_prospects (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name   text        NOT NULL,
  phone           text        NOT NULL,
  website         text,
  suburb          text,
  state           text,
  rating          numeric(2,1),
  review_count    integer,
  industry        text        NOT NULL DEFAULT 'dental',

  -- Outreach tracking
  status          text        NOT NULL DEFAULT 'new',
  sms_count       integer     NOT NULL DEFAULT 0,
  last_sms_at     timestamptz,
  first_sms_at    timestamptz,
  last_clicked_at timestamptz,
  replied_at      timestamptz,
  reply_text      text,
  notes           text,

  -- Personalized link tracking
  tracking_id     text        UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  link_clicks     integer     NOT NULL DEFAULT 0,

  -- Source
  source          text        DEFAULT 'google_maps',
  scraped_data    jsonb,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbound_prospects_status ON public.outbound_prospects(status);
CREATE INDEX idx_outbound_prospects_industry ON public.outbound_prospects(industry);
CREATE INDEX idx_outbound_prospects_tracking_id ON public.outbound_prospects(tracking_id);
CREATE INDEX idx_outbound_prospects_phone ON public.outbound_prospects(phone);

ALTER TABLE public.outbound_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outbound_prospects_service" ON public.outbound_prospects
  FOR ALL USING (true) WITH CHECK (true);

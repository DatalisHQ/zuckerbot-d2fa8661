-- Competitor analysis results from TinyFish web agent
CREATE TABLE IF NOT EXISTS competitor_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  industry TEXT NOT NULL,
  location TEXT NOT NULL,
  country TEXT DEFAULT 'US',
  competitor_ads JSONB DEFAULT '[]'::jsonb,
  ad_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups by business
CREATE INDEX IF NOT EXISTS idx_competitor_analyses_business ON competitor_analyses(business_id);

-- RLS
ALTER TABLE competitor_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own competitor analyses" ON competitor_analyses
  FOR SELECT USING (
    business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert competitor analyses" ON competitor_analyses
  FOR INSERT WITH CHECK (true);

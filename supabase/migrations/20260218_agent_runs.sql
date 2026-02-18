-- Agent Console: persist agent run results for signup bridge
CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  url text NOT NULL,
  brand_data jsonb,
  competitor_data jsonb,
  creative_data jsonb,
  campaign_plan jsonb,
  outreach_plan jsonb,
  analytics_projections jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Allow anonymous inserts (no auth required for agent console)
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert agent runs"
  ON agent_runs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can read own runs"
  ON agent_runs FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Anyone can read by id"
  ON agent_runs FOR SELECT
  USING (true);

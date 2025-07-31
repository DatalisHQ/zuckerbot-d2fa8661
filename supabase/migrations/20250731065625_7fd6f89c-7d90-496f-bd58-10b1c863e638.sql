-- Add draft data storage columns to ad_campaigns table
ALTER TABLE public.ad_campaigns 
ADD COLUMN IF NOT EXISTS draft_data jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS step_data jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS is_draft boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS last_saved_at timestamp with time zone DEFAULT now();

-- Update existing records to be drafts by default
UPDATE public.ad_campaigns 
SET is_draft = true, last_saved_at = now() 
WHERE is_draft IS NULL;
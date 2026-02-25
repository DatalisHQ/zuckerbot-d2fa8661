-- Migration: Creative Generation Enhancements
-- Date: 2026-02-25
-- Purpose: Add support for creative variations and enhanced prompt tracking

-- Create creatives table if it doesn't exist
CREATE TABLE IF NOT EXISTS creatives (
    id TEXT PRIMARY KEY,
    url TEXT,
    original_prompt TEXT,
    generation_method TEXT DEFAULT 'imagen',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add new columns if table already exists
ALTER TABLE IF EXISTS creatives 
ADD COLUMN IF NOT EXISTS original_prompt TEXT,
ADD COLUMN IF NOT EXISTS generation_method TEXT DEFAULT 'imagen';

-- Add columns to api_usage for better tracking
ALTER TABLE IF EXISTS api_usage 
ADD COLUMN IF NOT EXISTS generation_method TEXT,
ADD COLUMN IF NOT EXISTS detected_industry TEXT;

-- Create creative_feedback table for quality tracking
CREATE TABLE IF NOT EXISTS creative_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creative_id TEXT NOT NULL,
    api_key_id UUID NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
);

-- Create index on creative_feedback for performance
CREATE INDEX IF NOT EXISTS idx_creative_feedback_creative_id ON creative_feedback(creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_feedback_api_key_id ON creative_feedback(api_key_id);
CREATE INDEX IF NOT EXISTS idx_creative_feedback_created_at ON creative_feedback(created_at);

-- Add indexes on new columns for performance
CREATE INDEX IF NOT EXISTS idx_api_usage_generation_method ON api_usage(generation_method);
CREATE INDEX IF NOT EXISTS idx_api_usage_detected_industry ON api_usage(detected_industry);
CREATE INDEX IF NOT EXISTS idx_creatives_generation_method ON creatives(generation_method);
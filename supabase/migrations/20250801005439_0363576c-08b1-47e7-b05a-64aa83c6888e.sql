-- Add facebook_token_expires_at column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN facebook_token_expires_at TIMESTAMP WITH TIME ZONE;
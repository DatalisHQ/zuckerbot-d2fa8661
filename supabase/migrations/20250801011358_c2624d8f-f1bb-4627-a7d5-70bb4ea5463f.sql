-- Add refresh token column to profiles table for silent token refresh
ALTER TABLE public.profiles 
ADD COLUMN facebook_refresh_token text;
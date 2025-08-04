-- Add selected_ad_account_id field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN selected_ad_account_id text;
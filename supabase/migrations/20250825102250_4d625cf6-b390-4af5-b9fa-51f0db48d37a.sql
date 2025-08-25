-- Fix critical security vulnerabilities in RLS policies

-- Drop the overly permissive policies on subscribers table
DROP POLICY IF EXISTS "insert_subscription" ON public.subscribers;
DROP POLICY IF EXISTS "update_own_subscription" ON public.subscribers;

-- Create secure RLS policies for subscribers table
-- Only authenticated users can insert their own subscription
CREATE POLICY "Users can insert their own subscription" 
ON public.subscribers 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Only authenticated users can update their own subscription
CREATE POLICY "Users can update their own subscription" 
ON public.subscribers 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

-- Ensure profiles table has proper authentication checks
-- Drop and recreate the update policy to ensure it requires authentication
DROP POLICY IF EXISTS "Allow updating own profile" ON public.profiles;

-- Create a more secure update policy that requires authentication
CREATE POLICY "Authenticated users can update own profile" 
ON public.profiles 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

-- Add missing DELETE policy for profiles (users should be able to delete their own profile)
CREATE POLICY "Users can delete their own profile" 
ON public.profiles 
FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);
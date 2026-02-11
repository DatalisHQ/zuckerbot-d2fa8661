-- Frontend-controlled auth email solution
-- Instead of using database triggers (which require pg_net extension),
-- we'll modify the frontend to handle auth emails directly

-- Create a utility function to generate confirmation URLs
-- This helps maintain consistency with Supabase's URL format
CREATE OR REPLACE FUNCTION generate_confirmation_url(
  token_hash TEXT,
  redirect_url TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(redirect_url, 'https://zuckerbot.ai') || 
         '/auth/callback?token_hash=' || token_hash || '&type=email' ||
         CASE 
           WHEN redirect_url IS NOT NULL 
           THEN '&redirect_to=' || redirect_url 
           ELSE '&redirect_to=https://zuckerbot.ai/onboarding'
         END;
END;
$$ LANGUAGE plpgsql;

-- Create helper function to check if user needs email confirmation
CREATE OR REPLACE FUNCTION user_needs_email_confirmation(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_record RECORD;
BEGIN
  SELECT email, email_confirmed_at, confirmation_token
  INTO user_record
  FROM auth.users
  WHERE id = user_id;
  
  RETURN user_record.email IS NOT NULL 
    AND user_record.email_confirmed_at IS NULL 
    AND user_record.confirmation_token IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION generate_confirmation_url(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_confirmation_url(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION user_needs_email_confirmation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_needs_email_confirmation(UUID) TO anon;
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    console.log('=== FACEBOOK OAUTH CALLBACK DEBUG START ===');
    console.log("Request timestamp:", new Date().toISOString());
    
    // CRITICAL: Get session immediately to capture provider_token (only available right after login)
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    
    console.log('=== COMPLETE SESSION OBJECT DUMP ===');
    console.log('Session error:', sessionError);
    console.log('Complete session object:', JSON.stringify(session, null, 2));
    
    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      console.error('❌ User authentication failed:', userError);
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ User authenticated successfully:', user.id);
    console.log('User email:', user.email);

    // CRITICAL: Extract Facebook access token from session provider_token
    let facebookAccessToken = null;
    
    if (session?.provider_token) {
      console.log('✅ FOUND provider_token in session!');
      console.log('Provider token length:', session.provider_token.length);
      console.log('Provider token preview:', session.provider_token.substring(0, 20) + "...");
      facebookAccessToken = session.provider_token;
    } else {
      console.error('❌ CRITICAL ERROR: NO provider_token found in session');
      console.error('Available session keys:', session ? Object.keys(session) : 'no session');
      
      return new Response(
        JSON.stringify({ 
          error: 'Facebook access token not found in session', 
          details: 'provider_token missing from OAuth callback - this is a fatal error',
          reconnectRequired: true
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // IMMEDIATELY save the token to profiles table (token is only available now)
    console.log('=== IMMEDIATE TOKEN STORAGE ===');
    console.log('Storing Facebook access token immediately to profiles table...');
    
    const { error: immediateUpdateError } = await supabaseClient
      .from('profiles')
      .update({
        facebook_connected: true,
        facebook_access_token: facebookAccessToken,
        facebook_token_expires_at: new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString() // 2 hours default
      })
      .eq('user_id', user.id);

    if (immediateUpdateError) {
      console.error('❌ CRITICAL: Failed to store Facebook token immediately:', immediateUpdateError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to store Facebook access token', 
          details: immediateUpdateError.message
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('✅ Facebook access token stored successfully in profiles table');

    // OPTIONAL: Try to exchange for long-lived token (but continue even if this fails)
    console.log('=== OPTIONAL: FACEBOOK TOKEN EXCHANGE PHASE ===');
    console.log('Attempting to exchange for long-lived token...');
    console.log('App ID configured:', !!Deno.env.get('FACEBOOK_APP_ID'));
    console.log('App Secret configured:', !!Deno.env.get('FACEBOOK_APP_SECRET'));

    let finalToken = facebookAccessToken;
    let finalExpiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString(); // 2 hours default
    let isLongLived = false;
    
    try {
      const exchangeUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(
        Deno.env.get('FACEBOOK_APP_ID') || ''
      )}&client_secret=${encodeURIComponent(
        Deno.env.get('FACEBOOK_APP_SECRET') || ''
      )}&fb_exchange_token=${encodeURIComponent(facebookAccessToken)}`;
      
      console.log('Making token exchange request to Facebook...');
      const exchangeResponse = await fetch(exchangeUrl);
      const responseText = await exchangeResponse.text();
      
      console.log('Exchange response status:', exchangeResponse.status);

      if (exchangeResponse.ok) {
        const tokenData = JSON.parse(responseText);
        console.log('=== TOKEN EXCHANGE SUCCESS ===');
        console.log('Token exchange response:', JSON.stringify(tokenData, null, 2));
        
        finalToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in;
        
        // Check if we got a long-lived token (should be > 2 million seconds for 60 days)
        isLongLived = expiresIn > 2000000;
        
        console.log('Token expires in seconds:', expiresIn);
        console.log('Token expires in days:', expiresIn / 86400);
        console.log('Is long-lived token:', isLongLived);
        
        finalExpiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();
        console.log('Token will expire at:', finalExpiresAt);
        
      } else {
        console.warn('⚠️ Token exchange failed, using original token');
        console.warn('Response status:', exchangeResponse.status);
        console.warn('Response body:', responseText);
      }
    } catch (error) {
      console.warn('⚠️ Token exchange error, using original token:', error.message);
    }

    // Get user's business accounts to find business ID
    let businessId = null;
    try {
      console.log('=== FETCHING BUSINESS ID ===');
      const businessResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/businesses?access_token=${finalToken}`
      );

      if (businessResponse.ok) {
        const businessData = await businessResponse.json();
        console.log('Business data:', businessData);
        if (businessData.data && businessData.data.length > 0) {
          businessId = businessData.data[0].id;
          console.log('Found business ID:', businessId);
        }
      } else {
        console.warn('No business accounts found or access denied');
      }
    } catch (error) {
      console.warn('Error fetching business accounts:', error.message);
    }

    // FINAL UPDATE: Store the final token (long-lived if exchange worked, original if not)
    console.log('=== FINAL DATABASE UPDATE ===');
    const { error: finalUpdateError } = await supabaseClient
      .from('profiles')
      .update({
        facebook_connected: true,
        facebook_access_token: finalToken,
        facebook_business_id: businessId,
        facebook_token_expires_at: finalExpiresAt
      })
      .eq('user_id', user.id);

    if (finalUpdateError) {
      console.error('❌ Error updating profile with final token:', finalUpdateError);
      // Don't fail here since we already stored the initial token
    } else {
      console.log('✅ Final token update successful');
    }

    // Verify the token was stored correctly
    const { data: verifyProfile, error: verifyError } = await supabaseClient
      .from('profiles')
      .select('facebook_access_token, facebook_token_expires_at, facebook_business_id')
      .eq('user_id', user.id)
      .single();

    if (!verifyError && verifyProfile) {
      console.log('✅ Verification: Token stored successfully');
      console.log('Stored token length:', verifyProfile.facebook_access_token?.length || 0);
      console.log('Stored expiry:', verifyProfile.facebook_token_expires_at);
      console.log('Stored business ID:', verifyProfile.facebook_business_id);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: isLongLived ? 'Facebook long-lived token stored successfully' : 'Facebook token stored successfully',
        hasBusinessId: !!businessId,
        isLongLived,
        tokenExpiresAt: finalExpiresAt,
        debugInfo: {
          tokenType: isLongLived ? 'long-lived' : 'short-lived',
          appConfigurationNote: isLongLived ? 'App properly configured' : 'App may need Live mode for long-lived tokens'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in facebook-oauth-callback:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
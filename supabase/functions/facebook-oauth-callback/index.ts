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

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's Facebook identity
    const facebookIdentity = user.identities?.find(identity => identity.provider === 'facebook');
    
    if (!facebookIdentity || !facebookIdentity.identity_data) {
      return new Response(
        JSON.stringify({ error: 'Facebook identity not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract Facebook access token from user metadata or session
    // First try to get the session to access provider tokens
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    let accessToken = null;
    let refreshToken = null;

    // 1. Check session provider token (most reliable)
    if (session?.provider_token) {
      accessToken = session.provider_token;
      console.log('Found token in session.provider_token');
    }

    // 2. Check session refresh token
    if (session?.provider_refresh_token) {
      refreshToken = session.provider_refresh_token;
      console.log('Found refresh token in session');
    }
    
    // 3. Try user metadata locations
    if (!accessToken && user.user_metadata?.provider_token) {
      accessToken = user.user_metadata.provider_token;
      console.log('Found token in user_metadata.provider_token');
    }

    // 4. Check user metadata refresh token
    if (!refreshToken && user.user_metadata?.provider_refresh_token) {
      refreshToken = user.user_metadata.provider_refresh_token;
      console.log('Found refresh token in user_metadata');
    }
    
    // 5. Check app metadata
    if (!accessToken && user.app_metadata?.provider_token) {
      accessToken = user.app_metadata.provider_token;
      console.log('Found token in app_metadata.provider_token');
    }
    
    // 6. Get token from Facebook identity data (most reliable for fresh OAuth)
    if (!accessToken && facebookIdentity.identity_data) {
      accessToken = facebookIdentity.identity_data.provider_token ||
                   facebookIdentity.identity_data.access_token ||
                   facebookIdentity.identity_data.token;
      if (accessToken) {
        console.log('Found token in identity_data');
      }
    }
    
    console.log('Token search results:', {
      sessionToken: !!session?.provider_token,
      userMetadataToken: !!user.user_metadata?.provider_token,
      appMetadataToken: !!user.app_metadata?.provider_token,
      identityDataToken: !!(facebookIdentity.identity_data?.provider_token || 
                           facebookIdentity.identity_data?.access_token || 
                           facebookIdentity.identity_data?.token),
      refreshTokenAvailable: !!(refreshToken),
      finalToken: !!accessToken
    });
    
    // For now, if no token is found, we'll use a placeholder approach
    // and mark the connection as incomplete but still progress the onboarding
    if (!accessToken) {
      console.error('Facebook access token not found in any location');
      console.log('User metadata:', JSON.stringify(user.user_metadata, null, 2));
      console.log('App metadata:', JSON.stringify(user.app_metadata, null, 2));
      console.log('Identity data:', JSON.stringify(facebookIdentity.identity_data, null, 2));
      
      // Mark Facebook as connected but without access token
      // This allows onboarding to continue while flagging the incomplete connection
      const { error: updateError } = await supabaseClient
        .from('profiles')
        .update({
          facebook_connected: true,
          facebook_access_token: null, // Explicitly set to null to indicate incomplete connection
          facebook_business_id: null
        })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error updating profile with incomplete connection:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update user profile' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Facebook connected but access token not available - you can retry connecting later',
          incomplete: true 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Facebook access token found, exchanging for long-lived token...');

    // Exchange short-lived token for long-lived token (60 days)
    let longLivedToken = null;
    let tokenExpiresAt = null;
    
    try {
      const exchangeResponse = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(
          Deno.env.get('FACEBOOK_APP_ID') || ''
        )}&client_secret=${encodeURIComponent(
          Deno.env.get('FACEBOOK_APP_SECRET') || ''
        )}&fb_exchange_token=${encodeURIComponent(accessToken)}`
      );

      if (exchangeResponse.ok) {
        const tokenData = await exchangeResponse.json();
        longLivedToken = tokenData.access_token;
        
        // Calculate expiration - Facebook long-lived tokens last 60 days by default
        const expiresIn = tokenData.expires_in || (60 * 24 * 60 * 60); // 60 days in seconds
        tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();
        
        console.log('Successfully exchanged for long-lived token, expires in:', expiresIn / 86400, 'days');
      } else {
        console.error('Failed to exchange token:', await exchangeResponse.text());
        // Fall back to using the original token with shorter expiry
        longLivedToken = accessToken;
        tokenExpiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString(); // 2 hours
      }
    } catch (error) {
      console.error('Error exchanging token:', error);
      // Fall back to using the original token
      longLivedToken = accessToken;
      tokenExpiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString(); // 2 hours
    }

    // Validate the token (either long-lived or fallback)
    let tokenValid = false;
    try {
      const validationResponse = await fetch(
        `https://graph.facebook.com/v18.0/me?access_token=${longLivedToken}`
      );
      
      if (validationResponse.ok) {
        tokenValid = true;
        console.log('Facebook token validation successful');
      } else {
        console.error('Facebook token validation failed:', await validationResponse.text());
      }
    } catch (error) {
      console.error('Error validating Facebook token:', error);
    }

    // Get user's business accounts to find business ID
    let businessId = null;
    if (tokenValid) {
      try {
        const businessResponse = await fetch(
          `https://graph.facebook.com/v18.0/me/businesses?access_token=${longLivedToken}`
        );

        if (businessResponse.ok) {
          const businessData = await businessResponse.json();
          if (businessData.data && businessData.data.length > 0) {
            businessId = businessData.data[0].id;
          }
        } else {
          console.error('Failed to fetch business accounts:', await businessResponse.text());
        }
      } catch (error) {
        console.error('Error fetching business accounts:', error);
      }
    }

    // Update user profile with Facebook tokens and refresh token
    const updateData: any = {
      facebook_connected: true,
      facebook_access_token: tokenValid ? longLivedToken : null,
      facebook_business_id: businessId,
      facebook_token_expires_at: tokenValid ? tokenExpiresAt : null
    };

    // Store refresh token if available for future silent refreshes
    if (refreshToken) {
      updateData.facebook_refresh_token = refreshToken;
      console.log('Storing refresh token for future use');
    }

    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update(updateData)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully stored Facebook tokens for user:', user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Facebook tokens stored successfully',
        hasBusinessId: !!businessId
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
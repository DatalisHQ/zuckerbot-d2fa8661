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

    console.log('=== FACEBOOK TOKEN EXCHANGE PHASE ===');
    console.log('Facebook access token found, exchanging for long-lived token...');
    console.log('Short-lived token length:', accessToken.length);
    console.log('App ID configured:', !!Deno.env.get('FACEBOOK_APP_ID'));
    console.log('App Secret configured:', !!Deno.env.get('FACEBOOK_APP_SECRET'));

    // Exchange short-lived token for long-lived token (60 days)
    let longLivedToken = null;
    let tokenExpiresAt = null;
    let isLongLived = false;
    
    try {
      const exchangeUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(
        Deno.env.get('FACEBOOK_APP_ID') || ''
      )}&client_secret=${encodeURIComponent(
        Deno.env.get('FACEBOOK_APP_SECRET') || ''
      )}&fb_exchange_token=${encodeURIComponent(accessToken)}`;
      
      console.log('Making token exchange request to Facebook...');
      const exchangeResponse = await fetch(exchangeUrl);
      const responseText = await exchangeResponse.text();
      
      console.log('Exchange response status:', exchangeResponse.status);
      console.log('Exchange response headers:', Object.fromEntries(exchangeResponse.headers.entries()));

      if (exchangeResponse.ok) {
        const tokenData = JSON.parse(responseText);
        console.log('=== TOKEN EXCHANGE SUCCESS ===');
        console.log('Full token exchange response:', JSON.stringify(tokenData, null, 2));
        
        longLivedToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in;
        
        // Check if we got a long-lived token (should be > 2 million seconds for 60 days)
        isLongLived = expiresIn > 2000000; // ~23 days, so 60 days should be much higher
        
        console.log('Token expires in seconds:', expiresIn);
        console.log('Token expires in days:', expiresIn / 86400);
        console.log('Is long-lived token:', isLongLived);
        
        if (expiresIn <= 7200) {
          console.warn('⚠️  WARNING: Token exchange returned short-lived token (<=2 hours)');
          console.warn('This suggests the Facebook app is not in Live mode or user is not admin/tester');
        }
        
        tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();
        console.log('Token will expire at:', tokenExpiresAt);
        
      } else {
        console.error('=== TOKEN EXCHANGE FAILED ===');
        console.error('Response status:', exchangeResponse.status);
        console.error('Response body:', responseText);
        
        // Try to parse error details
        try {
          const errorData = JSON.parse(responseText);
          console.error('Facebook error details:', errorData);
        } catch (e) {
          console.error('Could not parse error response as JSON');
        }
        
        // Fall back to using the original token with shorter expiry
        console.log('Falling back to original short-lived token');
        longLivedToken = accessToken;
        tokenExpiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString(); // 2 hours
      }
    } catch (error) {
      console.error('=== TOKEN EXCHANGE ERROR ===');
      console.error('Error exchanging token:', error);
      console.error('Error details:', error.message);
      
      // Fall back to using the original token
      console.log('Falling back to original short-lived token due to error');
      longLivedToken = accessToken;
      tokenExpiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString(); // 2 hours
    }

    // Validate the token (either long-lived or fallback)
    console.log('=== TOKEN VALIDATION PHASE ===');
    let tokenValid = false;
    let userInfo = null;
    
    try {
      console.log('Validating token with Facebook /me endpoint...');
      const validationResponse = await fetch(
        `https://graph.facebook.com/v18.0/me?access_token=${longLivedToken}`
      );
      
      const validationText = await validationResponse.text();
      console.log('Validation response status:', validationResponse.status);
      
      if (validationResponse.ok) {
        userInfo = JSON.parse(validationText);
        tokenValid = true;
        console.log('✅ Facebook token validation successful');
        console.log('User info:', userInfo);
      } else {
        console.error('❌ Facebook token validation failed');
        console.error('Validation response:', validationText);
        try {
          const errorData = JSON.parse(validationText);
          console.error('Facebook validation error details:', errorData);
        } catch (e) {
          console.error('Could not parse validation error as JSON');
        }
      }
    } catch (error) {
      console.error('❌ Error validating Facebook token:', error);
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

    console.log('=== DATABASE STORAGE PHASE ===');
    console.log('Storing token in database...');
    console.log('Update data:', {
      ...updateData,
      facebook_access_token: updateData.facebook_access_token ? `${updateData.facebook_access_token.substring(0, 10)}...` : null
    });

    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update(updateData)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('❌ Error updating profile:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the token was stored correctly
    console.log('=== DATABASE VERIFICATION PHASE ===');
    const { data: verifyProfile, error: verifyError } = await supabaseClient
      .from('profiles')
      .select('facebook_access_token, facebook_token_expires_at, facebook_business_id')
      .eq('user_id', user.id)
      .single();

    if (verifyError) {
      console.error('❌ Error verifying stored data:', verifyError);
    } else {
      console.log('✅ Verification: Token stored successfully');
      console.log('Stored token length:', verifyProfile.facebook_access_token?.length || 0);
      console.log('Stored expiry:', verifyProfile.facebook_token_expires_at);
      console.log('Stored business ID:', verifyProfile.facebook_business_id);
      
      // Final token type validation
      if (isLongLived) {
        console.log('🎉 SUCCESS: Long-lived token (60 days) stored successfully!');
      } else {
        console.warn('⚠️  WARNING: Short-lived token stored. Check Facebook app configuration.');
        console.warn('To get long-lived tokens:');
        console.warn('1. Facebook app must be in Live mode (not Development)');
        console.warn('2. User must be app admin, developer, or tester');
        console.warn('3. App must have proper permissions configured');
      }
    }

    console.log('Successfully stored Facebook tokens for user:', user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: isLongLived ? 'Facebook long-lived token stored successfully' : 'Facebook token stored (short-lived - check app configuration)',
        hasBusinessId: !!businessId,
        isLongLived,
        tokenExpiresAt,
        debugInfo: {
          tokenType: isLongLived ? 'long-lived' : 'short-lived',
          userFacebookId: userInfo?.id,
          appConfigurationNote: isLongLived ? 'App properly configured' : 'App may need Live mode or user permissions'
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
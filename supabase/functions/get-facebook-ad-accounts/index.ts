import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdAccount {
  id: string;
  name: string;
  account_status: number;
}

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

    console.log('=== GET FACEBOOK AD ACCOUNTS DEBUG START ===');
    console.log('Request timestamp:', new Date().toISOString());

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
    console.log('Fetching token from user profile...');
    
    // Get user's Facebook access token from their profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('facebook_access_token, facebook_token_expires_at, facebook_connected, facebook_business_id')
      .eq('user_id', user.id)
      .single();

    console.log('=== PROFILE DATA ANALYSIS ===');
    console.log('Profile fetch error:', profileError);
    console.log('Profile data retrieved:', {
      facebook_connected: profile?.facebook_connected,
      token_exists: !!profile?.facebook_access_token,
      token_length: profile?.facebook_access_token?.length || 0,
      token_expires_at: profile?.facebook_token_expires_at,
      business_id: profile?.facebook_business_id,
      token_preview: profile?.facebook_access_token ? 
        profile.facebook_access_token.substring(0, 20) + '...' : 'N/A'
    });
    
    if (profileError) {
      console.error('❌ Profile fetch error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check token expiry
    const now = new Date();
    const expiryDate = profile?.facebook_token_expires_at ? new Date(profile.facebook_token_expires_at) : null;
    const isExpired = expiryDate ? now >= expiryDate : false;
    
    console.log('Token expiry analysis:', {
      current_time: now.toISOString(),
      token_expires_at: expiryDate?.toISOString() || 'N/A',
      is_expired: isExpired,
      time_until_expiry: expiryDate ? Math.round((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) + ' days' : 'N/A'
    });

    if (!profile?.facebook_access_token) {
      console.error('❌ CRITICAL: No Facebook access token found in profile');
      console.error('This means either:');
      console.error('1. User never completed Facebook OAuth');
      console.error('2. OAuth callback failed to store the token'); 
      console.error('3. Token was manually deleted from database');
      
      return new Response(
        JSON.stringify({ 
          error: 'Your Facebook session expired or access was revoked. Please reconnect to continue.',
          reconnectRequired: true,
          facebookError: 'NO_TOKEN_STORED'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    if (isExpired) {
      console.error('❌ CRITICAL: Facebook access token has expired');
      console.error('Token expired at:', expiryDate?.toISOString());
      console.error('Current time:', now.toISOString());
      
      return new Response(
        JSON.stringify({ 
          error: 'Your Facebook session expired or access was revoked. Please reconnect to continue.',
          reconnectRequired: true,
          facebookError: 'TOKEN_EXPIRED'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('✅ Token found and not expired, proceeding with validation...');
    
    // Use Facebook's Access Token Debugger to validate the token
    console.log('🔍 Validating token with Facebook Access Token Debugger...');
    const debugUrl = `https://graph.facebook.com/debug_token?input_token=${profile.facebook_access_token}&access_token=${profile.facebook_access_token}`;
    
    let tokenValidation = null;
    try {
      console.log('Making request to Facebook debugger API...');
      const debugResponse = await fetch(debugUrl);
      const debugText = await debugResponse.text();
      
      console.log('Debug API response status:', debugResponse.status);
      console.log('Debug API response headers:', Object.fromEntries(debugResponse.headers.entries()));
      
      if (debugResponse.ok) {
        tokenValidation = JSON.parse(debugText);
        console.log('=== FACEBOOK TOKEN DEBUG RESULTS ===');
        console.log('Full debug response:', JSON.stringify(tokenValidation, null, 2));
        
        if (tokenValidation.data) {
          const tokenInfo = tokenValidation.data;
          const expiresAt = tokenInfo.expires_at ? new Date(tokenInfo.expires_at * 1000) : null;
          
          console.log('🔍 Token validation summary:', {
            is_valid: tokenInfo.is_valid,
            app_id: tokenInfo.app_id,
            user_id: tokenInfo.user_id,
            expires_at_timestamp: tokenInfo.expires_at,
            expires_at_date: expiresAt?.toISOString() || 'Never',
            scopes: tokenInfo.scopes || [],
            application: tokenInfo.application,
            issued_at: tokenInfo.issued_at ? new Date(tokenInfo.issued_at * 1000).toISOString() : 'Unknown'
          });
          
          // Check if token is valid
          if (!tokenInfo.is_valid) {
            console.error('❌ Facebook API reports token is INVALID');
            console.error('Error details from Facebook:', tokenInfo.error || 'No specific error provided');
            
            return new Response(
              JSON.stringify({ 
                error: 'Your Facebook session expired or access was revoked. Please reconnect to continue.',
                reconnectRequired: true,
                facebookError: tokenInfo.error || 'INVALID_TOKEN'
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }
          
          // Check expiry from Facebook's authoritative response
          if (tokenInfo.expires_at && tokenInfo.expires_at < Math.floor(Date.now() / 1000)) {
            console.error('❌ Facebook API reports token is EXPIRED');
            console.error('Token expired at:', expiresAt?.toISOString());
            console.error('Current time:', new Date().toISOString());
            
            return new Response(
              JSON.stringify({ 
                error: 'Your Facebook session expired or access was revoked. Please reconnect to continue.',
                reconnectRequired: true,
                facebookError: 'TOKEN_EXPIRED'
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }
          
          // Check required scopes for ad accounts
          const requiredScopes = ['ads_read', 'ads_management'];
          const userScopes = tokenInfo.scopes || [];
          const missingScopes = requiredScopes.filter(scope => !userScopes.includes(scope));
          
          if (missingScopes.length > 0) {
            console.error('❌ Missing required Facebook permissions:', missingScopes);
            console.error('Available scopes:', userScopes);
            console.error('Required scopes:', requiredScopes);
            
            return new Response(
              JSON.stringify({ 
                error: 'Your Facebook session expired or access was revoked. Please reconnect to continue.',
                reconnectRequired: true,
                facebookError: 'INSUFFICIENT_PERMISSIONS',
                missingScopes
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }
          
          console.log('✅ Token validation PASSED - token is valid and has required permissions');
        }
      } else {
        console.error('❌ Facebook debug API request failed');
        console.error('Response status:', debugResponse.status);
        console.error('Response body:', debugText);
        
        // Try to parse error
        try {
          const errorData = JSON.parse(debugText);
          console.error('Facebook debug API error:', errorData);
          
          // If the debug API itself fails due to token issues, return reconnect required
          if (errorData.error && (
            errorData.error.code === 190 || // Invalid token
            errorData.error.code === 102 || // Session key invalid  
            errorData.error.type === 'OAuthException'
          )) {
            return new Response(
              JSON.stringify({ 
                error: 'Your Facebook session expired or access was revoked. Please reconnect to continue.',
                reconnectRequired: true,
                facebookError: errorData.error
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }
        } catch (e) {
          console.error('Could not parse debug API error response');
        }
        
        console.warn('⚠️ Proceeding with ad accounts fetch despite debug API failure');
      }
    } catch (debugError) {
      console.error('⚠️ Exception during token validation:', debugError);
      console.error('Error details:', debugError.message);
      console.warn('Proceeding with ad accounts fetch, but token may be invalid');
    }

    console.log('=== FACEBOOK AD ACCOUNTS API CALL ===');
    console.log('📱 Making request to Facebook Graph API for ad accounts...');
    console.log('API endpoint: me/adaccounts');
    console.log('Using token (preview):', profile.facebook_access_token.substring(0, 20) + '...');
    console.log('Request timestamp:', new Date().toISOString());
    
    const apiUrl = `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${profile.facebook_access_token}`;
    console.log('Full API URL (token redacted):', apiUrl.replace(profile.facebook_access_token, '[TOKEN_REDACTED]'));
    
    const facebookResponse = await fetch(apiUrl);

    console.log('=== FACEBOOK API RESPONSE ===');
    console.log('Response status:', facebookResponse.status);
    console.log('Response status text:', facebookResponse.statusText);
    console.log('Response headers:', Object.fromEntries(facebookResponse.headers.entries()));

    const responseText = await facebookResponse.text();
    console.log('Raw response body:', responseText);

    if (!facebookResponse.ok) {
      console.error('❌ Facebook API request FAILED');
      console.error('Status:', facebookResponse.status);
      console.error('Status text:', facebookResponse.statusText);
      console.error('Response body:', responseText);
      
      // Parse error details if possible
      let errorDetails = null;
      try {
        errorDetails = JSON.parse(responseText);
        console.error('Parsed error details:', JSON.stringify(errorDetails, null, 2));
        
        // Check for specific token-related errors
        if (errorDetails.error) {
          const error = errorDetails.error;
          console.error('Facebook error details:', {
            code: error.code,
            type: error.type,
            message: error.message,
            error_subcode: error.error_subcode,
            fbtrace_id: error.fbtrace_id
          });
          
          // Handle token expiry/revocation errors
          if (error.code === 190 || error.code === 102 || error.type === 'OAuthException') {
            console.error('🔒 Token-related error detected - user needs to reconnect');
            
            return new Response(
              JSON.stringify({ 
                error: 'Your Facebook session expired or access was revoked. Please reconnect to continue.',
                reconnectRequired: true,
                facebookError: error
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }
        }
      } catch (e) {
        console.error('Could not parse Facebook API error response as JSON');
        console.error('Parse error:', e.message);
      }

      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch Facebook ad accounts',
          facebookError: errorDetails || responseText,
          httpStatus: facebookResponse.status
        }),
        { 
          status: facebookResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('✅ Facebook API request SUCCESSFUL');
    
    let data;
    try {
      data = JSON.parse(responseText);
      console.log('=== FACEBOOK API SUCCESS RESPONSE ===');
      console.log('Parsed response structure:', {
        has_data: !!data.data,
        data_length: data.data?.length || 0,
        has_paging: !!data.paging,
        response_keys: Object.keys(data)
      });
      console.log('Full parsed response:', JSON.stringify(data, null, 2));
    } catch (parseError) {
      console.error('❌ Failed to parse successful Facebook API response as JSON');
      console.error('Parse error:', parseError.message);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid response format from Facebook API',
          rawResponse: responseText
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Filter for active ad accounts only (account_status = 1)
    const allAccounts = data.data || [];
    const activeAdAccounts = allAccounts.filter((account: AdAccount) => account.account_status === 1);
    
    console.log('=== AD ACCOUNTS PROCESSING RESULTS ===');
    console.log(`Total accounts returned by Facebook: ${allAccounts.length}`);
    console.log(`Active accounts (status=1): ${activeAdAccounts.length}`);
    
    if (allAccounts.length > 0) {
      console.log('Account status breakdown:');
      const statusCounts = allAccounts.reduce((counts: any, account: AdAccount) => {
        counts[account.account_status] = (counts[account.account_status] || 0) + 1;
        return counts;
      }, {});
      console.log('Status counts:', statusCounts);
      
      console.log('Sample accounts:');
      allAccounts.slice(0, 3).forEach((account: AdAccount, index: number) => {
        console.log(`Account ${index + 1}:`, {
          id: account.id,
          name: account.name,
          status: account.account_status
        });
      });
    }
    
    console.log('🎉 FINAL SUCCESS: Returning', activeAdAccounts.length, 'active ad accounts');

    return new Response(
      JSON.stringify({ 
        adAccounts: activeAdAccounts,
        debugInfo: {
          totalAccounts: allAccounts.length,
          activeAccounts: activeAdAccounts.length,
          tokenValidation: tokenValidation,
          requestTimestamp: new Date().toISOString()
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-facebook-ad-accounts function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
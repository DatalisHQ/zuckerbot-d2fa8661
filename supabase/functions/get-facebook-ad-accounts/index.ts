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

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's Facebook access token from their profile
    console.log('=== GET FACEBOOK AD ACCOUNTS ===');
    console.log('Fetching token from user profile...');
    
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('facebook_access_token, facebook_token_expires_at, facebook_connected')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('❌ Profile fetch error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profile?.facebook_access_token) {
      console.error('❌ No Facebook access token found in profile');
      console.log('Profile data:', {
        facebook_connected: profile?.facebook_connected,
        token_exists: !!profile?.facebook_access_token,
        token_expires_at: profile?.facebook_token_expires_at
      });
      
      return new Response(
        JSON.stringify({ error: 'Facebook access token not found. Please reconnect your Facebook account.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const graphApiToken = profile.facebook_access_token;
    console.log('✅ Using stored Facebook token');
    console.log('Token length:', graphApiToken.length);
    console.log('Token expires at:', profile.facebook_token_expires_at);
    
    // Log full token value (redacted for security)
    console.log('Full token (redacted):', graphApiToken.substring(0, 20) + '...' + graphApiToken.substring(graphApiToken.length - 10));
    
    // Check if token is expired
    let isExpiredByTimestamp = false;
    if (profile.facebook_token_expires_at) {
      const expiresAt = new Date(profile.facebook_token_expires_at);
      const now = new Date();
      isExpiredByTimestamp = now >= expiresAt;
      
      console.log('Token expiry check:', {
        expires_at: expiresAt.toISOString(),
        current_time: now.toISOString(),
        is_expired: isExpiredByTimestamp,
        hours_until_expiry: isExpiredByTimestamp ? 'EXPIRED' : Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
      });
      
      if (isExpiredByTimestamp) {
        console.error('❌ Token is expired by timestamp, cannot proceed');
        return new Response(
          JSON.stringify({ 
            error: 'Your Facebook session expired or access was revoked. Please reconnect to continue.',
            reconnectRequired: true 
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Use Facebook Access Token Debugger to validate token
    console.log('=== FACEBOOK TOKEN DEBUGGER VALIDATION ===');
    try {
      const debuggerResponse = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${graphApiToken}&access_token=${graphApiToken}`
      );
      
      const debuggerData = await debuggerResponse.json();
      console.log('Facebook Token Debugger Response:', JSON.stringify(debuggerData, null, 2));
      
      if (debuggerData.data) {
        const tokenInfo = debuggerData.data;
        console.log('Token validation results:', {
          is_valid: tokenInfo.is_valid,
          expires_at: tokenInfo.expires_at ? new Date(tokenInfo.expires_at * 1000).toISOString() : 'Never expires',
          scopes: tokenInfo.scopes || [],
          app_id: tokenInfo.app_id,
          user_id: tokenInfo.user_id,
          error: tokenInfo.error
        });
        
        if (!tokenInfo.is_valid) {
          console.error('❌ Facebook Token Debugger says token is invalid:', tokenInfo.error);
          return new Response(
            JSON.stringify({ 
              error: 'Your Facebook session expired or access was revoked. Please reconnect to continue.',
              reconnectRequired: true,
              debugInfo: tokenInfo.error
            }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Check if token expires soon (within 24 hours)
        if (tokenInfo.expires_at) {
          const expiresAt = new Date(tokenInfo.expires_at * 1000);
          const now = new Date();
          const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
          
          if (hoursUntilExpiry < 24) {
            console.warn('⚠️  Token expires in less than 24 hours:', hoursUntilExpiry.toFixed(2), 'hours');
          }
        }
        
        console.log('✅ Token validation passed, proceeding with API call');
      }
    } catch (debuggerError) {
      console.error('❌ Failed to validate token with Facebook debugger:', debuggerError);
      // Continue with API call since debugger failure doesn't mean token is invalid
    }

    console.log('Making Facebook API request for ad accounts...');

    // Get user's ad accounts
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status&access_token=${graphApiToken}`
    );

    console.log('Facebook API response status:', response.status);
    console.log('Facebook API response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Facebook API error - Full response body:', errorData);
      console.error('❌ Facebook API response status:', response.status);
      console.error('❌ Facebook API response headers:', Object.fromEntries(response.headers.entries()));
      
      // Try to parse Facebook error details
      let errorJson = null;
      try {
        errorJson = JSON.parse(errorData);
        console.error('❌ Parsed Facebook error details:', JSON.stringify(errorJson, null, 2));
        
        // Check for token-related errors
        if (errorJson.error?.code === 190) {
          console.error('🔑 Token error (code 190) detected - user needs to reconnect');
          console.error('🔑 Token error message:', errorJson.error.message);
          console.error('🔑 Token error type:', errorJson.error.type);
          console.error('🔑 Token error subcode:', errorJson.error.error_subcode);
          
          return new Response(
            JSON.stringify({ 
              error: 'Your Facebook session expired or access was revoked. Please reconnect to continue.',
              reconnectRequired: true,
              facebookError: errorJson.error
            }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Check for permissions errors
        if (errorJson.error?.code === 10 || errorJson.error?.error_subcode === 458) {
          console.error('🔑 Permission error detected - user needs to reconnect with proper permissions');
          
          return new Response(
            JSON.stringify({ 
              error: 'Your Facebook session expired or access was revoked. Please reconnect to continue.',
              reconnectRequired: true,
              facebookError: errorJson.error
            }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Log other Facebook error details
        console.error('❌ Other Facebook API error:', {
          code: errorJson.error?.code,
          message: errorJson.error?.message,
          type: errorJson.error?.type,
          error_subcode: errorJson.error?.error_subcode,
          error_user_title: errorJson.error?.error_user_title,
          error_user_msg: errorJson.error?.error_user_msg
        });
        
      } catch (e) {
        console.error('❌ Could not parse Facebook error response as JSON:', e);
        console.error('❌ Raw error response:', errorData);
      }
      
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch ad accounts from Facebook API',
          facebookError: errorJson?.error || { message: errorData }
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('✅ Facebook API response successful');
    console.log('Raw response data:', JSON.stringify(data, null, 2));

    // Filter active accounts and format the response
    const totalAccounts = data.data?.length || 0;
    const adAccounts: AdAccount[] = (data.data || [])
      .filter((account: any) => account.account_status === 1) // Only active accounts
      .map((account: any) => ({
        id: account.id,
        name: account.name,
        account_status: account.account_status
      }));

    console.log('Account filtering results:', {
      total_accounts_found: totalAccounts,
      active_accounts_filtered: adAccounts.length,
      accounts: adAccounts.map(acc => ({ id: acc.id, name: acc.name }))
    });

    console.log('✅ Successfully returning', adAccounts.length, 'active ad accounts');

    return new Response(
      JSON.stringify({ adAccounts }),
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
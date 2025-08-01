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
    
    // Check if token is expired
    if (profile.facebook_token_expires_at) {
      const expiresAt = new Date(profile.facebook_token_expires_at);
      const now = new Date();
      const isExpired = now >= expiresAt;
      
      console.log('Token expiry check:', {
        expires_at: expiresAt.toISOString(),
        current_time: now.toISOString(),
        is_expired: isExpired,
        hours_until_expiry: isExpired ? 'EXPIRED' : Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
      });
      
      if (isExpired) {
        console.warn('⚠️  Token is expired, API call may fail');
      }
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
      console.error('❌ Facebook API error:', errorData);
      
      // Try to parse Facebook error details
      try {
        const errorJson = JSON.parse(errorData);
        console.error('Facebook error details:', errorJson);
        
        // Check for token-related errors
        if (errorJson.error?.code === 190) {
          console.error('🔑 Token error detected - user needs to reconnect');
        }
      } catch (e) {
        console.error('Could not parse Facebook error as JSON');
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to fetch ad accounts from Facebook API' }),
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
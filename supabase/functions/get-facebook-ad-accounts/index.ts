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
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('facebook_access_token')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile?.facebook_access_token) {
      return new Response(
        JSON.stringify({ error: 'Facebook access token not found. Please reconnect your Facebook account.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const graphApiToken = profile.facebook_access_token;

    console.log('Fetching Facebook ad accounts...');

    // Get user's ad accounts
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status&access_token=${graphApiToken}`
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Facebook API error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch ad accounts from Facebook API' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Facebook API response:', data);

    // Filter active accounts and format the response
    const adAccounts: AdAccount[] = (data.data || [])
      .filter((account: any) => account.account_status === 1) // Only active accounts
      .map((account: any) => ({
        id: account.id,
        name: account.name,
        account_status: account.account_status
      }));

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
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const graphApiToken = Deno.env.get('FACEBOOK_ACCESS_TOKEN');
    if (!graphApiToken) {
      return new Response(
        JSON.stringify({ error: 'Facebook access token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { adAccountId } = await req.json();
    
    if (!adAccountId) {
      return new Response(
        JSON.stringify({ error: 'Ad Account ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const graphApiToken = Deno.env.get('FACEBOOK_ACCESS_TOKEN');
    if (!graphApiToken) {
      return new Response(
        JSON.stringify({ error: 'Facebook access token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching Facebook ad images for account:', adAccountId);

    // Call Facebook Graph API to get ad images
    const response = await fetch(
      `https://graph.facebook.com/v15.0/${adAccountId}/adimages?fields=url&access_token=${graphApiToken}`
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Facebook API error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch from Facebook API' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Facebook API response:', data);

    // Extract image URLs from the response
    const assets = data.data?.map((item: any) => item.url) || [];

    return new Response(
      JSON.stringify({ assets }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-facebook-assets function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
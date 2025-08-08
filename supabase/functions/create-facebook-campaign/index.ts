import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CampaignPayload {
  adAccountId: string;
  campaign: {
    name: string;
    objective: string;
    status: 'PAUSED' | 'ACTIVE';
    start_time?: string;
    end_time?: string;
  };
  adSets: Array<{
    name: string;
    daily_budget: number;
    billing_event: string;
    optimization_goal: string;
    targeting: object;
    placements?: object;
    status?: 'PAUSED' | 'ACTIVE';
  }>;
  ads: Array<{
    name: string;
    adset_index: number; // Index to match with adSets array
    creative: { creative_id: string };
    status: 'PAUSED' | 'ACTIVE';
  }>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: CampaignPayload = await req.json();
    
    const { adAccountId, campaign, adSets, ads } = payload;

    // Validate required fields
    if (!adAccountId || !campaign || !adSets || !ads) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: adAccountId, campaign, adSets, ads' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = Deno.env.get('FACEBOOK_ACCESS_TOKEN');
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Facebook access token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiVersion = Deno.env.get('FACEBOOK_API_VERSION') || 'v19.0';
    const baseUrl = `https://graph.facebook.com/${apiVersion}`;

    console.log('Starting Facebook campaign creation for account:', adAccountId);

    // Step 1: Create Campaign
    console.log('Creating campaign:', campaign.name);
    const campaignParams = new URLSearchParams({
      access_token: accessToken,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      special_ad_categories: '[]' // Empty array for regular ads
    });
    if (campaign.start_time) {
      campaignParams.append('start_time', campaign.start_time);
    }
    if (campaign.end_time) {
      campaignParams.append('end_time', campaign.end_time);
    }

    let campaignResponse: Response;
    try {
      campaignResponse = await fetch(
        `${baseUrl}/act_${adAccountId}/campaigns?${campaignParams.toString()}`,
        { method: 'POST' }
      );
    } catch (networkError) {
      return new Response(
        JSON.stringify({
          error: 'Network error creating campaign',
          details: String(networkError),
          suggestion: 'Check network connectivity and Facebook API availability.'
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!campaignResponse.ok) {
      const errorData = await campaignResponse.json().catch(() => ({}));
      const fbMessage = errorData?.error?.message || errorData?.message || errorData || 'Unknown Facebook API error';
      console.error('Campaign creation failed:', errorData);
      return new Response(
        JSON.stringify({
          error: 'Failed to create campaign',
          details: fbMessage,
          suggestion: 'Check your Facebook ad account permissions, campaign objective, and naming conventions.'
        }),
        { status: campaignResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const campaignData = await campaignResponse.json();
    const campaignId = campaignData.id;
    console.log('Campaign created successfully:', campaignId);

    // Step 2: Create Ad Sets
    const createdAdSetIds: string[] = [];
    
    for (let i = 0; i < adSets.length; i++) {
      const adSet = adSets[i];
      console.log(`Creating ad set ${i + 1}/${adSets.length}:`, adSet.name);

      // Merge placements.publisher_platforms into targeting if present
      const targetingObj = {
        ...(adSet.targeting || {}),
        ...(adSet.placements && (adSet.placements as any).publisher_platforms
          ? { publisher_platforms: (adSet.placements as any).publisher_platforms }
          : {})
      };

      const adSetParams = new URLSearchParams({
        access_token: accessToken,
        campaign_id: campaignId,
        name: adSet.name,
        // Client sends minor units already (e.g., cents). Do not convert again.
        daily_budget: String(adSet.daily_budget),
        billing_event: adSet.billing_event,
        optimization_goal: adSet.optimization_goal,
        targeting: JSON.stringify(targetingObj),
        status: adSet.status || 'PAUSED'
      });

      let adSetResponse: Response;
      try {
        adSetResponse = await fetch(
          `${baseUrl}/act_${adAccountId}/adsets?${adSetParams.toString()}`,
          { method: 'POST' }
        );
      } catch (networkError) {
        return new Response(
          JSON.stringify({
            error: `Network error creating ad set ${i + 1}`,
            details: String(networkError),
            partialResults: { campaignId, adSetIds: createdAdSetIds },
            suggestion: 'Retry later or verify Facebook API status.'
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!adSetResponse.ok) {
        const errorData = await adSetResponse.json().catch(() => ({}));
        const fbMessage = errorData?.error?.message || errorData?.message || errorData || 'Unknown Facebook API error';
        console.error(`Ad set ${i + 1} creation failed:`, errorData);
        return new Response(
          JSON.stringify({
            error: `Failed to create ad set ${i + 1}`,
            details: fbMessage,
            partialResults: { campaignId, adSetIds: createdAdSetIds },
            suggestion: 'Check targeting, budget, and placement settings for this ad set.'
          }),
          { status: adSetResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const adSetData = await adSetResponse.json();
      createdAdSetIds.push(adSetData.id);
      console.log(`Ad set ${i + 1} created successfully:`, adSetData.id);
    }

    // Step 3: Create Ads
    const createdAdIds: string[] = [];
    
    for (let i = 0; i < ads.length; i++) {
      const ad = ads[i];
      const adSetId = createdAdSetIds[ad.adset_index];
      
      if (!adSetId) {
        console.error(`Invalid adset_index ${ad.adset_index} for ad ${i + 1}`);
        continue;
      }

      console.log(`Creating ad ${i + 1}/${ads.length}:`, ad.name);

      const adParams = new URLSearchParams({
        access_token: accessToken,
        name: ad.name,
        adset_id: adSetId,
        creative: JSON.stringify(ad.creative),
        status: ad.status
      });

      let adResponse: Response;
      try {
        adResponse = await fetch(
          `${baseUrl}/act_${adAccountId}/ads?${adParams.toString()}`,
          { method: 'POST' }
        );
      } catch (networkError) {
        return new Response(
          JSON.stringify({
            error: `Network error creating ad ${i + 1}`,
            details: String(networkError),
            partialResults: { campaignId, adSetIds: createdAdSetIds, adIds: createdAdIds },
            suggestion: 'Retry later or verify Facebook API status.'
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!adResponse.ok) {
        const errorData = await adResponse.json().catch(() => ({}));
        const fbMessage = errorData?.error?.message || errorData?.message || errorData || 'Unknown Facebook API error';
        console.error(`Ad ${i + 1} creation failed:`, errorData);
        return new Response(
          JSON.stringify({
            error: `Failed to create ad ${i + 1}`,
            details: fbMessage,
            partialResults: { campaignId, adSetIds: createdAdSetIds, adIds: createdAdIds },
            suggestion: 'Check creative assets, ad copy, and Facebook ad policies.'
          }),
          { status: adResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const adData = await adResponse.json();
      createdAdIds.push(adData.id);
      console.log(`Ad ${i + 1} created successfully:`, adData.id);
    }

    console.log('Facebook campaign creation completed successfully');
    console.log('Campaign ID:', campaignId);
    console.log('Ad Set IDs:', createdAdSetIds);
    console.log('Ad IDs:', createdAdIds);

    return new Response(
      JSON.stringify({
        success: true,
        campaignId,
        adSetIds: createdAdSetIds,
        adIds: createdAdIds,
        summary: {
          campaignName: campaign.name,
          adSetsCreated: createdAdSetIds.length,
          adsCreated: createdAdIds.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-facebook-campaign function:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error',
        details: error.stack || null,
        suggestion: 'Try again or contact support if the issue persists.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
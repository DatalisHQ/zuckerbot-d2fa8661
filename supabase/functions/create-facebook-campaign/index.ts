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

    const campaignResponse = await fetch(
      `${baseUrl}/act_${adAccountId}/campaigns?${campaignParams.toString()}`,
      { method: 'POST' }
    );

    if (!campaignResponse.ok) {
      const errorData = await campaignResponse.text();
      console.error('Campaign creation failed:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to create campaign', details: errorData }),
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

      const adSetParams = new URLSearchParams({
        access_token: accessToken,
        campaign_id: campaignId,
        name: adSet.name,
        daily_budget: (adSet.daily_budget * 100).toString(), // Convert to cents
        billing_event: adSet.billing_event,
        optimization_goal: adSet.optimization_goal,
        targeting: JSON.stringify(adSet.targeting),
        status: adSet.status || 'PAUSED'
      });

      // Add placements if provided
      if (adSet.placements) {
        adSetParams.append('placements', JSON.stringify(adSet.placements));
      }

      const adSetResponse = await fetch(
        `${baseUrl}/act_${adAccountId}/adsets?${adSetParams.toString()}`,
        { method: 'POST' }
      );

      if (!adSetResponse.ok) {
        const errorData = await adSetResponse.text();
        console.error(`Ad set ${i + 1} creation failed:`, errorData);
        return new Response(
          JSON.stringify({ 
            error: `Failed to create ad set ${i + 1}`, 
            details: errorData,
            partialResults: { campaignId, adSetIds: createdAdSetIds }
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

      const adResponse = await fetch(
        `${baseUrl}/act_${adAccountId}/ads?${adParams.toString()}`,
        { method: 'POST' }
      );

      if (!adResponse.ok) {
        const errorData = await adResponse.text();
        console.error(`Ad ${i + 1} creation failed:`, errorData);
        return new Response(
          JSON.stringify({ 
            error: `Failed to create ad ${i + 1}`, 
            details: errorData,
            partialResults: { campaignId, adSetIds: createdAdSetIds, adIds: createdAdIds }
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
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
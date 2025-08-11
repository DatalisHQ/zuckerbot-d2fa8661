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
    
    let { adAccountId, campaign, adSets, ads } = payload;

    // Normalize adAccountId: strip any leading 'act_' (even if duplicated)
    adAccountId = adAccountId.replace(/^act_+/i, '');

    // Validate required fields
    if (!adAccountId || !campaign || !adSets || !ads) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: adAccountId, campaign, adSets, ads' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = Deno.env.get('FACEBOOK_ACCESS_TOKEN');
    if (!accessToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Facebook access token not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiVersion = Deno.env.get('FACEBOOK_API_VERSION') || 'v21.0';
    const baseUrl = `https://graph.facebook.com/${apiVersion}`;

    // Resolve interest names to valid numeric IDs using Facebook Interest Search
    const interestCache = new Map<string, { id: string; name: string }>();
    const isNumeric = (v: any) => /^\d+$/.test(String(v || ''));
    const resolveInterest = async (term: string): Promise<{ id: string; name: string } | null> => {
      const key = term.toLowerCase();
      if (interestCache.has(key)) return interestCache.get(key)!;
      try {
        const url = new URL(`${baseUrl}/search`);
        url.searchParams.set('type', 'adinterest');
        url.searchParams.set('q', JSON.stringify([term]));
        url.searchParams.set('limit', '1');
        url.searchParams.set('access_token', accessToken!);
        const res = await fetch(url.toString());
        const data = await res.json().catch(() => ({}));
        const first = data?.data?.[0];
        if (first?.id && isNumeric(first.id)) {
          const entry = { id: String(first.id), name: String(first.name || term) };
          interestCache.set(key, entry);
          return entry;
        }
      } catch { /* ignore */ }
      return null;
    };

    console.log('Starting Facebook campaign creation for account:', adAccountId);

    // Step 1: Create Campaign
    console.log('Creating campaign:', campaign.name);

    // Map legacy/abstract objectives to valid Graph API values
    const normalizeObjective = (obj: string) => {
      const o = (obj || '').toUpperCase();
      const map: Record<string, string> = {
        'AWARENESS': 'OUTCOME_AWARENESS',
        'TRAFFIC': 'OUTCOME_TRAFFIC',
        'LINK_CLICKS': 'OUTCOME_TRAFFIC',
        'CONVERSIONS': 'OUTCOME_SALES',
        'SALES': 'OUTCOME_SALES',
        'LEADS': 'OUTCOME_LEADS',
        'BRAND_AWARENESS': 'OUTCOME_AWARENESS',
        'REACH': 'OUTCOME_AWARENESS',
        'APP_INSTALLS': 'APP_INSTALLS',
        'ENGAGEMENT': 'OUTCOME_ENGAGEMENT'
      };
      const allowed = new Set([
        'APP_INSTALLS','BRAND_AWARENESS','EVENT_RESPONSES','LEAD_GENERATION','LINK_CLICKS','LOCAL_AWARENESS','MESSAGES','OFFER_CLAIMS','PAGE_LIKES','POST_ENGAGEMENT','PRODUCT_CATALOG_SALES','REACH','STORE_VISITS','VIDEO_VIEWS','OUTCOME_AWARENESS','OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_SALES','OUTCOME_TRAFFIC','OUTCOME_APP_PROMOTION','CONVERSIONS'
      ]);
      const normalized = map[o] || o;
      // If still not allowed but looks like a known alias, fallback sensibly
      if (!allowed.has(normalized)) {
        if (normalized === 'AWARENESS') return 'OUTCOME_AWARENESS';
        if (normalized === 'TRAFFIC') return 'OUTCOME_TRAFFIC';
        if (normalized === 'ENGAGEMENT') return 'OUTCOME_ENGAGEMENT';
        if (normalized === 'LEAD_GENERATION' || normalized === 'LEADS') return 'OUTCOME_LEADS';
        if (normalized === 'SALES' || normalized === 'PURCHASE' || normalized === 'CONVERSIONS') return 'OUTCOME_SALES';
      }
      return normalized;
    };

    const normalizedObjective = normalizeObjective(campaign.objective);

    // Derive safe defaults for ad set optimization/billing based on objective
    const deriveAdsetGoals = (objective: string) => {
      switch (objective) {
        case 'OUTCOME_TRAFFIC':
        case 'LINK_CLICKS':
          return { optimization_goal: 'LINK_CLICKS', billing_event: 'LINK_CLICKS' };
        case 'OUTCOME_AWARENESS':
        case 'REACH':
        case 'BRAND_AWARENESS':
          return { optimization_goal: 'REACH', billing_event: 'IMPRESSIONS' };
        case 'OUTCOME_ENGAGEMENT':
        case 'POST_ENGAGEMENT':
          return { optimization_goal: 'POST_ENGAGEMENT', billing_event: 'IMPRESSIONS' };
        case 'OUTCOME_LEADS':
        case 'LEAD_GENERATION':
          return { optimization_goal: 'LEAD_GENERATION', billing_event: 'IMPRESSIONS' };
        case 'OUTCOME_SALES':
        case 'CONVERSIONS':
          return { optimization_goal: 'CONVERSIONS', billing_event: 'IMPRESSIONS' };
        default:
          return { optimization_goal: 'REACH', billing_event: 'IMPRESSIONS' };
      }
    };
    const defaultAdsetGoals = deriveAdsetGoals(normalizedObjective);

    // Cache a discovered pixel id per request if needed for CONVERSIONS
    let discoveredPixelId: string | null = null;
    const getDefaultPixelId = async (): Promise<string | null> => {
      if (discoveredPixelId) return discoveredPixelId;
      try {
        const url = new URL(`${baseUrl}/act_${adAccountId}/adspixels`);
        url.searchParams.set('fields', 'id');
        url.searchParams.set('limit', '1');
        url.searchParams.set('access_token', accessToken!);
        const res = await fetch(url.toString());
        const data = await res.json().catch(() => ({}));
        const first = data?.data?.[0];
        if (first?.id) {
          discoveredPixelId = String(first.id);
          return discoveredPixelId;
        }
      } catch { /* ignore */ }
      return null;
    };
    const campaignParams = new URLSearchParams({
      access_token: accessToken,
      name: campaign.name,
      objective: normalizedObjective,
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
          success: false,
          error: 'Network error creating campaign',
          details: String(networkError),
          suggestion: 'Check network connectivity and Facebook API availability.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!campaignResponse.ok) {
      const errorData = await campaignResponse.json().catch(() => ({}));
      const fbMessage = errorData?.error?.message || errorData?.message || errorData || 'Unknown Facebook API error';
      console.error('Campaign creation failed:', errorData);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to create campaign',
          details: fbMessage,
          suggestion: 'Check your Facebook ad account permissions, campaign objective, and naming conventions.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

      // Extract placements (should be top-level ad set params, not inside targeting)
      const placements = (adSet as any).placements || {};

      // Normalize targeting
      const baseTargeting = { ...(adSet.targeting || {}) } as any;
      // Hard sanitize: never allow top-level interests to pass to Graph
      if (Object.prototype.hasOwnProperty.call(baseTargeting, 'interests')) {
        delete (baseTargeting as any).interests;
      }
      // Support alternate key from clients
      const incomingInterestTerms = Array.isArray((adSet.targeting as any)?.interest_terms)
        ? (adSet.targeting as any).interest_terms
        : Array.isArray((adSet.targeting as any)?.interests)
          ? (adSet.targeting as any).interests
          : [];
      // Resolve interests provided as names into numeric IDs
      let validInterests: { id: string; name: string }[] = [];
      if (Array.isArray(incomingInterestTerms)) {
        const resolved: any[] = [];
        for (const interest of incomingInterestTerms) {
          if (isNumeric(interest?.id)) {
            resolved.push({ id: String(interest.id), name: String(interest.name || '') });
          } else if (typeof interest === 'string' && interest.trim()) {
            const hit = await resolveInterest(interest.trim());
            if (hit) resolved.push(hit);
          } else if (interest?.name) {
            const hit = await resolveInterest(String(interest.name));
            if (hit) resolved.push(hit);
          }
        }
        validInterests = resolved.filter((it: any) => isNumeric(it?.id));
        // Ensure both potential keys are removed from targeting clone
        delete (baseTargeting as any).interests;
        delete (baseTargeting as any).interest_terms;
      }

      const targetingObj: any = {
        ...baseTargeting,
      };

      // Ensure required geo_locations with safe fallback
      const hasGeo = targetingObj?.geo_locations && (
        Array.isArray(targetingObj.geo_locations.countries) ? targetingObj.geo_locations.countries.length > 0 : true
      );
      if (!hasGeo) {
        targetingObj.geo_locations = { countries: ['US'] };
      }

      // Normalize age range defaults
      if (typeof targetingObj.age_min !== 'number' || targetingObj.age_min < 13) targetingObj.age_min = 18;
      if (typeof targetingObj.age_max !== 'number' || targetingObj.age_max < targetingObj.age_min) targetingObj.age_max = 65;

      // Normalize genders: allow 1 or 2; if both/all -> omit
      if (Array.isArray(targetingObj.genders)) {
        const vals = (targetingObj.genders as any[]).map((v) => Number(v)).filter((v) => v === 1 || v === 2);
        const unique = Array.from(new Set(vals));
        if (unique.length !== 1) {
          delete targetingObj.genders;
        } else {
          targetingObj.genders = unique;
        }
      }

      // Merge placements into targeting as per Graph API spec
      if (placements && Array.isArray((placements as any).publisher_platforms) && (placements as any).publisher_platforms.length > 0) {
        (targetingObj as any).publisher_platforms = (placements as any).publisher_platforms;
      }
      if (placements && Array.isArray((placements as any).facebook_positions) && (placements as any).facebook_positions.length > 0) {
        (targetingObj as any).facebook_positions = (placements as any).facebook_positions;
      }
      if (placements && Array.isArray((placements as any).instagram_positions) && (placements as any).instagram_positions.length > 0) {
        (targetingObj as any).instagram_positions = (placements as any).instagram_positions;
      }

      // Normalize custom_audiences to expected array of objects with id
      if (Array.isArray((targetingObj as any).custom_audiences)) {
        (targetingObj as any).custom_audiences = (targetingObj as any).custom_audiences
          .filter((v: any) => !!v)
          .map((v: any) => (typeof v === 'string' || typeof v === 'number') ? { id: String(v) } : (v?.id ? { id: String(v.id) } : null))
          .filter((v: any) => v && /^\d+$/.test(v.id));
        if ((targetingObj as any).custom_audiences.length === 0) {
          delete (targetingObj as any).custom_audiences;
        }
      }

      // Ensure no stray top-level interests leak through to the Graph API
      delete (targetingObj as any).interests;
      delete (targetingObj as any).interest_terms;

      // If we have valid interests, attach them under flexible_spec as per current API
      if (validInterests.length > 0) {
        targetingObj.flexible_spec = [ { interests: validInterests } ];
      }

      console.log('Final targeting payload for ad set', i + 1, JSON.stringify(targetingObj).slice(0, 400));

      const adSetParams = new URLSearchParams({
        access_token: accessToken,
        campaign_id: campaignId,
        name: adSet.name,
        // Client sends minor units already (e.g., cents). Do not convert again.
        daily_budget: String(adSet.daily_budget),
        // Use backend-derived goals to avoid invalid combinations
        billing_event: defaultAdsetGoals.billing_event,
        optimization_goal: defaultAdsetGoals.optimization_goal,
        targeting: JSON.stringify(targetingObj),
        status: adSet.status || 'PAUSED'
      });

      // Use validate_only to get detailed errors without creating objects
      adSetParams.append('execution_options', 'validate_only');
      // Add debug output from Graph
      adSetParams.append('debug', 'all');

      // For CONVERSIONS optimization, try to attach a pixel as promoted_object
      if (defaultAdsetGoals.optimization_goal === 'CONVERSIONS') {
        const pixelId = await getDefaultPixelId();
        if (pixelId) {
          adSetParams.append('promoted_object', JSON.stringify({ pixel_id: pixelId }));
        }
      }

      // Placements are included in targetingObj; no top-level placement params

      let adSetResponse: Response;
      try {
        adSetResponse = await fetch(
          `${baseUrl}/act_${adAccountId}/adsets?${adSetParams.toString()}`,
          { method: 'POST' }
        );
      } catch (networkError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Network error creating ad set ${i + 1}`,
            details: String(networkError),
            partialResults: { campaignId, adSetIds: createdAdSetIds },
            suggestion: 'Retry later or verify Facebook API status.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!adSetResponse.ok) {
        const errorData = await adSetResponse.json().catch(() => ({}));
        const fbMessage = errorData?.error?.message || errorData?.message || 'Unknown Facebook API error';
        const fbUser = errorData?.error?.error_user_msg || errorData?.error_user_msg;
        const fbData = errorData?.error?.error_data || errorData?.error_data;
        const detailParts = [fbMessage];
        if (fbUser) detailParts.push(String(fbUser));
        if (fbData) detailParts.push(typeof fbData === 'string' ? fbData : JSON.stringify(fbData));
        const traceId = adSetResponse.headers.get('x-fb-trace-id');
        if (traceId) detailParts.push(`trace_id:${traceId}`);
        const details = detailParts.join(' | ');
        console.error(`Ad set ${i + 1} creation failed:`, errorData);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to create ad set ${i + 1}`,
            details,
            partialResults: { campaignId, adSetIds: createdAdSetIds },
            suggestion: 'Enable fewer placements, verify geo_locations, age/gender, budget min, and interest keywords.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

      // Validate creative_id; must be an existing creative ID in this ad account
      const creativeId = ad?.creative?.creative_id;
      if (!creativeId || !/^\d+$/.test(String(creativeId))) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Invalid creative_id for ad ${i + 1}`,
            details: 'creative_id must be a numeric ID of an existing AdCreative. Create the creative first, then pass its ID.',
            partialResults: { campaignId, adSetIds: createdAdSetIds, adIds: createdAdIds },
            suggestion: 'Create image/video AdCreative via the /adcreatives endpoint and pass its ID in the payload.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const adParams = new URLSearchParams({
        access_token: accessToken,
        name: ad.name,
        adset_id: adSetId,
        creative: JSON.stringify({ creative_id: String(creativeId) }),
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
            success: false,
            error: `Network error creating ad ${i + 1}`,
            details: String(networkError),
            partialResults: { campaignId, adSetIds: createdAdSetIds, adIds: createdAdIds },
            suggestion: 'Retry later or verify Facebook API status.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!adResponse.ok) {
        const errorData = await adResponse.json().catch(() => ({}));
        const fbMessage = errorData?.error?.message || errorData?.message || errorData || 'Unknown Facebook API error';
        console.error(`Ad ${i + 1} creation failed:`, errorData);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to create ad ${i + 1}`,
            details: fbMessage,
            partialResults: { campaignId, adSetIds: createdAdSetIds, adIds: createdAdIds },
            suggestion: 'Check creative assets, ad copy, and Facebook ad policies.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        success: false,
        error: error.message || 'Unknown error',
        details: error.stack || null,
        suggestion: 'Try again or contact support if the issue persists.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
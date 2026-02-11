import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Meta Graph API config ───────────────────────────────────────────────────
const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface LaunchCampaignRequest {
  business_id: string;
  headline: string;
  body: string;
  cta: string;
  daily_budget_cents: number;
  radius_km: number;
  image_url?: string;
}

interface MetaApiResponse {
  id?: string;
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

// ─── Helper: POST to Meta Graph API ─────────────────────────────────────────

async function metaPost(
  path: string,
  params: Record<string, string>,
  accessToken: string
): Promise<{ ok: boolean; data: MetaApiResponse }> {
  const form = new URLSearchParams(params);
  form.set("access_token", accessToken);

  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const data = (await res.json()) as MetaApiResponse;
  return { ok: res.ok, data };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth check ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[launch-campaign] Auth failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: authError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[launch-campaign] User authenticated:", user.id, user.email);

    // ── Parse request body ──────────────────────────────────────────────────
    const body = (await req.json()) as LaunchCampaignRequest;
    const {
      business_id,
      headline,
      body: adBody,
      cta,
      daily_budget_cents,
      radius_km,
      image_url,
    } = body;

    if (!business_id || !headline || !adBody || !cta) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: business_id, headline, body, cta",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch business & verify ownership ───────────────────────────────────
    const { data: business, error: bizError } = await supabase
      .from("businesses")
      .select(
        "id, user_id, name, trade, suburb, state, lat, lng, " +
        "facebook_access_token, facebook_ad_account_id, facebook_page_id"
      )
      .eq("id", business_id)
      .single();

    if (bizError || !business) {
      return new Response(
        JSON.stringify({ error: "Business not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (business.user_id !== user.id) {
      console.error("[launch-campaign] Ownership mismatch:", {
        business_user_id: business.user_id,
        auth_user_id: user.id,
        business_id: business_id,
      });
      return new Response(
        JSON.stringify({ 
          error: "You do not own this business",
          debug: { business_user_id: business.user_id, auth_user_id: user.id }
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Validate Facebook connection ────────────────────────────────────────
    if (!business.facebook_access_token) {
      return new Response(
        JSON.stringify({
          error: "Please connect your Facebook account first",
          reconnectRequired: true,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!business.facebook_ad_account_id) {
      return new Response(
        JSON.stringify({
          error: "No Facebook ad account linked. Please select an ad account in settings.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fbToken = business.facebook_access_token;
    const adAccountId = business.facebook_ad_account_id.replace(/^act_/, "");
    const campaignName = `${business.name} – ${business.trade} – ${new Date().toISOString().slice(0, 10)}`;

    console.log("[launch-campaign] Creating Meta campaign for:", business.name);

    // ── Step 1: Create Campaign ─────────────────────────────────────────────
    const campaignResult = await metaPost(
      `/act_${adAccountId}/campaigns`,
      {
        name: campaignName,
        objective: "OUTCOME_LEADS",
        status: "ACTIVE",
        special_ad_categories: "[]",
      },
      fbToken
    );

    if (!campaignResult.ok || !campaignResult.data.id) {
      const errMsg =
        campaignResult.data.error?.message || "Failed to create campaign on Meta";
      console.error("[launch-campaign] Campaign creation failed:", campaignResult.data);
      return new Response(
        JSON.stringify({ error: errMsg, meta_error: campaignResult.data.error }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metaCampaignId = campaignResult.data.id;
    console.log("[launch-campaign] Campaign created:", metaCampaignId);

    // ── Step 2: Create Ad Set ───────────────────────────────────────────────
    // Build geo-targeting: radius around business lat/lng
    const targeting: Record<string, unknown> = {
      age_min: 25,
      age_max: 65,
      geo_locations: {
        custom_locations: [
          {
            latitude: business.lat || -33.8688, // fallback: Sydney
            longitude: business.lng || 151.2093,
            radius: radius_km || 25,
            distance_unit: "kilometer",
          },
        ],
      },
      // Publisher platforms: Facebook & Instagram
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: ["feed"],
      instagram_positions: ["stream"],
    };

    const adSetResult = await metaPost(
      `/act_${adAccountId}/adsets`,
      {
        name: `${campaignName} – Ad Set`,
        campaign_id: metaCampaignId,
        daily_budget: String(daily_budget_cents || 1500), // Meta expects cents
        billing_event: "IMPRESSIONS",
        optimization_goal: "LEAD_GENERATION",
        targeting: JSON.stringify(targeting),
        status: "ACTIVE",
        // Start immediately
        start_time: new Date().toISOString(),
      },
      fbToken
    );

    if (!adSetResult.ok || !adSetResult.data.id) {
      const errMsg =
        adSetResult.data.error?.message || "Failed to create ad set on Meta";
      console.error("[launch-campaign] Ad set creation failed:", adSetResult.data);
      return new Response(
        JSON.stringify({ error: errMsg, meta_error: adSetResult.data.error }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metaAdSetId = adSetResult.data.id;
    console.log("[launch-campaign] Ad set created:", metaAdSetId);

    // ── Step 3: Create Lead Form ────────────────────────────────────────────
    // NOTE: Lead forms require a Facebook Page ID. If we have one, create it;
    // otherwise the ad will need to reference an existing lead form.
    let metaLeadFormId: string | null = null;

    if (business.facebook_page_id) {
      const leadFormResult = await metaPost(
        `/${business.facebook_page_id}/leadgen_forms`,
        {
          name: `${business.name} Lead Form`,
          // Questions: name, phone number, email
          questions: JSON.stringify([
            { type: "FULL_NAME" },
            { type: "PHONE" },
            { type: "EMAIL" },
            {
              type: "CUSTOM",
              key: "suburb",
              label: "What suburb are you in?",
            },
          ]),
          privacy_policy: JSON.stringify({
            url: "https://zuckerbot.ai/privacy", // placeholder
          }),
          // Thank you screen
          follow_up_action_url: "https://zuckerbot.ai/",
        },
        fbToken
      );

      if (leadFormResult.ok && leadFormResult.data.id) {
        metaLeadFormId = leadFormResult.data.id;
        console.log("[launch-campaign] Lead form created:", metaLeadFormId);
      } else {
        console.warn(
          "[launch-campaign] Lead form creation failed, continuing without:",
          leadFormResult.data
        );
      }
    }

    // ── Step 4: Create Ad Creative + Ad ─────────────────────────────────────
    // Build the creative object_story_spec
    const objectStorySpec: Record<string, unknown> = {
      page_id: business.facebook_page_id || adAccountId,
      link_data: {
        message: adBody,
        name: headline,
        // CTA mapping
        call_to_action: {
          type:
            cta === "Get Quote"
              ? "GET_QUOTE"
              : cta === "Call Now"
                ? "CALL_NOW"
                : "LEARN_MORE",
          value: metaLeadFormId
            ? { lead_gen_form_id: metaLeadFormId }
            : undefined,
        },
        // Attach image if provided
        ...(image_url ? { picture: image_url } : {}),
      },
    };

    // Create AdCreative
    const creativeResult = await metaPost(
      `/act_${adAccountId}/adcreatives`,
      {
        name: `${campaignName} – Creative`,
        object_story_spec: JSON.stringify(objectStorySpec),
      },
      fbToken
    );

    if (!creativeResult.ok || !creativeResult.data.id) {
      const errMsg =
        creativeResult.data.error?.message || "Failed to create ad creative on Meta";
      console.error("[launch-campaign] Creative creation failed:", creativeResult.data);
      return new Response(
        JSON.stringify({ error: errMsg, meta_error: creativeResult.data.error }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metaCreativeId = creativeResult.data.id;
    console.log("[launch-campaign] Creative created:", metaCreativeId);

    // Create Ad
    const adResult = await metaPost(
      `/act_${adAccountId}/ads`,
      {
        name: `${campaignName} – Ad`,
        adset_id: metaAdSetId,
        creative: JSON.stringify({ creative_id: metaCreativeId }),
        status: "ACTIVE",
      },
      fbToken
    );

    if (!adResult.ok || !adResult.data.id) {
      const errMsg =
        adResult.data.error?.message || "Failed to create ad on Meta";
      console.error("[launch-campaign] Ad creation failed:", adResult.data);
      return new Response(
        JSON.stringify({ error: errMsg, meta_error: adResult.data.error }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metaAdId = adResult.data.id;
    console.log("[launch-campaign] Ad created:", metaAdId);

    // ── Step 5: Insert campaign into database ───────────────────────────────
    const { data: campaign, error: insertError } = await supabase
      .from("campaigns")
      .insert({
        business_id: business.id,
        name: campaignName,
        status: "active",
        daily_budget_cents: daily_budget_cents || 1500,
        radius_km: radius_km || 25,
        ad_headline: headline,
        ad_copy: adBody,
        ad_image_url: image_url || null,
        meta_campaign_id: metaCampaignId,
        meta_adset_id: metaAdSetId,
        meta_ad_id: metaAdId,
        meta_leadform_id: metaLeadFormId,
        leads_count: 0,
        spend_cents: 0,
        launched_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("[launch-campaign] DB insert failed:", insertError);
      return new Response(
        JSON.stringify({
          error: "Campaign created on Meta but failed to save to database",
          meta_campaign_id: metaCampaignId,
          details: insertError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[launch-campaign] Campaign saved to DB:", campaign.id);

    // ── Return success ──────────────────────────────────────────────────────
    return new Response(JSON.stringify(campaign), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[launch-campaign] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

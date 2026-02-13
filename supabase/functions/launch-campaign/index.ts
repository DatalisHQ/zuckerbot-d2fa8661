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

interface MetaApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

interface MetaApiResponse {
  id?: string;
  error?: MetaApiError;
}

// ─── Helper: POST to Meta Graph API ─────────────────────────────────────────

async function metaPost(
  path: string,
  params: Record<string, string>,
  accessToken: string
): Promise<{ ok: boolean; data: MetaApiResponse; rawBody: string }> {
  const form = new URLSearchParams(params);
  form.set("access_token", accessToken);

  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const rawBody = await res.text();
  let data: MetaApiResponse;
  try {
    data = JSON.parse(rawBody) as MetaApiResponse;
  } catch {
    data = { error: { message: `Non-JSON response: ${rawBody.slice(0, 500)}`, type: "ParseError", code: -1 } };
  }
  return { ok: res.ok, data, rawBody };
}

// ─── Helper: Build clear error response ─────────────────────────────────────

function errorResponse(
  status: number,
  error: string,
  extra?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({ error, ...extra }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
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
      return errorResponse(401, "Missing or invalid authorization header");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[launch-campaign] Auth failed:", authError?.message);
      return errorResponse(401, "Unauthorized", { detail: authError?.message });
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
      return errorResponse(400, "Missing required fields: business_id, headline, body, cta");
    }

    // ── Fetch business & verify ownership ───────────────────────────────────
    const { data: business, error: bizError } = await supabase
      .from("businesses")
      .select(
        "id, user_id, name, trade, suburb, state, country, lat, lng, " +
        "facebook_access_token, facebook_ad_account_id, facebook_page_id"
      )
      .eq("id", business_id)
      .single();

    if (bizError || !business) {
      return errorResponse(404, "Business not found");
    }

    if (business.user_id !== user.id) {
      console.error("[launch-campaign] Ownership mismatch:", {
        business_user_id: business.user_id,
        auth_user_id: user.id,
        business_id: business_id,
      });
      return errorResponse(403, "You do not own this business", {
        debug: { business_user_id: business.user_id, auth_user_id: user.id },
      });
    }

    // ── Validate Facebook connection ────────────────────────────────────────
    if (!business.facebook_access_token) {
      return errorResponse(400, "Please connect your Facebook account first", {
        reconnectRequired: true,
      });
    }

    if (!business.facebook_ad_account_id) {
      return errorResponse(400, "No Facebook ad account linked. Please select an ad account in settings.");
    }

    if (!business.facebook_page_id) {
      return errorResponse(400, "No Facebook Page linked. Lead ads require a Facebook Page. Please connect a Page in settings.");
    }

    const fbToken = business.facebook_access_token;
    const adAccountId = business.facebook_ad_account_id.replace(/^act_/, "");
    const pageId = business.facebook_page_id;
    const campaignName = `${business.name} – ${business.trade} – ${new Date().toISOString().slice(0, 10)}`;

    console.log("[launch-campaign] Creating Meta campaign for:", business.name, "| Page:", pageId, "| Ad Account:", adAccountId);

    // ── Step 1: Create Campaign ─────────────────────────────────────────────
    // Meta API: special_ad_categories must be a JSON array (empty [] if none apply)
    // Objective: OUTCOME_LEADS (ODAX objective for lead generation)
    const campaignResult = await metaPost(
      `/act_${adAccountId}/campaigns`,
      {
        name: campaignName,
        objective: "OUTCOME_LEADS",
        status: "PAUSED", // Create paused — activate only after all steps succeed
        special_ad_categories: JSON.stringify([]), // Must be a JSON array, not "[]" string
      },
      fbToken
    );

    if (!campaignResult.ok || !campaignResult.data.id) {
      const errMsg =
        campaignResult.data.error?.message || "Failed to create campaign on Meta";
      console.error("[launch-campaign] Campaign creation failed:", campaignResult.rawBody);
      return errorResponse(502, errMsg, { meta_error: campaignResult.data.error, step: "campaign" });
    }

    const metaCampaignId = campaignResult.data.id;
    console.log("[launch-campaign] Campaign created:", metaCampaignId);

    // ── Step 2: Create Ad Set ───────────────────────────────────────────────
    // Key requirements for OUTCOME_LEADS / LEAD_GENERATION:
    // - promoted_object with page_id is REQUIRED
    // - destination_type: "ON_AD" is REQUIRED for lead form ads
    // - billing_event: "IMPRESSIONS"
    // - optimization_goal: "LEAD_GENERATION"
    // - daily_budget in CENTS (smallest currency unit; e.g. 1500 = $15.00 AUD)

    // Build geo-targeting
    const geoLocations: Record<string, unknown> = {};
    if (business.lat && business.lng) {
      geoLocations.custom_locations = [
        {
          latitude: business.lat,
          longitude: business.lng,
          radius: radius_km || 25,
          distance_unit: "kilometer",
        },
      ];
    } else {
      // Fallback: target country-wide if no lat/lng
      const countryCode: Record<string, string> = {
        "Australia": "AU",
        "United States": "US",
        "United Kingdom": "GB",
        "Canada": "CA",
      };
      const cc = countryCode[business.country] || "AU";
      geoLocations.countries = [cc];
      console.warn(`[launch-campaign] No lat/lng for business, falling back to ${cc} country targeting`);
    }

    const targeting: Record<string, unknown> = {
      age_min: 25,
      age_max: 65,
      geo_locations: geoLocations,
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: ["feed"],
      instagram_positions: ["stream"],
    };

    const adSetParams: Record<string, string> = {
      name: `${campaignName} – Ad Set`,
      campaign_id: metaCampaignId,
      daily_budget: String(daily_budget_cents || 1500), // Meta expects cents (smallest unit)
      billing_event: "IMPRESSIONS",
      optimization_goal: "LEAD_GENERATION",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: JSON.stringify(targeting),
      promoted_object: JSON.stringify({ page_id: pageId }), // REQUIRED for lead gen
      destination_type: "ON_AD", // REQUIRED for lead form ads
      status: "PAUSED", // Create paused — activate after all steps succeed
      start_time: new Date().toISOString(),
    };

    const adSetResult = await metaPost(
      `/act_${adAccountId}/adsets`,
      adSetParams,
      fbToken
    );

    if (!adSetResult.ok || !adSetResult.data.id) {
      const errMsg =
        adSetResult.data.error?.message || "Failed to create ad set on Meta";
      console.error("[launch-campaign] Ad set creation failed:", adSetResult.rawBody);
      return errorResponse(502, errMsg, { meta_error: adSetResult.data.error, step: "adset" });
    }

    const metaAdSetId = adSetResult.data.id;
    console.log("[launch-campaign] Ad set created:", metaAdSetId);

    // ── Step 3: Create Lead Form ────────────────────────────────────────────
    // Lead forms are created on the PAGE, not the ad account.
    // Required fields: name, questions, privacy_policy (as legal_content or privacy_policy object)
    // The privacy_policy field needs: { url: "...", link_text: "..." }

    let metaLeadFormId: string | null = null;

    const leadFormResult = await metaPost(
      `/${pageId}/leadgen_forms`,
      {
        name: `${business.name} Lead Form – ${Date.now()}`,
        questions: JSON.stringify([
          { type: "FULL_NAME" },
          { type: "PHONE" },
          { type: "EMAIL" },
          {
            type: "CUSTOM",
            key: "location",
            label: "What area are you in?",
          },
        ]),
        // privacy_policy is passed as a JSON object with url + link_text
        privacy_policy: JSON.stringify({
          url: "https://zuckerbot.ai/privacy",
          link_text: "Privacy Policy",
        }),
        // Thank you page — valid button_types: VIEW_WEBSITE, CALL_BUSINESS, NONE, etc.
        thank_you_page: JSON.stringify({
          title: "Thanks for your enquiry!",
          body: `${business.name} will be in touch shortly.`,
          button_type: "NONE",
        }),
      },
      fbToken
    );

    if (leadFormResult.ok && leadFormResult.data.id) {
      metaLeadFormId = leadFormResult.data.id;
      console.log("[launch-campaign] Lead form created:", metaLeadFormId);
    } else {
      console.error(
        "[launch-campaign] Lead form creation failed:",
        leadFormResult.rawBody
      );
      // Lead form is critical for lead gen ads — fail if we can't create it
      const errMsg = leadFormResult.data.error?.message || "Failed to create lead form";
      return errorResponse(502, errMsg, { meta_error: leadFormResult.data.error, step: "leadform" });
    }

    // ── Step 4: Create Ad Creative ──────────────────────────────────────────
    // For lead gen ads, object_story_spec.link_data MUST include:
    // - link: URL (required, can be the Facebook page URL)
    // - message: The ad body text
    // - name: The headline
    // - call_to_action.type: CTA type (e.g., "SIGN_UP", "GET_QUOTE", "LEARN_MORE")
    // - call_to_action.value.lead_gen_form_id: The lead form ID
    // - picture/image_hash: Image (optional but recommended)

    // Build CTA type mapping
    let ctaType = "LEARN_MORE";
    if (cta === "Get Quote" || cta === "GET_QUOTE") {
      ctaType = "GET_QUOTE";
    } else if (cta === "Call Now" || cta === "CALL_NOW") {
      ctaType = "CALL_NOW";
    } else if (cta === "Sign Up" || cta === "SIGN_UP") {
      ctaType = "SIGN_UP";
    } else if (cta === "Subscribe" || cta === "SUBSCRIBE") {
      ctaType = "SUBSCRIBE";
    } else if (cta === "Contact Us" || cta === "CONTACT_US") {
      ctaType = "CONTACT_US";
    }

    // The link field is REQUIRED and must be an EXTERNAL URL (not a Facebook page).
    const pageLink = "https://zuckerbot.ai/";

    const objectStorySpec: Record<string, unknown> = {
      page_id: pageId,
      link_data: {
        message: adBody,
        name: headline,
        link: pageLink, // REQUIRED — this was the missing field causing the error
        call_to_action: {
          type: ctaType,
          value: {
            lead_gen_form_id: metaLeadFormId,
          },
        },
        // Attach image if provided
        ...(image_url ? { picture: image_url } : {}),
      },
    };

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
      console.error("[launch-campaign] Creative creation failed:", creativeResult.rawBody);
      return errorResponse(502, errMsg, { meta_error: creativeResult.data.error, step: "creative" });
    }

    const metaCreativeId = creativeResult.data.id;
    console.log("[launch-campaign] Creative created:", metaCreativeId);

    // ── Step 5: Create Ad ───────────────────────────────────────────────────
    const adResult = await metaPost(
      `/act_${adAccountId}/ads`,
      {
        name: `${campaignName} – Ad`,
        adset_id: metaAdSetId,
        creative: JSON.stringify({ creative_id: metaCreativeId }),
        status: "PAUSED", // Create paused — activate after all steps succeed
      },
      fbToken
    );

    if (!adResult.ok || !adResult.data.id) {
      const errMsg =
        adResult.data.error?.message || "Failed to create ad on Meta";
      console.error("[launch-campaign] Ad creation failed:", adResult.rawBody);
      return errorResponse(502, errMsg, { meta_error: adResult.data.error, step: "ad" });
    }

    const metaAdId = adResult.data.id;
    console.log("[launch-campaign] Ad created:", metaAdId);

    // ── Step 6: Activate everything ─────────────────────────────────────────
    // All objects created successfully in PAUSED state — now activate them
    console.log("[launch-campaign] All objects created. Activating...");

    const activateAd = await metaPost(`/${metaAdId}`, { status: "ACTIVE" }, fbToken);
    if (!activateAd.ok) {
      console.error("[launch-campaign] Failed to activate ad:", activateAd.rawBody);
      // Clean up: delete the campaign (cascades to ad set + ad)
      await metaPost(`/${metaCampaignId}`, {}, fbToken); // will use DELETE below
      await fetch(`${GRAPH_BASE}/${metaCampaignId}?access_token=${fbToken}`, { method: "DELETE" });
      return errorResponse(502, activateAd.data.error?.message || "Failed to activate ad", {
        meta_error: activateAd.data.error,
        step: "activate",
      });
    }

    const activateAdSet = await metaPost(`/${metaAdSetId}`, { status: "ACTIVE" }, fbToken);
    if (!activateAdSet.ok) {
      console.error("[launch-campaign] Failed to activate ad set:", activateAdSet.rawBody);
    }

    const activateCampaign = await metaPost(`/${metaCampaignId}`, { status: "ACTIVE" }, fbToken);
    if (!activateCampaign.ok) {
      console.error("[launch-campaign] Failed to activate campaign:", activateCampaign.rawBody);
    }

    console.log("[launch-campaign] All objects activated successfully");

    // ── Step 7: Insert campaign into database ───────────────────────────────
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
      return errorResponse(500, "Campaign created on Meta but failed to save to database", {
        meta_campaign_id: metaCampaignId,
        details: insertError.message,
      });
    }

    console.log("[launch-campaign] Campaign saved to DB:", campaign.id);

    // ── Step 8: Send campaign launched email (fire-and-forget) ───────────────
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

      // Look up the user's profile for their name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user.id)
        .maybeSingle();

      const userEmail = profile?.email || user.email;
      const userName = profile?.full_name || user.user_metadata?.full_name;

      if (userEmail) {
        await fetch(`${supabaseUrl}/functions/v1/campaign-launched-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            user_email: userEmail,
            user_name: userName || undefined,
            campaign_name: campaignName,
            daily_budget_cents: daily_budget_cents || 1500,
          }),
        });
        console.log("[launch-campaign] Campaign launched email sent to:", userEmail);
      }
    } catch (emailErr) {
      // Non-blocking — don't fail the campaign launch if email fails
      console.warn("[launch-campaign] Campaign launched email failed (non-blocking):", emailErr);
    }

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

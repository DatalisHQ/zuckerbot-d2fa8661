// sync-conversions — Meta Conversion API feedback loop
// When a tradie marks a lead as "won" or "lost", we tell Meta's CAPI
// so Andromeda optimises for better quality leads.
//
// Input: { lead_id: string, quality: "good" | "bad" }
// - "good" (won/contacted) → sends a "Lead" conversion event
// - "bad" (lost) → sends with a low value signal so Meta deprioritises similar

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncRequest {
  lead_id: string;
  quality: "good" | "bad";
}

interface Lead {
  id: string;
  campaign_id: string;
  business_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  meta_lead_id: string | null;
  created_at: string;
}

interface Campaign {
  id: string;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
}

interface Business {
  id: string;
  user_id: string;
  facebook_access_token: string | null;
  facebook_page_id: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const metaPixelId = Deno.env.get("META_PIXEL_ID");
    const metaAccessToken = Deno.env.get("META_SYSTEM_USER_TOKEN"); // system user or page token

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Auth ────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Parse request ───────────────────────────────────────────────────
    const body: SyncRequest = await req.json();
    const { lead_id, quality } = body;

    if (!lead_id || !["good", "bad"].includes(quality)) {
      return new Response(
        JSON.stringify({ error: "Invalid request. Need lead_id and quality (good|bad)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch lead + campaign + business ────────────────────────────────
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedLead = lead as unknown as Lead;

    const { data: business } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", typedLead.business_id)
      .single();

    if (!business) {
      return new Response(
        JSON.stringify({ error: "Business not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedBusiness = business as unknown as Business;

    // Verify ownership
    if (typedBusiness.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — not your lead" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", typedLead.campaign_id)
      .single();

    const typedCampaign = campaign as unknown as Campaign | null;

    // ── Determine the access token to use ───────────────────────────────
    // Priority: business-level token > system user token from env
    const accessToken = typedBusiness.facebook_access_token || metaAccessToken;
    const pixelId = metaPixelId;

    if (!accessToken || !pixelId) {
      console.log("[sync-conversions] No Meta access token or pixel ID configured — skipping CAPI call");
      return new Response(
        JSON.stringify({
          success: true,
          capi_sent: false,
          message: "Lead quality recorded but Meta CAPI not configured yet",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Build Conversion API event ──────────────────────────────────────
    // See: https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api
    const eventTime = Math.floor(Date.now() / 1000);
    const leadCreatedTime = Math.floor(new Date(typedLead.created_at).getTime() / 1000);

    const userData: Record<string, string> = {};
    if (typedLead.email) {
      // Hash for CAPI (in production you'd SHA256 these — for now we send raw and let Meta hash)
      userData.em = typedLead.email.toLowerCase().trim();
    }
    if (typedLead.phone) {
      // Normalize AU phone: remove spaces, ensure +61 prefix
      let phone = typedLead.phone.replace(/\s+/g, "");
      if (phone.startsWith("0")) phone = "+61" + phone.slice(1);
      userData.ph = phone;
    }
    if (typedLead.name) {
      const parts = typedLead.name.trim().split(/\s+/);
      if (parts[0]) userData.fn = parts[0].toLowerCase();
      if (parts.length > 1) userData.ln = parts[parts.length - 1].toLowerCase();
    }

    const event: Record<string, any> = {
      event_name: quality === "good" ? "Lead" : "Other",
      event_time: eventTime,
      action_source: "system",
      user_data: userData,
      custom_data: {
        lead_quality: quality,
        lead_id: typedLead.id,
        campaign_id: typedLead.campaign_id,
        value: quality === "good" ? 100 : 0,
        currency: "AUD",
      },
    };

    // If we have the original Meta lead ID, include it for dedup
    if (typedLead.meta_lead_id) {
      event.event_id = typedLead.meta_lead_id;
    }

    // ── Send to Conversion API ──────────────────────────────────────────
    const capiUrl = `https://graph.facebook.com/v21.0/${pixelId}/events`;

    const capiPayload = {
      data: [event],
      access_token: accessToken,
    };

    console.log(`[sync-conversions] Sending ${quality} signal for lead ${lead_id} to CAPI`);

    const capiResp = await fetch(capiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capiPayload),
    });

    const capiResult = await capiResp.json();

    if (!capiResp.ok) {
      console.error("[sync-conversions] CAPI error:", JSON.stringify(capiResult));
      return new Response(
        JSON.stringify({
          success: false,
          error: "Meta CAPI returned an error",
          details: capiResult,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-conversions] CAPI success:`, JSON.stringify(capiResult));

    return new Response(
      JSON.stringify({
        success: true,
        capi_sent: true,
        events_received: capiResult.events_received || 1,
        quality,
        lead_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[sync-conversions] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// sync-conversions — Meta Conversion API feedback loop
// When a business owner marks a lead as "won" or "lost", we tell Meta's CAPI
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
  meta_pixel_id: string | null;
  currency: string | null;
}

interface CapiConfig {
  is_enabled: boolean;
  currency: string | null;
}

const encoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, "");
  if (!digits) return null;
  return digits.startsWith("+")
    ? `+${digits.slice(1).replace(/\D/g, "")}`
    : digits.replace(/\D/g, "");
}

async function buildHashedUserData(lead: Lead): Promise<Record<string, string>> {
  const userData: Record<string, string> = {};
  const email = normalizeEmail(lead.email);
  const phone = normalizePhone(lead.phone);

  if (email) userData.em = await sha256Hex(email);
  if (phone) userData.ph = await sha256Hex(phone);

  if (lead.name) {
    const parts = lead.name.trim().toLowerCase().split(/\s+/);
    if (parts[0]) userData.fn = await sha256Hex(parts[0]);
    if (parts.length > 1) userData.ln = await sha256Hex(parts[parts.length - 1]);
  }

  return userData;
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
    const { data: capiConfig } = await supabase
      .from("capi_configs")
      .select("is_enabled, currency")
      .eq("business_id", typedBusiness.id)
      .maybeSingle();

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
    const pixelId = typedBusiness.meta_pixel_id || metaPixelId;
    const eventCurrency = capiConfig?.currency || typedBusiness.currency || "USD";

    if (!accessToken || !pixelId) {
      console.log("[sync-conversions] No Meta access token or pixel ID configured — skipping CAPI call");
      await supabase.from("capi_events").insert({
        business_id: typedBusiness.id,
        user_id: user.id,
        campaign_id: typedLead.campaign_id,
        lead_id: typedLead.id,
        crm_source: "manual_conversion",
        source_stage: quality,
        meta_event_name: "Lead",
        meta_event_id: typedLead.meta_lead_id,
        match_quality: "lead_id",
        status: "skipped",
        meta_response: {
          reason: "missing_meta_credentials",
          has_access_token: !!accessToken,
          has_pixel_id: !!pixelId,
        },
      });
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
    const userData = await buildHashedUserData(typedLead);

    const event: Record<string, any> = {
      event_name: "Lead",
      event_time: eventTime,
      action_source: "system",
      user_data: userData,
      custom_data: {
        lead_quality: quality,
        lead_id: typedLead.id,
        campaign_id: typedLead.campaign_id,
        value: quality === "good" ? 100 : 0,
        currency: eventCurrency,
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
      await supabase.from("capi_events").insert({
        business_id: typedBusiness.id,
        user_id: user.id,
        campaign_id: typedLead.campaign_id,
        lead_id: typedLead.id,
        crm_source: "manual_conversion",
        source_stage: quality,
        meta_event_name: "Lead",
        event_time: new Date().toISOString(),
        meta_event_id: typedLead.meta_lead_id,
        match_quality: "lead_id",
        status: "failed",
        meta_response: capiResult,
      });
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
    await supabase.from("capi_events").insert({
      business_id: typedBusiness.id,
      user_id: user.id,
      campaign_id: typedLead.campaign_id,
      lead_id: typedLead.id,
      crm_source: "manual_conversion",
      source_stage: quality,
      meta_event_name: "Lead",
      event_time: new Date().toISOString(),
      meta_event_id: typedLead.meta_lead_id,
      match_quality: "lead_id",
      status: "sent",
      meta_response: capiResult,
    });

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

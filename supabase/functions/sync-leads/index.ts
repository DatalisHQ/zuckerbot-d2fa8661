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

interface SyncLeadsRequest {
  campaign_id: string;
}

interface MetaLeadFieldData {
  name: string;
  values: string[];
}

interface MetaLead {
  id: string;
  created_time: string;
  field_data: MetaLeadFieldData[];
}

interface MetaLeadsResponse {
  data: MetaLead[];
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
  };
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

interface ParsedLead {
  name: string | null;
  phone: string | null;
  email: string | null;
  suburb: string | null;
}

// ─── Helper: Extract field value from Meta lead data ─────────────────────────

function extractField(fieldData: MetaLeadFieldData[], fieldName: string): string | null {
  const field = fieldData.find(
    (f) => f.name.toLowerCase() === fieldName.toLowerCase()
  );
  return field?.values?.[0] || null;
}

// ─── Helper: Parse Meta lead into our format ─────────────────────────────────

function parseLead(metaLead: MetaLead): ParsedLead {
  const fd = metaLead.field_data;
  return {
    name: extractField(fd, "full_name") || extractField(fd, "name"),
    phone: extractField(fd, "phone_number") || extractField(fd, "phone"),
    email: extractField(fd, "email"),
    suburb: extractField(fd, "suburb") || extractField(fd, "city"),
  };
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
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Parse request body ──────────────────────────────────────────────────
    const { campaign_id } = (await req.json()) as SyncLeadsRequest;

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: "campaign_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch campaign ──────────────────────────────────────────────────────
    const { data: campaign, error: campError } = await supabase
      .from("campaigns")
      .select("id, business_id, meta_leadform_id, leads_count")
      .eq("id", campaign_id)
      .single();

    if (campError || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campaign not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch business & verify ownership ───────────────────────────────────
    const { data: business, error: bizError } = await supabase
      .from("businesses")
      .select("id, user_id, name, facebook_access_token")
      .eq("id", campaign.business_id)
      .single();

    if (bizError || !business) {
      return new Response(
        JSON.stringify({ error: "Business not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (business.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "You do not own this campaign" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Validate prerequisites ──────────────────────────────────────────────
    if (!business.facebook_access_token) {
      return new Response(
        JSON.stringify({
          error: "Please connect your Facebook account first",
          reconnectRequired: true,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!campaign.meta_leadform_id) {
      return new Response(
        JSON.stringify({
          error: "No lead form associated with this campaign. Cannot sync leads.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fbToken = business.facebook_access_token;

    console.log("[sync-leads] Fetching leads for campaign:", campaign_id);
    console.log("[sync-leads] Lead form ID:", campaign.meta_leadform_id);

    // ── Fetch leads from Meta Graph API ─────────────────────────────────────
    // Paginate through all available leads
    let allMetaLeads: MetaLead[] = [];
    let nextUrl: string | null =
      `${GRAPH_BASE}/${campaign.meta_leadform_id}/leads?access_token=${fbToken}&limit=100`;

    while (nextUrl) {
      const res = await fetch(nextUrl);
      const data = (await res.json()) as MetaLeadsResponse;

      if (!res.ok || data.error) {
        const errMsg =
          data.error?.message || "Failed to fetch leads from Meta";
        console.error("[sync-leads] Meta API error:", data.error);
        return new Response(
          JSON.stringify({ error: errMsg, meta_error: data.error }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (data.data && data.data.length > 0) {
        allMetaLeads = allMetaLeads.concat(data.data);
      }

      // Follow pagination cursor
      nextUrl = data.paging?.next || null;
    }

    console.log("[sync-leads] Fetched", allMetaLeads.length, "leads from Meta");

    // ── Deduplicate against existing leads ──────────────────────────────────
    // Fetch all existing meta_lead_ids for this campaign
    const { data: existingLeads, error: existErr } = await supabase
      .from("leads")
      .select("meta_lead_id")
      .eq("campaign_id", campaign_id);

    if (existErr) {
      console.error("[sync-leads] Failed to fetch existing leads:", existErr);
      return new Response(
        JSON.stringify({ error: "Failed to check existing leads" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existingIds = new Set(
      (existingLeads || []).map((l) => l.meta_lead_id).filter(Boolean)
    );

    // Filter to only new leads
    const newMetaLeads = allMetaLeads.filter(
      (lead) => !existingIds.has(lead.id)
    );

    console.log("[sync-leads] New leads to insert:", newMetaLeads.length);

    // ── Insert new leads ────────────────────────────────────────────────────
    const insertedLeads: string[] = [];

    for (const metaLead of newMetaLeads) {
      const parsed = parseLead(metaLead);

      const { data: newLead, error: insertErr } = await supabase
        .from("leads")
        .insert({
          campaign_id: campaign.id,
          business_id: business.id,
          name: parsed.name,
          phone: parsed.phone,
          email: parsed.email,
          suburb: parsed.suburb,
          status: "new",
          meta_lead_id: metaLead.id,
          sms_sent: false,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error(
          "[sync-leads] Failed to insert lead:",
          metaLead.id,
          insertErr
        );
        continue; // Skip this lead but continue processing others
      }

      insertedLeads.push(newLead.id);

      // ── Queue SMS for new lead ──────────────────────────────────────────
      // Insert a pending SMS log entry that the send-sms function can pick up,
      // or directly invoke the send-sms function.
      if (parsed.phone) {
        const { error: smsErr } = await supabase.from("sms_log").insert({
          lead_id: newLead.id,
          to_phone: parsed.phone,
          message: `Thanks for reaching out to ${business.name}! We'll get back to you within the hour. Reply STOP to opt out.`,
          status: "pending",
        });

        if (smsErr) {
          console.warn(
            "[sync-leads] Failed to queue SMS for lead:",
            newLead.id,
            smsErr
          );
        }
      }
    }

    // ── Update campaign leads_count ─────────────────────────────────────────
    const newTotal = (campaign.leads_count || 0) + insertedLeads.length;

    const { error: updateErr } = await supabase
      .from("campaigns")
      .update({ leads_count: newTotal })
      .eq("id", campaign_id);

    if (updateErr) {
      console.warn("[sync-leads] Failed to update leads_count:", updateErr);
    }

    console.log(
      "[sync-leads] Sync complete. New leads:",
      insertedLeads.length,
      "Total:",
      newTotal
    );

    // ── Return response ─────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        new_leads_count: insertedLeads.length,
        total_leads_count: newTotal,
        new_lead_ids: insertedLeads,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[sync-leads] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

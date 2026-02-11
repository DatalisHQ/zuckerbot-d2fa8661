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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Service-role client for DB operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // ── Auth check ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // ── Parse request body ──────────────────────────────────────────────────
    const body = await req.json();
    const { campaign_id } = body;

    if (!campaign_id) {
      return jsonResponse({ error: "campaign_id is required" }, 400);
    }

    // ── Fetch campaign ──────────────────────────────────────────────────────
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from("campaigns")
      .select("id, business_id, meta_campaign_id, name, status")
      .eq("id", campaign_id)
      .single();

    if (campErr || !campaign) {
      return jsonResponse({ error: "Campaign not found" }, 404);
    }

    // ── Verify ownership via business ───────────────────────────────────────
    const { data: business, error: bizErr } = await supabaseAdmin
      .from("businesses")
      .select("id, user_id, facebook_access_token")
      .eq("id", campaign.business_id)
      .single();

    if (bizErr || !business) {
      return jsonResponse({ error: "Business not found" }, 404);
    }

    if (business.user_id !== user.id) {
      return jsonResponse({ error: "You do not own this campaign" }, 403);
    }

    // ── Delete from Meta if meta_campaign_id exists ─────────────────────────
    let metaDeleted = false;
    let metaError: string | null = null;

    if (campaign.meta_campaign_id) {
      if (!business.facebook_access_token) {
        console.warn(
          `[delete-campaign] No facebook_access_token for business ${business.id}, skipping Meta deletion`
        );
        metaError = "No Facebook access token — skipped Meta deletion";
      } else {
        try {
          const deleteUrl = `${GRAPH_BASE}/${campaign.meta_campaign_id}?access_token=${business.facebook_access_token}`;
          const metaRes = await fetch(deleteUrl, { method: "DELETE" });
          const metaData = await metaRes.json().catch(() => ({}));

          if (metaRes.ok || metaData?.success) {
            metaDeleted = true;
            console.log(
              `[delete-campaign] Meta campaign ${campaign.meta_campaign_id} deleted successfully`
            );
          } else {
            // Campaign may already be deleted on Meta side — log but continue
            const errMsg = metaData?.error?.message || `HTTP ${metaRes.status}`;
            console.warn(
              `[delete-campaign] Meta deletion failed for ${campaign.meta_campaign_id}: ${errMsg} — proceeding with DB deletion`
            );
            metaError = errMsg;
            // Still proceed to delete from DB
          }
        } catch (err) {
          console.warn(
            `[delete-campaign] Network error deleting from Meta: ${err.message} — proceeding with DB deletion`
          );
          metaError = `Network error: ${err.message}`;
        }
      }
    }

    // ── Delete associated leads from DB ─────────────────────────────────────
    const { error: leadsDelErr, count: leadsDeleted } = await supabaseAdmin
      .from("leads")
      .delete({ count: "exact" })
      .eq("campaign_id", campaign_id);

    if (leadsDelErr) {
      console.warn(
        `[delete-campaign] Error deleting leads for campaign ${campaign_id}:`,
        leadsDelErr
      );
    }

    // ── Delete campaign record from DB ──────────────────────────────────────
    const { error: delErr } = await supabaseAdmin
      .from("campaigns")
      .delete()
      .eq("id", campaign_id);

    if (delErr) {
      console.error(
        `[delete-campaign] Error deleting campaign ${campaign_id}:`,
        delErr
      );
      return jsonResponse(
        {
          error: "Failed to delete campaign from database",
          details: delErr.message,
        },
        500
      );
    }

    console.log(
      `[delete-campaign] Campaign ${campaign_id} ("${campaign.name}") deleted — meta_deleted: ${metaDeleted}, leads_deleted: ${leadsDeleted || 0}`
    );

    return jsonResponse({
      success: true,
      message: `Campaign "${campaign.name}" deleted successfully`,
      meta_deleted: metaDeleted,
      meta_error: metaError,
      leads_deleted: leadsDeleted || 0,
    });
  } catch (error) {
    console.error("[delete-campaign] Unexpected error:", error);
    return jsonResponse(
      { error: error.message || "Internal server error" },
      500
    );
  }
});

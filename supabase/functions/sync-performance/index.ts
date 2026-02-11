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

interface SyncRequest {
  campaign_id?: string;
  sync_all?: boolean;
}

interface Campaign {
  id: string;
  business_id: string;
  meta_campaign_id: string;
  status: string;
  leads_count: number;
  spend_cents: number;
  launched_at: string | null;
  created_at: string;
}

interface Business {
  id: string;
  user_id: string;
  facebook_access_token: string | null;
}

interface MetaInsightsAction {
  action_type: string;
  value: string;
}

interface MetaInsightsData {
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: MetaInsightsAction[];
}

interface MetaInsightsResponse {
  data?: MetaInsightsData[];
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

interface SyncResult {
  campaign_id: string;
  campaign_name?: string;
  status: "synced" | "skipped" | "error";
  reason?: string;
  impressions?: number;
  clicks?: number;
  spend_cents?: number;
  leads_count?: number;
  cpl_cents?: number | null;
  performance_status?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function determinePerformanceStatus(
  campaign: Campaign,
  impressions: number,
  spendCents: number,
  leadsCount: number,
  cplCents: number | null
): string {
  // Check if campaign is paused
  if (campaign.status === "paused") {
    return "paused";
  }

  // Check if still in learning phase
  const launchedAt = campaign.launched_at
    ? new Date(campaign.launched_at).getTime()
    : new Date(campaign.created_at).getTime();
  const hoursSinceLaunch = (Date.now() - launchedAt) / (1000 * 60 * 60);

  if (hoursSinceLaunch < 48 || impressions < 500) {
    return "learning";
  }

  // Check for underperforming
  if (cplCents !== null && cplCents >= 3000) {
    return "underperforming";
  }
  if (spendCents > 5000 && leadsCount === 0) {
    return "underperforming";
  }

  // Check for healthy
  if (cplCents !== null && cplCents < 3000 && leadsCount >= 1) {
    return "healthy";
  }

  // Default to learning if none of the above match
  return "learning";
}

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

    // ── Parse request body ──────────────────────────────────────────────────
    const body: SyncRequest = await req.json();
    const { campaign_id, sync_all } = body;

    if (!campaign_id && !sync_all) {
      return jsonResponse(
        { error: "Either campaign_id or sync_all: true is required" },
        400
      );
    }

    // ── Auth check ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");

      // Check if it's a service role call (token matches service key)
      if (token === supabaseServiceKey) {
        // Service role — allowed to sync_all without user auth
        userId = null;
      } else {
        // User token — verify
        const {
          data: { user },
          error: authError,
        } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
        userId = user.id;
      }
    } else {
      return jsonResponse(
        { error: "Missing or invalid authorization header" },
        401
      );
    }

    // ── Fetch campaigns to sync ─────────────────────────────────────────────
    let campaigns: Campaign[] = [];

    if (campaign_id) {
      // Specific campaign — verify ownership if user-authenticated
      const { data: camp, error: campErr } = await supabaseAdmin
        .from("campaigns")
        .select(
          "id, business_id, meta_campaign_id, status, leads_count, spend_cents, launched_at, created_at"
        )
        .eq("id", campaign_id)
        .single();

      if (campErr || !camp) {
        return jsonResponse({ error: "Campaign not found" }, 404);
      }

      if (userId) {
        // Verify user owns this campaign
        const { data: biz } = await supabaseAdmin
          .from("businesses")
          .select("user_id")
          .eq("id", camp.business_id)
          .single();

        if (!biz || biz.user_id !== userId) {
          return jsonResponse(
            { error: "You do not own this campaign" },
            403
          );
        }
      }

      campaigns = [camp as Campaign];
    } else if (sync_all) {
      // All active campaigns with a meta_campaign_id
      const { data: allCamps, error: allErr } = await supabaseAdmin
        .from("campaigns")
        .select(
          "id, business_id, meta_campaign_id, status, leads_count, spend_cents, launched_at, created_at"
        )
        .eq("status", "active")
        .not("meta_campaign_id", "is", null);

      if (allErr) {
        console.error("[sync-performance] Failed to fetch campaigns:", allErr);
        return jsonResponse({ error: "Failed to fetch campaigns" }, 500);
      }

      // If user-authenticated, only sync their campaigns
      if (userId) {
        const { data: userBiz } = await supabaseAdmin
          .from("businesses")
          .select("id")
          .eq("user_id", userId)
          .single();

        if (userBiz) {
          campaigns = ((allCamps || []) as Campaign[]).filter(
            (c) => c.business_id === userBiz.id
          );
        }
      } else {
        campaigns = (allCamps || []) as Campaign[];
      }
    }

    if (campaigns.length === 0) {
      return jsonResponse({
        message: "No campaigns to sync",
        results: [],
      });
    }

    // ── Cache businesses to avoid repeated lookups ──────────────────────────
    const businessCache: Record<string, Business> = {};

    async function getBusiness(businessId: string): Promise<Business | null> {
      if (businessCache[businessId]) return businessCache[businessId];

      const { data, error } = await supabaseAdmin
        .from("businesses")
        .select("id, user_id, facebook_access_token")
        .eq("id", businessId)
        .single();

      if (error || !data) return null;
      businessCache[businessId] = data as Business;
      return data as Business;
    }

    // ── Sync each campaign ──────────────────────────────────────────────────
    const results: SyncResult[] = [];

    for (const campaign of campaigns) {
      const result: SyncResult = {
        campaign_id: campaign.id,
        status: "synced",
      };

      try {
        // Skip if no meta_campaign_id
        if (!campaign.meta_campaign_id) {
          result.status = "skipped";
          result.reason = "No meta_campaign_id";
          results.push(result);
          continue;
        }

        // Fetch business for access token
        const business = await getBusiness(campaign.business_id);
        if (!business) {
          result.status = "skipped";
          result.reason = "Business not found";
          results.push(result);
          continue;
        }

        if (!business.facebook_access_token) {
          console.warn(
            `[sync-performance] Campaign ${campaign.id}: No facebook_access_token for business ${business.id}, skipping`
          );
          result.status = "skipped";
          result.reason = "No facebook_access_token";
          results.push(result);
          continue;
        }

        // ── Call Meta Marketing API ───────────────────────────────────────
        const insightsUrl = `${GRAPH_BASE}/${campaign.meta_campaign_id}/insights?fields=impressions,clicks,spend,actions&date_preset=lifetime&access_token=${business.facebook_access_token}`;

        const metaRes = await fetch(insightsUrl);
        const metaData = (await metaRes.json()) as MetaInsightsResponse;

        if (!metaRes.ok || metaData.error) {
          const errMsg =
            metaData.error?.message || `HTTP ${metaRes.status}`;
          console.error(
            `[sync-performance] Campaign ${campaign.id}: Meta API error — ${errMsg}`
          );

          // Handle expired token (401/190)
          if (
            metaRes.status === 401 ||
            metaData.error?.code === 190
          ) {
            result.status = "error";
            result.reason = "Access token expired — reconnect Facebook";
          } else {
            result.status = "error";
            result.reason = `Meta API error: ${errMsg}`;
          }
          results.push(result);
          continue;
        }

        // ── Parse insights ────────────────────────────────────────────────
        const insights = metaData.data?.[0];

        // Meta returns empty data array if no delivery yet
        const impressions = insights?.impressions
          ? parseInt(insights.impressions, 10)
          : 0;
        const clicks = insights?.clicks
          ? parseInt(insights.clicks, 10)
          : 0;
        const spendDollars = insights?.spend
          ? parseFloat(insights.spend)
          : 0;
        const spendCents = Math.round(spendDollars * 100);

        // Find lead actions
        const leadAction = insights?.actions?.find(
          (a) => a.action_type === "lead"
        );
        const leadsCount = leadAction ? parseInt(leadAction.value, 10) : 0;

        // Calculate CPL
        const cplCents =
          leadsCount > 0 ? Math.round(spendCents / leadsCount) : null;

        // ── Determine performance status ──────────────────────────────────
        const performanceStatus = determinePerformanceStatus(
          campaign,
          impressions,
          spendCents,
          leadsCount,
          cplCents
        );

        // ── Update campaign in DB ─────────────────────────────────────────
        const { error: updateErr } = await supabaseAdmin
          .from("campaigns")
          .update({
            impressions,
            clicks,
            spend_cents: spendCents,
            leads_count: leadsCount,
            cpl_cents: cplCents,
            performance_status: performanceStatus,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", campaign.id);

        if (updateErr) {
          console.error(
            `[sync-performance] Campaign ${campaign.id}: DB update error —`,
            updateErr
          );
          result.status = "error";
          result.reason = "Failed to update database";
          results.push(result);
          continue;
        }

        result.impressions = impressions;
        result.clicks = clicks;
        result.spend_cents = spendCents;
        result.leads_count = leadsCount;
        result.cpl_cents = cplCents;
        result.performance_status = performanceStatus;

        console.log(
          `[sync-performance] Campaign ${campaign.id}: synced — ${impressions} imp, ${clicks} clicks, $${(spendCents / 100).toFixed(2)} spend, ${leadsCount} leads, status=${performanceStatus}`
        );

        results.push(result);
      } catch (err) {
        console.error(
          `[sync-performance] Campaign ${campaign.id}: Unexpected error —`,
          err
        );
        result.status = "error";
        result.reason = err.message || "Unexpected error";
        results.push(result);
      }
    }

    // ── Return summary ──────────────────────────────────────────────────────
    const synced = results.filter((r) => r.status === "synced").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const errors = results.filter((r) => r.status === "error").length;

    return jsonResponse({
      message: `Synced ${synced} campaign(s), skipped ${skipped}, errors ${errors}`,
      total: results.length,
      synced,
      skipped,
      errors,
      results,
    });
  } catch (error) {
    console.error("[sync-performance] Unexpected error:", error);
    return jsonResponse(
      { error: error.message || "Internal server error" },
      500
    );
  }
});

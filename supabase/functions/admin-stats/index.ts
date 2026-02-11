import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Marketing campaign ID (ZuckerBot's own Meta ads)
const MARKETING_CAMPAIGN_ID = "120241673514780057";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // ── Auth: verify caller is authenticated ──────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Use anon client for auth validation (admin client can't validate user JWTs)
    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "");
    
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.log(`[admin-stats] Auth error:`, authError?.message || "No user");
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Admin access: only allow specific email
    const ADMIN_EMAILS = ["davisgrainger@gmail.com"];
    if (!user.email || !ADMIN_EMAILS.includes(user.email)) {
      console.log(`[admin-stats] Access denied for email: ${user.email}`);
      return jsonResponse({ error: "Forbidden — admin access only" }, 403);
    }

    // ── Fetch all profiles (users) ────────────────────────────────────────
    const { data: profiles, error: profilesErr } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (profilesErr) {
      console.error("[admin-stats] Error fetching profiles:", profilesErr);
      return jsonResponse({ error: "Failed to fetch profiles" }, 500);
    }

    // ── Fetch all businesses ──────────────────────────────────────────────
    const { data: businesses, error: bizErr } = await supabaseAdmin
      .from("businesses")
      .select("*")
      .order("created_at", { ascending: false });

    if (bizErr) {
      console.error("[admin-stats] Error fetching businesses:", bizErr);
      return jsonResponse({ error: "Failed to fetch businesses" }, 500);
    }

    // ── Fetch all campaigns ──────────────────────────────────────────────
    const { data: campaigns, error: campErr } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (campErr) {
      console.error("[admin-stats] Error fetching campaigns:", campErr);
      return jsonResponse({ error: "Failed to fetch campaigns" }, 500);
    }

    // ── Fetch all leads ──────────────────────────────────────────────────
    const { data: leads, error: leadsErr } = await supabaseAdmin
      .from("leads")
      .select("id, business_id, status, created_at")
      .order("created_at", { ascending: false });

    // ── Fetch subscribers table for subscription data ────────────────────
    const { data: subscribers, error: subsErr } = await supabaseAdmin
      .from("subscribers")
      .select("*")
      .order("created_at", { ascending: false });

    // ── Fetch auth.users for email/created_at ────────────────────────────
    const { data: authUsersData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000,
    });

    const authUsers = authUsersData?.users || [];

    // Build lookup maps
    const businessByUserId: Record<string, any> = {};
    (businesses || []).forEach((b: any) => {
      businessByUserId[b.user_id] = b;
    });

    const campaignsByBusinessId: Record<string, any[]> = {};
    (campaigns || []).forEach((c: any) => {
      if (!campaignsByBusinessId[c.business_id]) {
        campaignsByBusinessId[c.business_id] = [];
      }
      campaignsByBusinessId[c.business_id].push(c);
    });

    const subscriberByUserId: Record<string, any> = {};
    const subscriberByEmail: Record<string, any> = {};
    (subscribers || []).forEach((s: any) => {
      if (s.user_id) subscriberByUserId[s.user_id] = s;
      if (s.email) subscriberByEmail[s.email.toLowerCase()] = s;
    });

    // ── Build enriched user list ─────────────────────────────────────────
    const usersList = authUsers.map((au: any) => {
      const profile = (profiles || []).find((p: any) => p.user_id === au.id);
      const biz = businessByUserId[au.id];
      const userCampaigns = biz ? (campaignsByBusinessId[biz.id] || []) : [];
      const sub = subscriberByUserId[au.id] || subscriberByEmail[(au.email || "").toLowerCase()];

      // Determine subscription status
      let subscriptionStatus = "none";
      if (sub?.subscribed && sub?.subscription_tier && sub.subscription_tier !== "free") {
        subscriptionStatus = "active";
      } else if (profile?.subscription_tier && profile.subscription_tier !== "free") {
        subscriptionStatus = "active";
      } else if (sub?.subscription_end) {
        const endDate = new Date(sub.subscription_end);
        if (endDate > new Date()) {
          subscriptionStatus = "trial";
        } else {
          subscriptionStatus = "expired";
        }
      } else if (profile?.created_at) {
        // Check if within 7-day trial window
        const createdAt = new Date(profile.created_at);
        const trialEnd = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        if (trialEnd > new Date()) {
          subscriptionStatus = "trial";
        }
      }

      return {
        id: au.id,
        email: au.email || profile?.email || null,
        full_name: profile?.full_name || null,
        created_at: au.created_at || profile?.created_at,
        has_business: !!biz,
        business_name: biz?.name || null,
        has_campaign: userCampaigns.length > 0,
        campaign_count: userCampaigns.length,
        subscription_status: subscriptionStatus,
        subscription_tier: sub?.subscription_tier || profile?.subscription_tier || "free",
        subscription_end: sub?.subscription_end || null,
        facebook_connected: profile?.facebook_connected || false,
        onboarding_completed: profile?.onboarding_completed || false,
      };
    });

    // ── Compute aggregates ───────────────────────────────────────────────
    const allCampaigns = campaigns || [];
    const activeCampaigns = allCampaigns.filter((c: any) => c.status === "active");
    const totalSpendCents = allCampaigns.reduce((sum: number, c: any) => sum + (c.spend_cents || 0), 0);
    const totalLeadsCount = allCampaigns.reduce((sum: number, c: any) => sum + (c.leads_count || 0), 0);
    const totalImpressions = allCampaigns.reduce((sum: number, c: any) => sum + (c.impressions || 0), 0);
    const totalClicks = allCampaigns.reduce((sum: number, c: any) => sum + (c.clicks || 0), 0);

    // Subscription stats
    const payingCustomers = usersList.filter((u: any) => u.subscription_status === "active").length;
    const activeTrials = usersList.filter((u: any) => u.subscription_status === "trial").length;

    // MRR calculation (from subscribers with active subscriptions)
    let mrrCents = 0;
    (subscribers || []).forEach((s: any) => {
      if (s.subscribed && s.subscription_tier) {
        if (s.subscription_tier === "pro") mrrCents += 9900;
        else if (s.subscription_tier === "starter") mrrCents += 4900;
      }
    });

    // Also add from profiles subscription_tier
    if (mrrCents === 0) {
      (profiles || []).forEach((p: any) => {
        if (p.subscription_tier === "pro") mrrCents += 9900;
        else if (p.subscription_tier === "starter") mrrCents += 4900;
      });
    }

    const conversionRate = usersList.length > 0
      ? ((payingCustomers / usersList.length) * 100).toFixed(1)
      : "0.0";

    // ── Fetch ZuckerBot's own Meta marketing campaign insights ──────────
    let marketingInsights: any = null;
    try {
      // Find the first business with a facebook_access_token to use for API calls
      const bizWithToken = (businesses || []).find((b: any) => b.facebook_access_token);
      if (bizWithToken?.facebook_access_token) {
        const insightsUrl = `${GRAPH_BASE}/${MARKETING_CAMPAIGN_ID}/insights?fields=impressions,clicks,spend,actions,ctr,cpc,cpp,reach&date_preset=lifetime&access_token=${bizWithToken.facebook_access_token}`;
        const metaRes = await fetch(insightsUrl);
        const metaData = await metaRes.json();

        if (metaRes.ok && metaData.data && metaData.data.length > 0) {
          const d = metaData.data[0];
          marketingInsights = {
            impressions: parseInt(d.impressions || "0", 10),
            clicks: parseInt(d.clicks || "0", 10),
            spend: d.spend || "0",
            ctr: d.ctr || "0",
            cpc: d.cpc || "0",
            cpp: d.cpp || "0",
            reach: parseInt(d.reach || "0", 10),
            actions: d.actions || [],
          };
        } else {
          console.warn("[admin-stats] Meta insights error or empty:", metaData.error?.message || "no data");
        }
      }
    } catch (metaErr) {
      console.error("[admin-stats] Meta marketing insights error:", metaErr);
    }

    // ── Build response ───────────────────────────────────────────────────
    return jsonResponse({
      // User stats
      total_users: usersList.length,
      active_trials: activeTrials,
      paying_customers: payingCustomers,
      mrr_cents: mrrCents,
      conversion_rate: conversionRate,
      users: usersList,

      // Business stats
      total_businesses: (businesses || []).length,

      // Campaign stats
      total_campaigns: allCampaigns.length,
      active_campaigns: activeCampaigns.length,
      total_leads: totalLeadsCount,
      total_spend_cents: totalSpendCents,
      total_impressions: totalImpressions,
      total_clicks: totalClicks,
      campaigns: allCampaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        daily_budget_cents: c.daily_budget_cents,
        leads_count: c.leads_count || 0,
        spend_cents: c.spend_cents || 0,
        impressions: c.impressions || 0,
        clicks: c.clicks || 0,
        cpl_cents: c.cpl_cents,
        performance_status: c.performance_status,
        created_at: c.created_at,
        launched_at: c.launched_at,
        last_synced_at: c.last_synced_at,
        business_id: c.business_id,
      })),

      // ZuckerBot's own marketing
      marketing_insights: marketingInsights,

      // Timestamp
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[admin-stats] Unexpected error:", error);
    return jsonResponse(
      { error: error.message || "Internal server error" },
      500
    );
  }
});

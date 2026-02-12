import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = ["davisgrainger@gmail.com"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);

    // Auth check with anon client
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);

    if (authError || !user || !user.email || !ADMIN_EMAILS.includes(user.email)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // ── Fetch all data with service role (bypasses RLS) ──────────────────

    // 1. All auth users
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const allUsers = authUsers?.users || [];

    // 2. All profiles
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    // 3. All businesses
    const { data: businesses } = await supabaseAdmin
      .from("businesses")
      .select("*")
      .order("created_at", { ascending: false });

    // 4. All campaigns
    const { data: campaigns } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    // 5. All leads
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    // ── Build user list with enriched data ───────────────────────────────

    const userList = allUsers.map(u => {
      const profile = (profiles || []).find((p: any) => p.user_id === u.id);
      const biz = (businesses || []).find((b: any) => b.user_id === u.id);
      const userCampaigns = biz
        ? (campaigns || []).filter((c: any) => c.business_id === biz.id)
        : [];

      return {
        id: u.id,
        email: u.email,
        full_name: profile?.full_name || u.user_metadata?.full_name || null,
        created_at: u.created_at,
        has_business: !!biz,
        business_name: biz?.name || null,
        trade: biz?.trade || null,
        suburb: biz?.suburb || null,
        campaign_count: userCampaigns.length,
        facebook_connected: profile?.facebook_connected || false,
        onboarding_completed: profile?.onboarding_completed || false,
        subscription_status: "none", // TODO: check Stripe
      };
    });

    // ── Campaign stats ───────────────────────────────────────────────────

    const allCampaigns = (campaigns || []).map((c: any) => {
      const biz = (businesses || []).find((b: any) => b.id === c.business_id);
      const owner = allUsers.find(u => u.id === biz?.user_id);
      return {
        ...c,
        business_name: biz?.name || "Unknown",
        user_email: owner?.email || "Unknown",
      };
    });

    const totalSpend = allCampaigns.reduce((sum: number, c: any) => sum + (c.spend_cents || 0), 0);
    const totalLeads = allCampaigns.reduce((sum: number, c: any) => sum + (c.leads_count || 0), 0);
    const totalImpressions = allCampaigns.reduce((sum: number, c: any) => sum + (c.impressions || 0), 0);
    const totalClicks = allCampaigns.reduce((sum: number, c: any) => sum + (c.clicks || 0), 0);
    const activeCampaigns = allCampaigns.filter((c: any) => c.status === "active").length;

    // ── Marketing campaign insights (Meta API) ──────────────────────────

    let marketingInsights = null;
    try {
      const META_TOKEN = Deno.env.get("META_SYSTEM_USER_TOKEN");
      if (META_TOKEN) {
        const campaignId = "120241673514780057";
        const metaRes = await fetch(
          `https://graph.facebook.com/v19.0/${campaignId}/insights?fields=impressions,reach,clicks,ctr,cpc,cpp,spend,actions&date_preset=lifetime&access_token=${META_TOKEN}`
        );
        const metaData = await metaRes.json();
        if (metaData.data?.[0]) {
          marketingInsights = metaData.data[0];
        }
      }
    } catch (e) {
      console.error("[admin-data] Meta API error:", e);
    }

    // ── Response ─────────────────────────────────────────────────────────

    const response = {
      total_users: allUsers.length,
      active_trials: 0,
      paying_customers: 0,
      mrr_cents: 0,
      conversion_rate: "0",
      total_businesses: (businesses || []).length,
      total_campaigns: allCampaigns.length,
      active_campaigns: activeCampaigns,
      total_leads: totalLeads,
      total_spend_cents: totalSpend,
      total_impressions: totalImpressions,
      total_clicks: totalClicks,
      users: userList,
      campaigns: allCampaigns,
      marketing_insights: marketingInsights,
      fetched_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[admin-data] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

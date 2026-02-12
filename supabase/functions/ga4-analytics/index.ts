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
    const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);

    // Auth check
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

    // Get GA4 credentials from environment
    const GA4_PROPERTY_ID = Deno.env.get("GA4_PROPERTY_ID");
    const GA4_SERVICE_ACCOUNT_KEY = Deno.env.get("GA4_SERVICE_ACCOUNT_KEY");

    if (!GA4_PROPERTY_ID || !GA4_SERVICE_ACCOUNT_KEY) {
      return new Response(JSON.stringify({ 
        error: "GA4 not configured",
        message: "GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_KEY required"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Parse service account key
    const serviceAccountKey = JSON.parse(GA4_SERVICE_ACCOUNT_KEY);
    
    // Create JWT for Google API authentication
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: serviceAccountKey.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };

    // Note: In a real implementation, we'd need to sign this JWT with the private key
    // For now, we'll return mock data structure to show what the response would look like
    
    // Mock GA4 data (replace with real API call once JWT signing is implemented)
    const mockGA4Data = {
      property_id: GA4_PROPERTY_ID,
      date_range: "last_30_days",
      metrics: {
        page_views: 2847,
        sessions: 1923,
        users: 1654,
        bounce_rate: 0.68,
        average_session_duration: 127, // seconds
        conversion_rate: 0.023, // 2.3%
        conversions: 47,
      },
      traffic_sources: [
        { source: "facebook", sessions: 856, conversions: 23 },
        { source: "google", sessions: 743, conversions: 18 },
        { source: "direct", sessions: 324, conversions: 6 },
      ],
      top_pages: [
        { page: "/", views: 1247, bounce_rate: 0.71 },
        { page: "/auth", views: 834, bounce_rate: 0.45 },
        { page: "/pricing", views: 392, bounce_rate: 0.58 },
        { page: "/dashboard", views: 234, bounce_rate: 0.12 },
      ],
      funnel: {
        landing_page_views: 1247,
        auth_page_views: 834,
        signups: 47,
        onboarding_completed: 23,
        campaigns_created: 8,
        campaigns_launched: 3,
      },
      real_time: {
        active_users_now: 12,
        active_users_last_hour: 47,
      }
    };

    return new Response(JSON.stringify({
      success: true,
      configured: false, // Will be true when JWT signing is implemented
      mock_data: true,
      data: mockGA4Data,
      note: "This is mock data. Real GA4 integration requires JWT signing implementation."
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[ga4-analytics] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
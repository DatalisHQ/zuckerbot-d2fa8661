import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TINYFISH_API_URL = "https://agent.tinyfish.ai/v1/automation/run-sse";
const TINYFISH_API_KEY = Deno.env.get("TINYFISH_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface CompetitorAd {
  page_name: string;
  ad_body_text: string;
  started_running_date: string;
  platforms: string;
}

async function scrapeCompetitorAds(industry: string, location: string, country: string): Promise<CompetitorAd[]> {
  const searchQuery = encodeURIComponent(`${industry} ${location}`);
  const countryCode = country === "AU" ? "AU" : "US";
  const adLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${countryCode}&q=${searchQuery}`;

  // Use AbortController for timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000); // 50s timeout

  try {
    const response = await fetch(TINYFISH_API_URL, {
      method: "POST",
      headers: {
        "X-API-Key": TINYFISH_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: adLibraryUrl,
        goal: `Extract the first 5 active ads shown. For each return JSON: {"data": [{"page_name": str, "ad_body_text": str, "started_running_date": str, "platforms": str}]}. Dismiss any popups.`,
        browser_profile: "stealth",
        proxy_config: { enabled: true, country_code: countryCode },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`TinyFish API error: ${response.status}`);
    }

    // Read SSE stream
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "COMPLETE" && event.status === "COMPLETED") {
            clearTimeout(timeout);
            try { reader.cancel(); } catch {}
            // Extract ads array from various possible response shapes
            const rj = event.resultJson || {};
            if (Array.isArray(rj)) return rj;
            if (Array.isArray(rj.data)) return rj.data;
            if (Array.isArray(rj.ads)) return rj.ads;
            for (const val of Object.values(rj)) {
              if (Array.isArray(val)) return val as CompetitorAd[];
            }
            return [];
          }
        } catch {}
      }
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!TINYFISH_API_KEY) {
      return new Response(
        JSON.stringify({ error: "TinyFish API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { businessId, industry, location, country, businessName } = await req.json();

    if (!industry || !location) {
      return new Response(
        JSON.stringify({ error: "industry and location are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing competitors for: ${industry} in ${location}, ${country}`);

    const competitorAds = await scrapeCompetitorAds(industry, location, country || "US");

    console.log(`Found ${competitorAds.length} competitor ads`);

    if (businessId) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase.from("competitor_analyses").insert({
          business_id: businessId,
          industry,
          location,
          country: country || "US",
          competitor_ads: competitorAds,
          ad_count: competitorAds.length,
        });
      } catch (e) {
        console.error("Failed to store results:", e);
      }
    }

    const insights = generateInsights(competitorAds, industry);

    return new Response(
      JSON.stringify({ success: true, competitor_ads: competitorAds, insights, ad_count: competitorAds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to analyze competitors" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateInsights(ads: CompetitorAd[], industry: string): Record<string, string> {
  if (!ads.length) return { summary: "No active competitor ads found in this market." };

  const avgLen = Math.round(ads.reduce((s, a) => s + (a.ad_body_text?.length || 0), 0) / ads.length);
  const multi = ads.filter(a => a.platforms?.includes(",")).length;
  const longRun = ads.filter(a => {
    try { return (Date.now() - new Date(a.started_running_date).getTime()) / 86400000 > 90; }
    catch { return false; }
  }).length;

  return {
    summary: `Found ${ads.length} active competitor ads in ${industry}.`,
    avg_copy_length: `${avgLen} chars avg copy length`,
    multi_platform: `${multi}/${ads.length} ads on multiple platforms`,
    long_running: `${longRun}/${ads.length} ads running 90+ days`,
    opportunity: longRun > ads.length / 2
      ? "Competitors rely on evergreen ads. Fresh creative could stand out."
      : "Active market. Strong differentiation needed.",
  };
}

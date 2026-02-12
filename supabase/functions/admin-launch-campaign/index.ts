import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function metaPost(path: string, params: Record<string, string>, token: string) {
  const form = new URLSearchParams(params);
  form.set("access_token", token);
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      ad_account_id,
      page_id,
      campaign_name,
      ads, // Array of { headline, body, cta, image_url? }
      daily_budget_cents,
      targeting_countries,
    } = await req.json();

    const metaToken = Deno.env.get("META_SYSTEM_USER_TOKEN");
    if (!metaToken) {
      return new Response(JSON.stringify({ error: "Meta token not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adAccountId = ad_account_id.replace(/^act_/, "");

    // Step 1: Create Campaign (PAUSED)
    console.log("[admin-launch] Creating campaign:", campaign_name);
    const campaignResult = await metaPost(`/act_${adAccountId}/campaigns`, {
      name: campaign_name,
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: JSON.stringify([]),
    }, metaToken);

    if (!campaignResult.ok || !campaignResult.data.id) {
      console.error("[admin-launch] Campaign failed:", JSON.stringify(campaignResult.data));
      return new Response(JSON.stringify({ error: campaignResult.data.error?.message || "Campaign creation failed", step: "campaign" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const metaCampaignId = campaignResult.data.id;
    console.log("[admin-launch] Campaign created:", metaCampaignId);

    // Step 2: Create Ad Set
    const targeting = {
      age_min: 25,
      age_max: 55,
      geo_locations: { countries: targeting_countries || ["AU"] },
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: ["feed", "marketplace"],
      instagram_positions: ["stream", "explore"],
      targeting_automation: { advantage_audience: 1 },
    };

    const adSetResult = await metaPost(`/act_${adAccountId}/adsets`, {
      name: `${campaign_name} – Ad Set`,
      campaign_id: metaCampaignId,
      daily_budget: String(daily_budget_cents || 2000),
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: JSON.stringify(targeting),
      promoted_object: JSON.stringify({ page_id }),
      status: "PAUSED",
      start_time: new Date().toISOString(),
    }, metaToken);

    if (!adSetResult.ok || !adSetResult.data.id) {
      console.error("[admin-launch] Ad set failed:", JSON.stringify(adSetResult.data));
      return new Response(JSON.stringify({ error: adSetResult.data.error?.message || "Ad set creation failed", step: "adset" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const metaAdSetId = adSetResult.data.id;
    console.log("[admin-launch] Ad set created:", metaAdSetId);

    // Step 3: Create multiple ad creatives + ads
    const createdAds: Array<{ headline: string; creative_id: string; ad_id: string }> = [];

    for (const ad of (ads || [])) {
      const objectStorySpec: Record<string, unknown> = {
        page_id,
        link_data: {
          message: ad.body,
          name: ad.headline,
          link: "https://zuckerbot.ai/",
          call_to_action: { type: "LEARN_MORE" },
          ...(ad.image_url ? { picture: ad.image_url } : {}),
        },
      };

      const creativeResult = await metaPost(`/act_${adAccountId}/adcreatives`, {
        name: `${campaign_name} – ${ad.headline}`,
        object_story_spec: JSON.stringify(objectStorySpec),
      }, metaToken);

      if (!creativeResult.ok || !creativeResult.data.id) {
        console.error("[admin-launch] Creative failed for:", ad.headline, JSON.stringify(creativeResult.data));
        continue;
      }

      const adResult = await metaPost(`/act_${adAccountId}/ads`, {
        name: `${campaign_name} – ${ad.headline}`,
        adset_id: metaAdSetId,
        creative: JSON.stringify({ creative_id: creativeResult.data.id }),
        status: "PAUSED",
      }, metaToken);

      if (adResult.ok && adResult.data.id) {
        createdAds.push({
          headline: ad.headline,
          creative_id: creativeResult.data.id,
          ad_id: adResult.data.id,
        });
        console.log("[admin-launch] Ad created:", ad.headline, adResult.data.id);
      }
    }

    if (createdAds.length === 0) {
      return new Response(JSON.stringify({ error: "No ads could be created", step: "ads" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 4: Activate everything
    for (const ad of createdAds) {
      await metaPost(`/${ad.ad_id}`, { status: "ACTIVE" }, metaToken);
    }
    await metaPost(`/${metaAdSetId}`, { status: "ACTIVE" }, metaToken);
    await metaPost(`/${metaCampaignId}`, { status: "ACTIVE" }, metaToken);
    console.log("[admin-launch] All objects activated");

    return new Response(JSON.stringify({
      success: true,
      campaign_id: metaCampaignId,
      adset_id: metaAdSetId,
      ads: createdAds,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[admin-launch] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

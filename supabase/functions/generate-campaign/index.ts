import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Anthropic from "npm:@anthropic-ai/sdk@latest";

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface GenerateCampaignRequest {
  business_id: string;
}

interface AdVariant {
  headline: string; // max 40 chars
  body: string; // max 125 chars
  cta: "Get Quote" | "Call Now" | "Learn More";
}

interface TargetingRecommendation {
  age_min: number;
  age_max: number;
  radius_km: number;
  daily_budget_cents: number;
  interests: string[];
}

interface GenerateCampaignResponse {
  variants: AdVariant[];
  targeting: TargetingRecommendation;
}

// ─── Interest mapping by trade ───────────────────────────────────────────────
const TRADE_INTERESTS: Record<string, string[]> = {
  plumber: ["home improvement", "home maintenance", "plumbing", "bathroom renovation"],
  electrician: ["home improvement", "home renovation", "electrical", "smart home"],
  landscaper: ["gardening", "landscaping", "outdoor living", "home improvement"],
  cleaner: ["home services", "cleaning", "home improvement", "house cleaning"],
  painter: ["home improvement", "interior design", "home renovation", "painting"],
  carpenter: ["home improvement", "woodworking", "home renovation", "carpentry"],
  roofer: ["home improvement", "roofing", "home maintenance", "home renovation"],
  concreter: ["home improvement", "construction", "outdoor living", "home renovation"],
  fencer: ["home improvement", "fencing", "outdoor living", "home security"],
  tiler: ["home improvement", "bathroom renovation", "tiling", "home renovation"],
  builder: ["home improvement", "construction", "home renovation", "building"],
};

const DEFAULT_INTERESTS = ["home improvement", "home maintenance", "home services"];

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

    // Validate JWT and get user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Parse request body ──────────────────────────────────────────────────
    const { business_id } = (await req.json()) as GenerateCampaignRequest;

    if (!business_id) {
      return new Response(
        JSON.stringify({ error: "business_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch business & verify ownership ───────────────────────────────────
    const { data: business, error: bizError } = await supabase
      .from("businesses")
      .select("id, user_id, name, trade, suburb, postcode, state")
      .eq("id", business_id)
      .single();

    if (bizError || !business) {
      return new Response(
        JSON.stringify({ error: "Business not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (business.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "You do not own this business" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Call Claude API to generate ad variants ─────────────────────────────
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const tradeLabel = business.trade || "trades";
    const locationLabel = [business.suburb, business.state].filter(Boolean).join(", ");

    const systemPrompt =
      "You are an expert Facebook ads copywriter for Australian trade businesses. " +
      "Generate compelling, concise ad copy that drives leads. " +
      "Respond ONLY with valid JSON — no markdown fences, no explanation.";

    const userPrompt =
      `Generate 3 Facebook ad variants for an Australian ${tradeLabel} business.\n\n` +
      `Business name: ${business.name}\n` +
      `Location: ${locationLabel} ${business.postcode || ""}\n` +
      `Trade: ${tradeLabel}\n\n` +
      `Return a JSON object with this exact structure:\n` +
      `{\n` +
      `  "variants": [\n` +
      `    { "headline": "string (max 40 chars)", "body": "string (max 125 chars)", "cta": "Get Quote" },\n` +
      `    { "headline": "string (max 40 chars)", "body": "string (max 125 chars)", "cta": "Call Now" },\n` +
      `    { "headline": "string (max 40 chars)", "body": "string (max 125 chars)", "cta": "Learn More" }\n` +
      `  ]\n` +
      `}\n\n` +
      `Guidelines:\n` +
      `- Headlines must be ≤40 characters\n` +
      `- Body text must be ≤125 characters\n` +
      `- Use Australian English (e.g., "metre" not "meter")\n` +
      `- Include the suburb/area name where relevant\n` +
      `- Focus on urgency, social proof, or value propositions\n` +
      `- Each variant should use a different angle (e.g., urgency, trust, value)`;

    console.log("[generate-campaign] Calling Claude API for business:", business.name);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    // Extract text content from Claude response
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    let parsedVariants: { variants: AdVariant[] };
    try {
      parsedVariants = JSON.parse(responseText);
    } catch {
      console.error("[generate-campaign] Failed to parse Claude response:", responseText);
      return new Response(
        JSON.stringify({
          error: "Failed to parse AI response",
          raw: responseText,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Build targeting recommendation ──────────────────────────────────────
    const tradeLower = (business.trade || "").toLowerCase();
    const interests = TRADE_INTERESTS[tradeLower] || DEFAULT_INTERESTS;

    const targeting: TargetingRecommendation = {
      age_min: 25,
      age_max: 65,
      radius_km: 25,
      daily_budget_cents: 1500, // $15/day
      interests,
    };

    // ── Return response ─────────────────────────────────────────────────────
    const response: GenerateCampaignResponse = {
      variants: parsedVariants.variants,
      targeting,
    };

    console.log("[generate-campaign] Successfully generated campaign for:", business.name);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[generate-campaign] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

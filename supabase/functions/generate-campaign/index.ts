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
  usp?: string;
  current_offer?: string;
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
  restaurant: ["restaurants", "food and drink", "dining out", "local restaurants"],
  gym: ["fitness", "gym", "health and wellness", "exercise"],
  salon: ["beauty", "hair salon", "beauty salon", "personal care"],
  dental: ["dental care", "dentist", "health", "medical"],
  real_estate: ["real estate", "property", "home buying", "investment"],
  retail: ["shopping", "retail", "online shopping", "e-commerce"],
  professional_services: ["business services", "consulting", "professional services", "accounting"],
  cafe: ["coffee", "cafes", "food and drink", "brunch"],
  health_wellness: ["health and wellness", "wellness", "self care", "fitness"],
  education: ["education", "tutoring", "learning", "courses"],
  automotive: ["automotive", "cars", "auto repair", "car maintenance"],
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
    const { business_id, usp, current_offer } = (await req.json()) as GenerateCampaignRequest;

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
      `You are Australia's best Facebook ad copywriter, specialising in local small businesses — restaurants, gyms, salons, dental practices, retail, professional services, and tradies. ` +
      `You write ads that feel human, specific, and local — never generic or corporate. ` +
      `You understand that Meta's Andromeda algorithm rewards creative diversity, so each variant must use a genuinely different angle and tone. ` +
      `You write in natural Australian English. Respond ONLY with valid JSON — no markdown fences, no explanation.`;

    const userPrompt =
      `Write 3 high-converting Facebook ad variants for this business:\n\n` +
      `Business: ${business.name}\n` +
      `Business type: ${tradeLabel}\n` +
      `Location: ${locationLabel} ${business.postcode || ""}\n` +
      `${usp ? `Unique selling point: ${usp}\n` : ""}` +
      `${current_offer ? `Current offer/promotion: ${current_offer}\n` : ""}` +
      `\n` +
      `Return JSON with this exact structure:\n` +
      `{\n` +
      `  "variants": [\n` +
      `    { "headline": "string (max 40 chars)", "body": "string (max 125 chars)", "cta": "Get Quote" | "Call Now" | "Learn More" | "Book Now" | "Sign Up" | "Contact Us" },\n` +
      `    { ... },\n` +
      `    { ... }\n` +
      `  ]\n` +
      `}\n\n` +
      `RULES — follow these exactly:\n` +
      `- Headlines ≤40 chars. Body ≤125 chars. Hard limits.\n` +
      `- Australian English ("metre", "colour", "organise").\n` +
      `- Reference the SPECIFIC business type naturally. A café is a café, a gym is a gym. Don't say "business" generically.\n` +
      `- Use the suburb name naturally — locals should feel like this ad is for THEIR area.\n` +
      `- Each variant must use a DIFFERENT psychological angle:\n` +
      `  1. Social proof / trust (reviews, years in business, "locals trust us")\n` +
      `  2. Urgency / availability ("same-day", "booking up fast", "this week only")\n` +
      `  3. Value / outcome ("free quote", "fixed price", "no call-out fee", the end result they get)\n` +
      `- Write like a smart local business owner — conversational, confident, not corporate. Keep it punchy.\n` +
      `- NO clichés like "your one-stop shop" or "we've got you covered".\n` +
      `- The CTA should match the angle — e.g. urgency → "Call Now", trust → "Learn More", value → "Get Quote".\n` +
      `- If a unique selling point is provided, weave it naturally into at least 2 of the 3 variants.\n` +
      `- If a current offer is provided, feature it prominently in at least 1 variant.\n` +
      `- Make ${business.name} sound like a real local business people would actually call.`;

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

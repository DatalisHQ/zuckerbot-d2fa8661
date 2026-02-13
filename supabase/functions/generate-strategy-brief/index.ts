import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Supabase clients ────────────────────────────────────────────────────────

const supabaseAnon = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_ANON_KEY") ?? ""
);

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

// ─── Website scraping ────────────────────────────────────────────────────────

interface ScrapedData {
  title: string;
  description: string;
  headings: string[];
  ogImage: string | null;
  keywords: string[];
  hasContactInfo: boolean;
  hasPricing: boolean;
  hasTestimonials: boolean;
  socialLinks: string[];
  techStack: string[];
  pageSpeed: string;
  rawText: string;
}

async function scrapeWebsite(url: string): Promise<ScrapedData | null> {
  try {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ZuckerBot/1.0; +https://zuckerbot.ai)",
      },
      redirect: "follow",
    });

    if (!response.ok) return null;
    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || "";

    // Meta description
    const metaDescMatch = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
    );
    const ogDescMatch = html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
    );
    const description = metaDescMatch?.[1] || ogDescMatch?.[1] || "";

    // OG image
    const ogImageMatch = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    );
    const ogImage = ogImageMatch?.[1] || null;

    // Headings (h1-h3)
    const headingRegex = /<h[1-3][^>]*>([^<]*(?:<[^/][^>]*>[^<]*)*)<\/h[1-3]>/gi;
    const headings: string[] = [];
    let hMatch;
    while ((hMatch = headingRegex.exec(html)) !== null && headings.length < 10) {
      const cleanText = hMatch[1].replace(/<[^>]+>/g, "").trim();
      if (cleanText) headings.push(cleanText);
    }

    // Keywords from meta
    const keywordsMatch = html.match(
      /<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i
    );
    const keywords = keywordsMatch?.[1]?.split(",").map((k: string) => k.trim()).filter(Boolean) || [];

    // Check for common elements
    const hasContactInfo = /(?:contact|phone|call|email|@|tel:)/i.test(html);
    const hasPricing = /(?:pricing|price|\$\d|cost|plan|subscription)/i.test(html);
    const hasTestimonials = /(?:testimonial|review|rating|★|⭐|star)/i.test(html);

    // Social links
    const socialRegex = /href=["'](https?:\/\/(?:www\.)?(?:facebook|instagram|twitter|x|linkedin|tiktok|youtube)\.com[^"']*)/gi;
    const socialLinks: string[] = [];
    let sMatch;
    while ((sMatch = socialRegex.exec(html)) !== null && socialLinks.length < 6) {
      socialLinks.push(sMatch[1]);
    }

    // Tech stack hints
    const techStack: string[] = [];
    if (/wordpress/i.test(html)) techStack.push("WordPress");
    if (/shopify/i.test(html)) techStack.push("Shopify");
    if (/wix\.com/i.test(html)) techStack.push("Wix");
    if (/squarespace/i.test(html)) techStack.push("Squarespace");
    if (/react/i.test(html)) techStack.push("React");
    if (/next/i.test(html) && /vercel/i.test(html)) techStack.push("Next.js");
    if (/google-analytics|gtag/i.test(html)) techStack.push("Google Analytics");
    if (/facebook.*pixel|fbq\(/i.test(html)) techStack.push("Meta Pixel");

    // Extract visible text (rough)
    const rawText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);

    return {
      title,
      description,
      headings,
      ogImage,
      keywords,
      hasContactInfo,
      hasPricing,
      hasTestimonials,
      socialLinks,
      techStack,
      pageSpeed: response.headers.get("server") || "unknown",
      rawText,
    };
  } catch (err) {
    console.error("[strategy-brief] Scrape failed:", err);
    return null;
  }
}

// ─── Claude strategy generation ──────────────────────────────────────────────

interface BusinessContext {
  name: string;
  trade: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
  phone: string;
  websiteUrl: string | null;
  targetType: string;
  targetRadiusKm: number | null;
  scrapedData: ScrapedData | null;
}

async function generateBrief(ctx: BusinessContext): Promise<{ markdown: string; executionPlan: any }> {
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const scrapedSection = ctx.scrapedData
    ? `
WEBSITE ANALYSIS:
- Title: ${ctx.scrapedData.title}
- Description: ${ctx.scrapedData.description}
- Key headings: ${ctx.scrapedData.headings.join(", ")}
- Has contact info: ${ctx.scrapedData.hasContactInfo}
- Has pricing: ${ctx.scrapedData.hasPricing}
- Has testimonials/reviews: ${ctx.scrapedData.hasTestimonials}
- Social media presence: ${ctx.scrapedData.socialLinks.length > 0 ? ctx.scrapedData.socialLinks.join(", ") : "None found"}
- Tech stack: ${ctx.scrapedData.techStack.join(", ") || "Unknown"}
- Keywords: ${ctx.scrapedData.keywords.join(", ") || "None"}
- Page content preview: ${ctx.scrapedData.rawText.slice(0, 1500)}
`
    : "No website provided — analysis based on business details only.";

  const countryContext = ctx.country === "US" 
    ? "United States market. Use USD. American English."
    : ctx.country === "UK"
    ? "United Kingdom market. Use GBP. British English."
    : ctx.country === "CA"
    ? "Canadian market. Use CAD. Canadian English."
    : "Australian market. Use AUD. Australian English.";

  const prompt = `You are the head strategist at ZuckerBot, an AI-powered advertising agency. Generate a comprehensive ad strategy brief for this business.

BUSINESS DETAILS:
- Name: ${ctx.name}
- Type: ${ctx.trade}
- Location: ${ctx.suburb}, ${ctx.state} ${ctx.postcode}
- Country: ${ctx.country}
- Target type: ${ctx.targetType}
- Target radius: ${ctx.targetRadiusKm ? ctx.targetRadiusKm + "km" : "National"}
- Website: ${ctx.websiteUrl || "Not provided"}
- Phone: ${ctx.phone}

${scrapedSection}

MARKET CONTEXT: ${countryContext}

Generate TWO outputs in a single JSON response:

{
  "markdown": "... (the full strategy brief as markdown - see structure below) ...",
  "execution_plan": { ... (structured JSON - see schema below) ... }
}

MARKDOWN BRIEF STRUCTURE (write this like a real agency would — professional, specific, actionable):

# Ad Strategy Brief: [Business Name]
## Prepared by ZuckerBot AI Agency

### 1. Business Analysis
- What the business does, who they serve
- Current online presence assessment (website quality, social presence, existing marketing)
- Key strengths and unique selling points identified
- Gaps and opportunities spotted

### 2. Target Audience
- Primary audience persona (demographics, psychographics, behaviors)
- Secondary audience persona
- Geographic targeting recommendation
- Best times to reach them

### 3. Competitive Landscape
- Likely competitors in their space/area (infer from business type and location)
- How they can differentiate
- Market positioning recommendation

### 4. Recommended Ad Strategy
- Campaign objective and why (leads, traffic, awareness)
- 3-4 creative angles with example headlines and copy
- Visual direction for ad creatives (what images/videos to use)
- Landing page recommendations (if website exists, suggest improvements)

### 5. Budget & Projected ROI
- Recommended daily ad spend
- Expected cost per result (based on industry benchmarks)
- Projected monthly leads/traffic
- Break-even analysis (what does one customer worth?)

### 6. 30/60/90 Day Roadmap
- Week 1-2: Launch and learn phase
- Week 3-4: Optimize based on data
- Month 2: Scale what works, kill what doesn't
- Month 3: Expand channels, test new audiences

### 7. KPIs & Success Metrics
- Primary KPI
- Secondary metrics to track
- Red flags to watch for
- When to pivot strategy

EXECUTION PLAN JSON SCHEMA:
{
  "business_analysis": {
    "summary": "string",
    "strengths": ["string"],
    "weaknesses": ["string"],
    "opportunities": ["string"],
    "online_presence_score": 1-10,
    "recommended_objective": "leads|traffic|awareness|sales"
  },
  "target_audiences": [
    {
      "name": "string (persona name)",
      "description": "string",
      "age_range": [min, max],
      "gender": "all|male|female",
      "interests": ["string"],
      "behaviors": ["string"],
      "geo": {
        "country": "string",
        "region": "string",
        "radius_km": number
      },
      "best_times": ["string (e.g. 'weekday evenings', 'weekend mornings')"]
    }
  ],
  "campaigns": [
    {
      "name": "string",
      "objective": "leads|traffic|awareness|sales",
      "angle": "string (creative angle name)",
      "headlines": ["string (3-5 headline options)"],
      "copy_variants": ["string (3-5 primary text options)"],
      "creative_prompts": ["string (Imagen prompts for generating ad images)"],
      "cta": "string (Learn More, Book Now, Shop Now, etc.)",
      "budget_daily_cents": number,
      "duration_days": number,
      "kpis": {
        "target_cpl_cents": number,
        "target_ctr_pct": number,
        "target_cpc_cents": number
      }
    }
  ],
  "schedule": {
    "creative_refresh_days": number,
    "performance_review_days": number,
    "budget_reallocation_trigger": "string (condition)",
    "scale_trigger": "string (condition)",
    "kill_trigger": "string (condition)"
  },
  "roadmap": {
    "week_1_2": ["string (action items)"],
    "week_3_4": ["string (action items)"],
    "month_2": ["string (action items)"],
    "month_3": ["string (action items)"]
  },
  "kpis": {
    "primary": "string",
    "secondary": ["string"],
    "red_flags": ["string"]
  }
}

Be SPECIFIC. Use real numbers based on industry benchmarks. Reference their actual business details. If you scraped their website, reference specific things you found. This needs to feel like a $5,000 agency deliverable, not a template.

Respond with ONLY the JSON object. No markdown fences. No explanation.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[strategy-brief] Claude error:", errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.type === "text" ? data.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    return {
      markdown: parsed.markdown,
      executionPlan: parsed.execution_plan,
    };
  } catch (err) {
    console.error("[strategy-brief] Parse error. Raw text:", text.slice(0, 500));
    throw new Error("Failed to parse Claude response as JSON");
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth — this function requires authentication
    const authHeader = req.headers.get("Authorization");
    const token = authHeader ? authHeader.replace("Bearer ", "") : null;

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userData, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;

    // Get business
    const { data: business, error: bizError } = await supabaseAdmin
      .from("businesses")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (bizError || !business) {
      return new Response(
        JSON.stringify({ error: "No business profile found. Complete onboarding first." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if brief already exists
    const { data: existingBrief } = await supabaseAdmin
      .from("strategy_briefs")
      .select("id, brief_markdown, execution_plan, presentation_url, created_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Parse request body for force regeneration
    let forceRegenerate = false;
    try {
      const body = await req.json();
      forceRegenerate = body?.regenerate === true;
    } catch {
      // No body or invalid JSON — that's fine
    }

    if (existingBrief && !forceRegenerate) {
      return new Response(
        JSON.stringify({
          brief_id: existingBrief.id,
          markdown: existingBrief.brief_markdown,
          execution_plan: existingBrief.execution_plan,
          presentation_url: existingBrief.presentation_url,
          created_at: existingBrief.created_at,
          cached: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[strategy-brief] Generating brief for ${business.name} (${business.id})`);

    // Scrape website if available
    let scrapedData: ScrapedData | null = null;
    if (business.website_url) {
      scrapedData = await scrapeWebsite(business.website_url);
      console.log(`[strategy-brief] Scraped ${business.website_url}: ${scrapedData ? "success" : "failed"}`);
    }

    // Generate the brief
    const { markdown, executionPlan } = await generateBrief({
      name: business.name,
      trade: business.trade,
      suburb: business.suburb || "",
      state: business.state || "",
      postcode: business.postcode || "",
      country: business.country || "AU",
      phone: business.phone || "",
      websiteUrl: business.website_url,
      targetType: business.target_type || "local",
      targetRadiusKm: business.target_radius_km,
      scrapedData,
    });

    // Store in database
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("strategy_briefs")
      .insert({
        business_id: business.id,
        user_id: userId,
        brief_markdown: markdown,
        execution_plan: executionPlan,
        status: "generated",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[strategy-brief] Insert error:", insertError);
      throw new Error("Failed to save strategy brief");
    }

    console.log(`[strategy-brief] Generated and stored brief ${inserted.id} for ${business.name}`);

    return new Response(
      JSON.stringify({
        brief_id: inserted.id,
        markdown,
        execution_plan: executionPlan,
        presentation_url: null, // Gamma integration TBD
        created_at: new Date().toISOString(),
        cached: false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[strategy-brief] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate strategy brief" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

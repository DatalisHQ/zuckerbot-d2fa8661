import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Supabase client for logging
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

// CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Rate limiting (in-memory, resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 3; // max previews per IP per hour
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// Enrichment types

interface ReviewData {
  rating?: number;
  review_count?: number;
  themes?: string[];
  best_quotes?: string[];
}

interface CompetitorEntry {
  page_name: string;
  ad_body_text: string;
}

interface CompetitorData {
  ad_count?: number;
  competitors?: CompetitorEntry[];
  common_hooks?: string[];
  gaps?: string[];
}

interface EnrichmentMeta {
  has_reviews: boolean;
  has_competitors: boolean;
  review_themes_used: string[];
  competitor_gaps_exploited: string[];
}

// Website scraping

interface ScrapedBusiness {
  business_name: string;
  description: string;
  images: string[]; // URLs
}

async function scrapeWebsite(url: string): Promise<ScrapedBusiness> {
  // Normalize URL
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ZuckerBot/1.0; +https://zuckerbot.ai)",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch website: ${response.status}`);
  }

  const html = await response.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  let businessName = titleMatch?.[1]?.trim() || "";
  // Clean up title, remove common suffixes
  businessName = businessName
    .replace(/\s*[-–|].*$/, "")
    .replace(/\s*—.*$/, "")
    .trim();

  // Extract meta description
  const metaDescMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  );
  const ogDescMatch = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
  );
  const description = metaDescMatch?.[1] || ogDescMatch?.[1] || "";

  // Extract OG image
  const ogImageMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  );

  // Extract OG title as fallback
  if (!businessName) {
    const ogTitleMatch = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
    );
    businessName = ogTitleMatch?.[1]?.trim() || new URL(url).hostname;
  }

  const images: string[] = [];
  if (ogImageMatch?.[1]) {
    images.push(ogImageMatch[1]);
  }

  // Also try to find logo
  const logoMatch = html.match(
    /<link[^>]+rel=["'](?:icon|apple-touch-icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i
  );
  if (logoMatch?.[1]) {
    try {
      const logoUrl = new URL(logoMatch[1], url).href;
      images.push(logoUrl);
    } catch {
      // ignore invalid URLs
    }
  }

  return {
    business_name: businessName || new URL(url).hostname,
    description: description || `${businessName} - local business`,
    images,
  };
}

// Business type inference (shared by copy + image generation)

function inferBusinessType(name: string, desc: string): string {
  const combined = `${name} ${desc}`.toLowerCase();
  if (
    combined.includes("restaurant") ||
    combined.includes("food") ||
    combined.includes("kitchen") ||
    combined.includes("dining")
  )
    return "restaurant";
  if (
    combined.includes("gym") ||
    combined.includes("fitness") ||
    combined.includes("workout") ||
    combined.includes("training")
  )
    return "fitness";
  if (
    combined.includes("roof") ||
    combined.includes("construction") ||
    combined.includes("repair") ||
    combined.includes("contractor")
  )
    return "roofing";
  if (
    combined.includes("salon") ||
    combined.includes("hair") ||
    combined.includes("beauty") ||
    combined.includes("spa")
  )
    return "beauty";
  if (
    combined.includes("garage") ||
    combined.includes("auto") ||
    combined.includes("mechanic") ||
    combined.includes("car")
  )
    return "automotive";
  if (
    combined.includes("clean") ||
    combined.includes("maid") ||
    combined.includes("housekeeping")
  )
    return "cleaning";
  if (
    combined.includes("dental") ||
    combined.includes("dentist") ||
    combined.includes("teeth")
  )
    return "dental";
  if (
    combined.includes("law") ||
    combined.includes("attorney") ||
    combined.includes("legal")
  )
    return "legal";
  if (
    combined.includes("real estate") ||
    combined.includes("realtor") ||
    combined.includes("property")
  )
    return "realestate";
  if (
    combined.includes("plumb") ||
    combined.includes("electric") ||
    combined.includes("hvac")
  )
    return "trades";
  return "general";
}

// Gemini image generation (enrichment-aware)

const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") || "";

function getIndustryPrompts(
  name: string,
  businessType: string,
  count: number,
  reviewData?: ReviewData,
  competitorData?: CompetitorData
): string[] {
  const prompts: string[] = [];
  const themes = reviewData?.themes || [];
  const themesLower = themes.map((t) => t.toLowerCase());

  // Determine visual modifiers from enrichment data
  const showSpeed =
    themesLower.some(
      (t) => t.includes("fast") || t.includes("quick") || t.includes("speed")
    );
  const showFriendly =
    themesLower.some(
      (t) =>
        t.includes("friendly") || t.includes("welcoming") || t.includes("warm")
    );
  const showQuality =
    themesLower.some(
      (t) =>
        t.includes("quality") || t.includes("excellent") || t.includes("best")
    );

  // Build enrichment-aware visual hints
  let moodHint = "";
  if (showSpeed) moodHint += ", sense of motion and efficiency, dynamic energy";
  if (showFriendly) moodHint += ", genuine warmth between people, real smiles";
  if (showQuality) moodHint += ", meticulous attention to detail, premium feel";

  // If competitors have gaps around social proof, show happy customers prominently
  const gapsLower = (competitorData?.gaps || []).map((g) => g.toLowerCase());
  const competitorsLackSocialProof = gapsLower.some(
    (g) => g.includes("social proof") || g.includes("reviews")
  );
  if (competitorsLackSocialProof) {
    moodHint += ", thrilled satisfied customers reacting with delight";
  }

  switch (businessType) {
    case "restaurant":
      prompts.push(
        `Mouth-watering signature dish from ${name}, steam rising, close-up food photography, warm restaurant ambiance in background, golden hour lighting, makes viewer instantly hungry${moodHint}`,
        `Happy diverse group of friends laughing while sharing a meal at ${name}, cozy restaurant interior, warm lighting, authentic candid moment showing pure joy${moodHint}`,
        `Chef's hands tossing fresh ingredients in a hot pan at ${name}, close-up action shot with flame and steam, conveys skill and freshness${moodHint}`
      );
      break;

    case "fitness":
      prompts.push(
        `Person mid-rep hitting a personal best, sweat flying, intense focus, modern gym with natural light pouring in, raw determination and triumph${moodHint}`,
        `High-energy group fitness class, diverse people pushing hard and grinning, modern equipment, dynamic action shot, motivational and inclusive${moodHint}`,
        `Trainer high-fiving a client after a tough set, both genuinely smiling, shows human connection and real results${moodHint}`
      );
      break;

    case "roofing":
      prompts.push(
        `Skilled crew installing a new roof on a sunny day, suburban home, crisp angles, shows craftsmanship and protection${moodHint}`,
        `Split view: damaged weathered roof on one side vs pristine new installation on the other, same house, dramatic transformation${moodHint}`,
        `Family relaxing on their porch while a new roof gleams overhead, sunset light, conveys security and peace of mind${moodHint}`
      );
      break;

    case "beauty":
      prompts.push(
        `Stunning hair transformation, person turning to camera with a confident smile, salon mirrors and warm lighting in the background${moodHint}`,
        `Client leaning back with eyes closed during a relaxing treatment, serene spa atmosphere, soft candlelight, pure self-care bliss${moodHint}`,
        `Close-up of flawlessly styled hair catching the light, intricate detail, makes the viewer want exactly that look${moodHint}`
      );
      break;

    case "trades":
      prompts.push(
        `Skilled tradesperson solving a problem on-site, tools in hand, focused and capable, bright well-lit workspace${moodHint}`,
        `Homeowner shaking hands with a technician at the front door, relieved smile, job done right, neighborhood visible behind them${moodHint}`,
        `Close-up of precise hands-on work: copper pipe fitting, wiring, or ductwork, clean execution, shows mastery${moodHint}`
      );
      break;

    case "automotive":
      prompts.push(
        `Mechanic under the hood of a car, focused and skilled, clean modern garage with bright overhead lights${moodHint}`,
        `Owner picking up their car, keys in hand, gleaming vehicle, genuine smile of relief and satisfaction${moodHint}`,
        `Diagnostic tools and a spotless engine bay, precision work in progress, conveys trust and expertise${moodHint}`
      );
      break;

    default:
      prompts.push(
        `Welcoming team at ${name} greeting a happy customer, bright modern space, genuine interaction and trust${moodHint}`,
        `Before and after showcasing ${name}'s impact, dramatic improvement, clear value delivered${moodHint}`,
        `Busy thriving operation at ${name}, multiple satisfied customers, lively atmosphere, conveys popularity and reliability${moodHint}`
      );
  }

  // Trim to count and append universal quality suffix
  // NEVER use the word "professional" in these prompts
  return prompts.slice(0, count).map(
    (prompt) =>
      `${prompt}. Ultra-high quality photography, commercial ad style, square format 1080x1080, no text or logos in image, photorealistic, award-winning composition`
  );
}

async function generateAdImages(
  businessName: string,
  description: string,
  count: number = 2,
  reviewData?: ReviewData,
  competitorData?: CompetitorData
): Promise<string[]> {
  const images: string[] = [];
  const businessType = inferBusinessType(businessName, description);
  const prompts = getIndustryPrompts(
    businessName,
    businessType,
    count,
    reviewData,
    competitorData
  );

  console.log(
    "[generate-preview] Generating",
    count,
    "images with enrichment-aware prompts"
  );

  const results = await Promise.allSettled(
    prompts.map(async (prompt) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GOOGLE_AI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[generate-preview] Gemini image error:", errorText);
        throw new Error(`Gemini image error: ${response.status}`);
      }

      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);

      if (!imagePart) {
        throw new Error("No image in response");
      }

      return imagePart.inlineData.data;
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      images.push(result.value);
    }
  }

  if (images.length === 0) {
    throw new Error("No images generated");
  }

  // If we got fewer than requested, duplicate the first one
  while (images.length < count) {
    images.push(images[0]);
  }

  return images;
}

// Claude ad copy generation (enrichment-aware)

interface AdCopy {
  headline: string;
  copy: string;
  rationale: string;
}

function buildCopyPrompt(
  businessName: string,
  description: string,
  count: number,
  reviewData?: ReviewData,
  competitorData?: CompetitorData
): string {
  const hasReviews =
    reviewData &&
    (reviewData.rating != null || (reviewData.themes && reviewData.themes.length > 0));
  const hasCompetitors =
    competitorData &&
    ((competitorData.common_hooks && competitorData.common_hooks.length > 0) ||
      (competitorData.gaps && competitorData.gaps.length > 0));

  let enrichmentBlock = "";

  if (hasReviews) {
    const ratingStr = reviewData!.rating != null ? `${reviewData!.rating} stars` : "";
    const countStr =
      reviewData!.review_count != null
        ? `from ${reviewData!.review_count} reviews`
        : "";
    const ratingLine = [ratingStr, countStr].filter(Boolean).join(" ");
    const themeLine =
      reviewData!.themes && reviewData!.themes.length > 0
        ? `Customers frequently mention: ${reviewData!.themes.join(", ")}.`
        : "";
    const quoteLine =
      reviewData!.best_quotes && reviewData!.best_quotes.length > 0
        ? `Real customer quotes: "${reviewData!.best_quotes.join('", "')}".`
        : "";

    enrichmentBlock += `\n\nREVIEW INTELLIGENCE:\nThis business has ${ratingLine}. ${themeLine} ${quoteLine}\nUse real customer language and social proof in the copy. Reference the review count and rating with specific numbers.`;
  }

  if (hasCompetitors) {
    const hooksLine =
      competitorData!.common_hooks && competitorData!.common_hooks.length > 0
        ? `Competitors are using these hooks: ${competitorData!.common_hooks.join(", ")}.`
        : "";
    const gapsLine =
      competitorData!.gaps && competitorData!.gaps.length > 0
        ? `Their gaps are: ${competitorData!.gaps.join(", ")}.`
        : "";

    enrichmentBlock += `\n\nCOMPETITOR INTELLIGENCE:\n${hooksLine} ${gapsLine}\nDifferentiate by filling those gaps. Do not copy competitor messaging. Find angles they are missing.`;
  }

  // Strategy assignment per ad
  const strategies: string[] = [];
  if (hasReviews) {
    strategies.push(
      "SOCIAL PROOF: Lead with the star rating, review count, or a real customer quote. Make the reader trust through numbers and real voices."
    );
  } else {
    strategies.push(
      "SOCIAL PROOF: Imply popularity and community trust. Use phrases that suggest many locals already choose this business."
    );
  }
  strategies.push(
    "URGENCY/SCARCITY: Create a reason to act now. Limited spots, seasonal timing, or a time-sensitive benefit. Make waiting feel like losing out."
  );
  strategies.push(
    "BENEFIT-DRIVEN: Focus on the single biggest tangible outcome the customer gets. Be specific. Save time, save money, solve a pain point."
  );

  const strategyInstructions = strategies
    .slice(0, count)
    .map((s, i) => `  Ad ${i + 1} strategy: ${s}`)
    .join("\n");

  // Rationale instruction
  let rationaleGuidance = "";
  if (hasReviews || hasCompetitors) {
    rationaleGuidance =
      'For each ad, write a rationale explaining WHY you chose that angle. Reference specific review data or competitor gaps you are exploiting. Example: "Uses the 4.8-star rating as social proof. Competitors are not mentioning reviews, so this fills a clear gap."';
  } else {
    rationaleGuidance =
      'For each ad, set the rationale to: "Based on your website content. Connect your accounts for smarter, data-driven ads."';
  }

  return `Write ${count} high-converting Facebook ad variants for this business:

Business: ${businessName}
Description: ${description}${enrichmentBlock}

STRATEGY ASSIGNMENTS (each ad MUST use a different approach):
${strategyInstructions}

Return JSON:
{
  "ads": [
    { "headline": "string (max 40 chars)", "copy": "string (max 125 chars, the primary text above the image)", "rationale": "string (why this ad was designed this way)" }
  ]
}

STRICT RULES:
- Headlines must be 40 chars max, copy must be 125 chars max
- NEVER start a headline with "Discover"
- NEVER use em dashes (the long dash character). Use commas, periods, or restructure.
- Each ad MUST use its assigned strategy above. Do NOT repeat the same angle.
- If review numbers are available, weave in specific figures like "4.8 stars" or "127 reviews"
- Sound human and conversational, like a local friend recommending the place. Not corporate, not AI.
- End each ad with a clear, specific call to action
- ${rationaleGuidance}`;
}

async function generateAdCopy(
  businessName: string,
  description: string,
  count: number = 2,
  reviewData?: ReviewData,
  competitorData?: CompetitorData
): Promise<AdCopy[]> {
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const userPrompt = buildCopyPrompt(
    businessName,
    description,
    count,
    reviewData,
    competitorData
  );

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system:
        "You are a direct-response Facebook ad copywriter who creates instantly compelling ads that make people take action. You write like a sharp local marketer, not a robot. You never use em dashes. You never start headlines with the word Discover. Respond ONLY with valid JSON. No markdown fences, no explanation.",
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[generate-preview] Claude API error:", errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const text =
    data.content?.[0]?.type === "text" ? data.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    // Ensure each ad has a rationale
    return parsed.ads.map((ad: any) => ({
      headline: ad.headline || businessName,
      copy: ad.copy || `Visit ${businessName} today.`,
      rationale:
        ad.rationale ||
        "Based on your website content. Connect your accounts for smarter, data-driven ads.",
    }));
  } catch {
    console.error("[generate-preview] Failed to parse Claude response:", text);
    // Return fallback copy
    const defaultRationale =
      "Based on your website content. Connect your accounts for smarter, data-driven ads.";
    return Array.from({ length: count }, (_, i) => ({
      headline:
        i === 0
          ? `Why Locals Love ${businessName}`
          : `${businessName}: Try Us Today`,
      copy:
        i === 0
          ? `Find out why locals love ${businessName}. Visit us today and see the difference.`
          : `Ready for something great? ${businessName} is here for you. Get in touch now.`,
      rationale: defaultRationale,
    }));
  }
}

// Build enrichment metadata for the response

function buildEnrichmentMeta(
  reviewData?: ReviewData,
  competitorData?: CompetitorData
): EnrichmentMeta {
  const hasReviews = !!(
    reviewData &&
    (reviewData.rating != null ||
      (reviewData.themes && reviewData.themes.length > 0))
  );
  const hasCompetitors = !!(
    competitorData &&
    ((competitorData.common_hooks && competitorData.common_hooks.length > 0) ||
      (competitorData.gaps && competitorData.gaps.length > 0))
  );

  return {
    has_reviews: hasReviews,
    has_competitors: hasCompetitors,
    review_themes_used: hasReviews ? (reviewData!.themes || []) : [],
    competitor_gaps_exploited: hasCompetitors
      ? (competitorData!.gaps || [])
      : [],
  };
}

// Main handler

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limit by IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded. Please try again later.",
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse body
    const body = await req.json();
    const { url, images, review_data, competitor_data } = body as {
      url?: string;
      images?: string[];
      review_data?: ReviewData;
      competitor_data?: CompetitorData;
    };

    if (!url && (!images || images.length === 0)) {
      return new Response(
        JSON.stringify({
          error:
            "Please provide a website URL or upload at least one image.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let businessName = "Your Business";
    let description = "A local business ready to grow";
    const adCount = 2;

    // Scrape website if URL provided
    if (url) {
      try {
        const scraped = await scrapeWebsite(url);
        businessName = scraped.business_name;
        description = scraped.description;
        console.log(
          "[generate-preview] Scraped:",
          businessName,
          ",",
          description
        );
      } catch (err) {
        console.error("[generate-preview] Scrape failed:", err);

        // Log scrape failure
        await supabaseAdmin
          .from("preview_logs")
          .insert({
            url,
            has_images: false,
            ip_address: ip,
            user_agent: req.headers.get("user-agent") || null,
            success: false,
            error_message: `Scrape failed: ${(err as Error).message}`,
          })
          .catch(() => {});

        return new Response(
          JSON.stringify({
            error: "scrape_failed",
            message:
              "We couldn't read your website. Try uploading photos of your business instead.",
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Generate images and copy in parallel (with enrichment data)
    console.log(
      "[generate-preview] Generating images and copy in parallel..."
    );

    let adImages: string[] = [];
    let adCopies: AdCopy[] = [];

    const [imageResult, copyResult] = await Promise.allSettled([
      generateAdImages(
        businessName,
        description,
        adCount,
        review_data,
        competitor_data
      ),
      generateAdCopy(
        businessName,
        description,
        adCount,
        review_data,
        competitor_data
      ),
    ]);

    if (imageResult.status === "fulfilled") {
      adImages = imageResult.value;
    } else {
      console.error(
        "[generate-preview] Image generation failed:",
        imageResult.reason
      );
    }

    if (copyResult.status === "fulfilled") {
      adCopies = copyResult.value;
    } else {
      console.error(
        "[generate-preview] Copy generation failed:",
        copyResult.reason
      );
      // Fallback copy
      const defaultRationale =
        "Based on your website content. Connect your accounts for smarter, data-driven ads.";
      adCopies = Array.from({ length: adCount }, (_, i) => ({
        headline:
          i === 0
            ? `Why Locals Love ${businessName}`
            : `${businessName}: Try Us Today`,
        copy:
          i === 0
            ? `Find out why locals love ${businessName}. Visit us today and see the difference.`
            : `Ready for something great? ${businessName} is here for you. Get in touch now.`,
        rationale: defaultRationale,
      }));
    }

    // If no images generated, return service unavailable
    if (adImages.length === 0) {
      console.warn("[generate-preview] No images generated, returning 503");
      return new Response(
        JSON.stringify({
          error:
            "Image generation is temporarily unavailable. Please try again in a few minutes.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Combine results
    const ads = adImages.map((image_base64: string, i: number) => ({
      image_base64,
      headline: adCopies[i]?.headline || `Why Locals Love ${businessName}`,
      copy: adCopies[i]?.copy || `Visit ${businessName} today.`,
      rationale:
        adCopies[i]?.rationale ||
        "Based on your website content. Connect your accounts for smarter, data-driven ads.",
    }));

    console.log(
      "[generate-preview] Successfully generated",
      ads.length,
      "ads for:",
      businessName
    );

    // Save images to Supabase Storage for auditing
    const savedImageUrls: string[] = [];
    for (let i = 0; i < adImages.length; i++) {
      try {
        const fileName = `preview-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}-${i}.png`;
        const imageBuffer = Uint8Array.from(atob(adImages[i]), (c) =>
          c.charCodeAt(0)
        );

        const { data: uploadData, error: uploadError } =
          await supabaseAdmin.storage
            .from("ad-previews")
            .upload(fileName, imageBuffer, {
              contentType: "image/png",
            });

        if (!uploadError && uploadData) {
          const { data: publicUrlData } = supabaseAdmin.storage
            .from("ad-previews")
            .getPublicUrl(fileName);
          savedImageUrls.push(publicUrlData.publicUrl);
        }
      } catch (storageError) {
        console.warn(`Failed to save image ${i} to storage:`, storageError);
      }
    }

    // Build enrichment metadata
    const enrichment = buildEnrichmentMeta(review_data, competitor_data);

    // Log successful preview with saved images and copy
    await supabaseAdmin
      .from("preview_logs")
      .insert({
        url: url || null,
        has_images: !!images && images.length > 0,
        image_count: images?.length || 0,
        business_name: businessName,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || null,
        success: true,
        saved_image_urls: savedImageUrls,
        generated_ads: ads, // Save complete ad data for auditing
      })
      .then(({ error: logError }) => {
        if (logError)
          console.error("[generate-preview] Log insert error:", logError);
      });

    return new Response(
      JSON.stringify({
        business_name: businessName,
        description,
        ads,
        enrichment,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[generate-preview] Unexpected error:", error);

    // Log failed preview
    const failIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";
    await supabaseAdmin
      .from("preview_logs")
      .insert({
        url: null,
        has_images: false,
        ip_address: failIp,
        user_agent: req.headers.get("user-agent") || null,
        success: false,
        error_message: (error as Error).message || "Unknown error",
      })
      .catch(() => {});

    return new Response(
      JSON.stringify({
        error:
          (error as Error).message ||
          "Something went wrong. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

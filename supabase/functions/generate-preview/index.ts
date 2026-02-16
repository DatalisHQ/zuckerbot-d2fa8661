import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─── Supabase client for logging ─────────────────────────────────────────────
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Rate limiting (in-memory, resets on cold start) ─────────────────────────
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

// ─── Website scraping ────────────────────────────────────────────────────────

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
  // Clean up title - remove common suffixes
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
  const description =
    metaDescMatch?.[1] || ogDescMatch?.[1] || "";

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

// ─── Nano Banana Pro (Gemini 3 Pro Image) API ────────────────────────────────

const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") || "";

async function generateAdImages(
  businessName: string,
  description: string,
  count: number = 2
): Promise<string[]> {
  const images: string[] = [];

  // Nano Banana Pro generates one image per call, so we run in parallel
  const prompts = [];
  for (let i = 0; i < count; i++) {
    const angle = i === 0 
      ? "hero product/service shot, aspirational, warm lighting" 
      : "lifestyle scene showing happy customer, candid feel, natural lighting";
    prompts.push(
      `Professional Facebook ad creative for: ${businessName}. ${description}. ${angle}. Photorealistic, modern, eye-catching, clean composition. Square format. No text or words in the image.`
    );
  }

  console.log("[generate-preview] Nano Banana Pro: generating", count, "images");

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
        console.error("[generate-preview] Nano Banana Pro error:", errorText);
        throw new Error(`Nano Banana Pro error: ${response.status}`);
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
    throw new Error("No images generated by Nano Banana Pro");
  }

  // If we got fewer than requested, duplicate the first one
  while (images.length < count) {
    images.push(images[0]);
  }

  return images;
}

// ─── Claude ad copy generation ───────────────────────────────────────────────

interface AdCopy {
  headline: string;
  copy: string;
}

async function generateAdCopy(
  businessName: string,
  description: string,
  count: number = 2
): Promise<AdCopy[]> {
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system:
        "You are a Facebook ad copywriter. Write short, punchy ad copy for local businesses. Respond ONLY with valid JSON — no markdown fences, no explanation.",
      messages: [
        {
          role: "user",
          content: `Write ${count} Facebook ad variants for this business:\n\nBusiness: ${businessName}\nDescription: ${description}\n\nReturn JSON:\n{\n  "ads": [\n    { "headline": "string (max 40 chars)", "copy": "string (max 125 chars, the primary text above the image)" }\n  ]\n}\n\nRules:\n- Headlines ≤40 chars, copy ≤125 chars\n- Make it feel real and local, not corporate\n- Each variant should use a different angle (trust, urgency, value)\n- Include a clear benefit or call to action in the copy`,
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
    return parsed.ads;
  } catch {
    console.error("[generate-preview] Failed to parse Claude response:", text);
    // Return fallback copy
    return Array.from({ length: count }, (_, i) => ({
      headline:
        i === 0
          ? `Discover ${businessName}`
          : `${businessName} — Try Us Today`,
      copy:
        i === 0
          ? `Find out why locals love ${businessName}. Visit us today and see the difference.`
          : `Ready for something great? ${businessName} is here for you. Get in touch now.`,
    }));
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

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
    const { url, images } = body as {
      url?: string;
      images?: string[];
    };

    if (!url && (!images || images.length === 0)) {
      return new Response(
        JSON.stringify({
          error: "Please provide a website URL or upload at least one image.",
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

    // ── Scrape website if URL provided ────────────────────────────────────
    if (url) {
      try {
        const scraped = await scrapeWebsite(url);
        businessName = scraped.business_name;
        description = scraped.description;
        console.log(
          "[generate-preview] Scraped:",
          businessName,
          "—",
          description
        );
      } catch (err) {
        console.error("[generate-preview] Scrape failed:", err);

        // Log scrape failure
        await supabaseAdmin.from("preview_logs").insert({
          url,
          has_images: false,
          ip_address: ip,
          user_agent: req.headers.get("user-agent") || null,
          success: false,
          error_message: `Scrape failed: ${err.message}`,
        }).catch(() => {});

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

    // ── Generate images and copy in parallel ──────────────────────────────
    console.log("[generate-preview] Generating images and copy in parallel...");

    let adImages: string[] = [];
    let adCopies: AdCopy[] = [];

    const [imageResult, copyResult] = await Promise.allSettled([
      generateAdImages(businessName, description, adCount),
      generateAdCopy(businessName, description, adCount),
    ]);

    if (imageResult.status === "fulfilled") {
      adImages = imageResult.value;
    } else {
      console.error("[generate-preview] Image generation failed:", imageResult.reason);
    }

    if (copyResult.status === "fulfilled") {
      adCopies = copyResult.value;
    } else {
      console.error("[generate-preview] Copy generation failed:", copyResult.reason);
      // Fallback copy
      adCopies = Array.from({ length: adCount }, (_, i) => ({
        headline: i === 0 ? `Discover ${businessName}` : `${businessName} — Try Us Today`,
        copy: i === 0
          ? `Find out why locals love ${businessName}. Visit us today and see the difference.`
          : `Ready for something great? ${businessName} is here for you. Get in touch now.`,
      }));
    }

    // If no images generated, use a placeholder gradient
    if (adImages.length === 0) {
      console.warn("[generate-preview] No images generated, using placeholder");
      // Return error suggesting image gen is temporarily down
      return new Response(
        JSON.stringify({
          error: "Image generation is temporarily unavailable. Please try again in a few minutes.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Combine results ───────────────────────────────────────────────────
    const ads = adImages.map((image_base64: string, i: number) => ({
      image_base64,
      headline: adCopies[i]?.headline || `Discover ${businessName}`,
      copy: adCopies[i]?.copy || `Visit ${businessName} today.`,
    }));

    console.log(
      "[generate-preview] Successfully generated",
      ads.length,
      "ads for:",
      businessName
    );

    // Log successful preview
    await supabaseAdmin.from("preview_logs").insert({
      url: url || null,
      has_images: !!images && images.length > 0,
      image_count: images?.length || 0,
      business_name: businessName,
      ip_address: ip,
      user_agent: req.headers.get("user-agent") || null,
      success: true,
    }).then(({ error: logError }) => {
      if (logError) console.error("[generate-preview] Log insert error:", logError);
    });

    return new Response(
      JSON.stringify({
        business_name: businessName,
        description,
        ads,
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
    await supabaseAdmin.from("preview_logs").insert({
      url: null,
      has_images: false,
      ip_address: failIp,
      user_agent: req.headers.get("user-agent") || null,
      success: false,
      error_message: error.message || "Unknown error",
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        error: error.message || "Something went wrong. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

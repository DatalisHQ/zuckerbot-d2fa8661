import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BrandAnalysis {
  business_type: string;
  business_category: string; // ecommerce, services, b2b_software, restaurant, etc.
  product_focus: string[]; // specific products or services
  target_audience: string;
  brand_aesthetic: string; // professional, casual, luxury, local, etc.
  color_scheme: string[];
  extracted_assets: {
    product_images: string[];
    team_photos: string[];
    portfolio_images: string[];
    logo_url?: string;
    hero_images: string[];
  };
  competitive_positioning: string;
  ad_strategy: string; // what type of ads would work best
}

async function analyzeBrandFromUrl(url: string): Promise<BrandAnalysis> {
  console.log(`[brand-analysis] Analyzing: ${url}`);
  
  // Normalize URL
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  // Fetch website content
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ZuckerBot/1.0; +https://zuckerbot.ai)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch website: ${response.status}`);
  }

  const html = await response.text();
  
  // Extract basic information
  const title = extractTitle(html);
  const description = extractDescription(html);
  const text = extractMainText(html);
  const images = extractImages(html, url);
  
  console.log(`[brand-analysis] Found ${images.length} images`);
  
  // Use AI to analyze the brand
  const analysis = await analyzeWithAI(title, description, text, images, url);
  
  return analysis;
}

function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogTitleMatch) return ogTitleMatch[1].trim();
  
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  
  return "";
}

function extractDescription(html: string): string {
  const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (metaDescMatch) return metaDescMatch[1].trim();
  
  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (ogDescMatch) return ogDescMatch[1].trim();
  
  return "";
}

function extractMainText(html: string): string {
  // Remove scripts, styles, and other non-content tags
  let cleanHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleanHtml = cleanHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  cleanHtml = cleanHtml.replace(/<[^>]+>/g, ' ');
  cleanHtml = cleanHtml.replace(/\s+/g, ' ').trim();
  
  // Take first 2000 characters for analysis
  return cleanHtml.slice(0, 2000);
}

function extractImages(html: string, baseUrl: string): string[] {
  const images: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  
  while ((match = imgRegex.exec(html)) !== null) {
    try {
      const imgUrl = new URL(match[1], baseUrl).href;
      // Filter out tiny images, icons, and common tracking pixels
      if (!imgUrl.includes('pixel') && 
          !imgUrl.includes('tracking') && 
          !imgUrl.includes('1x1') &&
          !imgUrl.includes('favicon') &&
          !imgUrl.includes('icon') &&
          imgUrl.length < 500) { // Reasonable URL length
        images.push(imgUrl);
      }
    } catch {
      // Invalid URL, skip
    }
  }
  
  // Also check for CSS background images
  const bgImageRegex = /background-image:\s*url\(['"]?([^'"]+)['"]?\)/gi;
  while ((match = bgImageRegex.exec(html)) !== null) {
    try {
      const imgUrl = new URL(match[1], baseUrl).href;
      images.push(imgUrl);
    } catch {
      // Invalid URL, skip
    }
  }
  
  return [...new Set(images)].slice(0, 20); // Dedupe and limit
}

async function analyzeWithAI(
  title: string, 
  description: string, 
  text: string, 
  images: string[], 
  url: string
): Promise<BrandAnalysis> {
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const prompt = `Analyze this business website and provide detailed brand analysis for ad generation.

WEBSITE DATA:
Title: ${title}
Description: ${description}
URL: ${url}
Content Sample: ${text.slice(0, 1000)}
Images Found: ${images.length} images

ANALYSIS REQUIRED:
1. Business Type & Category (be very specific - not just "business")
2. Core Products/Services (what they actually sell)
3. Target Audience (who buys from them)
4. Brand Aesthetic (professional, casual, luxury, local, edgy, etc.)
5. Ad Strategy (what type of ads would convert best)

For ECOMMERCE: Focus on products, lifestyle, customer benefits
For SERVICES: Focus on results, before/after, local trust, expertise  
For B2B SOFTWARE: Focus on efficiency, ROI, problem-solving
For RESTAURANTS: Focus on food quality, atmosphere, experience
For FITNESS: Focus on transformation, community, results

Return ONLY valid JSON in this format:
{
  "business_type": "specific business type",
  "business_category": "ecommerce|services|b2b_software|restaurant|fitness|healthcare|automotive|beauty|real_estate|trades|other",
  "product_focus": ["specific product 1", "specific product 2"],
  "target_audience": "detailed target audience description",
  "brand_aesthetic": "brand personality and visual style",
  "color_scheme": ["primary color", "secondary color"],
  "competitive_positioning": "what makes them different",
  "ad_strategy": "recommended ad approach for this specific business"
}

Be specific and actionable. This analysis will drive AI ad generation.`;

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
      system: "You are a brand strategist and marketing expert. Analyze websites to understand their business model, target audience, and optimal advertising approach.",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[brand-analysis] Claude API error:", errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const analysisText = data.content?.[0]?.type === "text" ? data.content[0].text : "";

  try {
    // Clean the response to extract JSON
    let cleanText = analysisText.trim();
    
    // Look for JSON block if wrapped in other text
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }
    
    const analysis = JSON.parse(cleanText);
    
    // Add extracted assets
    analysis.extracted_assets = categorizeImages(images, analysis.business_category || "other");
    
    return analysis;
  } catch (error) {
    console.error("[brand-analysis] Failed to parse AI response:", analysisText);
    
    // Fallback analysis if JSON parsing fails
    return {
      business_type: title || "Business",
      business_category: "other",
      product_focus: ["Products/Services"],
      target_audience: "Small business customers",
      brand_aesthetic: "Professional",
      color_scheme: ["#1a73e8", "#34a853"],
      competitive_positioning: "Quality service provider",
      ad_strategy: "Focus on value and trust",
      extracted_assets: categorizeImages(images, "other")
    };
  }
}

function categorizeImages(images: string[], businessCategory: string): any {
  // Smart categorization based on URL patterns and business type
  const assets = {
    product_images: [] as string[],
    team_photos: [] as string[],
    portfolio_images: [] as string[],
    logo_url: undefined as string | undefined,
    hero_images: [] as string[],
  };

  for (const img of images) {
    const imgLower = img.toLowerCase();
    
    // Logo detection
    if (imgLower.includes('logo') && !assets.logo_url) {
      assets.logo_url = img;
      continue;
    }
    
    // Product images for ecommerce
    if (businessCategory === 'ecommerce') {
      if (imgLower.includes('product') || imgLower.includes('shop') || imgLower.includes('item')) {
        assets.product_images.push(img);
        continue;
      }
    }
    
    // Portfolio for services
    if (businessCategory === 'services' || businessCategory === 'trades') {
      if (imgLower.includes('portfolio') || imgLower.includes('project') || imgLower.includes('work') || imgLower.includes('before') || imgLower.includes('after')) {
        assets.portfolio_images.push(img);
        continue;
      }
    }
    
    // Team photos
    if (imgLower.includes('team') || imgLower.includes('staff') || imgLower.includes('about') || imgLower.includes('crew')) {
      assets.team_photos.push(img);
      continue;
    }
    
    // Hero/banner images
    if (imgLower.includes('hero') || imgLower.includes('banner') || imgLower.includes('main')) {
      assets.hero_images.push(img);
      continue;
    }
    
    // Default to hero images for uncategorized
    if (assets.hero_images.length < 3) {
      assets.hero_images.push(img);
    }
  }

  return assets;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const analysis = await analyzeBrandFromUrl(url);

    return new Response(
      JSON.stringify(analysis),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
    
  } catch (error) {
    console.error("[brand-analysis] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Analysis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
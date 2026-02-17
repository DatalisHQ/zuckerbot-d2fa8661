import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Enhanced preview generation with brand analysis and asset extraction
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

    console.log(`[generate-preview-v2] Starting enhanced analysis for: ${url}`);

    // Step 1: Brand Analysis
    const brandAnalysis = await performBrandAnalysis(url);
    console.log(`[generate-preview-v2] Brand analysis complete:`, {
      business_type: brandAnalysis.business_type,
      category: brandAnalysis.business_category,
      assets_found: Object.keys(brandAnalysis.extracted_assets).map(k => 
        `${k}: ${brandAnalysis.extracted_assets[k]?.length || 0}`
      )
    });

    // Step 2: Enhanced Creative Generation
    const ads = await generateEnhancedAds(brandAnalysis, url);
    console.log(`[generate-preview-v2] Generated ${ads.length} enhanced ads`);

    // Step 3: Save audit trail with brand analysis
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const savedImageUrls = await saveGeneratedImages(ads, supabase);

    // Save comprehensive audit log (handle case where brand_analysis column doesn't exist)
    try {
      await supabase.from("preview_logs").insert({
        url: url,
        business_name: brandAnalysis.business_type,
        success: true,
        has_images: ads.length > 0,
        image_count: ads.length,
        ip_address: req.headers.get("x-forwarded-for") || "unknown",
        user_agent: req.headers.get("user-agent") || null,
        saved_image_urls: savedImageUrls,
        generated_ads: ads,
        brand_analysis: brandAnalysis, // Save full analysis for debugging
      });
    } catch (dbError: any) {
      // If brand_analysis column doesn't exist, save without it
      if (dbError.code === '42703') {
        console.log("[generate-preview-v2] brand_analysis column not found, saving without it");
        await supabase.from("preview_logs").insert({
          url: url,
          business_name: brandAnalysis.business_type,
          success: true,
          has_images: ads.length > 0,
          image_count: ads.length,
          ip_address: req.headers.get("x-forwarded-for") || "unknown",
          user_agent: req.headers.get("user-agent") || null,
          saved_image_urls: savedImageUrls,
          generated_ads: ads,
        });
      } else {
        throw dbError;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        business_name: brandAnalysis.business_type,
        brand_analysis: brandAnalysis,
        ads: ads,
        message: "Enhanced ads generated using brand-specific analysis",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("[generate-preview-v2] Error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Enhanced preview generation failed",
        stack: error.stack 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function performBrandAnalysis(url: string) {
  // Call our brand-analysis function
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/brand-analysis`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error(`Brand analysis failed: ${response.status}`);
  }

  return await response.json();
}

async function generateEnhancedAds(brandAnalysis: any, url: string) {
  const ads = [];
  
  // Generate 2 enhanced ads using brand-specific context
  for (let i = 0; i < 2; i++) {
    const adPrompt = buildEnhancedPrompt(brandAnalysis, i);
    const generatedAd = await generateSingleAd(adPrompt, brandAnalysis, i);
    ads.push(generatedAd);
  }
  
  return ads;
}

function buildEnhancedPrompt(brandAnalysis: any, adIndex: number): string {
  const { business_category, business_type, product_focus, target_audience, brand_aesthetic, extracted_assets, ad_strategy } = brandAnalysis;

  // Base enhanced prompt with brand-specific context
  let basePrompt = `Create a high-converting Facebook ad image for ${business_type}.

BUSINESS CONTEXT:
- Category: ${business_category}
- Products/Services: ${product_focus.join(", ")}
- Target Audience: ${target_audience}
- Brand Aesthetic: ${brand_aesthetic}
- Ad Strategy: ${ad_strategy}

VISUAL REQUIREMENTS:`;

  // Category-specific enhanced prompts
  switch (business_category) {
    case "ecommerce":
      basePrompt += `
- Show actual product in use by target customers
- Lifestyle setting that appeals to ${target_audience}
- Include product benefits in visual context
- Use brand colors: ${brandAnalysis.color_scheme?.join(", ") || "brand appropriate"}
- High-quality product photography style
- Show transformation or usage result`;

      if (extracted_assets.product_images?.length > 0) {
        basePrompt += `\n- Reference these actual product images for accuracy: ${extracted_assets.product_images.slice(0, 3).join(", ")}`;
      }
      break;

    case "services":
    case "trades":
      basePrompt += `
- Show the actual work being performed or completed results
- Include professional team/equipment if relevant
- Before/after transformation if applicable
- Local/community trust elements
- Professional but approachable aesthetic
- Show expertise and quality of work`;

      if (extracted_assets.portfolio_images?.length > 0) {
        basePrompt += `\n- Reference these actual project examples: ${extracted_assets.portfolio_images.slice(0, 3).join(", ")}`;
      }
      if (extracted_assets.team_photos?.length > 0) {
        basePrompt += `\n- Include actual team members from: ${extracted_assets.team_photos.slice(0, 2).join(", ")}`;
      }
      break;

    case "restaurant":
      basePrompt += `
- Show signature dishes in appetizing, professional food photography
- Include restaurant atmosphere and dining experience
- Happy customers enjoying the food
- Kitchen quality and freshness indicators
- Inviting, mouth-watering presentation`;
      break;

    case "fitness":
      basePrompt += `
- Show actual transformation results or training in progress
- Include diverse clientele achieving goals
- Professional equipment and clean facility
- Energy, motivation, and achievement themes
- Before/after style comparisons if applicable`;
      break;

    default:
      basePrompt += `
- Professional, high-quality imagery relevant to ${business_type}
- Show value proposition visually
- Appeal to ${target_audience}
- Maintain ${brand_aesthetic} brand aesthetic`;
  }

  // Add variation for second ad
  if (adIndex === 1) {
    basePrompt += `\n\nVARIATION: Create a different angle/approach while maintaining brand consistency.`;
  }

  basePrompt += `\n\nStyle: Professional advertising photography, high resolution, optimized for Facebook feed display.`;

  return basePrompt;
}

async function generateSingleAd(prompt: string, brandAnalysis: any, adIndex: number) {
  const googleApiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!googleApiKey) {
    throw new Error("Google AI API key not configured");
  }

  // Generate image using Nano Banana Pro
  const imageResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${googleApiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
        }
      }),
    }
  );

  if (!imageResponse.ok) {
    const errorText = await imageResponse.text();
    console.error(`[generate-preview-v2] Image generation failed:`, errorText);
    throw new Error(`Image generation failed: ${imageResponse.status}`);
  }

  const imageData = await imageResponse.json();
  const parts = imageData.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p: any) => p.inlineData?.data);
  const imageBase64 = imagePart?.inlineData?.data;

  if (!imageBase64) {
    throw new Error("No image data returned from API");
  }

  // Generate enhanced copy
  const copy = await generateEnhancedCopy(brandAnalysis, adIndex);

  return {
    headline: copy.headline,
    copy: copy.body,
    cta: copy.cta,
    image_base64: imageBase64,
    prompt_used: prompt,
    brand_context: {
      business_type: brandAnalysis.business_type,
      target_audience: brandAnalysis.target_audience,
      ad_strategy: brandAnalysis.ad_strategy,
    }
  };
}

async function generateEnhancedCopy(brandAnalysis: any, adIndex: number) {
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const copyPrompt = `Write high-converting Facebook ad copy for ${brandAnalysis.business_type}.

BRAND CONTEXT:
- Business: ${brandAnalysis.business_type}
- Category: ${brandAnalysis.business_category}
- Products: ${brandAnalysis.product_focus.join(", ")}
- Target Audience: ${brandAnalysis.target_audience}
- Brand Voice: ${brandAnalysis.brand_aesthetic}
- Positioning: ${brandAnalysis.competitive_positioning}

COPY REQUIREMENTS:
- Hook: Attention-grabbing first line for ${brandAnalysis.target_audience}
- Value: Clear benefit specific to ${brandAnalysis.product_focus[0]}
- Proof: Social proof or credibility element
- Urgency: Reason to act now
- CTA: Specific action aligned with business model

${adIndex === 0 ? 'ANGLE: Problem/solution approach' : 'ANGLE: Benefit/transformation approach'}

Return ONLY JSON:
{
  "headline": "Attention-grabbing headline (5-8 words)",
  "body": "Main ad copy (2-3 sentences, conversational)",
  "cta": "Specific call-to-action"
}`;

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
      messages: [{ role: "user", content: copyPrompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Copy generation failed: ${response.status}`);
  }

  const data = await response.json();
  const copyText = data.content?.[0]?.text || "";

  try {
    return JSON.parse(copyText);
  } catch {
    // Fallback if JSON parsing fails
    return {
      headline: `Transform Your ${brandAnalysis.business_type}`,
      body: `See why ${brandAnalysis.target_audience} choose us for ${brandAnalysis.product_focus[0]}. Professional results you can trust.`,
      cta: "Get Started Today"
    };
  }
}

async function saveGeneratedImages(ads: any[], supabase: any): Promise<string[]> {
  const savedUrls: string[] = [];

  for (let i = 0; i < ads.length; i++) {
    try {
      const ad = ads[i];
      const fileName = `generated-ad-${Date.now()}-${i}.jpg`;
      
      // Convert base64 to buffer
      const imageBuffer = Uint8Array.from(atob(ad.image_base64), c => c.charCodeAt(0));

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from("generated-ads")
        .upload(fileName, imageBuffer, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        console.error(`[generate-preview-v2] Failed to upload image ${i}:`, error);
        continue;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("generated-ads")
        .getPublicUrl(fileName);

      savedUrls.push(publicUrl);
      console.log(`[generate-preview-v2] Saved image ${i}: ${publicUrl}`);

    } catch (error) {
      console.error(`[generate-preview-v2] Error saving image ${i}:`, error);
    }
  }

  return savedUrls;
}
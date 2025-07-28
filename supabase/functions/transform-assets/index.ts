import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brandUrl, rawAssets, competitorProfiles } = await req.json();
    
    if (!brandUrl || !rawAssets || !Array.isArray(rawAssets)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: brandUrl, rawAssets' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing asset transformation for:', brandUrl);
    console.log('Raw assets count:', rawAssets.length);

    // Extract value propositions from competitor profiles
    const valuePropositions = competitorProfiles?.flatMap(profile => 
      profile.valueProps || []
    ) || ['Save Time', 'Save Money', 'Get Results'];

    const transformedAssets = [];
    const campaignId = `campaign_${Date.now()}`;

    for (let i = 0; i < rawAssets.length; i++) {
      const rawAssetUrl = rawAssets[i];
      const assetId = `asset_${i}_${Date.now()}`;
      
      console.log(`Processing asset ${i + 1}/${rawAssets.length}: ${rawAssetUrl}`);

      try {
        // Select a value proposition for this asset
        const selectedValueProp = valuePropositions[i % valuePropositions.length];
        
        // Generate variants with different aspect ratios and headlines
        const aspectRatios = [
          { ratio: '1:1', size: '1024x1024', description: 'Square format for feed posts' },
          { ratio: '4:5', size: '1024x1280', description: 'Portrait format for stories' },
          { ratio: '16:9', size: '1280x720', description: 'Landscape format for video ads' }
        ];

        const variantUrls = [];

        for (const aspect of aspectRatios) {
          // Create a prompt for OpenAI to generate an ad-ready image
          const prompt = `Transform this product image into a professional advertisement. 
          
Product: Based on ${brandUrl}
Value Proposition: "${selectedValueProp}"
Format: ${aspect.ratio} aspect ratio, ${aspect.description}

Requirements:
- Crop/resize the product image to ${aspect.ratio} aspect ratio
- Add bold, eye-catching headline text: "${selectedValueProp}"
- Use modern, clean typography
- Ensure product remains the focal point
- Professional advertising aesthetic
- High contrast text that's readable
- Brand-appropriate color scheme

Style: Professional, modern, advertising-ready`;

          console.log(`Generating ${aspect.ratio} variant for asset ${assetId}`);

          // Call OpenAI Image Generation API
          const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-image-1',
              prompt: prompt,
              size: aspect.size,
              quality: 'high',
              n: 1,
              output_format: 'png'
            }),
          });

          if (!imageResponse.ok) {
            console.error(`OpenAI API error for ${aspect.ratio}:`, await imageResponse.text());
            continue;
          }

          const imageData = await imageResponse.json();
          
          if (!imageData.data || !imageData.data[0]) {
            console.error(`No image data returned for ${aspect.ratio}`);
            continue;
          }

          // OpenAI gpt-image-1 returns base64 data directly
          const base64Data = imageData.data[0].b64_json;
          
          if (!base64Data) {
            console.error(`No base64 data for ${aspect.ratio}`);
            continue;
          }

          // Convert base64 to blob
          const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          
          // Upload to Supabase Storage
          const fileName = `ad-assets/${campaignId}/${assetId}_${aspect.ratio.replace(':', 'x')}.png`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('user-files')
            .upload(fileName, imageBytes, {
              contentType: 'image/png',
              upsert: true
            });

          if (uploadError) {
            console.error(`Storage upload error for ${aspect.ratio}:`, uploadError);
            continue;
          }

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('user-files')
            .getPublicUrl(fileName);

          variantUrls.push(publicUrl);
          console.log(`Successfully created ${aspect.ratio} variant: ${publicUrl}`);
        }

        if (variantUrls.length > 0) {
          transformedAssets.push({
            assetId,
            variantUrls,
            headline: selectedValueProp,
            originalUrl: rawAssetUrl
          });
        } else {
          console.warn(`No variants created for asset ${assetId}, using original`);
          // Fallback to original asset
          transformedAssets.push({
            assetId,
            variantUrls: [rawAssetUrl],
            headline: selectedValueProp,
            originalUrl: rawAssetUrl
          });
        }

      } catch (assetError) {
        console.error(`Error processing asset ${assetId}:`, assetError);
        // Fallback to original asset
        transformedAssets.push({
          assetId,
          variantUrls: [rawAssetUrl],
          headline: valuePropositions[i % valuePropositions.length],
          originalUrl: rawAssetUrl
        });
      }
    }

    console.log(`Asset transformation complete. Generated ${transformedAssets.length} transformed assets`);

    return new Response(
      JSON.stringify({ 
        transformedAssets,
        campaignId,
        summary: {
          totalAssets: rawAssets.length,
          successfulTransforms: transformedAssets.filter(a => a.variantUrls.length > 1).length,
          fallbacks: transformedAssets.filter(a => a.variantUrls.length === 1).length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in transform-assets function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
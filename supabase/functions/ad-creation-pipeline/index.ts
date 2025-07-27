import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, businessContext, brandAnalysisId, competitorInsights, selectedAngle } = await req.json();
    
    if (!userId) {
      throw new Error('User ID is required');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create new ad campaign record
    const { data: campaign, error: campaignError } = await supabase
      .from('ad_campaigns')
      .insert({
        user_id: userId,
        campaign_name: `Campaign ${new Date().toLocaleDateString()}`,
        pipeline_status: 'running',
        current_step: 1
      })
      .select()
      .single();

    if (campaignError) {
      console.error('Error creating campaign:', campaignError);
      throw new Error('Failed to create campaign');
    }

    console.log('Campaign created:', campaign.id);

    // Step 1: Brand Analyzer Agent
    console.log('Starting Step 1: Brand Analysis');
    const brandAnalysis = await runBrandAnalyzer(supabase, userId, businessContext, brandAnalysisId, competitorInsights, selectedAngle);
    
    await supabase
      .from('ad_campaigns')
      .update({ 
        brand_analysis: brandAnalysis,
        current_step: 2 
      })
      .eq('id', campaign.id);

    // Step 2: Framework Selector Agent  
    console.log('Starting Step 2: Framework Selection');
    const frameworkSelection = await runFrameworkSelector(brandAnalysis);
    
    await supabase
      .from('ad_campaigns')
      .update({ 
        framework_selection: frameworkSelection,
        current_step: 3 
      })
      .eq('id', campaign.id);

    // Step 3: Ad Generator Agent
    console.log('Starting Step 3: Ad Generation');
    const generatedAds = await runAdGenerator(brandAnalysis, frameworkSelection);
    
    await supabase
      .from('ad_campaigns')
      .update({ 
        generated_ads: generatedAds,
        pipeline_status: 'completed',
        current_step: 3 
      })
      .eq('id', campaign.id);

    // Save individual ad sets to database
    const adSets = generatedAds.ads || [];
    for (let i = 0; i < adSets.length; i++) {
      const adSet = adSets[i];
      await supabase
        .from('ad_sets')
        .insert({
          user_id: userId,
          campaign_id: campaign.id,
          set_name: `${adSet.framework} Ad`,
          primary_text: adSet.primary_text,
          headline: adSet.headline,
          call_to_action: adSet.cta,
          creative_concept: adSet.creative_concept,
          framework_used: adSet.framework
        });
    }

    return new Response(JSON.stringify({
      success: true,
      campaign_id: campaign.id,
      brand_analysis: brandAnalysis,
      framework_selection: frameworkSelection,
      generated_ads: generatedAds
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ad-creation-pipeline:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'An unexpected error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function runBrandAnalyzer(supabase: any, userId: string, businessContext: any, brandAnalysisId?: string, competitorInsights?: any, selectedAngle?: any) {
  console.log('Brand Analyzer - Getting user data...');
  
  // Get user's Facebook ad history
  const { data: adHistory } = await supabase
    .from('facebook_ad_creatives')
    .select('title, body, call_to_action, performance_score')
    .eq('user_id', userId)
    .limit(10);

  // Get brand analysis if available
  let brandData = null;
  if (brandAnalysisId) {
    const { data } = await supabase
      .from('brand_analysis')
      .select('brand_url, brand_name, business_category, main_products, value_propositions')
      .eq('id', brandAnalysisId)
      .single();
    brandData = data;
  }

  // Create FB ad data summary
  const fbAdDataSummary = adHistory?.length 
    ? `Previous ads: ${adHistory.map(ad => `"${ad.title || ad.body}" (${ad.call_to_action})`).join(', ')}`
    : 'No previous ad data available';

  // Include competitor insights and selected angle if available
  const competitorContext = competitorInsights ? `

COMPETITOR INSIGHTS:
${JSON.stringify(competitorInsights, null, 2)}

SELECTED MARKETING ANGLE:
${JSON.stringify(selectedAngle, null, 2)}` : '';

  const prompt = `You are a senior marketing strategist. Your goal is to create a sharp, actionable brand summary that will guide ad creation.
You have data from the brand itself and from competitor research.

### INPUTS:
- BRAND PROFILE:
Business URL: ${brandData?.brand_url || 'Not provided'}
Business Name: ${brandData?.brand_name || businessContext?.business_name || 'Not provided'}  
Business Category: ${businessContext?.industry || brandData?.business_category || 'General business'}
Campaign Goal: Generate high-converting Facebook ad campaigns
Target Audience: ${businessContext?.target_audience || 'Not specified'}
Main Products/Services: ${brandData?.main_products ? JSON.stringify(brandData.main_products) : 'Not provided'}
Value Propositions: ${brandData?.value_propositions ? brandData.value_propositions.join(', ') : 'Not provided'}
Historical Ad Data: ${fbAdDataSummary}

- COMPETITOR INSIGHTS:
${competitorInsights ? JSON.stringify(competitorInsights, null, 2) : 'No competitor data available'}

- SELECTED ANGLE:
${selectedAngle ? JSON.stringify(selectedAngle, null, 2) : 'No specific angle selected'}

---

### TASK:
1. Analyze the brand profile and competitors.
2. Highlight 3-4 **unique selling points (USPs)** for this brand (how they stand out or can differentiate).
3. Summarize the **brand tone and voice** (e.g., playful, authoritative, luxury).
4. Identify **opportunities or gaps** based on competitor trends (e.g., "Competitors push urgency hooks, but humor is untapped.").
5. Keep output concise and structured.

---

### OUTPUT FORMAT:
Return valid JSON:
{
  "usps": ["USP 1", "USP 2", "USP 3"],
  "tone": "Brand tone/voice",
  "competitor_opportunities": ["Gap 1", "Gap 2"],
  "angle_focus": "How this angle will shape ad strategy"
}`;

  return await callOpenAI(prompt, 'brand_analysis');
}

async function runFrameworkSelector(brandAnalysis: any) {
  console.log('Framework Selector - Analyzing brand...');
  
  const prompt = `You are a performance marketing strategist. Your job is to select the 3 best ad frameworks based on the brand's USPs, tone, and competitor insights.

### INPUTS:
- BRAND & COMPETITOR ANALYSIS:
${JSON.stringify(brandAnalysis, null, 2)}

---

### TASK:
1. Select **3 ad frameworks** (e.g., Problem-Agitate-Solution, Testimonial, Scarcity/Offer, Lifestyle/Emotional Hook, Before/After).
2. For each framework, explain **why it's a strong fit** for this brand given the selected_angle and competitor gaps.
3. Ensure at least one framework is aligned with **competitor trends** and another is **differentiated**.

---

### OUTPUT FORMAT:
Return valid JSON:
{
  "frameworks": [
    {
      "name": "Framework 1",
      "reason": "Why this fits based on USPs and competitor opportunities"
    },
    {
      "name": "Framework 2",
      "reason": "Why this fits based on USPs and competitor opportunities"
    },
    {
      "name": "Framework 3",
      "reason": "Why this fits based on USPs and competitor opportunities"
    }
  ]
}`;

  return await callOpenAI(prompt, 'framework_selection');
}

async function runAdGenerator(brandAnalysis: any, frameworkSelection: any) {
  console.log('Ad Generator - Creating ads...');
  
  const prompt = `You are a high-performance ad copywriter. Use the brand data and chosen frameworks to generate 3 complete ad sets.

Brand Data:
${JSON.stringify(brandAnalysis, null, 2)}

Frameworks:
${JSON.stringify(frameworkSelection, null, 2)}

TASK:
1. For each framework, create:
   - Primary Text (100-150 characters, direct and compelling)
   - Headline (max 6 words, high impact)
   - Call-to-Action (e.g., "Shop Now", "Learn More")
   - Creative Concept (image or video idea, 1-2 sentences)

2. Write copy that aligns with the brand tone and positioning.

Return the result as structured JSON:
{
  "ads": [
    {
      "framework": "Framework Name",
      "primary_text": "Sample primary text",
      "headline": "Sample headline",
      "cta": "CTA text",
      "creative_concept": "Creative concept description"
    }
  ]
}`;

  return await callOpenAI(prompt, 'ad_generation');
}

async function callOpenAI(prompt: string, function_name: string) {
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-2025-04-14',
      messages: [
        {
          role: 'system',
          content: 'You are an expert marketing AI. Always respond with valid JSON in the exact format requested.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1500
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error(`OpenAI API error for ${function_name}:`, errorData);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  try {
    return JSON.parse(content);
  } catch (error) {
    console.error(`JSON parse error for ${function_name}:`, content);
    throw new Error(`Invalid JSON response from OpenAI for ${function_name}`);
  }
}
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
    const { userId, businessContext, brandAnalysisId } = await req.json();
    
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
    const brandAnalysis = await runBrandAnalyzer(supabase, userId, businessContext, brandAnalysisId);
    
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
    const adSets = generatedAds.ad_sets || [];
    for (let i = 0; i < adSets.length; i++) {
      const adSet = adSets[i];
      await supabase
        .from('ad_sets')
        .insert({
          user_id: userId,
          campaign_id: campaign.id,
          set_name: adSet.set_name || `Ad Set ${i + 1}`,
          primary_text: adSet.primary_text,
          headline: adSet.headline,
          call_to_action: adSet.call_to_action,
          creative_concept: adSet.creative_concept,
          framework_used: adSet.framework_used
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

async function runBrandAnalyzer(supabase: any, userId: string, businessContext: any, brandAnalysisId?: string) {
  console.log('Brand Analyzer - Getting user data...');
  
  // Get user's Facebook ad history
  const { data: adHistory } = await supabase
    .from('facebook_ad_creatives')
    .select('*')
    .eq('user_id', userId)
    .limit(10);

  // Get brand analysis if available
  let brandData = null;
  if (brandAnalysisId) {
    const { data } = await supabase
      .from('brand_analysis')
      .select('*')
      .eq('id', brandAnalysisId)
      .single();
    brandData = data;
  }

  const prompt = `As a Brand Analyzer AI, analyze the following business data and extract key brand insights:

BUSINESS CONTEXT:
${JSON.stringify(businessContext, null, 2)}

BRAND ANALYSIS DATA:
${brandData ? JSON.stringify(brandData, null, 2) : 'No brand analysis available'}

FACEBOOK AD HISTORY:
${adHistory?.length ? JSON.stringify(adHistory, null, 2) : 'No ad history available'}

Based on this data, provide a comprehensive brand analysis with:
1. 3-4 Unique Selling Propositions (USPs)
2. Brand tone and voice
3. Target positioning
4. Key value propositions
5. Competitive advantages

Format your response as a JSON object with the following structure:
{
  "usps": ["USP 1", "USP 2", "USP 3"],
  "tone": "brand tone description",
  "positioning": "positioning statement", 
  "value_propositions": ["value prop 1", "value prop 2"],
  "competitive_advantages": ["advantage 1", "advantage 2"],
  "summary": "brief brand summary"
}`;

  return await callOpenAI(prompt, 'brand_analysis');
}

async function runFrameworkSelector(brandAnalysis: any) {
  console.log('Framework Selector - Analyzing brand...');
  
  const prompt = `As a Framework Selector AI, analyze the brand data and choose the 3 most effective ad frameworks:

BRAND ANALYSIS:
${JSON.stringify(brandAnalysis, null, 2)}

Based on this brand analysis, select 3 ad frameworks from these options:
- Problem-Agitate-Solution (PAS)
- Before-After-Bridge (BAB)
- Attention-Interest-Desire-Action (AIDA)
- Features-Advantages-Benefits (FAB)
- Social Proof/Testimonial
- Scarcity/Urgency
- Story-based
- Educational/How-to
- Comparison/Competitive
- Emotional Appeal

For each framework, explain why it fits the brand and provide a brief strategy outline.

Format your response as a JSON object:
{
  "selected_frameworks": [
    {
      "name": "Framework Name",
      "reason": "Why this framework fits",
      "strategy": "Brief strategy outline"
    }
  ],
  "reasoning": "Overall reasoning for framework selection"
}`;

  return await callOpenAI(prompt, 'framework_selection');
}

async function runAdGenerator(brandAnalysis: any, frameworkSelection: any) {
  console.log('Ad Generator - Creating ads...');
  
  const prompt = `As an Ad Generator AI, create 3 distinct ad sets using the brand analysis and selected frameworks:

BRAND ANALYSIS:
${JSON.stringify(brandAnalysis, null, 2)}

SELECTED FRAMEWORKS:
${JSON.stringify(frameworkSelection, null, 2)}

Create 3 unique ad sets, each using a different framework. Each ad set should include:
- Primary Text (main ad copy, 90-125 words)
- Headline (compelling hook, 5-8 words)
- Call-to-Action (action button text)
- Creative Concept (visual description)

Make the ads compelling, on-brand, and conversion-focused. Vary the approach between emotional, logical, and social proof angles.

Format your response as a JSON object:
{
  "ad_sets": [
    {
      "set_name": "Ad Set 1",
      "framework_used": "Framework Name",
      "primary_text": "Main ad copy text...",
      "headline": "Compelling headline",
      "call_to_action": "Learn More",
      "creative_concept": "Visual description for creative team"
    }
  ],
  "performance_prediction": "Brief prediction of which ad might perform best and why"
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
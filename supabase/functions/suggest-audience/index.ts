import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brandUrl, competitorProfiles } = await req.json();

    if (!brandUrl || !competitorProfiles || !Array.isArray(competitorProfiles)) {
      return new Response(
        JSON.stringify({ error: 'Missing brandUrl or competitorProfiles array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating audience suggestions for:', brandUrl);

    // Construct prompt based on competitor insights
    const competitorSummary = competitorProfiles.map(comp => 
      `${comp.name}: Value Props: ${comp.valueProps?.join(', ') || 'N/A'}, Tone: ${comp.toneProfile || 'N/A'}`
    ).join('\n');

    const prompt = `Based on the following competitor analysis for brand "${brandUrl}", suggest 3-5 distinct high-value audience segments:

Competitors analyzed:
${competitorSummary}

Please analyze the competitor value propositions and tones to identify distinct audience segments that would be interested in this type of product/service.

Return your response as a JSON array in this exact format:
[
  { "segment": "Women 25-34 interested in sustainable fashion", "criteria": "Age 25-34, Female, Interests: Sustainability, Eco-friendly products, Fashion" },
  { "segment": "Tech-savvy entrepreneurs", "criteria": "Age 25-45, Business owners, Interests: Technology, Productivity tools, Business growth" }
]

Focus on segments that are:
1. Specific enough to target effectively
2. Large enough to be profitable
3. Aligned with the value propositions identified in the competitor analysis
4. Distinct from each other`;

    console.log('Calling OpenAI for audience suggestions...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert digital marketing strategist specializing in audience research and segmentation. Always return valid JSON arrays as requested.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content;

    if (!aiResponse) {
      throw new Error('No response from OpenAI');
    }

    console.log('OpenAI response:', aiResponse);

    // Parse JSON response
    let audienceSegments;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        audienceSegments = JSON.parse(jsonMatch[0]);
      } else {
        audienceSegments = JSON.parse(aiResponse);
      }
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      // Fallback to generic segments
      audienceSegments = [
        { 
          segment: "Business owners and entrepreneurs", 
          criteria: "Age 25-45, Business owners, Interests: Business growth, Productivity, ROI optimization" 
        },
        { 
          segment: "Marketing professionals", 
          criteria: "Age 25-40, Job titles: Marketing Manager, Digital Marketer, Interests: Marketing tools, Analytics" 
        },
        { 
          segment: "Small business owners", 
          criteria: "Age 30-55, Small business owners, Interests: Cost-effective solutions, Automation, Efficiency" 
        }
      ];
    }

    // Validate the structure
    if (!Array.isArray(audienceSegments)) {
      throw new Error('Invalid response format from OpenAI');
    }

    // Ensure each segment has required fields
    const validSegments = audienceSegments.filter(seg => 
      seg && typeof seg.segment === 'string' && typeof seg.criteria === 'string'
    );

    if (validSegments.length === 0) {
      throw new Error('No valid audience segments returned');
    }

    console.log(`Generated ${validSegments.length} audience segments`);

    return new Response(JSON.stringify({ segments: validSegments }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in suggest-audience function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
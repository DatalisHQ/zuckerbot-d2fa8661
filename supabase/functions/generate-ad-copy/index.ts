import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const { businessContext, campaignObjective, targetAudience } = await req.json();

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = `Create 3 distinct Facebook ad copy variations for this business:

Business: ${businessContext?.business_name || 'Business'}
Business Type: ${businessContext?.business_type || 'Not specified'}
Campaign Objective: ${campaignObjective || 'Generate leads'}
Target Audience: ${targetAudience || 'General audience'}

Create 3 variations with different approaches:
- Version A: Benefit-focused (highlight main value proposition)
- Version B: Problem-solving (address pain points) 
- Version C: Social proof/urgency (use testimonials or scarcity)

For each version, provide:
- Headline (max 40 characters)
- Primary Text (max 125 characters for feed, engaging and conversational)
- Call-to-Action (choose from: Learn More, Shop Now, Sign Up, Get Quote, Contact Us, Download, Book Now)

Format as JSON with this structure:
{
  "versions": [
    {
      "type": "A - Benefit-Focused",
      "headline": "...",
      "primaryText": "...", 
      "callToAction": "..."
    },
    {
      "type": "B - Problem-Solving", 
      "headline": "...",
      "primaryText": "...",
      "callToAction": "..."
    },
    {
      "type": "C - Social Proof/Urgency",
      "headline": "...", 
      "primaryText": "...",
      "callToAction": "..."
    }
  ]
}`;

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
            content: 'You are an expert Facebook ads copywriter. Create compelling, conversion-focused ad copy that follows Facebook best practices. Keep headlines punchy and primary text engaging but concise.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;

    console.log('Generated ad copy:', generatedContent);

    // Try to parse as JSON, fall back to plain text if needed
    let adCopyData;
    try {
      adCopyData = JSON.parse(generatedContent);
    } catch (parseError) {
      console.log('Failed to parse as JSON, returning raw content');
      adCopyData = { rawContent: generatedContent };
    }

    return new Response(JSON.stringify(adCopyData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-ad-copy function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
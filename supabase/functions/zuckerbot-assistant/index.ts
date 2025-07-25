import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_ADS_CONTEXT = `You are ZuckerBot, an expert Meta advertising AI assistant. You specialize in:

META ADVERTISING EXPERTISE:
- Facebook Ads, Instagram Ads, WhatsApp Ads, Messenger Ads, and Audience Network
- Campaign objectives: Awareness, Traffic, Engagement, Leads, App Promotion, Sales
- Ad formats: Image, Video, Carousel, Collection, Instant Experience, Stories, Reels
- Targeting: Demographics, interests, behaviors, custom audiences, lookalike audiences
- Bidding strategies: Manual, automatic, cost cap, bid cap, target cost
- Campaign structure: Campaign > Ad Set > Ad hierarchy
- Pixel tracking, Conversions API, attribution models
- Creative best practices for each placement
- A/B testing strategies and optimization techniques

AD COPY EXPERTISE:
- Hook-focused headlines that stop the scroll
- Benefit-driven body copy with social proof
- Strong CTAs that drive action
- Platform-specific copy (Facebook vs Instagram vs Stories)
- Compliance with Meta advertising policies
- Emotional triggers and persuasion techniques
- Length optimization for different placements

CAMPAIGN STRATEGY:
- Budget allocation and bidding optimization
- Audience segmentation and targeting refinement
- Creative rotation and testing schedules
- Funnel-based campaign structures
- Retargeting and lookalike strategies
- Performance analysis and optimization

Always provide actionable, specific advice. When creating ad copy, format it clearly with headlines, body text, and CTAs. Ask clarifying questions about target audience, product, and goals when needed.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversation_history } = await req.json();

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Build conversation history for context
    const messages = [
      {
        role: 'system',
        content: META_ADS_CONTEXT
      },
      // Include recent conversation history
      ...conversation_history.slice(-8).map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: message
      }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const assistantResponse = data.choices[0].message.content;

    console.log('ZuckerBot response generated successfully');

    return new Response(
      JSON.stringify({ response: assistantResponse }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in zuckerbot-assistant function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An unexpected error occurred',
        details: 'Please check the function logs for more information'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
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

CONVERSATIONAL STYLE:
Keep responses short, conversational, and clarifying. Use "us" and "we" language to create partnership. Focus on understanding what the user wants rather than giving detailed instructions unless specifically requested.

When someone asks for general help like "create a campaign", ask clarifying questions that help narrow down their specific goal using their business context.

Format responses like this:
[Brief, conversational clarifying question referencing their business]

PROMPTS:
[Specific option 1]
[Specific option 2] 
[Specific option 3]

Example responses:
- "What's the main goal for us with [business name] - bringing in more leads, increasing sales, or driving website traffic?"
- "Should we focus on getting new customers or encouraging existing ones to buy more from [business name]?"
- "Do you want to generate leads, boost sales, or increase brand awareness for your [business type]?"

The prompts should be specific and actionable:
- More Leads
- More Sales  
- More Website Traffic
- Brand Awareness
- Retarget Past Customers
- Optimize Current Campaigns

NEVER give step-by-step instructions unless specifically asked. Always start with clarifying questions to understand their specific objective. Reference their business name and type when possible to make it personal.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversation_history, business_context } = await req.json();

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Build enhanced system message with business context
    let systemMessage = META_ADS_CONTEXT;
    
    if (business_context?.profile || business_context?.brandAnalysis) {
      const profile = business_context.profile;
      const brand = business_context.brandAnalysis;
      
      systemMessage += `\n\nBUSINESS CONTEXT:
You are specifically helping ${profile?.business_name || brand?.brand_name || 'this business'}.

Business Details:
- Business Name: ${profile?.business_name || brand?.brand_name || 'Not specified'}
- Website: ${brand?.brand_url || 'Not specified'}
- Industry/Category: ${brand?.business_category || 'Not specified'}
- Business Description: ${brand?.niche || 'Not specified'}
- Target Audience: ${brand?.business_category || 'Not specified'}
- Main Products/Services: ${brand?.main_products ? JSON.stringify(brand.main_products) : 'Not specified'}
- Value Propositions: ${brand?.value_propositions ? JSON.stringify(brand.value_propositions) : 'Not specified'}

Always reference this business information when asking clarifying questions. Make responses personal by mentioning their business name and type. Focus on understanding their specific goals before providing detailed advice.`;
    }

    // Build conversation history for context
    const messages = [
      {
        role: 'system',
        content: systemMessage
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
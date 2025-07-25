import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

    // Initialize Supabase client to fetch user's Facebook Ads data
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

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
- Value Propositions: ${brand?.value_propositions ? JSON.stringify(brand.value_propositions) : 'Not specified'}`;

      // Try to get current user for Facebook Ads data
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
          // Fetch recent Facebook Ads performance data
          const { data: campaigns } = await supabaseClient
            .from('facebook_campaigns')
            .select('campaign_name, objective, status, daily_budget')
            .eq('user_id', user.id)
            .eq('status', 'ACTIVE')
            .limit(5);

          const { data: recentMetrics } = await supabaseClient
            .from('facebook_ad_metrics')
            .select('spend, impressions, clicks, ctr, conversions')
            .eq('user_id', user.id)
            .gte('date_start', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
            .order('date_start', { ascending: false })
            .limit(10);

          const { data: audiences } = await supabaseClient
            .from('facebook_audiences')
            .select('audience_name, audience_type, audience_size')
            .eq('user_id', user.id)
            .limit(5);

          if (campaigns && campaigns.length > 0) {
            systemMessage += `

CURRENT FACEBOOK ADS PERFORMANCE:
Active Campaigns: ${campaigns.map(c => `${c.campaign_name} (${c.objective}, $${c.daily_budget}/day)`).join(', ')}`;
          }

          if (recentMetrics && recentMetrics.length > 0) {
            const totalSpend = recentMetrics.reduce((sum, m) => sum + (parseFloat(m.spend) || 0), 0);
            const totalImpressions = recentMetrics.reduce((sum, m) => sum + (parseInt(m.impressions) || 0), 0);
            const totalClicks = recentMetrics.reduce((sum, m) => sum + (parseInt(m.clicks) || 0), 0);
            const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : 0;

            systemMessage += `
Recent Performance (Last 7 days): $${totalSpend.toFixed(2)} spent, ${totalImpressions.toLocaleString()} impressions, ${totalClicks.toLocaleString()} clicks, ${avgCTR}% CTR`;
          }

          if (audiences && audiences.length > 0) {
            systemMessage += `
Saved Audiences: ${audiences.map(a => `${a.audience_name} (${a.audience_size?.toLocaleString()} people)`).join(', ')}`;
          }
        }
      } catch (error) {
        console.log('Could not fetch Facebook Ads data:', error);
      }

      systemMessage += `

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
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

REAL-TIME PERFORMANCE ANALYSIS:
When a user asks to "analyze and optimize Meta ads performance" or similar:
1. Fetch their actual Facebook campaigns using the Marketing API
2. Analyze real performance metrics (CTR, CPC, CPM, ROAS, conversion rates)
3. Compare performance against campaign objectives
4. Provide specific optimization recommendations based on actual data
5. Identify underperforming campaigns, ad sets, or ads
6. Suggest budget reallocation, audience refinements, or creative updates

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

WORKFLOW RULES - CRITICAL:
1. When someone asks for "analyze and optimize Meta ads performance", immediately fetch their actual campaign data and provide specific insights.

2. When someone asks for "Create Ad Copy", "Write Ad Copy", or similar requests, follow this streamlined process:
   - Ask MAXIMUM 1 question about their main campaign objective (leads, sales, traffic, awareness)
   - Then immediately generate 3 different ad copy variations using their business context
   - Do NOT ask about placement, creative type, audience details, or other specifics

3. For ad copy generation, create 3 distinct variations with this structure:
   **Version A - Benefit-Focused:**
   Headline: [compelling 40-char headline]
   Primary Text: [125-char benefit-driven copy]
   Call-to-Action: [specific CTA button]

   **Version B - Problem-Solving:**
   Headline: [problem-addressing headline] 
   Primary Text: [pain point + solution copy]
   Call-to-Action: [action-focused CTA]

   **Version C - Social Proof/Urgency:**
   Headline: [social proof or urgency headline]
   Primary Text: [testimonial or scarcity copy]
   Call-to-Action: [urgency-driven CTA]

RESPONSE FORMAT - CRITICAL:
You MUST always structure your responses in exactly this format:

[Brief, conversational response referencing their business]

PROMPTS:
[Specific option 1]
[Specific option 2] 
[Specific option 3]

NEVER skip the "PROMPTS:" section. It is required for every response.

When providing ad copy, still include prompts for next actions like:
PROMPTS:
Refine Version A
Refine Version B  
Create New Variations

Common prompt options to use:
- More Leads
- More Sales  
- More Website Traffic
- Brand Awareness
- Retarget Past Customers
- Optimize Current Campaigns
- Create Ad Copy
- Target New Audiences
- Increase Conversions
- Refine Copy
- New Variations
- Different Tone

NEVER give step-by-step instructions unless specifically asked. Move quickly from minimal questions to actionable outputs. Reference their business name and type when possible to make it personal. ALWAYS include the PROMPTS section with clickable options.`;

// Facebook Marketing API helper functions
async function fetchFacebookCampaigns(accessToken: string, accountId?: string) {
  try {
    console.log('Fetching Facebook campaigns...');
    
    // If no specific account ID, get ad accounts first
    let adAccountId = accountId;
    if (!adAccountId) {
      const accountsResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}`
      );
      const accountsData = await accountsResponse.json();
      if (accountsData.data && accountsData.data.length > 0) {
        adAccountId = accountsData.data[0].id;
        console.log('Using ad account:', adAccountId);
      } else {
        throw new Error('No ad accounts found');
      }
    }

    // Fetch campaigns with insights
    const campaignsResponse = await fetch(
      `https://graph.facebook.com/v18.0/${adAccountId}/campaigns?fields=id,name,objective,status,daily_budget,lifetime_budget,created_time&limit=10&access_token=${accessToken}`
    );
    
    if (!campaignsResponse.ok) {
      const error = await campaignsResponse.text();
      throw new Error(`Facebook API error: ${error}`);
    }
    
    const campaignsData = await campaignsResponse.json();
    console.log(`Found ${campaignsData.data?.length || 0} campaigns`);

    // Fetch insights for active campaigns
    const campaigns = [];
    for (const campaign of campaignsData.data || []) {
      try {
        const insightsResponse = await fetch(
          `https://graph.facebook.com/v18.0/${campaign.id}/insights?fields=spend,impressions,clicks,ctr,cpm,cpp,reach,frequency,actions&date_preset=last_7d&access_token=${accessToken}`
        );
        
        const insightsData = await insightsResponse.json();
        const insights = insightsData.data?.[0] || {};
        
        campaigns.push({
          ...campaign,
          insights: {
            spend: parseFloat(insights.spend || '0'),
            impressions: parseInt(insights.impressions || '0'),
            clicks: parseInt(insights.clicks || '0'),
            ctr: parseFloat(insights.ctr || '0'),
            cpm: parseFloat(insights.cpm || '0'),
            cpp: parseFloat(insights.cpp || '0'),
            reach: parseInt(insights.reach || '0'),
            frequency: parseFloat(insights.frequency || '0'),
            conversions: insights.actions?.find((a: any) => a.action_type === 'offsite_conversion.custom')?.value || '0'
          }
        });
      } catch (error) {
        console.log(`Could not fetch insights for campaign ${campaign.id}:`, error);
        campaigns.push({ ...campaign, insights: {} });
      }
    }

    return campaigns;
  } catch (error) {
    console.error('Error fetching Facebook campaigns:', error);
    throw error;
  }
}

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

      // Check if this is a performance analysis request
      const isPerformanceAnalysis = message.toLowerCase().includes('analyze') || 
                                   message.toLowerCase().includes('optimize') || 
                                   message.toLowerCase().includes('performance');

      if (isPerformanceAnalysis && profile?.facebook_connected) {
        try {
          console.log('Fetching real Facebook Ads data for performance analysis...');
          
          const facebookAccessToken = Deno.env.get('FACEBOOK_ACCESS_TOKEN');
          if (facebookAccessToken) {
            const campaigns = await fetchFacebookCampaigns(facebookAccessToken, profile.facebook_business_id);
            
            if (campaigns && campaigns.length > 0) {
              systemMessage += `\n\nREAL-TIME FACEBOOK ADS PERFORMANCE DATA:`;
              
              campaigns.forEach((campaign: any) => {
                const insights = campaign.insights || {};
                systemMessage += `\n\nCampaign: ${campaign.name}
- Objective: ${campaign.objective}
- Status: ${campaign.status}
- Budget: $${campaign.daily_budget || campaign.lifetime_budget || 'Not set'}
- Last 7 days performance:
  * Spend: $${insights.spend?.toFixed(2) || '0'}
  * Impressions: ${insights.impressions?.toLocaleString() || '0'}
  * Clicks: ${insights.clicks?.toLocaleString() || '0'}
  * CTR: ${insights.ctr?.toFixed(2) || '0'}%
  * CPM: $${insights.cpm?.toFixed(2) || '0'}
  * CPC: $${insights.cpp?.toFixed(2) || '0'}
  * Reach: ${insights.reach?.toLocaleString() || '0'}
  * Frequency: ${insights.frequency?.toFixed(2) || '0'}
  * Conversions: ${insights.conversions || '0'}`;
              });
              
              systemMessage += `\n\nBased on this REAL performance data, provide specific optimization recommendations. Focus on campaigns with poor CTR (<1%), high CPM, low conversion rates, or other performance issues you can identify from the actual metrics.`;
            } else {
              systemMessage += `\n\nNote: No active Facebook campaigns found. User may need to create campaigns first or check their Facebook Ads Manager access.`;
            }
          }
        } catch (error) {
          console.error('Error fetching Facebook Ads data:', error);
          systemMessage += `\n\nNote: Could not fetch real-time Facebook Ads data. Using general optimization guidance.`;
        }
      } else {
        // Fallback to database data for non-performance requests
        try {
          const { data: { user } } = await supabaseClient.auth.getUser();
          if (user) {
            const { data: campaigns } = await supabaseClient
              .from('facebook_campaigns')
              .select('campaign_name, objective, status, daily_budget')
              .eq('user_id', user.id)
              .eq('status', 'ACTIVE')
              .limit(5);

            if (campaigns && campaigns.length > 0) {
              systemMessage += `\n\nCURRENT FACEBOOK ADS: ${campaigns.map(c => `${c.campaign_name} (${c.objective})`).join(', ')}`;
            }
          }
        } catch (error) {
          console.log('Could not fetch stored campaign data:', error);
        }
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
        model: 'gpt-4.1-2025-04-14',
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
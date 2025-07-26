import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { competitorName, competitorUrl, competitorListId, userId } = await req.json();
    
    if (!competitorName || !competitorListId || !userId) {
      throw new Error('Missing required parameters: competitorName, competitorListId, userId');
    }

    console.log('Analyzing Meta ads for competitor:', competitorName);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Use Meta Ad Library API
    const facebookAccessToken = Deno.env.get('FACEBOOK_ACCESS_TOKEN');
    if (!facebookAccessToken) {
      console.log('Facebook access token not configured, using mock data');
      
      // Return mock ad data for demonstration
      const mockAds = [
        {
          id: `${competitorName.toLowerCase()}_ad_1`,
          headline: "Transform Your Business Today",
          primary_text: "Discover how thousands of businesses are growing with our innovative solutions. Start your free trial now!",
          cta: "Learn More",
          image_url: "https://via.placeholder.com/400x300?text=Ad+Creative+1",
          impressions: "10K-50K",
          spend_estimate: "$500-$1000",
          date_created: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: `${competitorName.toLowerCase()}_ad_2`,
          headline: "Limited Time Offer - 50% Off",
          primary_text: "Don't miss out! Join over 10,000 satisfied customers who've already made the switch. Special pricing ends soon.",
          cta: "Shop Now",
          image_url: "https://via.placeholder.com/400x300?text=Ad+Creative+2",
          impressions: "5K-25K",
          spend_estimate: "$300-$800",
          date_created: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: `${competitorName.toLowerCase()}_ad_3`,
          headline: "See What Our Customers Say",
          primary_text: "Real results from real people. Watch testimonials from customers who've transformed their lives with our product.",
          cta: "Watch Video",
          image_url: "https://via.placeholder.com/400x300?text=Ad+Creative+3",
          impressions: "15K-75K",
          spend_estimate: "$750-$1500",
          date_created: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: `${competitorName.toLowerCase()}_ad_4`,
          headline: "Free Expert Consultation",
          primary_text: "Get personalized advice from our experts. Book your free 30-minute consultation and discover your potential.",
          cta: "Book Now",
          image_url: "https://via.placeholder.com/400x300?text=Ad+Creative+4",
          impressions: "8K-40K",
          spend_estimate: "$400-$900",
          date_created: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: `${competitorName.toLowerCase()}_ad_5`,
          headline: "Join the Revolution",
          primary_text: "Be part of the movement that's changing the industry. Early adopters are seeing incredible results. Are you next?",
          cta: "Get Started",
          image_url: "https://via.placeholder.com/400x300?text=Ad+Creative+5",
          impressions: "12K-60K",
          spend_estimate: "$600-$1200",
          date_created: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      ];

      // Analyze patterns using OpenAI
      const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openAIApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const adTexts = mockAds.map(ad => `Headline: ${ad.headline}\nText: ${ad.primary_text}\nCTA: ${ad.cta}`).join('\n\n');

      const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: `You are a marketing analyst. Analyze the competitor ads and return JSON:
{
  "hooks": ["Hook 1", "Hook 2", "Hook 3"],
  "ctas": ["Most common CTA"],
  "creative_trends": ["Creative trend 1", "Creative trend 2"]
}

Analyze these ads from ${competitorName}:
${adTexts}`
            }
          ],
          max_tokens: 800,
          temperature: 0.3
        })
      });

      if (!analysisResponse.ok) {
        throw new Error(`OpenAI API error: ${analysisResponse.statusText}`);
      }

      const analysisData = await analysisResponse.json();
      let insights;
      try {
        insights = JSON.parse(analysisData.choices[0].message.content);
      } catch (parseError) {
        // Fallback insights
        insights = {
          hooks: ["Transform Your Business", "Limited Time Offer", "See What Customers Say"],
          ctas: ["Learn More", "Shop Now", "Get Started"],
          creative_trends: ["Social proof", "Urgency", "Benefits-focused"]
        };
      }

      // Save competitor ad insights to database
      const { data: insightsData, error: insightsError } = await supabase
        .from('competitor_ad_insights')
        .insert({
          user_id: userId,
          competitor_list_id: competitorListId,
          competitor_name: competitorName,
          ads_data: mockAds,
          hooks: insights.hooks,
          ctas: insights.ctas,
          creative_trends: insights.creative_trends,
          total_ads_found: mockAds.length
        })
        .select()
        .single();

      if (insightsError) {
        console.error('Error saving competitor ad insights:', insightsError);
      }

      const result = {
        success: true,
        data: {
          competitor_ad_insights_id: insightsData?.id,
          competitor: competitorName,
          ads: mockAds,
          insights,
          total_ads_found: mockAds.length,
          analysis_date: new Date().toISOString()
        }
      };

      console.log('Meta ads analysis completed and saved for:', competitorName);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    }

    // Handle case where no active ads found (this logic should be inside the processing)
    // For now, mockAds will always have data so this case won't trigger
    
    // TODO: Implement real Meta Ad Library API integration when token is available
    // For now, return mock data as above

  } catch (error) {
    console.error('Error in analyze-meta-ads:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to analyze Meta ads' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
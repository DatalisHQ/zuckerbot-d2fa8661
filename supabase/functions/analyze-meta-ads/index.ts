import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper functions for processing Meta Ad Library data
function extractCallToAction(text: string): string {
  const ctaKeywords = ['Learn More', 'Shop Now', 'Sign Up', 'Get Started', 'Book Now', 'Download', 'Subscribe', 'Contact Us', 'Buy Now', 'Try Free'];
  const lowerText = text.toLowerCase();
  
  for (const cta of ctaKeywords) {
    if (lowerText.includes(cta.toLowerCase())) {
      return cta;
    }
  }
  
  return 'Learn More'; // Default CTA
}

function formatImpressions(impressions: any): string {
  if (!impressions || !impressions.lower_bound) return 'N/A';
  
  const lower = parseInt(impressions.lower_bound);
  const upper = impressions.upper_bound ? parseInt(impressions.upper_bound) : lower * 2;
  
  if (lower >= 1000000) {
    return `${Math.round(lower/1000000)}M-${Math.round(upper/1000000)}M`;
  } else if (lower >= 1000) {
    return `${Math.round(lower/1000)}K-${Math.round(upper/1000)}K`;
  }
  
  return `${lower}-${upper}`;
}

function formatSpend(spend: any, currency: string = 'USD'): string {
  if (!spend || !spend.lower_bound) return 'N/A';
  
  const lower = parseInt(spend.lower_bound);
  const upper = spend.upper_bound ? parseInt(spend.upper_bound) : lower * 2;
  
  return `$${lower}-$${upper}`;
}

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
      throw new Error('Facebook access token not configured');
    }

    console.log('Fetching ads from Meta Ad Library for:', competitorName);

    // Search for ads using Meta Ad Library API
    const searchQueries = [
      competitorName,
      competitorName.replace(/\s+/g, ''),
      competitorName.toLowerCase(),
      competitorUrl ? new URL(competitorUrl).hostname.replace('www.', '') : ''
    ].filter(Boolean);

    let allAds = [];

    for (const query of searchQueries) {
      if (allAds.length >= 5) break; // Stop when we have enough ads

      try {
        const adLibraryUrl = new URL('https://graph.facebook.com/v18.0/ads_archive');
        adLibraryUrl.searchParams.set('access_token', facebookAccessToken);
        adLibraryUrl.searchParams.set('search_terms', query);
        adLibraryUrl.searchParams.set('ad_reached_countries', 'ALL');
        adLibraryUrl.searchParams.set('ad_active_status', 'ALL');
        adLibraryUrl.searchParams.set('limit', '10');
        adLibraryUrl.searchParams.set('fields', 'id,page_name,page_id,funding_entity,currency,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_descriptions,ad_creative_link_titles,ad_snapshot_url,ad_delivery_start_time,impressions,spend,demographic_distribution');

        console.log('Querying Meta Ad Library with:', query);
        
        const response = await fetch(adLibraryUrl.toString());
        
        if (!response.ok) {
          console.error(`Ad Library API error for "${query}":`, response.status, response.statusText);
          continue;
        }

        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
          console.log(`Found ${data.data.length} ads for "${query}"`);
          
          // Process and format the ads
          const processedAds = data.data.slice(0, 5 - allAds.length).map((ad: any) => ({
            id: ad.id,
            headline: ad.ad_creative_link_titles?.[0] || ad.ad_creative_link_captions?.[0] || 'No headline',
            primary_text: ad.ad_creative_bodies?.[0] || ad.ad_creative_link_descriptions?.[0] || 'No description',
            cta: extractCallToAction(ad.ad_creative_link_captions?.[0] || ad.ad_creative_link_titles?.[0] || ''),
            image_url: ad.ad_snapshot_url || 'https://via.placeholder.com/400x300?text=Ad+Creative',
            impressions: formatImpressions(ad.impressions),
            spend_estimate: formatSpend(ad.spend, ad.currency),
            date_created: ad.ad_delivery_start_time || new Date().toISOString(),
            page_name: ad.page_name,
            funding_entity: ad.funding_entity
          }));
          
          allAds.push(...processedAds);
        }
      } catch (error) {
        console.error(`Error fetching ads for "${query}":`, error);
        continue;
      }
    }

    // If no ads found, provide fallback
    if (allAds.length === 0) {
      console.log('No ads found in Meta Ad Library, generating fallback insights');
      
      const fallbackAds = [{
        id: `${competitorName.toLowerCase()}_fallback`,
        headline: "No Active Ads Found",
        primary_text: `No current ad campaigns found for ${competitorName} in the Meta Ad Library.`,
        cta: "Learn More",
        image_url: "https://via.placeholder.com/400x300?text=No+Ads+Found",
        impressions: "N/A",
        spend_estimate: "N/A",
        date_created: new Date().toISOString()
      }];

      allAds = fallbackAds;
    }

    console.log(`Total ads collected: ${allAds.length}`);

      // Analyze patterns using OpenAI
      const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openAIApiKey) {
        throw new Error('OpenAI API key not configured');
      }

    const adTexts = allAds.map(ad => `Headline: ${ad.headline}\nText: ${ad.primary_text}\nCTA: ${ad.cta}`).join('\n\n');

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
      // Fallback insights based on actual ad data
      const extractedCTAs = allAds.map(ad => ad.cta).filter(Boolean);
      const uniqueCTAs = [...new Set(extractedCTAs)];
      
      insights = {
        hooks: allAds.slice(0, 3).map(ad => ad.headline),
        ctas: uniqueCTAs.length > 0 ? uniqueCTAs : ["Learn More", "Get Started"],
        creative_trends: allAds.length > 0 ? ["Data-driven insights", "Performance-focused"] : ["No active campaigns"]
      };
    }

    // Save competitor ad insights to database
    const { data: insightsData, error: insightsError } = await supabase
      .from('competitor_ad_insights')
      .insert({
        user_id: userId,
        competitor_list_id: competitorListId,
        competitor_name: competitorName,
        ads_data: allAds,
        hooks: insights.hooks,
        ctas: insights.ctas,
        creative_trends: insights.creative_trends,
        total_ads_found: allAds.length
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
        ads: allAds,
        insights,
        total_ads_found: allAds.length,
        analysis_date: new Date().toISOString()
      }
    };

    console.log('Meta ads analysis completed and saved for:', competitorName);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

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
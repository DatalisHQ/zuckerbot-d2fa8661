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
    const { competitorListId, userId } = await req.json();

    if (!competitorListId || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing competitorListId or userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Fetching competitor list...');

    // Fetch competitor list
    const { data: competitorList, error: listError } = await supabase
      .from('competitor_lists')
      .select('*')
      .eq('id', competitorListId)
      .eq('user_id', userId)
      .single();

    if (listError || !competitorList) {
      return new Response(
        JSON.stringify({ error: 'Competitor list not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing competitor ads...');

    // Process each competitor through the full sub-pipeline
    const competitorInsights = [];
    const competitors = competitorList.competitors || [];

    for (const competitor of competitors) {
      console.log(`Processing competitor: ${competitor.name}`);
      
      let websiteData = null;
      let adsData = null;

      // Step 2: Website Scraping & Analysis (with timeout protection)
      if (competitor.url) {
        try {
          const websiteResponse = await Promise.race([
            supabase.functions.invoke('scrape-competitor-website', {
              body: { 
                competitorUrl: competitor.url,
                competitorName: competitor.name,
                competitorListId: competitorListId,
                userId: userId
              }
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Website scraping timeout')), 30000)
            )
          ]);
          
          if (websiteResponse.data?.success) {
            websiteData = websiteResponse.data.data;
          }
        } catch (error) {
          console.error(`Failed to scrape website for ${competitor.name}:`, error);
          // Continue processing without website data
        }
      }

      // Step 3: Meta Ad Library Analysis (with timeout protection)
      try {
        const adsResponse = await Promise.race([
          supabase.functions.invoke('analyze-meta-ads', {
            body: { 
              competitorName: competitor.name,
              competitorUrl: competitor.url,
              competitorListId: competitorListId,
              userId: userId
            }
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Ad analysis timeout')), 30000)
          )
        ]);
        
        if (adsResponse.data?.success) {
          adsData = adsResponse.data.data;
        }
      } catch (error) {
        console.error(`Failed to analyze ads for ${competitor.name}:`, error);
        // No fallback - let the error propagate
        adsData = {
          ads: [],
          insights: { 
            common_hooks: [],
            common_ctas: [],
            dominant_tones: [],
            avg_text_length: 0
          },
          total_ads_found: 0,
          error: error.message
        };
      }

      // Only use fallback data when absolutely necessary
      const hasValidWebsiteData = websiteData?.analysis && 
        websiteData.analysis.niche !== "Unknown" && 
        websiteData.analysis.audience !== "General";
      
      const hasValidAdsData = adsData?.ads && adsData.ads.length > 0;
      
      competitorInsights.push({
        name: competitor.name,
        url: competitor.url,
        websiteAnalysis: hasValidWebsiteData ? websiteData.analysis : null,
        ads: adsData?.ads || [],
        insights: hasValidAdsData ? adsData.insights : null,
        total_ads_found: adsData?.total_ads_found || 0,
        no_ads_message: adsData?.error || (!hasValidAdsData ? `No active ads found for ${competitor.name}. They may not be running Facebook ads currently, or their ads are not publicly visible in the Ad Library.` : null),
        analysis_error: (!hasValidWebsiteData && !hasValidAdsData) ? `Limited data available for ${competitor.name}. This could indicate the website couldn't be properly analyzed or they're not running Facebook ads.` : null
      });
    }

    // Generate overall patterns and trends  
    const overallInsights = generateOverallInsights(competitorInsights) || {
      trending_hooks: [],
      trending_tones: [],
      trending_ctas: [],
      key_patterns: ["Not enough competitor ad data to generate intelligence summary. Most competitors either don't have active Facebook ads or couldn't be accessed due to API limitations."],
      data_quality: {
        competitors_analyzed: competitorInsights.length,
        competitors_with_ad_data: competitorInsights.filter(c => c.total_ads_found > 0).length,
        total_hooks: 0,
        total_ctas: 0
      }
    };
    
    // Step 4: Generate angle suggestions for user selection
    const suggestedAngles = [
      {
        type: 'competitor-inspired',
        title: 'Competitor-Inspired',
        description: 'Use proven angles and tactics that competitors are using successfully.',
        strategy: 'Leverage competitor-validated messaging patterns and successful ad formats.',
        confidence: 85
      },
      {
        type: 'differentiated', 
        title: 'Differentiated',
        description: 'Stand out by taking a unique position that competitors are not addressing.',
        strategy: 'Identify gaps in competitor messaging and position your brand as the unique solution.',
        confidence: 75
      },
      {
        type: 'hybrid',
        title: 'Hybrid',
        description: 'Combine proven competitor tactics with your unique brand positioning.',
        strategy: 'Use competitor-validated hooks but differentiate through your unique approach and value props.',
        confidence: 90
      }
    ];

    const result = {
      competitorInsights,
      overallInsights,
      suggestedAngles,
      status: 'completed'
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in competitor-insights function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});


function analyzeCompetitorAds(ads: any[]) {
  if (!ads || ads.length === 0) {
    return {
      common_hooks: [],
      common_ctas: [],
      dominant_tones: [],
      avg_text_length: 0
    };
  }

  const hooks = ads.map(ad => ad.headline).filter(Boolean);
  const ctas = ads.map(ad => ad.cta).filter(Boolean);
  const tones = [];
  
  // Analyze tone and patterns
  ads.forEach(ad => {
    const text = (ad.primary_text || '').toLowerCase();
    if (text.includes('transform') || text.includes('secret') || text.includes('discover')) {
      tones.push('aspirational');
    }
    if (text.includes('limited') || text.includes('only') || text.includes('exclusive')) {
      tones.push('urgency');
    }
    if (text.includes('results') || text.includes('proof') || text.includes('testimonial')) {
      tones.push('social-proof');
    }
  });

  return {
    common_hooks: [...new Set(hooks)],
    common_ctas: [...new Set(ctas)],
    dominant_tones: [...new Set(tones)],
    avg_text_length: ads.reduce((acc, ad) => acc + (ad.primary_text || '').length, 0) / Math.max(ads.length, 1)
  };
}

function generateOverallInsights(competitorInsights: any[]) {
  // Check for ad insights first
  const validAdInsights = competitorInsights.filter(c => c.insights && 
    (c.insights.common_hooks?.length > 0 || c.insights.hooks?.length > 0 || 
     c.insights.common_ctas?.length > 0 || c.insights.ctas?.length > 0));
  
  // Check for website analysis data as fallback
  const validWebsiteInsights = competitorInsights.filter(c => 
    c.websiteAnalysis && c.websiteAnalysis.value_props?.length > 0);
  
  // If we have ad data, use it. Otherwise try website data
  if (validAdInsights.length > 0) {
    return generateAdBasedInsights(validAdInsights, competitorInsights.length);
  } else if (validWebsiteInsights.length > 0) {
    return generateWebsiteBasedInsights(validWebsiteInsights, competitorInsights.length);
  }
  
  // Return minimal fallback message if no actionable data
  return {
    trending_hooks: [],
    trending_ctas: [],
    key_patterns: ["Not enough data to generate market intelligence summary for these competitors."],
    data_quality: {
      competitors_analyzed: competitorInsights.length,
      competitors_with_ad_data: 0,
      competitors_with_website_data: 0,
      total_hooks: 0,
      total_ctas: 0
    }
  };
}

function generateAdBasedInsights(validInsights: any[], totalCompetitors: number) {
  const allHooks = validInsights.flatMap(c => 
    c.insights.common_hooks || c.insights.hooks || []
  ).filter(Boolean);
  
  const allTones = validInsights.flatMap(c => 
    c.insights.dominant_tones || c.insights.creative_trends || []
  ).filter(Boolean);
  
  const allCtas = validInsights.flatMap(c => 
    c.insights.common_ctas || c.insights.ctas || []
  ).filter(Boolean);
  
  // Only show insights if we have substantial data
  const minDataThreshold = 3;
  if (allHooks.length < minDataThreshold && allCtas.length < minDataThreshold) {
    return null;
  }
  
  const trendingHooks = getMostCommon(allHooks, 5).slice(0, Math.min(5, allHooks.length));
  const trendingCtas = getMostCommon(allCtas, 4).slice(0, Math.min(4, allCtas.length));
  const trendingTones = getMostCommon(allTones, 3).slice(0, Math.min(3, allTones.length));
  
  // Generate dynamic patterns based on actual data
  const patterns = [];
  if (trendingTones.length > 0) {
    patterns.push(`Market leans towards ${trendingTones.slice(0, 2).join(' and ')} messaging approaches`);
  }
  if (trendingHooks.length >= 3) {
    patterns.push(`Top performing hooks focus on transformation, results, and value delivery`);
  }
  if (trendingCtas.length >= 2) {
    patterns.push(`Most effective CTAs use direct action language: ${trendingCtas.slice(0, 2).join(', ')}`);
  }
  
  return {
    trending_hooks: trendingHooks,
    trending_tones: trendingTones,
    trending_ctas: trendingCtas,
    key_patterns: patterns.length > 0 ? patterns : [
      `Analysis based on ${validInsights.length} competitor${validInsights.length > 1 ? 's' : ''} with active advertising`
    ],
    data_quality: {
      competitors_analyzed: totalCompetitors,
      competitors_with_ad_data: validInsights.length,
      competitors_with_website_data: 0,
      total_hooks: allHooks.length,
      total_ctas: allCtas.length
    }
  };
}

function generateWebsiteBasedInsights(validWebsiteInsights: any[], totalCompetitors: number) {
  const allValueProps = validWebsiteInsights.flatMap(c => 
    c.websiteAnalysis.value_props || []
  ).filter(Boolean);
  
  const allTones = validWebsiteInsights.map(c => 
    c.websiteAnalysis.tone || ''
  ).filter(Boolean);
  
  // Extract common themes from value propositions
  const trendingHooks = getMostCommon(allValueProps, 5).slice(0, Math.min(5, allValueProps.length));
  const trendingTones = getMostCommon(allTones, 3).slice(0, Math.min(3, allTones.length));
  
  // Generate patterns based on website analysis
  const patterns = [];
  if (trendingTones.length > 0) {
    patterns.push(`Market messaging is predominantly ${trendingTones[0].toLowerCase()}`);
  }
  if (trendingHooks.length >= 2) {
    patterns.push(`Common value propositions focus on customer benefits and differentiation`);
  }
  patterns.push(`Analysis based on ${validWebsiteInsights.length} competitor website${validWebsiteInsights.length > 1 ? 's' : ''}`);
  
  return {
    trending_hooks: trendingHooks,
    trending_tones: trendingTones,
    trending_ctas: [],
    key_patterns: patterns,
    data_quality: {
      competitors_analyzed: totalCompetitors,
      competitors_with_ad_data: 0,
      competitors_with_website_data: validWebsiteInsights.length,
      total_hooks: allValueProps.length,
      total_ctas: 0
    }
  };
}

function generateAngleSuggestions(overallInsights: any, competitorInsights: any[]) {
  const topHook = overallInsights.trending_hooks[0] || 'Transform Your Business';
  const hasWebsiteData = competitorInsights.some(c => c.websiteAnalysis);
  
  return [
    {
      type: 'competitor-inspired',
      title: 'Follow the Winners',
      description: `Use proven angles like "${topHook}" with urgency tactics that competitors are using successfully.`,
      strategy: hasWebsiteData 
        ? 'Leverage competitor-validated messaging patterns combined with similar tone and value propositions from their websites.'
        : 'Use the most effective competitor ad patterns while adding your unique value proposition.',
      confidence: 85
    },
    {
      type: 'differentiated',
      title: 'Stand Out from the Crowd',
      description: 'Position your brand as the unique alternative by focusing on what competitors are NOT addressing.',
      strategy: hasWebsiteData
        ? 'Analyze competitor website messaging to identify gaps in their positioning and target unaddressed customer pain points.'
        : 'Identify gaps in competitor ad messaging and position your brand as the solution to unaddressed pain points.',
      confidence: 75
    },
    {
      type: 'hybrid',
      title: 'Best of Both Worlds',
      description: 'Combine proven competitor tactics with your unique brand positioning for maximum impact.',
      strategy: hasWebsiteData
        ? 'Use competitor-validated hooks and website messaging patterns but differentiate through your unique approach, pricing, or guarantees.'
        : 'Use competitor-validated hooks but differentiate through your unique approach, pricing, or guarantees.',
      confidence: 90
    }
  ];
}

function getMostCommon(arr: string[], limit: number): string[] {
  const counts = arr.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(counts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, limit)
    .map(([item]) => item);
}
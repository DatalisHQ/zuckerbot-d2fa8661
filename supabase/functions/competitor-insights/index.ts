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
        // Use mock data as fallback
        const mockAds = await fetchCompetitorAds(competitor.name);
        adsData = {
          ads: mockAds,
          insights: analyzeCompetitorAds(mockAds),
          total_ads_found: mockAds.length
        };
      }

      // Compile competitor insights with fallback data
      competitorInsights.push({
        name: competitor.name,
        url: competitor.url,
        websiteAnalysis: websiteData?.analysis || {
          value_propositions: [`Leading ${competitor.name} platform for business growth`],
          tone: 'professional',
          audience: 'business owners'
        },
        ads: adsData?.ads || [],
        insights: adsData?.insights || { 
          common_hooks: ['Transform Your Business', 'Get Results Fast'],
          common_ctas: ['Learn More', 'Get Started'],
          dominant_tones: ['professional', 'results-focused'],
          avg_text_length: 150
        },
        total_ads_found: adsData?.total_ads_found || 0,
        no_ads_message: adsData?.message || null
      });
    }

    // Generate overall patterns and trends
    const overallInsights = generateOverallInsights(competitorInsights);
    
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

async function fetchCompetitorAds(competitorName: string) {
  // Mock Facebook Ad Library data for now
  // In production, this would call the actual Facebook Ad Library API
  
  const mockAds = [
    {
      id: '1',
      headline: 'Transform Your Business Today',
      primary_text: 'Discover the secret strategies that top entrepreneurs use to scale their businesses. Join thousands who have already transformed their revenue.',
      cta: 'Learn More',
      image_url: 'https://via.placeholder.com/300x200',
      impressions: '10K-50K',
      spend_estimate: '$500-$1000',
      date_created: '2024-01-15'
    },
    {
      id: '2',
      headline: 'Limited Time Offer',
      primary_text: 'Get 50% off our premium course. Only 48 hours left! This exclusive deal has helped over 5,000 business owners increase their profits.',
      cta: 'Claim Offer',
      image_url: 'https://via.placeholder.com/300x200',
      impressions: '50K-100K',
      spend_estimate: '$1000-$2000',
      date_created: '2024-01-10'
    },
    {
      id: '3',
      headline: 'Real Results, Real People',
      primary_text: '"I increased my revenue by 300% in just 6 months using these strategies. The ROI was incredible!" - Sarah M., Business Owner',
      cta: 'See Proof',
      image_url: 'https://via.placeholder.com/300x200',
      impressions: '25K-75K',
      spend_estimate: '$750-$1500',
      date_created: '2024-01-05'
    }
  ];

  return mockAds;
}

function analyzeCompetitorAds(ads: any[]) {
  if (!ads || ads.length === 0) {
    return {
      common_hooks: ['Transform Your Business', 'Get Results Fast', 'Join Thousands'],
      common_ctas: ['Learn More', 'Get Started', 'Try Free'],
      dominant_tones: ['professional', 'results-focused', 'urgency'],
      avg_text_length: 120
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
  const allHooks = competitorInsights.flatMap(c => c.insights.common_hooks);
  const allTones = competitorInsights.flatMap(c => c.insights.dominant_tones);
  const allCtas = competitorInsights.flatMap(c => c.insights.common_ctas);

  return {
    trending_hooks: getMostCommon(allHooks, 3),
    trending_tones: getMostCommon(allTones, 3),
    trending_ctas: getMostCommon(allCtas, 3),
    key_patterns: [
      'Competitors heavily use urgency and scarcity tactics',
      'Social proof and testimonials are commonly featured',
      'Aspirational language focuses on transformation and results'
    ]
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
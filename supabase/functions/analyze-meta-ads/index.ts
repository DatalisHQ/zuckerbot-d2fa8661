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

// Simple web search function (placeholder for real search API)
async function performWebSearch(query: string) {
  try {
    console.log('Performing web search for:', query);
    
    // Use a simple search approach to find Facebook pages
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    
    try {
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (response.ok) {
        const html = await response.text();
        // Extract Facebook URLs from search results
        const facebookUrls = html.match(/https:\/\/[^"]*facebook\.com\/[^"\/\?]+/g) || [];
        return facebookUrls.map(url => ({ url }));
      }
    } catch (error) {
      console.log('Search failed, using fallback:', error);
    }
    
    return null;
  } catch (error) {
    console.error('Web search error:', error);
    return null;
  }
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

    // Check for required Facebook credentials
    const facebookAccessToken = Deno.env.get('FACEBOOK_ACCESS_TOKEN');
    const facebookAppId = Deno.env.get('FACEBOOK_APP_ID');
    
    if (!facebookAccessToken) {
      console.error('FACEBOOK_ACCESS_TOKEN environment variable is not set');
      throw new Error('Facebook Access Token is required but not configured. Please set FACEBOOK_ACCESS_TOKEN environment variable.');
    }
    
    if (!facebookAppId) {
      console.error('FACEBOOK_APP_ID environment variable is not set');
      throw new Error('Facebook App ID is required but not configured. Please set FACEBOOK_APP_ID environment variable.');
    }

    console.log('Facebook credentials found - Access Token:', facebookAccessToken ? 'SET' : 'MISSING');
    console.log('Facebook credentials found - App ID:', facebookAppId ? 'SET' : 'MISSING');

    console.log('Fetching ads from Meta Ad Library for:', competitorName);

    // First, search the web to find the competitor's Facebook page
    console.log('Searching for Facebook page URL...');
    const facebookPageQueries = [
      `${competitorName} facebook page`,
      `${competitorName} facebook profile`,
      `${competitorName} fb page`,
      `site:facebook.com ${competitorName}`,
      `"${competitorName}" facebook`
    ];
    
    let facebookPageName = null;
    let facebookPageId = null;
    
    // Use web search to find Facebook page
    for (const webQuery of facebookPageQueries) {
      try {
        console.log('Web search query:', webQuery);
        
        // Use a simple search API or fallback to enhanced name variations
        const searchResults = await performWebSearch(webQuery);
        
        if (searchResults && searchResults.length > 0) {
          // Parse search results to find Facebook URLs
          const facebookUrls = searchResults
            .filter((result: any) => result.url && result.url.includes('facebook.com'))
            .map((result: any) => result.url);
          
          if (facebookUrls.length > 0) {
            // Extract page name from Facebook URL
            const fbUrl = facebookUrls[0];
            const pageNameMatch = fbUrl.match(/facebook\.com\/([^\/\?]+)/);
            if (pageNameMatch && pageNameMatch[1]) {
              facebookPageName = pageNameMatch[1];
              console.log('Found Facebook page name from search:', facebookPageName);
              break;
            }
          }
        }
        
        // Fallback to enhanced name variations
        const potentialPageNames = [
          competitorName,
          competitorName.replace(/\s+/g, ''),
          competitorName.toLowerCase(),
          competitorName.replace(/[^a-zA-Z0-9]/g, ''),
          competitorName.split(' ')[0], // First word only
          competitorUrl ? new URL(competitorUrl).hostname.replace('www.', '').split('.')[0] : ''
        ].filter(Boolean);
        
        facebookPageName = potentialPageNames[0];
        break;
      } catch (error) {
        console.error('Error in web search:', error);
        continue;
      }
    }

    
    // Search for ads using Meta Ad Library API with enhanced queries
    const searchQueries = [
      competitorName,
      competitorName.replace(/\s+/g, ''),
      competitorName.toLowerCase(),
      competitorName.replace(/[^a-zA-Z0-9\s]/g, ''), // Remove special characters
      competitorName.split(' ')[0], // First word only
      competitorName.split(' ').slice(-1)[0], // Last word only
      competitorUrl ? new URL(competitorUrl).hostname.replace('www.', '').split('.')[0] : '',
      facebookPageName
    ].filter(Boolean).slice(0, 6); // Limit to 6 queries to avoid rate limits

    let allAds = [];

    for (const query of searchQueries) {
      if (allAds.length >= 5) break; // Stop when we have enough ads

      try {
        // Try multiple API approaches for better success rate
        const apiVersions = ['v21.0', 'v20.0', 'v19.0'];
        let apiSuccess = false;
        let adLibraryUrl;
        
        for (const version of apiVersions) {
          try {
            // First validate token for this API version
            const tokenValidationUrl = `https://graph.facebook.com/${version}/me?access_token=${facebookAccessToken}`;
            const tokenResponse = await fetch(tokenValidationUrl);
            
            if (tokenResponse.ok) {
              // Build Ad Library API URL with enhanced parameters
              adLibraryUrl = new URL(`https://graph.facebook.com/${version}/ads_archive`);
              adLibraryUrl.searchParams.set('access_token', facebookAccessToken);
              adLibraryUrl.searchParams.set('search_terms', query);
              adLibraryUrl.searchParams.set('ad_reached_countries', '["US","CA","GB","AU"]'); // Multiple countries for better coverage
              adLibraryUrl.searchParams.set('ad_active_status', 'ALL'); // Include both active and inactive ads
              adLibraryUrl.searchParams.set('ad_type', 'ALL'); // All ad types
              adLibraryUrl.searchParams.set('media_type', 'ALL'); // All media types
              adLibraryUrl.searchParams.set('limit', '50'); // Increased limit for more data
              adLibraryUrl.searchParams.set('fields', 'id,page_name,page_id,funding_entity,currency,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_descriptions,ad_creative_link_titles,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time,impressions,spend,demographic_distribution,region_distribution');
              
              console.log(`Using Facebook API ${version} for query:`, query);
              apiSuccess = true;
              break;
            } else {
              console.log(`API ${version} token validation failed, trying next version`);
            }
          } catch (versionError) {
            console.log(`API ${version} failed:`, versionError.message);
            continue;
          }
        }
        
        if (!apiSuccess) {
          console.error('All Facebook API versions failed token validation');
          continue; // Skip this query and try the next one
        }

        console.log('Querying Meta Ad Library with:', query);
        console.log('Full API URL:', adLibraryUrl.toString().replace(facebookAccessToken, '[REDACTED]'));
        
        const response = await fetch(adLibraryUrl.toString(), {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FacebookBot/1.0)',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Ad Library API error for "${query}":`, response.status, response.statusText);
          console.error('Error response body:', errorText);
          
          // If it's a rate limit error, wait and continue
          if (response.status === 429) {
            console.log('Rate limited, waiting 2 seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          // For 400 errors, try alternative search approaches
          if (response.status === 400) {
            console.log('Bad request - trying alternative search approach for:', query);
            
            // Try a simpler search with fewer parameters
            const simpleUrl = new URL(`https://graph.facebook.com/v21.0/ads_archive`);
            simpleUrl.searchParams.set('access_token', facebookAccessToken);
            simpleUrl.searchParams.set('search_terms', query);
            simpleUrl.searchParams.set('ad_reached_countries', '["US"]');
            simpleUrl.searchParams.set('limit', '10');
            simpleUrl.searchParams.set('fields', 'id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url');
            
            const simpleResponse = await fetch(simpleUrl.toString());
            if (simpleResponse.ok) {
              const simpleData = await simpleResponse.json();
              if (simpleData.data && simpleData.data.length > 0) {
                console.log(`Found ${simpleData.data.length} ads with simple search for "${query}"`);
                
                const processedAds = simpleData.data.slice(0, 5 - allAds.length).map((ad: any) => ({
                  id: ad.id,
                  headline: ad.ad_creative_link_titles?.[0] || 'No headline available',
                  primary_text: ad.ad_creative_bodies?.[0] || 'No description available',
                  cta: 'Learn More',
                  image_url: ad.ad_snapshot_url || 'https://via.placeholder.com/400x300?text=Ad+Creative',
                  impressions: 'Data not available',
                  spend_estimate: 'Data not available',
                  date_created: new Date().toISOString(),
                  page_name: ad.page_name,
                  relevance_score: 'medium'
                }));
                
                allAds.push(...processedAds);
                continue;
              }
            }
          }
          
          continue;
        }

        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
          console.log(`Found ${data.data.length} ads for "${query}"`);
          
          // Filter ads to find the most relevant ones
          const relevantAds = data.data.filter((ad: any) => {
            const pageName = ad.page_name?.toLowerCase() || '';
            const competitorLower = competitorName.toLowerCase();
            
            // Check if page name contains competitor name or vice versa
            return pageName.includes(competitorLower) || 
                   competitorLower.includes(pageName) ||
                   // Check for partial matches
                   pageName.split(' ').some((word: string) => 
                     competitorLower.includes(word) && word.length > 3
                   ) ||
                   competitorLower.split(' ').some((word: string) => 
                     pageName.includes(word) && word.length > 3
                   );
          });
          
          // Use relevant ads first, then fall back to all ads
          const adsToProcess = relevantAds.length > 0 ? relevantAds : data.data;
          
          // Process and format the ads
          const processedAds = adsToProcess.slice(0, 5 - allAds.length).map((ad: any) => ({
            id: ad.id,
            headline: ad.ad_creative_link_titles?.[0] || ad.ad_creative_link_captions?.[0] || 'No headline',
            primary_text: ad.ad_creative_bodies?.[0] || ad.ad_creative_link_descriptions?.[0] || 'No description',
            cta: extractCallToAction(ad.ad_creative_link_captions?.[0] || ad.ad_creative_link_titles?.[0] || ''),
            image_url: ad.ad_snapshot_url || 'https://via.placeholder.com/400x300?text=Ad+Creative',
            impressions: formatImpressions(ad.impressions),
            spend_estimate: formatSpend(ad.spend, ad.currency),
            date_created: ad.ad_delivery_start_time || new Date().toISOString(),
            page_name: ad.page_name,
            page_id: ad.page_id,
            funding_entity: ad.funding_entity,
            relevance_score: relevantAds.includes(ad) ? 'high' : 'medium'
          }));
          
          allAds.push(...processedAds);
          
          // If we found relevant ads, store the page info for future use
          if (relevantAds.length > 0 && !facebookPageId) {
            facebookPageId = relevantAds[0].page_id;
            facebookPageName = relevantAds[0].page_name;
            console.log('Found Facebook page:', facebookPageName, 'ID:', facebookPageId);
          }
        }
      } catch (error) {
        console.error(`Error fetching ads for "${query}":`, error);
        continue;
      }
    }

    // If no ads found, return structured response instead of throwing error
    if (allAds.length === 0) {
      console.log('No ads found in Meta Ad Library for:', competitorName);
      
      // Return successful response with empty data but clear messaging
      const result = {
        success: true,
        data: {
          competitor: competitorName,
          ads: [],
          insights: {
            hooks: [],
            ctas: [],
            creative_trends: []
          },
          total_ads_found: 0,
          no_ads_message: `No active or recent ads found for "${competitorName}" in Facebook Ad Library. This could mean: 1) The competitor is not running Facebook ads, 2) Their page name doesn't match our search terms, or 3) Their ads are not publicly visible in the Ad Library.`,
          analysis_date: new Date().toISOString()
        }
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
            role: 'system',
            content: 'You are a marketing analyst. Analyze competitor ads and provide detailed insights. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: `Analyze these Facebook ads from ${competitorName} and extract key patterns. Return detailed JSON:

{
  "hooks": ["Specific hook phrase 1", "Specific hook phrase 2", "Specific hook phrase 3", "Hook phrase 4", "Hook phrase 5"],
  "ctas": ["Most common CTA", "Second most common CTA", "Third CTA"],
  "creative_trends": ["Specific creative pattern 1", "Creative pattern 2", "Pattern 3"]
}

Focus on extracting actual phrases and patterns from these ads:
${adTexts}

Extract specific headlines, opening phrases, and emotional triggers used across the ads. Be detailed and specific.`
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
      let content = analysisData.choices[0].message.content;
      
      // Clean up the response if it contains markdown code blocks
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      insights = JSON.parse(content);
      
      // Validate that we got meaningful data
      if (!insights.hooks || insights.hooks.length === 0) {
        throw new Error("No hooks extracted from AI analysis");
      }
      
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      console.log('Raw OpenAI response:', analysisData.choices[0].message.content);
      
      // Enhanced fallback based on actual ad data
      const extractedCTAs = allAds.map(ad => ad.cta).filter(Boolean);
      const uniqueCTAs = [...new Set(extractedCTAs)];
      const extractedHeadlines = allAds.map(ad => ad.headline).filter(Boolean);
      const extractedPrimaryTexts = allAds.map(ad => ad.primary_text).filter(Boolean);
      
      // Extract hooks from headlines and primary text
      const hooks = [...new Set([...extractedHeadlines.slice(0, 3), ...extractedPrimaryTexts.slice(0, 2)])];
      
      insights = {
        hooks: hooks.length > 0 ? hooks : [`${competitorName} advertising patterns`],
        ctas: uniqueCTAs.length > 0 ? uniqueCTAs : ["Learn More", "Get Started"],
        creative_trends: allAds.length > 0 ? [
          `${competitorName} focuses on direct response advertising`,
          "Uses performance-driven creative strategies",
          "Emphasizes clear value propositions"
        ] : ["No active campaigns found"]
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
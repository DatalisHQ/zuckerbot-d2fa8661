import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { chromium } from "npm:playwright@1.40.0";

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

// Fallback scraper using Playwright
async function scrapeFacebookAdsLibrary(pageId: string): Promise<any[]> {
  let browser = null;
  try {
    console.log(`Starting Facebook Ads Library scraper for page ID: ${pageId}`);
    
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    const url = `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}`;
    console.log(`Navigating to: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
    
    // Wait for ads to load
    await page.waitForTimeout(3000);
    
    // Try to find ad containers
    const adSelectors = [
      '[data-testid="ad-item"]',
      '[data-testid="ad_snapshot"]',
      '.x1i10hfl.xjbqb8w.x6umtig.x1b1mbwd.xaqea5y.xav7gou.x9f619.x1ypdohk.xt0psk2.xe8uvvx.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x16tdsg8.x1hl2dhg.xggy1nq.x1a2a7pz.x1sur9pj.xkrqix3.x1fey0fg.x1s688f',
      '.x1yztbdb.x1n2onr6.xh8yej3.x1ja2u2z'
    ];
    
    let ads = [];
    
    for (const selector of adSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        
        ads = await page.evaluate((sel) => {
          const adElements = document.querySelectorAll(sel);
          const results = [];
          
          for (let i = 0; i < Math.min(5, adElements.length); i++) {
            const adElement = adElements[i];
            
            // Extract text content
            const textElements = adElement.querySelectorAll('span, div, p');
            const texts = Array.from(textElements)
              .map(el => el.textContent?.trim())
              .filter(text => text && text.length > 5);
            
            // Extract images
            const images = Array.from(adElement.querySelectorAll('img'))
              .map(img => img.src)
              .filter(src => src && !src.includes('data:'));
            
            if (texts.length > 0) {
              results.push({
                id: `scraped_${Date.now()}_${i}`,
                headline: texts[0] || 'No headline available',
                primary_text: texts[1] || texts[0] || 'No description available',
                cta: texts.find(t => ['Learn More', 'Shop Now', 'Sign Up', 'Get Started'].some(cta => t.includes(cta))) || 'Learn More',
                image_url: images[0] || 'https://via.placeholder.com/400x300?text=Ad+Creative',
                impressions: 'Data not available via scraper',
                spend_estimate: 'Data not available via scraper',
                date_created: new Date().toISOString(),
                page_name: 'Scraped from Facebook Ads Library',
                relevance_score: 'high'
              });
            }
          }
          
          return results;
        }, selector);
        
        if (ads.length > 0) {
          console.log(`Found ${ads.length} ads using selector: ${selector}`);
          break;
        }
      } catch (error) {
        console.log(`Selector ${selector} failed:`, error.message);
        continue;
      }
    }
    
    console.log(`Scraper completed. Found ${ads.length} ads.`);
    return ads;
    
  } catch (error) {
    console.error('Facebook Ads Library scraper error:', error);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
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

    
    // Known Page IDs for testing - hardcode Tarte for now
    const knownPageIds = {
      'Tarte Cosmetics': '82403561928',
      'tarte cosmetics': '82403561928',
      'Tarte': '82403561928'
    };
    
    // Build search queries with Page ID prioritized first
    const searchQueries = [];
    
    // 1. Try known Page ID first (highest priority)
    const knownPageId = knownPageIds[competitorName] || knownPageIds[competitorName.toLowerCase()];
    if (knownPageId) {
      searchQueries.push(`page_id:${knownPageId}`);
      console.log(`Using known Page ID for ${competitorName}: ${knownPageId}`);
    }
    
    // 2. Try Facebook page name if found from web search
    if (facebookPageName && facebookPageName !== competitorName) {
      searchQueries.push(facebookPageName);
    }
    
    // 3. Try exact brand name variations
    searchQueries.push(
      competitorName,
      competitorName.replace(/\s+/g, ''),
      competitorName.toLowerCase(),
      competitorName.replace(/[^a-zA-Z0-9\s]/g, ''), // Remove special characters
      competitorName.split(' ')[0], // First word only
      competitorName.split(' ').slice(-1)[0] // Last word only
    );
    
    // 4. Try domain-based search
    if (competitorUrl) {
      const domain = new URL(competitorUrl).hostname.replace('www.', '').split('.')[0];
      if (domain && domain !== competitorName.toLowerCase()) {
        searchQueries.push(domain);
      }
    }
    
    // Remove duplicates and limit queries
    const uniqueQueries = [...new Set(searchQueries.filter(Boolean))].slice(0, 8);

    let allAds = [];

    // Try API first with 5-second timeout
    for (const query of uniqueQueries) {
      if (allAds.length >= 5) break; // Stop when we have enough ads

      try {
        console.log(`\n=== ATTEMPTING API SEARCH FOR: "${query}" ===`);
        
        // Use latest stable API version with comprehensive error handling
        const adLibraryUrl = new URL('https://graph.facebook.com/v21.0/ads_archive');
        adLibraryUrl.searchParams.set('access_token', facebookAccessToken);
        
        // Handle Page ID search differently
        if (query.startsWith('page_id:')) {
          const pageId = query.replace('page_id:', '');
          adLibraryUrl.searchParams.set('search_page_ids', `["${pageId}"]`);
          console.log(`Searching by Page ID: ${pageId}`);
        } else {
          adLibraryUrl.searchParams.set('search_terms', query);
          console.log(`Searching by terms: ${query}`);
        }
        
        // Set comprehensive search parameters
        adLibraryUrl.searchParams.set('ad_reached_countries', '["US","CA","GB","AU","FR","DE","IT","ES","NL","SE","NO","DK","FI"]');
        adLibraryUrl.searchParams.set('ad_active_status', 'ALL');
        adLibraryUrl.searchParams.set('ad_type', 'ALL');
        adLibraryUrl.searchParams.set('media_type', 'ALL');
        adLibraryUrl.searchParams.set('limit', '100');
        adLibraryUrl.searchParams.set('fields', 'id,page_name,page_id,funding_entity,currency,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_descriptions,ad_creative_link_titles,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time,impressions,spend,demographic_distribution,region_distribution');
        
        console.log('Full API URL:', adLibraryUrl.toString().replace(facebookAccessToken, '[REDACTED]'));
        
        // 5-second timeout for API call
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        try {
          const response = await fetch(adLibraryUrl.toString(), {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
              'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          console.log(`Response status: ${response.status} ${response.statusText}`);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`=== API ERROR FOR "${query}" ===`);
            console.error(`Status: ${response.status} ${response.statusText}`);
            console.error('Full error response:', errorText);
            
            // Try to parse error for specific issues
            try {
              const errorData = JSON.parse(errorText);
              if (errorData.error) {
                console.error('Error details:', {
                  message: errorData.error.message,
                  type: errorData.error.type,
                  code: errorData.error.code,
                  subcode: errorData.error.error_subcode
                });
                
                // Handle specific error types
                if (errorData.error.code === 10 && errorData.error.error_subcode === 2332002) {
                  console.error('CRITICAL: App does not have Ad Library API access. Check app permissions and verification status.');
                  return new Response(JSON.stringify({
                    success: false,
                    error: 'Facebook App does not have permission to access Ad Library API. Please verify your app has been approved for Ad Library access.',
                    error_details: errorData.error
                  }), {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                  });
                }
              }
            } catch (parseError) {
              console.error('Could not parse error response:', parseError);
            }
            
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
        } catch (timeoutError) {
          clearTimeout(timeoutId);
          console.log(`API timeout for "${query}", moving to scraper fallback`);
          break; // Exit API attempts and go to scraper
        }
      } catch (error) {
        console.error(`Error fetching ads for "${query}":`, error);
        continue;
      }
    }

    // If API failed to get ads, try scraper fallback
    if (allAds.length === 0 && knownPageId) {
      console.log(`\n=== ATTEMPTING SCRAPER FALLBACK FOR PAGE ID: ${knownPageId} ===`);
      try {
        const scrapedAds = await scrapeFacebookAdsLibrary(knownPageId);
        if (scrapedAds.length > 0) {
          allAds.push(...scrapedAds);
          console.log(`Scraper found ${scrapedAds.length} ads`);
        }
      } catch (scraperError) {
        console.error('Scraper fallback failed:', scraperError);
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
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brandAnalysisId, userId } = await req.json();
    
    if (!brandAnalysisId || !userId) {
      throw new Error('Brand analysis ID and user ID are required');
    }

    console.log(`Starting competitor discovery for brand analysis: ${brandAnalysisId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the brand analysis data
    const { data: brandAnalysis, error: fetchError } = await supabase
      .from('brand_analysis')
      .select('*')
      .eq('id', brandAnalysisId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching brand analysis:', fetchError);
      throw fetchError;
    }

    if (!brandAnalysis) {
      throw new Error('Brand analysis not found');
    }

    console.log('Found brand analysis:', brandAnalysis.brand_name);

    // Create search queries based on brand analysis
    const searchQueries = [
      `${brandAnalysis.business_category} companies`,
      `${brandAnalysis.niche} competitors`,
      `${brandAnalysis.business_category} ${brandAnalysis.niche}`,
      `best ${brandAnalysis.business_category} tools`,
      `${brandAnalysis.niche} market leaders`
    ];

    console.log('Generated search queries:', searchQueries);

    // Create competitor discovery record
    const { data: discoveryRecord, error: insertError } = await supabase
      .from('competitor_discovery')
      .insert({
        user_id: userId,
        brand_analysis_id: brandAnalysisId,
        search_query: searchQueries.join(', '),
        discovery_status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating discovery record:', insertError);
      throw insertError;
    }

    console.log('Created discovery record:', discoveryRecord.id);

    // Use web search to find competitors
    const discoveredCompetitors: any[] = [];
    
    for (const query of searchQueries.slice(0, 3)) { // Limit to 3 searches
      try {
        console.log(`Searching for: ${query}`);
        
        // Use AI to discover real competitors
        const searchResults = await discoverCompetitorsWithAI(query, brandAnalysis);
        discoveredCompetitors.push(...searchResults);
        
      } catch (searchError) {
        console.error(`Error searching for "${query}":`, searchError);
      }
    }

    // Remove duplicates and filter out the original brand
    const uniqueCompetitors = removeDuplicates(discoveredCompetitors, brandAnalysis.brand_name);
    
    console.log(`Found ${uniqueCompetitors.length} unique competitors`);

    // Update the record with discovered competitors
    const { error: updateError } = await supabase
      .from('competitor_discovery')
      .update({
        discovered_competitors: uniqueCompetitors,
        discovery_status: 'completed'
      })
      .eq('id', discoveryRecord.id);

    if (updateError) {
      console.error('Error updating discovery record:', updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        discoveryId: discoveryRecord.id,
        competitors: uniqueCompetitors,
        totalFound: uniqueCompetitors.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in discover-competitors function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Use OpenAI to analyze search results and suggest competitors
async function discoverCompetitorsWithAI(query: string, brandAnalysis: any) {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openAIApiKey) {
    console.log('OpenAI API key not configured, using fallback competitors');
    return getFallbackCompetitors(brandAnalysis);
  }

  try {
    console.log(`Using AI to discover competitors for: ${query}`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: `You are a business analyst. Find real competitor companies for this search query: "${query}"

Brand details:
- Name: ${brandAnalysis.brand_name}
- Category: ${brandAnalysis.business_category}
- Niche: ${brandAnalysis.niche}
- URL: ${brandAnalysis.brand_url}

Return JSON with an array of real competitor companies (not the original brand):
{
  "competitors": [
    {
      "name": "Real Company Name",
      "website": "https://realcompany.com",
      "description": "Brief description",
      "category": "${brandAnalysis.business_category}",
      "similarity_score": 85
    }
  ]
}

Requirements:
- Find 2-3 REAL companies that compete in this space
- Include actual websites (not example.com)
- Focus on companies that offer similar services/products
- Don't include the original brand: ${brandAnalysis.brand_name}
- For AI chatbot/marketing tools, include companies like ManyChat, Chatfuel, MobileMonkey, etc.`
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      console.error(`OpenAI API error: ${response.status} ${response.statusText}`);
      return getFallbackCompetitors(brandAnalysis);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Invalid OpenAI response structure');
      return getFallbackCompetitors(brandAnalysis);
    }

    const content = data.choices[0].message.content;
    console.log('Raw AI response:', content);
    
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error('Error parsing AI response as JSON:', parseError);
      console.log('Attempting to extract competitors from text...');
      
      // Try to extract competitor info from non-JSON response
      const competitors = extractCompetitorsFromText(content, brandAnalysis);
      return competitors.length > 0 ? competitors : getFallbackCompetitors(brandAnalysis);
    }
    
    const competitors = result.competitors || [];
    console.log(`AI found ${competitors.length} competitors for "${query}"`);
    
    // If AI returned no competitors, use fallback
    if (competitors.length === 0) {
      console.log('AI returned no competitors, using fallback');
      return getFallbackCompetitors(brandAnalysis);
    }
    
    return competitors;
    
  } catch (error) {
    console.error(`Error using AI for competitor discovery:`, error);
    return getFallbackCompetitors(brandAnalysis);
  }
}

// Extract competitors from non-JSON AI responses
function extractCompetitorsFromText(text: string, brandAnalysis: any) {
  const competitors = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Look for patterns like "- CompanyName (website.com)" or "1. CompanyName - description"
    const patterns = [
      /[-*]\s*([A-Za-z0-9\s]+)\s*\((https?:\/\/[^\)]+)\)/,
      /\d+\.\s*([A-Za-z0-9\s]+)\s*-\s*([^-]+)/,
      /([A-Za-z0-9\s]+)\s*:\s*(https?:\/\/[^\s]+)/
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && competitors.length < 3) {
        competitors.push({
          name: match[1].trim(),
          website: match[2] || `https://${match[1].toLowerCase().replace(/\s+/g, '')}.com`,
          description: match[3] || `${match[1]} competitor`,
          category: brandAnalysis.business_category,
          similarity_score: 80
        });
      }
    }
  }
  
  return competitors;
}

// Provide realistic fallback competitors based on the business category
function getFallbackCompetitors(brandAnalysis: any) {
  console.log('Using fallback competitors for brand:', brandAnalysis.brand_name, 'category:', brandAnalysis.business_category, 'niche:', brandAnalysis.niche);
  
  const categoryCompetitors = {
    'ai chatbot': [
      { name: 'ManyChat', website: 'https://manychat.com', description: 'Leading chatbot platform for marketing automation' },
      { name: 'Chatfuel', website: 'https://chatfuel.com', description: 'Popular Facebook Messenger marketing platform' },
      { name: 'MobileMonkey', website: 'https://mobilemonkey.com', description: 'Chatbot platform for customer engagement' }
    ],
    'facebook ads': [
      { name: 'Hootsuite Ads', website: 'https://hootsuite.com', description: 'Social media advertising management' },
      { name: 'AdEspresso', website: 'https://adespresso.com', description: 'Facebook and Instagram ad optimization' },
      { name: 'Qwaya', website: 'https://qwaya.com', description: 'Facebook advertising tool' }
    ],
    'marketing automation': [
      { name: 'HubSpot', website: 'https://hubspot.com', description: 'Inbound marketing and sales platform' },
      { name: 'Mailchimp', website: 'https://mailchimp.com', description: 'Email marketing and automation' },
      { name: 'ActiveCampaign', website: 'https://activecampaign.com', description: 'Customer experience automation' }
    ],
    'saas': [
      { name: 'Slack', website: 'https://slack.com', description: 'Business communication platform' },
      { name: 'Zoom', website: 'https://zoom.us', description: 'Video conferencing solution' },
      { name: 'Dropbox', website: 'https://dropbox.com', description: 'Cloud storage and collaboration' }
    ],
    'ecommerce': [
      { name: 'Shopify', website: 'https://shopify.com', description: 'E-commerce platform' },
      { name: 'WooCommerce', website: 'https://woocommerce.com', description: 'WordPress e-commerce plugin' },
      { name: 'BigCommerce', website: 'https://bigcommerce.com', description: 'E-commerce software' }
    ],
    'fintech': [
      { name: 'Stripe', website: 'https://stripe.com', description: 'Online payment processing' },
      { name: 'Square', website: 'https://squareup.com', description: 'Point of sale and payment solutions' },
      { name: 'PayPal', website: 'https://paypal.com', description: 'Digital payment platform' }
    ],
    'productivity': [
      { name: 'Notion', website: 'https://notion.so', description: 'All-in-one workspace' },
      { name: 'Trello', website: 'https://trello.com', description: 'Project management tool' },
      { name: 'Asana', website: 'https://asana.com', description: 'Team collaboration and project management' }
    ],
    'default': [
      { name: 'Competitor A', website: 'https://example.com', description: 'Industry competitor' },
      { name: 'Competitor B', website: 'https://example.org', description: 'Market leader' },
      { name: 'Competitor C', website: 'https://example.net', description: 'Emerging player' }
    ]
  };

  // Try to match based on niche or category
  const niche = brandAnalysis.niche?.toLowerCase() || '';
  const category = brandAnalysis.business_category?.toLowerCase() || '';
  const brandName = brandAnalysis.brand_name?.toLowerCase() || '';
  
  console.log('Matching against:', { niche, category, brandName });
  
  let fallbackCompetitors = [];
  
  // More comprehensive matching logic
  if (niche.includes('chatbot') || niche.includes('bot') || category.includes('chatbot') || category.includes('bot')) {
    fallbackCompetitors = categoryCompetitors['ai chatbot'];
  } else if (niche.includes('facebook') || niche.includes('fb') || niche.includes('ads') || category.includes('advertising')) {
    fallbackCompetitors = categoryCompetitors['facebook ads'];
  } else if (category.includes('marketing') || niche.includes('marketing') || niche.includes('automation')) {
    fallbackCompetitors = categoryCompetitors['marketing automation'];
  } else if (category.includes('saas') || category.includes('software') || niche.includes('saas')) {
    fallbackCompetitors = categoryCompetitors['saas'];
  } else if (category.includes('ecommerce') || category.includes('e-commerce') || niche.includes('retail') || niche.includes('shop')) {
    fallbackCompetitors = categoryCompetitors['ecommerce'];
  } else if (category.includes('fintech') || category.includes('finance') || niche.includes('payment') || niche.includes('banking')) {
    fallbackCompetitors = categoryCompetitors['fintech'];
  } else if (category.includes('productivity') || niche.includes('productivity') || niche.includes('project') || niche.includes('management')) {
    fallbackCompetitors = categoryCompetitors['productivity'];
  } else {
    // Use generic competitors instead of defaulting to chatbot
    console.log('No specific category match found, using generic competitors');
    fallbackCompetitors = categoryCompetitors['default'].map(comp => ({
      ...comp,
      name: `${brandAnalysis.business_category || 'Industry'} Competitor ${comp.name.slice(-1)}`,
      description: `${brandAnalysis.business_category || 'Industry'} competitor offering similar services`
    }));
  }

  console.log('Selected fallback competitors:', fallbackCompetitors.map(c => c.name));

  return fallbackCompetitors.map(comp => ({
    ...comp,
    category: brandAnalysis.business_category,
    similarity_score: 75
  }));
}

function removeDuplicates(competitors: any[], originalBrandName: string) {
  const seen = new Set();
  const originalLower = originalBrandName?.toLowerCase() || '';
  
  return competitors.filter(comp => {
    const key = comp.name.toLowerCase();
    if (seen.has(key) || key.includes(originalLower)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
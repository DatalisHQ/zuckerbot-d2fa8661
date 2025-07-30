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

    // Create enhanced search queries based on brand analysis
    const searchQueries = [
      `${brandAnalysis.brand_name} competitors`,
      `alternatives to ${brandAnalysis.brand_name}`,
      `${brandAnalysis.business_category} companies like ${brandAnalysis.brand_name}`,
      `${brandAnalysis.niche} competitors`,
      `best ${brandAnalysis.business_category} platforms`,
      `${brandAnalysis.business_category} ${brandAnalysis.niche} market leaders`
    ].filter(query => query && !query.includes('undefined') && !query.includes('null'));

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
    
    // Enhanced prompt with better instructions for competitor discovery
    const prompt = `You are a business intelligence analyst. I need you to find REAL competitor companies based on this information:

BRAND TO ANALYZE:
- Name: ${brandAnalysis.brand_name}
- Website: ${brandAnalysis.brand_url}
- Category: ${brandAnalysis.business_category}
- Niche: ${brandAnalysis.niche}
- Value Props: ${Array.isArray(brandAnalysis.value_propositions) ? brandAnalysis.value_propositions.join(', ') : brandAnalysis.value_propositions || 'Not specified'}

SEARCH CONTEXT: "${query}"

INSTRUCTIONS:
1. Find 3-5 REAL companies that compete directly with this brand
2. Focus on companies with actual websites and current business operations
3. Look for companies that serve similar customers or solve similar problems
4. DO NOT include the original brand (${brandAnalysis.brand_name}) in results
5. Prioritize well-known, established competitors first
6. Include newer/smaller competitors if relevant

RESPONSE FORMAT - Return ONLY valid JSON (no markdown, no code blocks):
{
  "competitors": [
    {
      "name": "Exact Company Name",
      "website": "https://actualwebsite.com",
      "description": "What they do and how they compete",
      "category": "${brandAnalysis.business_category}",
      "similarity_score": 85
    }
  ]
}

Respond with valid JSON only, no other text.`;

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
            role: 'system',
            content: 'You are a business intelligence analyst who finds real competitor companies. Always respond with valid JSON only, no markdown or code blocks.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.2
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

    let content = data.choices[0].message.content.trim();
    console.log('Raw AI response:', content);
    
    // Fix common JSON parsing issues
    content = cleanJsonResponse(content);
    
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
    
    // Validate and filter competitors
    const validCompetitors = validateCompetitors(competitors, brandAnalysis);
    
    // If AI returned no valid competitors, use fallback
    if (validCompetitors.length === 0) {
      console.log('AI returned no valid competitors, using fallback');
      return getFallbackCompetitors(brandAnalysis);
    }
    
    return validCompetitors;
    
  } catch (error) {
    console.error(`Error using AI for competitor discovery:`, error);
    return getFallbackCompetitors(brandAnalysis);
  }
}

// Clean and fix common JSON response issues
function cleanJsonResponse(content: string): string {
  // Remove markdown code blocks if present
  content = content.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '');
  
  // Remove any text before the first { or after the last }
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    content = content.substring(firstBrace, lastBrace + 1);
  }
  
  return content.trim();
}

// Validate and score competitors
function validateCompetitors(competitors: any[], brandAnalysis: any): any[] {
  const originalBrandLower = brandAnalysis.brand_name?.toLowerCase() || '';
  
  return competitors
    .filter(comp => {
      // Basic validation
      if (!comp.name || !comp.description) return false;
      
      // Don't include the original brand
      if (comp.name.toLowerCase().includes(originalBrandLower)) return false;
      
      // Don't include obviously fake competitors
      if (comp.name.includes('Example') || comp.name.includes('Competitor')) return false;
      
      // Ensure website looks real
      if (comp.website && (comp.website.includes('example.') || comp.website.includes('test.'))) {
        comp.website = `https://${comp.name.toLowerCase().replace(/\s+/g, '')}.com`;
      }
      
      return true;
    })
    .map(comp => ({
      ...comp,
      category: comp.category || brandAnalysis.business_category,
      similarity_score: comp.similarity_score || 80,
      website: comp.website || `https://${comp.name.toLowerCase().replace(/\s+/g, '')}.com`
    }))
    .slice(0, 5); // Limit to 5 competitors per search
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
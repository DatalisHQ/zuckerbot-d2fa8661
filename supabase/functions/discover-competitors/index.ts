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
    console.log('OpenAI API key not configured, using fallback');
    return [];
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
- Don't include the original brand: ${brandAnalysis.brand_name}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    
    console.log(`AI found ${result.competitors?.length || 0} competitors for "${query}"`);
    return result.competitors || [];
    
  } catch (error) {
    console.error(`Error using AI for competitor discovery:`, error);
    return [];
  }
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
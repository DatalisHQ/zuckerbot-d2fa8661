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
        
        // Simple web search simulation - in production you'd use a real search API
        const searchResults = await simulateWebSearch(query, brandAnalysis);
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

// Simulate web search results - in production, replace with real search API
async function simulateWebSearch(query: string, brandAnalysis: any) {
  const competitors = [
    {
      name: "TechFlow Solutions",
      website: "https://techflow.example.com",
      description: "Leading provider of business automation tools",
      category: brandAnalysis.business_category,
      similarity_score: 85
    },
    {
      name: "DataSync Pro",
      website: "https://datasync.example.com", 
      description: "Enterprise data management platform",
      category: brandAnalysis.business_category,
      similarity_score: 78
    },
    {
      name: "CloudOps Central",
      website: "https://cloudops.example.com",
      description: "Cloud infrastructure management solutions",
      category: brandAnalysis.business_category,
      similarity_score: 72
    },
    {
      name: "InnovateTech",
      website: "https://innovatetech.example.com",
      description: "Cutting-edge technology solutions for businesses",
      category: brandAnalysis.business_category,
      similarity_score: 90
    },
    {
      name: "SmartBiz Tools",
      website: "https://smartbiz.example.com",
      description: "AI-powered business intelligence platform",
      category: brandAnalysis.business_category,
      similarity_score: 82
    }
  ];

  // Filter and randomize results based on query
  const queryLower = query.toLowerCase();
  const relevantCompetitors = competitors.filter(comp => 
    comp.category.toLowerCase() === brandAnalysis.business_category?.toLowerCase() ||
    comp.description.toLowerCase().includes(queryLower.split(' ')[0])
  );

  // Return 2-3 random competitors per search
  const shuffled = relevantCompetitors.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(3, shuffled.length));
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
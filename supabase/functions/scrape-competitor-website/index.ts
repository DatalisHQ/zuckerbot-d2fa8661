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
    const { competitorUrl, competitorName, competitorListId, userId } = await req.json();
    
    if (!competitorUrl || !competitorName || !competitorListId || !userId) {
      throw new Error('Missing required parameters: competitorUrl, competitorName, competitorListId, userId');
    }

    console.log('Scraping competitor website:', competitorUrl);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Use Firecrawl API for website scraping
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      throw new Error('Firecrawl API key not configured');
    }

    const scrapeResponse = await fetch('https://api.firecrawl.dev/v0/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: competitorUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        includeTags: ['h1', 'h2', 'h3', 'p', 'meta'],
        excludeTags: ['nav', 'footer', 'script', 'style']
      })
    });

    if (!scrapeResponse.ok) {
      throw new Error(`Firecrawl API error: ${scrapeResponse.statusText}`);
    }

    const scrapeData = await scrapeResponse.json();
    
    if (!scrapeData.success) {
      throw new Error('Failed to scrape website');
    }

    // Extract key information from scraped content
    const content = scrapeData.data.markdown || scrapeData.data.html || '';
    const metadata = scrapeData.data.metadata || {};

    // Use OpenAI to analyze the scraped content
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

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
            content: `You are a brand strategist. Analyze this website content and return JSON:
{
  "niche": "Brand niche",
  "audience": "Target audience", 
  "value_props": ["Value Prop 1", "Value Prop 2", "Value Prop 3"],
  "tone": "Brand tone"
}

Website: ${competitorUrl}
Content: ${content.substring(0, 8000)}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })
    });

    if (!analysisResponse.ok) {
      throw new Error(`OpenAI API error: ${analysisResponse.statusText}`);
    }

    const analysisData = await analysisResponse.json();
    let analysis;
    try {
      analysis = JSON.parse(analysisData.choices[0].message.content);
    } catch (parseError) {
      // Fallback if JSON parsing fails
      analysis = {
        niche: "Unknown",
        audience: "General", 
        value_props: [],
        tone: "Professional"
      };
    }

    // Save competitor profile to database
    const { data: profileData, error: profileError } = await supabase
      .from('competitor_profiles')
      .insert({
        user_id: userId,
        competitor_list_id: competitorListId,
        competitor_name: competitorName,
        competitor_url: competitorUrl,
        scraped_content: content.substring(0, 5000),
        niche: analysis.niche,
        audience: analysis.audience,
        value_props: analysis.value_props,
        tone: analysis.tone
      })
      .select()
      .single();

    if (profileError) {
      console.error('Error saving competitor profile:', profileError);
    }

    const result = {
      success: true,
      data: {
        competitor_profile_id: profileData?.id,
        url: competitorUrl,
        name: competitorName,
        analysis,
        scraped_at: new Date().toISOString()
      }
    };

    console.log('Website analysis completed and saved for:', competitorName);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in scrape-competitor-website:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to scrape website' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
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
    const { competitorUrl } = await req.json();
    
    if (!competitorUrl) {
      throw new Error('Competitor URL is required');
    }

    console.log('Scraping competitor website:', competitorUrl);

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
            role: 'system',
            content: `You are a marketing analyst. Analyze the following website content and extract:
1. Business niche/industry
2. Target audience
3. Brand tone and voice
4. Top 3 value propositions
5. Key messaging themes

Format as JSON with these keys: niche, audience, tone, valuePropositions (array), messagingThemes (array)`
          },
          {
            role: 'user',
            content: `Website: ${competitorUrl}\n\nContent:\n${content.substring(0, 8000)}`
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
        tone: "Professional",
        valuePropositions: [],
        messagingThemes: []
      };
    }

    const result = {
      url: competitorUrl,
      scraped_content: content.substring(0, 5000), // Store first 5k characters
      metadata: {
        title: metadata.title || '',
        description: metadata.description || '',
        ...analysis
      },
      analysis,
      scraped_at: new Date().toISOString()
    };

    console.log('Website analysis completed for:', competitorUrl);

    return new Response(JSON.stringify({ success: true, data: result }), {
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
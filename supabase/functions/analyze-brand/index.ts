import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import FirecrawlApp from 'https://esm.sh/@mendable/firecrawl-js@1.7.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brandUrl, userId } = await req.json();
    
    if (!brandUrl || !userId) {
      throw new Error('Brand URL and user ID are required');
    }

    console.log(`Starting brand analysis for: ${brandUrl}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create initial record
    const { data: brandRecord, error: insertError } = await supabase
      .from('brand_analysis')
      .insert({
        user_id: userId,
        brand_url: brandUrl,
        analysis_status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating brand record:', insertError);
      throw insertError;
    }

    console.log('Created brand record:', brandRecord.id);

    // Initialize Firecrawl
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      throw new Error('Firecrawl API key not configured');
    }

    const firecrawlApp = new FirecrawlApp({ apiKey: firecrawlApiKey });

    // Scrape the website
    console.log('Starting website scrape...');
    const scrapeResult = await firecrawlApp.scrapeUrl(brandUrl, {
      formats: ['markdown', 'html'],
      includeTags: ['h1', 'h2', 'h3', 'p', 'div', 'span'],
      excludeTags: ['script', 'style', 'nav', 'footer'],
    });

    if (!scrapeResult.success) {
      throw new Error(`Failed to scrape website: ${scrapeResult.error}`);
    }

    const scrapedContent = scrapeResult.data?.markdown || scrapeResult.data?.html || '';
    console.log(`Scraped content length: ${scrapedContent.length} characters`);

    // Analyze with OpenAI
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Starting AI analysis...');
    const analysisPrompt = `Analyze the following website content and extract key brand information. Return a JSON object with the following structure:

{
  "brandName": "string",
  "businessCategory": "string", 
  "niche": "string",
  "mainProducts": ["array of main products/services"],
  "valuePropositions": ["array of key value propositions"]
}

Website content:
${scrapedContent.slice(0, 8000)}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a brand analysis expert. Analyze websites and extract key brand information. Always respond with valid JSON only, no additional text.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API error: ${openaiResponse.statusText}`);
    }

    const openaiData = await openaiResponse.json();
    const analysisText = openaiData.choices[0].message.content;
    
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', analysisText);
      throw new Error('Invalid AI response format');
    }

    console.log('Analysis completed:', analysis);

    // Update the record with analysis results
    const { error: updateError } = await supabase
      .from('brand_analysis')
      .update({
        brand_name: analysis.brandName,
        business_category: analysis.businessCategory,
        niche: analysis.niche,
        main_products: analysis.mainProducts,
        value_propositions: analysis.valuePropositions,
        scraped_content: scrapedContent.slice(0, 10000), // Store first 10k chars
        analysis_status: 'completed'
      })
      .eq('id', brandRecord.id);

    if (updateError) {
      console.error('Error updating brand record:', updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysisId: brandRecord.id,
        analysis: analysis
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in analyze-brand function:', error);
    
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
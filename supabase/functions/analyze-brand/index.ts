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

    // Scrape the website using simple fetch
    console.log('Starting website scrape...');
    let scrapedContent = '';
    
    try {
      const response = await fetch(brandUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      console.log(`Fetched HTML length: ${html.length} characters`);
      
      // Simple HTML parsing to extract text content
      // Remove script and style tags
      let cleanedHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      cleanedHtml = cleanedHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      
      // Extract title
      const titleMatch = cleanedHtml.match(/<title[^>]*>([^<]+)</i);
      const title = titleMatch ? titleMatch[1].trim() : '';
      
      // Extract headings
      const headingMatches = cleanedHtml.match(/<h[1-6][^>]*>([^<]+)/gi) || [];
      const headings = headingMatches.map(match => 
        match.replace(/<[^>]*>/g, '').trim()
      ).filter(text => text).slice(0, 15);
      
      // Extract paragraph content
      const paragraphMatches = cleanedHtml.match(/<p[^>]*>([^<]+)/gi) || [];
      const paragraphs = paragraphMatches.map(match => 
        match.replace(/<[^>]*>/g, '').trim()
      ).filter(text => text && text.length > 20).slice(0, 20);
      
      scrapedContent = `
Title: ${title}

Headings:
${headings.join('\n')}

Content:
${paragraphs.join('\n\n')}

URL: ${brandUrl}
`.trim();

      console.log(`Scraped content length: ${scrapedContent.length} characters`);
      
    } catch (fetchError) {
      console.error('Error with website scraping:', fetchError);
      console.log('Proceeding with basic analysis using URL only');
      scrapedContent = `Website URL: ${brandUrl}\nDomain: ${new URL(brandUrl).hostname}`;
    }

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
      // Clean the response text by removing markdown code blocks if present
      let cleanedText = analysisText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      analysis = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', analysisText);
      console.error('Parse error details:', parseError);
      
      // Fallback analysis if parsing fails
      analysis = {
        brandName: "Brand Analysis",
        businessCategory: "General Business",
        niche: "To be determined",
        mainProducts: ["Analysis in progress"],
        valuePropositions: ["Competitive analysis available"]
      };
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
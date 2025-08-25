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

    // Use Firecrawl API for website scraping + screenshot
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      throw new Error('Firecrawl API key not configured');
    }

    // Try Firecrawl first, then gracefully fall back to direct HTML fetch
    let content = '';
    let metadata: any = {};
    try {
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

      if (scrapeResponse.ok) {
        const scrapeData = await scrapeResponse.json();
        if (scrapeData.success) {
          content = scrapeData.data.markdown || scrapeData.data.html || '';
          metadata = scrapeData.data.metadata || {};
        } else {
          console.warn('Firecrawl responded but did not succeed; falling back to direct fetch');
        }
      } else {
        console.warn(`Firecrawl API non-OK (${scrapeResponse.statusText}); falling back to direct fetch`);
      }
    } catch (fcErr) {
      console.warn('Firecrawl failed, using direct HTML fetch fallback:', fcErr);
    }

    // Fallback: direct HTML fetch and simple parsing
    if (!content) {
      try {
        const resp = await fetch(competitorUrl, { method: 'GET' });
        const html = await resp.text();
        // Basic sanitization: strip scripts/styles/nav/footer and compress whitespace
        const cleaned = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[\s\S]*?<\/footer>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        content = cleaned.slice(0, 20000); // keep reasonable size
      } catch (htmlErr) {
        console.error('Direct HTML fetch fallback failed:', htmlErr);
        // As a last resort, keep content empty; analysis will use heuristic fallback later
        content = '';
      }
    }

    // Take screenshot of the homepage using Playwright
    let screenshotUrl = null;
    try {
      const { chromium } = await import("npm:playwright@1.40.0");
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.goto(competitorUrl, { waitUntil: 'networkidle', timeout: 10000 });
      
      const screenshotBuffer = await page.screenshot({ 
        type: 'png',
        fullPage: false 
      });
      
      await browser.close();
      
      // Upload screenshot to Supabase storage
      const fileName = `competitor-screenshots/${competitorName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('user-files')
        .upload(fileName, screenshotBuffer, {
          contentType: 'image/png',
          upsert: true
        });
      
      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage
          .from('user-files')
          .getPublicUrl(fileName);
        screenshotUrl = urlData.publicUrl;
        console.log('Screenshot saved:', screenshotUrl);
      }
    } catch (screenshotError) {
      console.error('Failed to take screenshot:', screenshotError);
      // Continue without screenshot
    }

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
            content: 'You are a detailed brand strategist. Analyze websites and provide comprehensive, actionable insights. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: `Analyze this competitor's website and return CONCISE insights as JSON (2-3 sentences max per field):

{
  "niche": "Brief description of their specific market niche (max 2 sentences)",
  "audience": "Brief description of their target audience (max 2 sentences)", 
  "value_props": ["Concise value prop 1", "Concise value prop 2", "Concise value prop 3"],
  "tone": "Brief description of their brand voice and style (max 2 sentences)"
}

Company: ${competitorName}
Website: ${competitorUrl}
Content Analysis:
${content.substring(0, 6000)}

Be specific but concise. Focus on what makes them unique in 2-3 sentences max per field.`
          }
        ],
        max_tokens: 1200,
        temperature: 0.1
      })
    });

    if (!analysisResponse.ok) {
      throw new Error(`OpenAI API error: ${analysisResponse.statusText}`);
    }

    const analysisData = await analysisResponse.json();
    let analysis;
    try {
      let content = analysisData.choices[0].message.content;
      
      // Clean up the response if it contains markdown code blocks
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      analysis = JSON.parse(content);
      
      // Validate and enhance the analysis
      if (!analysis.niche || analysis.niche === "Unknown" || analysis.niche.length < 10) {
        throw new Error("Insufficient niche analysis");
      }
      if (!analysis.audience || analysis.audience === "General" || analysis.audience.length < 15) {
        throw new Error("Insufficient audience analysis");
      }
      
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      console.log('Raw OpenAI response:', analysisData.choices[0].message.content);
      
      // Enhanced fallback based on content analysis
      const contentLower = content.toLowerCase();
      let detectedNiche = "Business solutions and services";
      let detectedAudience = "Business professionals and decision makers";
      let detectedTone = "Professional and authoritative";
      
      // Simple content-based detection
      if (contentLower.includes('software') || contentLower.includes('app') || contentLower.includes('platform')) {
        detectedNiche = "Software and technology solutions for business optimization";
        detectedAudience = "Tech-savvy business users and software decision makers";
      }
      if (contentLower.includes('marketing') || contentLower.includes('advertis')) {
        detectedNiche = "Marketing and advertising services for business growth";
        detectedAudience = "Marketing professionals and business owners seeking growth";
      }
      if (contentLower.includes('ecommerce') || contentLower.includes('shop') || contentLower.includes('store')) {
        detectedNiche = "E-commerce and retail solutions";
        detectedAudience = "Online retailers and e-commerce business owners";
      }
      
      analysis = {
        niche: detectedNiche,
        audience: detectedAudience,
        value_props: [
          `${competitorName} provides specialized solutions for business needs`,
          "Focus on delivering measurable results and ROI",
          "Streamlined processes and user-friendly approach"
        ],
        tone: detectedTone
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
        tone: analysis.tone,
        screenshot_url: screenshotUrl
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
        analysis: {
          ...analysis,
          screenshot_url: screenshotUrl
        },
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
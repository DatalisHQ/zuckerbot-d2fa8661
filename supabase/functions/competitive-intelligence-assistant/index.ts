import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, competitorData, analysisType, userId } = await req.json();

    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log(`Starting ${action} analysis for competitive intelligence`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let assistant;
    let thread;

    switch (action) {
      case 'create_assistant':
        assistant = await createCompetitiveIntelligenceAssistant();
        return new Response(JSON.stringify({ success: true, assistant }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'analyze_competitor':
        const analysis = await analyzeCompetitorWithAssistant(competitorData, analysisType);
        return new Response(JSON.stringify({ success: true, analysis }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'analyze_ads':
        const adAnalysis = await analyzeAdsWithAssistant(competitorData);
        return new Response(JSON.stringify({ success: true, analysis: adAnalysis }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      default:
        throw new Error('Invalid action specified');
    }

  } catch (error) {
    console.error('Error in competitive-intelligence-assistant:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function createCompetitiveIntelligenceAssistant() {
  const assistantInstructions = `You are a world-class Competitive Intelligence Analyst specializing in digital marketing, advertising analysis, and market positioning. Your expertise includes:

## CORE COMPETENCIES:
1. **Advertising Analysis**: Meta/Facebook ads, Google ads, TikTok ads, creative analysis, messaging strategies
2. **Market Positioning**: Value propositions, target audience identification, competitive differentiation
3. **Pricing Strategy**: Pricing models, competitive pricing analysis, value-based pricing
4. **Feature Analysis**: Product feature comparison, gaps analysis, innovation opportunities
5. **Brand Analysis**: Brand positioning, messaging, visual identity, content strategy

## ANALYSIS FRAMEWORK:
For every analysis, use this structured approach:

### 1. EXECUTIVE SUMMARY
- Key findings in 2-3 bullet points
- Primary competitive threats/opportunities
- Recommended immediate actions

### 2. COMPETITIVE POSITIONING
- Market position relative to competitors
- Unique value propositions
- Differentiation factors
- Target audience overlap

### 3. ADVERTISING INTELLIGENCE
- Ad creative analysis (if ads found)
- Messaging themes and positioning
- Target audience insights from ad content
- Call-to-action analysis
- Budget/spend estimates (if visible)

### 4. PRICING & BUSINESS MODEL
- Pricing strategy analysis
- Business model assessment
- Value proposition mapping
- Revenue model insights

### 5. FEATURE & PRODUCT ANALYSIS
- Core feature comparison
- Innovation gaps
- Technical capabilities
- User experience insights

### 6. STRATEGIC RECOMMENDATIONS
- Specific actionable recommendations
- Priority level (High/Medium/Low)
- Implementation timeframe
- Expected impact

## OUTPUT FORMAT:
Always return structured JSON with these exact keys:
{
  "executiveSummary": {
    "keyFindings": ["finding1", "finding2", "finding3"],
    "primaryThreat": "description",
    "primaryOpportunity": "description",
    "confidenceScore": "0-100%"
  },
  "competitivePositioning": {
    "marketPosition": "description",
    "differentiationFactors": ["factor1", "factor2"],
    "targetAudienceOverlap": "percentage/description",
    "competitiveAdvantages": ["advantage1", "advantage2"],
    "vulnerabilities": ["vulnerability1", "vulnerability2"]
  },
  "advertisingIntelligence": {
    "adStrategy": "description",
    "messagingThemes": ["theme1", "theme2"],
    "targetDemographics": "description", 
    "creativeApproach": "description",
    "estimatedBudget": "range/unknown",
    "adPerformanceSignals": ["signal1", "signal2"]
  },
  "pricingAnalysis": {
    "pricingModel": "description",
    "pricePoints": ["price1", "price2"],
    "valueProposition": "description",
    "competitivePricing": "above/below/similar to market",
    "pricingStrategy": "penetration/premium/value/competitive"
  },
  "featureAnalysis": {
    "coreFeatures": ["feature1", "feature2"],
    "uniqueFeatures": ["feature1", "feature2"], 
    "missingFeatures": ["gap1", "gap2"],
    "technicalCapabilities": "assessment",
    "userExperience": "assessment"
  },
  "strategicRecommendations": [
    {
      "recommendation": "specific action",
      "priority": "High/Medium/Low",
      "timeframe": "immediate/short-term/long-term",
      "expectedImpact": "description",
      "implementation": "how to execute"
    }
  ]
}

## ANALYSIS PRINCIPLES:
- Base insights on actual data provided
- Identify patterns and strategic implications
- Focus on actionable competitive intelligence
- Maintain objectivity while highlighting opportunities
- Consider both immediate tactics and long-term strategy
- Always include confidence levels for uncertain assessments

When analyzing advertising data specifically:
- Look for messaging patterns and positioning themes
- Identify target audience signals from ad content
- Analyze creative approaches and visual strategies
- Assess call-to-action effectiveness
- Evaluate campaign frequency and timing patterns`;

  try {
    const response = await fetch('https://api.openai.com/v1/assistants', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        name: "Competitive Intelligence Analyst",
        instructions: assistantInstructions,
        model: "gpt-4.1-2025-04-14",
        tools: [
          {
            type: "function",
            function: {
              name: "structure_competitive_analysis",
              description: "Structure competitive intelligence analysis into standardized format",
              parameters: {
                type: "object",
                properties: {
                  analysis: {
                    type: "object",
                    description: "Complete competitive analysis following the framework"
                  }
                },
                required: ["analysis"]
              }
            }
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create assistant: ${response.statusText}`);
    }

    const assistant = await response.json();
    console.log('Created competitive intelligence assistant:', assistant.id);
    return assistant;

  } catch (error) {
    console.error('Error creating assistant:', error);
    throw error;
  }
}

async function analyzeCompetitorWithAssistant(competitorData: any, analysisType: string = 'full') {
  try {
    // Create a thread for this analysis
    const threadResponse = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({})
    });

    const thread = await threadResponse.json();
    console.log('Created analysis thread:', thread.id);

    // Add the competitor data to the thread
    const messageContent = `Please analyze this competitor data using your competitive intelligence framework:

COMPETITOR: ${competitorData.competitorName}
WEBSITE: ${competitorData.competitorUrl}

WEBSITE CONTENT:
${competitorData.websiteContent || 'No website content available'}

AD INTELLIGENCE DATA:
${JSON.stringify(competitorData.adIntelligence || {}, null, 2)}

SOCIAL PRESENCE DATA:
${JSON.stringify(competitorData.socialData || {}, null, 2)}

ANALYSIS TYPE: ${analysisType}

Please provide a comprehensive competitive intelligence analysis following your structured framework. Focus especially on advertising insights if ad data is available.`;

    await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        role: 'user',
        content: messageContent
      })
    });

    // Get or create assistant ID (in production, store this)
    const assistant = await createCompetitiveIntelligenceAssistant();

    // Run the analysis
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        assistant_id: assistant.id,
        instructions: "Provide a thorough competitive intelligence analysis using the structured framework. Return valid JSON format."
      })
    });

    const run = await runResponse.json();
    console.log('Started analysis run:', run.id);

    // Poll for completion
    let runStatus = run;
    while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      runStatus = await statusResponse.json();
    }

    if (runStatus.status === 'completed') {
      // Get the analysis result
      const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });

      const messages = await messagesResponse.json();
      const analysisMessage = messages.data[0];
      const analysisContent = analysisMessage.content[0].text.value;

      console.log('Analysis completed successfully');
      
      // Try to parse as JSON, fallback to text if needed
      try {
        return JSON.parse(analysisContent);
      } catch (parseError) {
        console.log('Could not parse as JSON, returning text analysis');
        return { 
          rawAnalysis: analysisContent,
          format: 'text',
          analysisType: analysisType
        };
      }
    } else {
      throw new Error(`Analysis failed with status: ${runStatus.status}`);
    }

  } catch (error) {
    console.error('Error in competitor analysis:', error);
    throw error;
  }
}

async function analyzeAdsWithAssistant(adData: any) {
  const adSpecificPrompt = `You are analyzing competitor advertising data. Focus specifically on:

1. AD CREATIVE ANALYSIS
2. MESSAGING STRATEGY  
3. TARGET AUDIENCE INSIGHTS
4. COMPETITIVE POSITIONING
5. CAMPAIGN PERFORMANCE SIGNALS

AD DATA TO ANALYZE:
${JSON.stringify(adData, null, 2)}

Provide insights specifically focused on advertising intelligence and competitive ad strategy.`;

  return await analyzeCompetitorWithAssistant({ 
    competitorName: adData.competitor_name || 'Unknown',
    adIntelligence: adData 
  }, 'ads_focused');
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

interface ActionCard {
  id: string
  type: 'increase_budget' | 'decrease_budget' | 'reallocate_budget' | 'pause' | 'swap_creative' | 'change_placements'
  entity: {
    type: 'campaign' | 'adset' | 'ad'
    id: string
  }
  title: string
  why: string
  impact_score: number
  payload: Record<string, any>
  creative_suggestions?: {
    headlines: string[]
    primary_texts: string[]
  }
}

interface AuditResponse {
  health: 'healthy' | 'watch' | 'critical'
  actions: ActionCard[]
}

// Rules Engine - Deterministic logic for generating candidate actions
function generateCandidateActions(metricsData: any, entityMetrics: any): ActionCard[] {
  const candidates: ActionCard[] = []
  
  try {
    // Scale winners: ROAS >= 1.3x median AND CPA < median
    const campaigns = entityMetrics.campaigns || []
    const adSets = entityMetrics.adSets || []
    
    if (campaigns.length > 1) {
      const roasValues = campaigns.map(c => c.roas || 0).filter(r => r > 0)
      const cpaValues = campaigns.map(c => c.cpa || 0).filter(c => c > 0)
      
      if (roasValues.length > 0 && cpaValues.length > 0) {
        const medianRoas = roasValues.sort((a, b) => a - b)[Math.floor(roasValues.length / 2)]
        const medianCpa = cpaValues.sort((a, b) => a - b)[Math.floor(cpaValues.length / 2)]
        
        campaigns.forEach((campaign) => {
          if (!campaign.in_learning && campaign.roas >= medianRoas * 1.3 && campaign.cpa < medianCpa && campaign.conversions >= 50) {
            // Don't exceed 30% budget increase
            const maxIncrease = Math.min(campaign.daily_budget * 0.3, 50)
            candidates.push({
              id: `inc_budget_${campaign.id}`,
              type: 'increase_budget',
              entity: { type: 'campaign', id: campaign.id },
              title: `Scale ${campaign.name}`,
              why: `Strong ROAS of ${campaign.roas.toFixed(2)} vs median ${medianRoas.toFixed(2)}`,
              impact_score: 8.5,
              payload: {
                current_budget: campaign.daily_budget,
                new_budget: campaign.daily_budget + maxIncrease,
                increase_amount: maxIncrease
              }
            })
          }
        })
      }
    }
    
    // Creative fatigue: frequency > 3.0 and CTR down >= 30% WoW
    adSets.forEach((adSet) => {
      if (adSet.frequency > 3.0 && adSet.ctr_change_wow <= -0.3) {
        candidates.push({
          id: `swap_creative_${adSet.id}`,
          type: 'swap_creative',
          entity: { type: 'adset', id: adSet.id },
          title: `Refresh Creative for ${adSet.name}`,
          why: `High frequency ${adSet.frequency.toFixed(1)} with CTR drop of ${(adSet.ctr_change_wow * 100).toFixed(0)}%`,
          impact_score: 7.2,
          payload: {
            current_frequency: adSet.frequency,
            ctr_decline: adSet.ctr_change_wow
          }
        })
      }
    })
    
    // Pause underperformers: bottom quartile ROAS with sufficient data
    if (campaigns.length >= 4) {
      const sortedCampaigns = campaigns.filter(c => c.conversions >= 20).sort((a, b) => a.roas - b.roas)
      const bottomQuartile = sortedCampaigns.slice(0, Math.ceil(sortedCampaigns.length * 0.25))
      
      bottomQuartile.forEach((campaign) => {
        if (!campaign.in_learning && campaign.conversions >= 50) {
          candidates.push({
            id: `pause_${campaign.id}`,
            type: 'pause',
            entity: { type: 'campaign', id: campaign.id },
            title: `Pause ${campaign.name}`,
            why: `Bottom quartile ROAS of ${campaign.roas.toFixed(2)} with ${campaign.conversions} conversions`,
            impact_score: 6.8,
            payload: {
              current_roas: campaign.roas,
              conversions: campaign.conversions
            }
          })
        }
      })
    }
    
  } catch (error) {
    console.error('Error in rules engine:', error)
  }
  
  return candidates.slice(0, 8) // Limit to 8 candidates for OpenAI processing
}

// Mock data generator for development
function generateMockMetrics() {
  return {
    summary: {
      total_spend: 2500,
      total_impressions: 145000,
      total_clicks: 3200,
      total_conversions: 85,
      avg_ctr: 2.21,
      avg_cpm: 17.24,
      avg_roas: 3.2
    },
    campaigns: [
      {
        id: 'camp_1',
        name: 'Summer Sale Campaign',
        daily_budget: 100,
        roas: 4.2,
        cpa: 28.50,
        conversions: 65,
        in_learning: false
      },
      {
        id: 'camp_2', 
        name: 'Brand Awareness Drive',
        daily_budget: 75,
        roas: 1.8,
        cpa: 45.20,
        conversions: 22,
        in_learning: false
      }
    ],
    adSets: [
      {
        id: 'adset_1',
        name: 'Lookalike Audience',
        frequency: 3.4,
        ctr_change_wow: -0.35
      },
      {
        id: 'adset_2',
        name: 'Interest Targeting',
        frequency: 2.1,
        ctr_change_wow: 0.12
      }
    ]
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      throw new Error('User not authenticated')
    }

    // Get ad account ID from query params
    const url = new URL(req.url)
    const adAccountId = url.searchParams.get('act')?.trim()
    
    // Handle missing ad account ID with graceful fallback
    if (!adAccountId) {
      return new Response(
        JSON.stringify({
          health: 'watch',
          actions: [],
          placeholders: true,
          message: 'No ad account connected. Connect to see live insights.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate ad account ID format
    if (!/^act_\d+$/.test(adAccountId)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid ad account format. Expected act_<number>.',
          health: 'critical',
          actions: []
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`Dashboard audit requested for user ${user.id}, account ${adAccountId}`)

    // Step A: Pull cached metrics (7d/30d) → if stale, refresh in background
    let metricsData: any = {}
    let entityMetrics: any = {}
    
    // Check cache first
    const { data: cachedData } = await supabaseClient
      .from('fb_metrics_cache')
      .select('*')
      .eq('user_id', user.id)
      .eq('ad_account_id', adAccountId)
      .eq('cache_key', '7d_summary')
      .gt('expires_at', new Date().toISOString())
      .single()

    if (cachedData) {
      console.log('Using cached metrics data')
      metricsData = cachedData.metrics_data
      entityMetrics = cachedData.entity_metrics
    } else {
      console.log('Cache miss or expired, using mock data for development')
      // For development - use mock data
      const mockData = generateMockMetrics()
      metricsData = mockData.summary
      entityMetrics = { 
        campaigns: mockData.campaigns, 
        adSets: mockData.adSets 
      }
      
      // Cache the mock data
      await supabaseClient
        .from('fb_metrics_cache')
        .upsert({
          user_id: user.id,
          ad_account_id: adAccountId,
          cache_key: '7d_summary',
          metrics_data: metricsData,
          entity_metrics: entityMetrics,
          cached_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() // 4 hours
        })
    }

    // Step B: Rules Engine builds candidate actions
    const candidateActions = generateCandidateActions(metricsData, entityMetrics)
    console.log(`Generated ${candidateActions.length} candidate actions`)

    if (candidateActions.length === 0) {
      return new Response(
        JSON.stringify({
          health: 'healthy',
          actions: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step C: Call OpenAI with Structured Outputs
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      console.warn('OpenAI API key not found, returning candidate actions directly')
      return new Response(
        JSON.stringify({
          health: candidateActions.length >= 3 ? 'watch' : 'healthy',
          actions: candidateActions.slice(0, 5)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get brand voice for creative suggestions
    const { data: brandData } = await supabaseClient
      .from('brand_analysis')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    const brandVoice = brandData ? 
      `Brand: ${brandData.brand_name}. Business: ${brandData.business_category}. Value props: ${brandData.value_propositions?.join(', ') || 'N/A'}` :
      'Professional, results-driven tone with clear value propositions'

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
            content: `You are ZuckerBot's Ads Strategist. You receive candidate ad actions with metrics and guardrails already applied. Produce at most 5 Action Cards optimized for ROI. Keep titles imperative and short. Provide a one-sentence "why" with a concrete metric delta. For creative actions, generate 3 headlines and 2 primary texts in the supplied brand voice: ${brandVoice}. Return JSON that exactly matches the provided schema. Never exceed guardrails or invent IDs.`
          },
          {
            role: 'user',
            content: `Candidate actions: ${JSON.stringify(candidateActions)}`
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'audit_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                health: {
                  type: 'string',
                  enum: ['healthy', 'watch', 'critical']
                },
                actions: {
                  type: 'array',
                  maxItems: 5,
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      type: {
                        type: 'string',
                        enum: ['increase_budget', 'decrease_budget', 'reallocate_budget', 'pause', 'swap_creative', 'change_placements']
                      },
                      entity: {
                        type: 'object',
                        properties: {
                          type: { type: 'string', enum: ['campaign', 'adset', 'ad'] },
                          id: { type: 'string' }
                        },
                        required: ['type', 'id']
                      },
                      title: { type: 'string' },
                      why: { type: 'string' },
                      impact_score: { type: 'number' },
                      payload: { type: 'object' },
                      creative_suggestions: {
                        type: 'object',
                        properties: {
                          headlines: {
                            type: 'array',
                            items: { type: 'string' },
                            maxItems: 3
                          },
                          primary_texts: {
                            type: 'array',
                            items: { type: 'string' },
                            maxItems: 2
                          }
                        }
                      }
                    },
                    required: ['id', 'type', 'entity', 'title', 'why', 'impact_score', 'payload']
                  }
                }
              },
              required: ['health', 'actions']
            }
          }
        }
      }),
    })

    if (!openaiResponse.ok) {
      console.error('OpenAI API error:', openaiResponse.status, await openaiResponse.text())
      throw new Error('Failed to process actions with AI')
    }

    const openaiData = await openaiResponse.json()
    const auditResult: AuditResponse = openaiData.choices[0].message.content ? 
      JSON.parse(openaiData.choices[0].message.content) : 
      { health: 'healthy', actions: candidateActions.slice(0, 5) }

    console.log(`Audit completed: ${auditResult.health} status with ${auditResult.actions.length} actions`)

    return new Response(
      JSON.stringify(auditResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in dashboard-audit function:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        health: 'critical',
        actions: []
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
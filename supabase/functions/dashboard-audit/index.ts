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
  comparison?: {
    window_primary: string
    window_baseline: string | null
    deltas: {
      roas: number
      cpa: number
      ctr: number
    }
  }
}

interface AuditResponse {
  health: 'healthy' | 'watch' | 'critical'
  actions: ActionCard[]
}

type WindowKey = '7d' | '30d' | '90d';

// Helper function to get summary data by window
async function getSummary(supabaseClient: any, userId: string, adAccountId: string, windows: WindowKey[]) {
  const summaries: Record<string, any> = {};
  
  for (const window of windows) {
    const { data } = await supabaseClient
      .from('fb_metrics_cache')
      .select('*')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .eq('cache_key', 'summary')
      .eq('time_window', window)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    
    if (data) {
      summaries[window] = data.metrics_data;
    }
  }
  
  return summaries;
}

// Rules Engine with multi-window support
function generateCandidateActions(summaries: Record<string, any>, sevenDayData: any, thirtyDayData: any): ActionCard[] {
  const candidates: ActionCard[] = []
  
  try {
    const seven = sevenDayData || {};
    const thirty = thirtyDayData || {};
    const hasComparison = seven && thirty;
    
    // Calculate deltas if we have both windows
    const deltas = hasComparison ? {
      roas: thirty.roas > 0 ? seven.roas / thirty.roas : 1,
      cpa: thirty.cpa > 0 ? seven.cpa / thirty.cpa : 1,
      ctr: thirty.ctr > 0 ? seven.ctr / thirty.ctr : 1
    } : { roas: 1, cpa: 1, ctr: 1 };

    // Scale winners: 7d ROAS ≥ 1.3x 30d ROAS and 7d CPA < 30d CPA
    if (hasComparison && deltas.roas >= 1.3 && deltas.cpa < 1.0 && thirty.conversions >= 50) {
      const currentBudget = 100; // Default budget for mock data
      const maxIncrease = Math.min(currentBudget * 0.3, 50);
      
      candidates.push({
        id: `scale_winner_account`,
        type: 'increase_budget',
        entity: { type: 'campaign', id: 'mock_campaign_1' },
        title: `Scale High-Performing Campaigns`,
        why: `7d ROAS of ${seven.roas?.toFixed(2)} is ${((deltas.roas - 1) * 100).toFixed(0)}% higher than 30d baseline`,
        impact_score: 8.5,
        payload: {
          current_budget: currentBudget,
          new_budget: currentBudget + maxIncrease,
          increase_amount: maxIncrease
        },
        comparison: {
          window_primary: '7d',
          window_baseline: '30d',
          deltas
        }
      });
    }

    // Reduce waste: 7d ROAS < 0.7x 30d ROAS and significant spend
    if (hasComparison && deltas.roas < 0.7 && seven.spend >= (thirty.spend * 0.2 / 30 * 7)) {
      candidates.push({
        id: `reduce_waste_account`,
        type: 'decrease_budget',
        entity: { type: 'campaign', id: 'mock_campaign_2' },
        title: `Reduce Underperforming Budget`,
        why: `7d ROAS of ${seven.roas?.toFixed(2)} is ${((1 - deltas.roas) * 100).toFixed(0)}% below 30d baseline`,
        impact_score: 7.0,
        payload: {
          current_roas: seven.roas,
          baseline_roas: thirty.roas,
          decline_percent: ((1 - deltas.roas) * 100).toFixed(0)
        },
        comparison: {
          window_primary: '7d',
          window_baseline: '30d',
          deltas
        }
      });
    }

    // Creative fatigue: 7d CTR ≤ 0.7x 30d CTR and high frequency
    if (hasComparison && deltas.ctr <= 0.7 && seven.frequency > 3.0) {
      candidates.push({
        id: `creative_fatigue_account`,
        type: 'swap_creative',
        entity: { type: 'adset', id: 'mock_adset_1' },
        title: `Refresh Creative Assets`,
        why: `7d CTR of ${seven.ctr?.toFixed(2)}% is ${((1 - deltas.ctr) * 100).toFixed(0)}% below baseline with frequency ${seven.frequency?.toFixed(1)}`,
        impact_score: 7.2,
        payload: {
          current_frequency: seven.frequency,
          ctr_decline: ((1 - deltas.ctr) * 100).toFixed(0)
        },
        comparison: {
          window_primary: '7d',
          window_baseline: '30d',
          deltas
        }
      });
    }

    // Learning guardrail: if insufficient data, suggest data collection
    if (thirty.conversions < 50) {
      candidates.push({
        id: `learning_phase_account`,
        type: 'change_placements',
        entity: { type: 'campaign', id: 'mock_campaign_learning' },
        title: `Optimize for Learning`,
        why: `Only ${thirty.conversions || 0} conversions in 30d - need more data before aggressive changes`,
        impact_score: 5.0,
        payload: {
          conversions: thirty.conversions || 0,
          recommendation: 'Continue data collection with current settings'
        },
        comparison: {
          window_primary: '7d',
          window_baseline: '30d',
          deltas
        }
      });
    }
    
  } catch (error) {
    console.error('Error in multi-window rules engine:', error)
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
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const urlObj = new URL(req.url);
    const actParam = urlObj.searchParams.get('act')?.trim();
    const authPresent = !!req.headers.get('Authorization');
    const apikeyPresent = !!req.headers.get('apikey');
    console.log('audit_req_received', { ts: new Date().toISOString(), act_present: !!actParam, auth_present: authPresent, apikey_present: apikeyPresent });
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get current user (handle unauthenticated gracefully)
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      console.log('audit_placeholder_returned', { reason: 'unauthenticated' });
      return new Response(
        JSON.stringify({
          health: 'watch',
          actions: [],
          placeholders: true,
          reason: 'unauthenticated',
          message: 'Sign in to see live insights'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get ad account ID from query params
    const url = new URL(req.url)
    const adAccountId = url.searchParams.get('act')?.trim()
    
    // Handle missing ad account ID with graceful fallback
    if (!adAccountId) {
      console.log('audit_placeholder_returned', { reason: 'no_account' });
      return new Response(
        JSON.stringify({
          health: 'watch',
          actions: [],
          placeholders: true,
          reason: 'no_account',
          message: 'No ad account connected. Connect to see live insights.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate ad account ID format
    if (!/^act_\d+$/.test(adAccountId)) {
      console.log('invalid_input', { reason: 'invalid_act_format', act: adAccountId });
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

    // Step A: Pull cached metrics (7d/30d/90d) → if stale, refresh in background
    const windows: WindowKey[] = ['7d', '30d', '90d'];
    const summaries = await getSummary(supabaseClient, user.id, adAccountId, windows);
    
    console.log('audit_req_received', { windows: Object.keys(summaries) });
    
    let sevenDayData = summaries['7d'];
    let thirtyDayData = summaries['30d'];
    
    // Fallback to mock data if no cached data available
    if (!sevenDayData && !thirtyDayData) {
      console.log('Cache miss for all windows, using mock data for development');
      const mockData = generateMockMetrics();
      
      // Create mock window data with realistic deltas
      sevenDayData = {
        ...mockData.summary,
        roas: mockData.summary.avg_roas * 1.2, // 7d performing 20% better
        ctr: mockData.summary.avg_ctr * 0.9,   // 7d CTR down 10%
        frequency: 3.2,
        conversions: 25
      };
      
      thirtyDayData = {
        ...mockData.summary,
        roas: mockData.summary.avg_roas,
        ctr: mockData.summary.avg_ctr,
        frequency: 2.8,
        conversions: 75
      };
      
      // Cache the mock data for both windows
      await Promise.all([
        supabaseClient.from('fb_metrics_cache').upsert({
          user_id: user.id,
          ad_account_id: adAccountId,
          cache_key: 'summary',
          time_window: '7d',
          metrics_data: sevenDayData,
          entity_metrics: { campaigns: mockData.campaigns, adSets: mockData.adSets },
          cached_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
        }),
        supabaseClient.from('fb_metrics_cache').upsert({
          user_id: user.id,
          ad_account_id: adAccountId,
          cache_key: 'summary',
          time_window: '30d',
          metrics_data: thirtyDayData,
          entity_metrics: { campaigns: mockData.campaigns, adSets: mockData.adSets },
          cached_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
        })
      ]);
    }

    // Step B: Rules Engine builds candidate actions using multi-window analysis
    const candidateActions = generateCandidateActions(summaries, sevenDayData, thirtyDayData);
    console.log('rules', { 
      scale_winner: candidateActions.filter(a => a.id.includes('scale')).length,
      reduce_waste: candidateActions.filter(a => a.id.includes('waste')).length,
      creative_fatigue: candidateActions.filter(a => a.id.includes('creative')).length
    });
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
      console.warn('OpenAI API key missing; returning placeholder');
      console.log('audit_placeholder_returned', { reason: 'config_missing' });
      return new Response(
        JSON.stringify({
          health: 'watch',
          actions: [],
          placeholders: true,
          reason: 'config_missing',
          message: 'Temporarily unavailable'
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
      .maybeSingle()

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
      const errText = await openaiResponse.text()
      console.error('OpenAI API error:', openaiResponse.status, errText)
      console.log('audit_placeholder_returned', { reason: 'ai_unavailable' });
      return new Response(
        JSON.stringify({
          health: 'watch',
          actions: candidateActions.slice(0, 5),
          placeholders: true,
          reason: 'ai_unavailable',
          message: 'AI refinement unavailable. Showing raw recommendations.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const openaiData = await openaiResponse.json()
    const auditResult: AuditResponse = openaiData.choices[0].message.content ? 
      JSON.parse(openaiData.choices[0].message.content) : 
      { health: 'healthy', actions: candidateActions.slice(0, 5) }

    console.log(`Audit completed: ${auditResult.health} status with ${auditResult.actions.length} actions`)
    console.log('audit_success', { health: auditResult.health, actions: auditResult.actions.length });

    return new Response(
      JSON.stringify(auditResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const err: any = error;
    console.error('audit_internal_error', { msg: err?.message, name: err?.name, stack: err?.stack?.slice(0,500) });
    return new Response(
      JSON.stringify({ 
        error: err?.message || 'Internal error',
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
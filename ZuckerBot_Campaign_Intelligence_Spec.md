# ZuckerBot Campaign Intelligence Layer — Codex Build Spec

## Problem Statement

ZuckerBot's campaign creation currently defaults to narrow, generic targeting (single city, 50km radius, basic interest targeting). This produces mediocre campaigns that don't reflect the business's actual historical data, market position, or conversion patterns.

Three things need to change:

1. **Smart Targeting** — Campaign creation must be informed by historical ad data, CRM pipeline data, market research, and user input. Not hardcoded defaults.
2. **Creative Handoff** — ZuckerBot handles campaign strategy and technical management. An external creative tool (like Sophiie's Ad Factory) handles creative production. ZuckerBot suggests angles, the user approves, creative is produced externally, then ZuckerBot receives the finished assets and uploads them into the correct ad sets with corresponding copy.
3. **LAL Audience Management** — ZuckerBot must be able to create, manage, and refresh Lookalike audiences programmatically via Meta's API.

All of this must be per-business and work for ANY business, not just Sophiie.

---

## Part 1: Campaign Intelligence Layer

### Current Flow (broken):
```
User calls create_campaign(url, budget) 
  → Claude generates generic strategy 
  → Returns narrow targeting + basic copy
```

### New Flow:
```
User calls create_campaign(url, budget)
  → ZuckerBot pulls historical account insights (if available)
  → ZuckerBot pulls market research for the business category
  → ZuckerBot pulls CRM pipeline data (if CAPI configured)
  → ZuckerBot pulls business profile (markets, currency, portfolio config)
  → All context is assembled into a structured brief
  → Brief is fed to Claude with a tight campaign planning prompt
  → Claude generates an informed strategy with:
     - Audience architecture (which tiers, which geos, broad vs LAL vs retargeting)
     - Budget allocation across tiers
     - Suggested creative angles (based on what's worked historically)
     - Targeting parameters informed by actual data
  → User reviews and approves the strategy
  → Strategy is passed to creative tool for production
  → Finished creative returns to ZuckerBot for upload and launch
```

### 1a. Campaign Context Assembly

Before Claude generates any strategy, ZuckerBot assembles a context object from all available data sources:

```typescript
interface CampaignContext {
  // Business basics (from businesses table)
  business: {
    name: string;
    url: string;
    type: string;           // 'saas', 'local_services', 'ecommerce'
    markets: string[];      // ['AU', 'UK', 'NZ', 'US']
    currency: string;       // 'AUD'
    deal_value?: number;    // From CAPI config
  };

  // Historical performance (from Meta via get_account_insights)
  // Only populated if business has historical data
  historical?: {
    months_of_data: number;
    total_spend: number;
    total_leads: number;
    avg_cpl: number;
    best_cpl_month: { month: string; cpl: number; spend: number; leads: number };
    worst_cpl_month: { month: string; cpl: number; spend: number; leads: number };
    sweet_spot: { month: string; cpl: number; spend: number; leads: number; ctr: number };
    cpl_trend: 'improving' | 'stable' | 'degrading';
    ctr_trend: 'improving' | 'stable' | 'degrading';
    frequency_issues: boolean;  // Any month >3.0
    current_monthly_spend: number;
    current_cpl: number;
  };

  // CRM pipeline data (from HubSpot/CRM via CAPI config)
  // Only populated if CAPI is configured
  pipeline?: {
    total_leads: number;
    total_customers: number;
    lead_to_customer_rate: number;
    cost_per_customer: number;
    customers_by_country: Record<string, number>;   // {'AU': 292, 'NZ': 12, 'UK': 0}
    customers_by_industry: Record<string, number>;  // {'Construction & Trades': 171}
    top_converting_segments: string[];
    non_converting_segments: string[];  // e.g., UK has 578 leads, 0 customers
  };

  // Market research (from research endpoint)
  market?: {
    competition_level: string;
    estimated_avg_cpl: number;
    estimated_avg_cpc: number;
    key_players: string[];
    opportunities: string[];
    recommended_positioning: string;
  };

  // Existing portfolio config (if set up)
  portfolio?: {
    template: string;
    tiers: AudienceTier[];
    total_daily_budget: number;
  };

  // User-provided goals for this campaign
  goals: {
    target_monthly_leads?: number;
    target_cpl?: number;
    target_monthly_budget?: number;
    growth_multiplier?: number;  // e.g., "3-5x current leads"
    markets_to_target?: string[];
    exclude_markets?: string[];
  };
}
```

### 1b. Campaign Planning Prompt (fed to Claude)

This is the key — a structured prompt that uses all the assembled context to generate an informed strategy. This replaces the current generic campaign generation.

```typescript
function buildCampaignPlanningPrompt(ctx: CampaignContext): string {
  let prompt = `You are a senior performance marketing strategist creating a Meta Ads campaign plan.

## Business Context
- Name: ${ctx.business.name}
- Type: ${ctx.business.type}
- URL: ${ctx.business.url}
- Target Markets: ${ctx.business.markets.join(', ')}
- Currency: ${ctx.business.currency}
${ctx.business.deal_value ? `- Average Deal Value: $${ctx.business.deal_value}/month` : ''}
`;

  if (ctx.historical) {
    prompt += `
## Historical Ad Performance (${ctx.historical.months_of_data} months of data)
- Total Spend: $${ctx.historical.total_spend.toLocaleString()}
- Total Leads: ${ctx.historical.total_leads.toLocaleString()}
- Average CPL: $${ctx.historical.avg_cpl.toFixed(2)}
- Current Monthly Spend: $${ctx.historical.current_monthly_spend.toLocaleString()}
- Current CPL: $${ctx.historical.current_cpl.toFixed(2)}
- CPL Trend: ${ctx.historical.cpl_trend}
- CTR Trend: ${ctx.historical.ctr_trend}
- Frequency Issues: ${ctx.historical.frequency_issues ? 'YES — audience saturation detected' : 'No'}
- Best Month: ${ctx.historical.sweet_spot.month} — $${ctx.historical.sweet_spot.cpl.toFixed(2)} CPL at $${ctx.historical.sweet_spot.spend.toLocaleString()} spend
`;
  } else {
    prompt += `
## Historical Data: NONE (new advertiser)
This is a new business with no historical Meta ad data. Use market benchmarks for planning.
`;
  }

  if (ctx.pipeline) {
    prompt += `
## CRM Pipeline Data (Paid Social Attribution)
- Lead → Customer Conversion Rate: ${(ctx.pipeline.lead_to_customer_rate * 100).toFixed(1)}%
- Cost Per Customer: $${ctx.pipeline.cost_per_customer.toFixed(2)}
- Customers by Country: ${JSON.stringify(ctx.pipeline.customers_by_country)}
- Top Converting Segments: ${ctx.pipeline.top_converting_segments.join(', ')}
${ctx.pipeline.non_converting_segments.length > 0 ? `- ⚠️ NON-CONVERTING SEGMENTS: ${ctx.pipeline.non_converting_segments.join(', ')} — DO NOT allocate significant budget to these markets without fixing the conversion pipeline first.` : ''}
`;
  }

  if (ctx.market) {
    prompt += `
## Market Research
- Competition Level: ${ctx.market.competition_level}
- Estimated Market CPL: $${(ctx.market.estimated_avg_cpl / 100).toFixed(2)}
- Key Players: ${ctx.market.key_players.join(', ')}
- Positioning: ${ctx.market.recommended_positioning}
`;
  }

  prompt += `
## Campaign Goals
${ctx.goals.target_monthly_leads ? `- Target: ${ctx.goals.target_monthly_leads} leads/month` : ''}
${ctx.goals.target_cpl ? `- Target CPL: $${ctx.goals.target_cpl}` : ''}
${ctx.goals.target_monthly_budget ? `- Monthly Budget: $${ctx.goals.target_monthly_budget}` : ''}
${ctx.goals.growth_multiplier ? `- Growth Target: ${ctx.goals.growth_multiplier}x current lead volume` : ''}
${ctx.goals.markets_to_target ? `- Markets: ${ctx.goals.markets_to_target.join(', ')}` : ''}
${ctx.goals.exclude_markets ? `- Exclude: ${ctx.goals.exclude_markets.join(', ')}` : ''}

## Your Task
Generate a campaign plan as JSON with the following structure:
{
  "strategy_summary": "One paragraph explaining the overall approach",
  "audience_tiers": [
    {
      "tier_name": "string — e.g., 'AU Broad ADV+'",
      "tier_type": "prospecting_broad | prospecting_lal | retargeting | reactivation",
      "geo": ["AU"],
      "targeting_type": "broad | interest | lal | custom",
      "targeting_details": "Description of targeting approach",
      "age_min": 25,
      "age_max": 55,
      "daily_budget_cents": 15000,
      "budget_pct": 40,
      "expected_cpl": 45.00,
      "rationale": "Why this tier and budget allocation"
    }
  ],
  "creative_angles": [
    {
      "angle_name": "string — e.g., 'Missed Call Anxiety'",
      "hook": "First 3 seconds hook concept",
      "message": "Core message/pain point",
      "cta": "Call to action",
      "format": "video_ugc | video_reel | static_image | static_audio",
      "rationale": "Why this angle, backed by data if available",
      "variants_recommended": 3
    }
  ],
  "total_daily_budget_cents": 50000,
  "total_monthly_budget": 150000,
  "projected_monthly_leads": 3000,
  "projected_cpl": 50.00,
  "warnings": ["Any risks or caveats"],
  "phase_1_actions": ["Immediate actions for week 1"],
  "phase_2_actions": ["Actions for weeks 2-3"],
  "phase_3_actions": ["Actions for week 4+"]
}

IMPORTANT RULES:
- If historical data shows a market generates leads but zero customers (e.g., UK), flag it as a warning and allocate minimal budget unless the user explicitly requests it.
- If frequency is above 3.0, recommend audience expansion or new geos.
- If CTR is declining, recommend fresh creative as a priority.
- For businesses with no historical data, use conservative budgets and broad targeting.
- Budget allocation should reflect what the DATA says works, not generic best practices.
- Creative angles should be informed by historical top performers if available.
- All targeting should be broad/ADV+ by default unless there's specific data suggesting interest targeting works better for this business.
- LAL audiences should only be recommended if the business has enough customer data to seed them (100+ customers minimum).
`;

  return prompt;
}
```

### 1c. New Campaign Creation Flow

```typescript
// Enhanced POST /api/v1/campaigns/create

async function createCampaign(req: NextRequest) {
  const { url, budget_daily_cents, goals } = await req.json();
  const business = await getBusinessFromApiKey(req);

  // Step 1: Assemble context from all available sources
  const context: CampaignContext = {
    business: {
      name: business.name,
      url,
      type: business.business_type || 'unknown',
      markets: business.markets || ['US'],
      currency: business.currency || 'USD',
      deal_value: await getDealValueFromCAPI(business.id),
    },
    goals: goals || {},
  };

  // Step 2: Pull historical insights (if available)
  try {
    const insights = await getAccountInsights(business, {
      date_from: twelveMonthsAgo(),
      date_to: today(),
      time_increment: 'monthly',
    });
    context.historical = summariseHistoricalData(insights);
  } catch (e) {
    // No historical data — new advertiser, that's fine
  }

  // Step 3: Pull CRM pipeline data (if CAPI configured)
  const capiConfig = await getCAPIConfig(business.id);
  if (capiConfig?.is_enabled) {
    context.pipeline = await getPipelineMetrics(business.id, capiConfig);
  }

  // Step 4: Pull market research
  try {
    context.market = await getMarketResearch(
      business.business_type || detectBusinessType(url),
      business.markets?.[0] || 'US'
    );
  } catch (e) {
    // Market research failed — proceed without it
  }

  // Step 5: Check existing portfolio
  context.portfolio = await getActivePortfolio(business.id);

  // Step 6: Generate strategy via Claude
  const prompt = buildCampaignPlanningPrompt(context);
  const strategy = await callClaude(prompt);

  // Step 7: Store as draft campaign with full context
  const campaign = await supabase.from('campaigns').insert({
    business_id: business.id,
    user_id: business.user_id,
    status: 'draft',
    strategy: strategy,
    context: context,  // Store the full context for auditability
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    id: campaign.id,
    status: 'draft',
    strategy: strategy,
    context_summary: {
      has_historical_data: !!context.historical,
      has_crm_data: !!context.pipeline,
      has_market_data: !!context.market,
      months_of_data: context.historical?.months_of_data || 0,
    },
    next_steps: [
      'Review the strategy and audience tiers',
      'Approve or modify creative angles',
      'Generate creative assets (video/static) using your creative tool',
      'Upload finished assets back to ZuckerBot for launch'
    ],
  });
}
```

---

## Part 2: Creative Handoff Protocol

### The Separation of Concerns:
- **ZuckerBot** → Strategy, targeting, budget, audience management, ad copy, campaign management
- **External Creative Tool** (Ad Factory, Canva, whatever) → Video/image production
- **User** → Approves angles, approves creative, approves campaign details

### 2a. Creative Brief Output

When ZuckerBot generates a campaign strategy, the `creative_angles` array serves as the brief for the external creative tool. The user takes these angles and produces creative externally.

### 2b. Creative Upload Endpoint

After creative is produced externally and approved by the user, it needs to come back to ZuckerBot for upload to Meta and insertion into the correct ad sets.

**New endpoint: `POST /api/v1/campaigns/:id/upload-creative`**

```typescript
interface CreativeUploadRequest {
  campaign_id: string;
  tier_name: string;          // Which audience tier this creative is for
  creatives: Array<{
    // Video or image asset
    asset_url: string;        // Cloudinary/CDN URL of the finished video or image
    asset_type: 'video' | 'image';
    
    // Ad copy (generated by ZuckerBot or edited by user)
    headline: string;
    body: string;
    cta: string;              // 'Learn More', 'Sign Up', 'Get Quote', etc.
    link_url: string;         // Landing page URL
    
    // Metadata
    angle_name: string;       // Maps back to the creative_angles from strategy
    variant_index: number;    // Which variant of this angle (0, 1, 2)
  }>;
}

// What it does:
// 1. Uploads video/image to Meta ad account via Marketing API
// 2. Waits for Meta to finish processing the asset
// 3. Creates an ad creative with the provided copy
// 4. Inserts a PAUSED ad into the correct ad set (based on tier_name)
// 5. Returns the Meta ad IDs for tracking
// 6. Sends Slack notification: "3 new creatives uploaded for [campaign]. Ready to activate."
```

### 2c. Ad Factory Integration (Specific)

For businesses using the Sophiie Ad Factory (or any n8n-webhook-based creative tool), add an optional integration:

```typescript
// Optional: POST /api/v1/campaigns/:id/request-creative
// Sends the creative brief to an external creative tool webhook

interface CreativeRequest {
  campaign_id: string;
  callback_url: string;       // ZuckerBot endpoint to receive finished assets
  angles: Array<{
    angle_name: string;
    hook: string;
    message: string;
    cta: string;
    variants: number;         // How many variants to generate
  }>;
  market: string;             // 'AU', 'UK', etc.
  product_focus: string;      // 'Full Product', 'Missed Calls', etc.
  font_preset?: string;       // Ad Factory specific
}

// The external tool processes the request and calls back:
// POST /api/v1/campaigns/:id/creative-callback
// with the finished asset URLs and metadata
```

### 2d. MCP Tools for Creative Flow

```typescript
// Suggest creative angles based on campaign context
{
  name: "zuckerbot_suggest_angles",
  description: "Suggest creative angles for a campaign based on historical performance data, market research, and business context. Returns angle names, hooks, messages, and recommended formats. These angles can be used as a brief for external creative production.",
  inputSchema: {
    type: "object",
    properties: {
      campaign_id: { type: "string", description: "Campaign ID to suggest angles for" },
      num_angles: { type: "number", description: "Number of angles to suggest (default: 5)" }
    },
    required: ["campaign_id"]
  }
}

// Upload finished creative assets to a campaign
{
  name: "zuckerbot_upload_creative",
  description: "Upload finished creative assets (video/image URLs) to a ZuckerBot campaign. Assets are uploaded to Meta, paired with ad copy, and inserted as paused ads in the correct ad set. Assets must already be hosted on a CDN (Cloudinary, S3, etc.).",
  inputSchema: {
    type: "object",
    properties: {
      campaign_id: { type: "string" },
      tier_name: { type: "string", description: "Audience tier this creative is for" },
      asset_url: { type: "string", description: "CDN URL of the video or image" },
      asset_type: { type: "string", enum: ["video", "image"] },
      headline: { type: "string" },
      body: { type: "string" },
      cta: { type: "string" },
      link_url: { type: "string" },
      angle_name: { type: "string" }
    },
    required: ["campaign_id", "asset_url", "asset_type", "headline", "body"]
  }
}
```

---

## Part 3: Programmatic LAL Audience Management

### 3a. LAL Audience Lifecycle

ZuckerBot needs to manage the full lifecycle of Lookalike audiences:

1. **Create seed audiences** from CAPI customer/SQL data
2. **Build LALs** from those seeds at configurable percentages (1%, 3%, 5%)
3. **Assign LALs** to campaigns/ad sets
4. **Refresh seeds** periodically as new customers flow in
5. **Retire LALs** that have saturated (frequency > threshold)

### 3b. API Endpoints

```
POST /api/v1/audiences/create-seed    — Create a custom audience from CAPI events
POST /api/v1/audiences/create-lal     — Create a LAL from a seed audience
GET  /api/v1/audiences/list           — List all audiences (seeds + LALs) for a business
POST /api/v1/audiences/refresh        — Refresh a seed audience with latest CAPI data
DELETE /api/v1/audiences/:id          — Delete an audience from Meta
GET  /api/v1/audiences/:id/status     — Check audience size and delivery status
```

### 3c. Seed Audience Creation from CAPI

```typescript
async function createSeedAudience(
  business: Business,
  config: {
    name: string;
    source_stage: string;       // 'customer', 'salesqualifiedlead', etc.
    lookback_days: number;      // How far back to pull contacts
    min_contacts?: number;      // Minimum contacts required (default: 100)
  }
) {
  // 1. Pull contacts from capi_events that match the source stage
  const { data: events } = await supabase
    .from('capi_events')
    .select('email_hash, meta_event_name, source_stage')
    .eq('business_id', business.id)
    .eq('source_stage', config.source_stage)
    .gte('created_at', daysAgo(config.lookback_days))
    .eq('status', 'sent');

  if (events.length < (config.min_contacts || 100)) {
    return {
      ok: false,
      error: `Insufficient contacts: ${events.length} found, ${config.min_contacts || 100} required.`,
      suggestion: 'Wait for more CAPI events to accumulate, or use a broader source stage.'
    };
  }

  // 2. Create Custom Audience on Meta
  const audience = await fetch(
    `https://graph.facebook.com/v21.0/act_${business.meta_ad_account_id}/customaudiences`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: `ZB_${config.name}_${new Date().toISOString().slice(0, 10)}`,
        subtype: 'CUSTOM',
        description: `Auto-generated by ZuckerBot from ${config.source_stage} events`,
        customer_file_source: 'USER_PROVIDED_ONLY',
        access_token: business.facebook_access_token,
      })
    }
  );

  const audienceData = await audience.json();

  // 3. Upload hashed emails to the audience
  // CAPI events already store hashed emails — use those directly
  const emailHashes = events.map(e => e.email_hash).filter(Boolean);

  await uploadUsersToAudience(
    audienceData.id,
    emailHashes,
    business.facebook_access_token
  );

  // 4. Store in local database
  await supabase.from('managed_audiences').insert({
    id: gen_random_uuid(),
    business_id: business.id,
    user_id: business.user_id,
    meta_audience_id: audienceData.id,
    name: config.name,
    audience_type: 'seed',
    source_stage: config.source_stage,
    lookback_days: config.lookback_days,
    contact_count: emailHashes.length,
    last_refreshed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  return { ok: true, audience_id: audienceData.id, contacts: emailHashes.length };
}
```

### 3d. LAL Creation from Seed

```typescript
async function createLALAudience(
  business: Business,
  config: {
    seed_audience_id: string;   // Meta audience ID of the seed
    seed_name: string;
    countries: string[];        // ['AU', 'GB', 'NZ']
    percentage: number;         // 1-10
  }
) {
  const lal = await fetch(
    `https://graph.facebook.com/v21.0/act_${business.meta_ad_account_id}/customaudiences`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: `ZB_LAL_${config.percentage}pct_${config.seed_name}_${config.countries.join('_')}`,
        subtype: 'LOOKALIKE',
        origin_audience_id: config.seed_audience_id,
        lookalike_spec: JSON.stringify({
          type: 'similarity',
          ratio: config.percentage / 100,
          country: config.countries.join(','),
        }),
        access_token: business.facebook_access_token,
      })
    }
  );

  const lalData = await lal.json();

  await supabase.from('managed_audiences').insert({
    id: gen_random_uuid(),
    business_id: business.id,
    user_id: business.user_id,
    meta_audience_id: lalData.id,
    name: `LAL ${config.percentage}% ${config.seed_name} (${config.countries.join(', ')})`,
    audience_type: 'lookalike',
    parent_audience_id: config.seed_audience_id,
    percentage: config.percentage,
    countries: config.countries,
    created_at: new Date().toISOString(),
  });

  return { ok: true, lal_audience_id: lalData.id };
}
```

### 3e. Managed Audiences Table

```sql
CREATE TABLE IF NOT EXISTS public.managed_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_audience_id text NOT NULL,
  name text NOT NULL,
  audience_type text NOT NULL,  -- 'seed', 'lookalike', 'retargeting'
  source_stage text,            -- For seeds: 'customer', 'salesqualifiedlead', etc.
  parent_audience_id text,      -- For LALs: the seed audience ID
  percentage integer,           -- For LALs: 1-10
  countries text[],             -- For LALs: target countries
  lookback_days integer,        -- For seeds: how far back
  contact_count integer,
  estimated_reach integer,      -- From Meta's audience size estimate
  last_refreshed_at timestamptz,
  status text DEFAULT 'active', -- active, expired, refreshing, error
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_managed_audiences_business ON public.managed_audiences(business_id);
CREATE INDEX idx_managed_audiences_type ON public.managed_audiences(audience_type);
```

### 3f. MCP Tools for Audience Management

```typescript
{
  name: "zuckerbot_create_audience",
  description: "Create a seed custom audience from CAPI conversion events (customers, SQLs, etc.) or a Lookalike audience from an existing seed. Seed audiences require minimum 100 contacts.",
  inputSchema: {
    type: "object",
    properties: {
      audience_type: { type: "string", enum: ["seed", "lookalike"] },
      name: { type: "string" },
      // For seeds:
      source_stage: { type: "string", description: "CRM stage to pull contacts from (e.g., 'customer', 'salesqualifiedlead')" },
      lookback_days: { type: "number", description: "How many days back to pull contacts (default: 180)" },
      // For LALs:
      seed_audience_id: { type: "string", description: "Meta audience ID of the seed" },
      countries: { type: "array", items: { type: "string" }, description: "Target countries (e.g., ['AU', 'UK'])" },
      percentage: { type: "number", description: "LAL percentage 1-10" }
    },
    required: ["audience_type", "name"]
  }
}

{
  name: "zuckerbot_list_audiences",
  description: "List all managed audiences (seeds + LALs) for the current business.",
  inputSchema: { type: "object", properties: {} }
}

{
  name: "zuckerbot_refresh_audience",
  description: "Refresh a seed audience with the latest CAPI conversion data. Also triggers refresh of any LALs built from this seed.",
  inputSchema: {
    type: "object",
    properties: {
      audience_id: { type: "string", description: "Managed audience ID" }
    },
    required: ["audience_id"]
  }
}
```

---

## Part 4: Updated Campaign Creation MCP Tool

The existing `zuckerbot_create_campaign` tool needs to accept goals and return the intelligent strategy:

```typescript
{
  name: "zuckerbot_create_campaign",
  description: "Create a campaign with intelligent strategy informed by historical ad data, CRM pipeline, and market research. Returns audience tiers, budget allocation, creative angle suggestions, and projected performance. All targeting is auto-determined from business data — no manual geo/interest input needed.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Business website URL" },
      budget_daily_cents: { type: "integer", description: "Total daily budget in cents" },
      objective: { type: "string", enum: ["leads", "traffic", "conversions", "awareness"] },
      // NEW: Goals that inform the intelligence layer
      target_cpl: { type: "number", description: "Target cost per lead" },
      target_monthly_leads: { type: "number", description: "Target number of leads per month" },
      growth_multiplier: { type: "number", description: "Desired growth vs current (e.g., 3 for 3x)" },
      markets: { type: "array", items: { type: "string" }, description: "Override target markets" },
      exclude_markets: { type: "array", items: { type: "string" }, description: "Markets to exclude" },
    },
    required: ["url"]
  }
}
```

---

## Build Order

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | Campaign context assembly (pull historical + CRM + market data) | 4-6 hrs | Foundation for everything |
| 2 | Campaign planning prompt (structured Claude prompt) | 2-3 hrs | Makes strategies intelligent |
| 3 | Creative upload endpoint + MCP tool | 4-6 hrs | Enables Ad Factory handoff |
| 4 | managed_audiences table + seed creation from CAPI | 4-6 hrs | Enables LAL management |
| 5 | LAL creation + refresh endpoints | 3-4 hrs | Completes audience lifecycle |
| 6 | MCP tools (suggest_angles, upload_creative, audiences) | 2-3 hrs | Makes it all accessible |
| 7 | Creative callback endpoint for external tools | 2-3 hrs | Optional webhook integration |

**Total: 3-5 days focused Codex work**

---

## Codex Prompt

```
Refactor ZuckerBot's campaign creation to use an intelligent planning layer.

## Campaign Intelligence

When creating a campaign, ZuckerBot must first assemble context from:
1. Historical Meta account insights (via existing get_account_insights)
2. CRM pipeline data from capi_events (if CAPI is configured)
3. Market research (via existing research endpoint)
4. Business profile (markets, currency, deal value from businesses table)

Assemble this into a CampaignContext object, then feed it to Claude via a 
structured prompt that generates: audience tiers with budget allocation, 
creative angle suggestions, targeting parameters, and projected performance.

The key principle: targeting decisions should be DATA-DRIVEN, not generic defaults.
If historical data shows a market has leads but zero customers, flag it.
If frequency is above 3.0, recommend audience expansion.
If CTR is declining, prioritise fresh creative.
For new businesses with no data, use conservative broad targeting.

## Creative Handoff

Add POST /api/v1/campaigns/:id/upload-creative endpoint that:
1. Accepts finished creative assets (video/image CDN URLs) + ad copy
2. Uploads the asset to Meta via Marketing API
3. Creates an ad creative with the provided copy
4. Inserts a PAUSED ad into the correct ad set
5. Sends Slack notification

Add MCP tools: zuckerbot_suggest_angles, zuckerbot_upload_creative

## LAL Audience Management

Add managed_audiences table (business_id, meta_audience_id, audience_type, 
source_stage, parent_audience_id, percentage, countries, contact_count, status).

Add endpoints:
- POST /api/v1/audiences/create-seed (from CAPI events, min 100 contacts)
- POST /api/v1/audiences/create-lal (from seed, configurable % and countries)
- GET /api/v1/audiences/list
- POST /api/v1/audiences/refresh
- GET /api/v1/audiences/:id/status

Add MCP tools: zuckerbot_create_audience, zuckerbot_list_audiences, 
zuckerbot_refresh_audience

## Key Principle
All of this must work for ANY business. The campaign intelligence layer uses 
whatever data is available — a new business with zero history gets conservative 
broad targeting. A business with 12 months of data and CAPI configured gets 
a fully-informed strategy with data-backed targeting and LAL recommendations.
```

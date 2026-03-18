# ZuckerBot: Audience Architecture & CAPI System — Codex Build Spec

## Context

This spec adds two major features to ZuckerBot that make it a genuine agency replacement:

1. **Audience Architecture** — A portfolio management system that coordinates multiple audience tiers (LAL, Broad, Retargeting, Custom) as a single strategy, with automated budget allocation across tiers.

2. **CAPI (Conversions API) Integration** — A webhook-driven pipeline that feeds downstream conversion events (MQL, SQL, Opportunity, Customer) from HubSpot to Meta's Conversions API, enabling Meta to optimize for actual business outcomes instead of just form fills.

### Why This Matters (Sophiie Data)

Current paid social funnel from HubSpot:
- 6,449 paid social contacts → 3,973 leads → 848 MQL → 477 SQL → 328 customers
- Lead → Customer conversion: 8.3%
- Current CPL: ~$67 AUD (last 3 months)
- Real CAC: ~$807 per customer
- Deal value: $300/mo (need ~2.7 months to recover CAC)

If Meta optimises for customers instead of form fills, even a modest improvement in lead quality (8.3% → 12% conversion) would cut CAC by ~30% without increasing spend.

---

## Part 1: CAPI Integration (HubSpot → ZuckerBot → Meta)

### Architecture

```
HubSpot Workflow (lifecycle stage change)
    ↓
HubSpot Webhook → POST /api/v1/capi/events
    ↓
ZuckerBot validates + enriches event data
    ↓
Meta Conversions API (POST /act_{id}/events)
    ↓
Meta's algorithm receives downstream signal
    ↓
Ad delivery optimises for higher-quality leads
```

### 1a. New Endpoint: Receive HubSpot Webhook Events

**`POST /api/v1/capi/events`**

This is the main ingestion endpoint. HubSpot sends a webhook when a contact's lifecycle stage changes, and ZuckerBot forwards it to Meta CAPI.

```typescript
// api/v1/capi/events.ts

interface CAPIEvent {
  // Required
  event_name: string;        // 'Lead' | 'MQL' | 'SQL' | 'Opportunity' | 'Purchase'
  event_time: number;        // Unix timestamp
  
  // User identification (at least one required for Meta matching)
  email?: string;            // Hashed before sending to Meta
  phone?: string;            // Hashed before sending to Meta
  first_name?: string;       // Hashed
  last_name?: string;        // Hashed
  
  // Attribution
  fbclid?: string;           // Facebook click ID (from UTM or cookie)
  fbc?: string;              // Facebook browser cookie
  fbp?: string;              // Facebook pixel cookie
  
  // Context
  hubspot_contact_id?: string;
  lifecycle_stage?: string;
  source_campaign?: string;
  deal_value?: number;
  
  // Business identification
  business_id?: string;      // ZuckerBot business ID
  api_key?: string;          // Resolved from Authorization header
}

export async function POST(req: NextRequest) {
  const events = await req.json();
  
  // 1. Resolve business from API key
  const business = await getBusinessFromApiKey(req);
  
  // 2. Map HubSpot lifecycle stage to Meta event name
  const metaEventName = mapLifecycleToMetaEvent(events.lifecycle_stage);
  
  // 3. Hash PII fields (SHA-256, lowercase, trimmed)
  const hashedUserData = hashUserData(events);
  
  // 4. Send to Meta Conversions API
  const metaPayload = {
    data: [{
      event_name: metaEventName,
      event_time: events.event_time || Math.floor(Date.now() / 1000),
      event_source_url: events.source_url || 'https://sophiie.ai',
      action_source: 'website',
      user_data: {
        em: hashedUserData.email,       // SHA-256 hashed
        ph: hashedUserData.phone,       // SHA-256 hashed
        fn: hashedUserData.first_name,  // SHA-256 hashed
        ln: hashedUserData.last_name,   // SHA-256 hashed
        fbc: events.fbc,               // Facebook click cookie
        fbp: events.fbp,               // Facebook pixel cookie
        client_ip_address: events.ip,
        client_user_agent: events.user_agent,
      },
      custom_data: {
        currency: 'AUD',
        value: events.deal_value || 0,
        lifecycle_stage: events.lifecycle_stage,
        hubspot_contact_id: events.hubspot_contact_id,
      }
    }],
    // Optional: test_event_code for debugging (remove in production)
    // test_event_code: 'TEST12345'
  };
  
  const metaResponse = await fetch(
    `https://graph.facebook.com/v21.0/${business.meta_pixel_id}/events`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...metaPayload,
        access_token: business.facebook_access_token
      })
    }
  );
  
  // 5. Log the event
  await supabase.from('capi_events').insert({
    business_id: business.id,
    event_name: metaEventName,
    hubspot_contact_id: events.hubspot_contact_id,
    lifecycle_stage: events.lifecycle_stage,
    meta_response: await metaResponse.json(),
    created_at: new Date().toISOString()
  });
  
  return NextResponse.json({ success: true });
}
```

### 1b. Lifecycle Stage → Meta Event Mapping

```typescript
function mapLifecycleToMetaEvent(lifecycleStage: string): string {
  const mapping: Record<string, string> = {
    'lead':                    'Lead',
    'marketingqualifiedlead':  'Lead',           // MQL maps to Lead (standard event)
    'salesqualifiedlead':      'Contact',         // SQL maps to Contact
    'opportunity':             'InitiateCheckout', // Opportunity maps to InitiateCheckout
    'customer':                'Purchase',         // Customer maps to Purchase
  };
  return mapping[lifecycleStage] || 'Lead';
}

// Why these mappings:
// - Meta recognises standard events (Lead, Contact, Purchase, etc.)
// - Custom events work too, but standard events get better algorithmic treatment
// - 'Purchase' is the gold signal — this tells Meta "this person became a paying customer"
// - 'InitiateCheckout' for Opportunity signals high intent without full conversion
```

### 1c. CAPI Events Log Table

```sql
CREATE TABLE IF NOT EXISTS public.capi_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  hubspot_contact_id text,
  lifecycle_stage text,
  email_hash text,              -- SHA-256 hash only, never store PII
  meta_response jsonb,
  meta_event_id text,           -- From Meta's response
  match_quality text,           -- Meta's match quality score
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_capi_events_business ON public.capi_events(business_id);
CREATE INDEX idx_capi_events_created ON public.capi_events(created_at);
CREATE INDEX idx_capi_events_stage ON public.capi_events(lifecycle_stage);

ALTER TABLE public.capi_events ENABLE ROW LEVEL SECURITY;
```

### 1d. HubSpot Webhook Configuration

In HubSpot, create a workflow for each lifecycle stage transition:

**Workflow 1: Contact becomes MQL**
- Trigger: Lifecycle stage = Marketing Qualified Lead
- Action: Send webhook to `https://zuckerbot.ai/api/v1/capi/events`
- Body:
```json
{
  "event_name": "MQL",
  "lifecycle_stage": "marketingqualifiedlead",
  "email": "{{contact.email}}",
  "phone": "{{contact.phone}}",
  "first_name": "{{contact.firstname}}",
  "last_name": "{{contact.lastname}}",
  "hubspot_contact_id": "{{contact.hs_object_id}}",
  "source_campaign": "{{contact.hs_analytics_first_touch_converting_campaign}}",
  "event_time": "{{now}}"
}
```

**Workflow 2: Contact becomes SQL** (same pattern, different stage)
**Workflow 3: Contact becomes Opportunity**
**Workflow 4: Contact becomes Customer** (include deal value)

### 1e. MCP Tool: CAPI Status Dashboard

Add `zuckerbot_capi_status` to see how events are flowing:

```typescript
{
  name: "zuckerbot_capi_status",
  description: "Get CAPI event delivery stats for a business. Shows events sent to Meta by type, match quality, and any errors.",
  inputSchema: {
    type: "object",
    properties: {
      days: {
        type: "number",
        description: "Number of days to look back (default: 7)"
      }
    }
  }
}
```

### 1f. Pixel ID Storage

The businesses table needs a `meta_pixel_id` column for CAPI to work. Check if this already exists (migration `20260314_add_pixel_id_to_businesses.sql` suggests it does).

If not:
```sql
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS meta_pixel_id text;
```

---

## Part 2: Audience Architecture

### Concept

Instead of managing individual campaigns in isolation, ZuckerBot manages a **portfolio** of audience tiers. Each tier serves a different purpose in the funnel, and budget flows between them based on performance.

### 2a. Audience Tier System

```typescript
interface AudienceTier {
  tier: 'prospecting_broad' | 'prospecting_lal' | 'prospecting_interest' | 'retargeting' | 'reactivation';
  description: string;
  budget_allocation_pct: number;  // % of total daily budget
  target_cpa: number;             // Tier-specific CPA target
  audience_config: AudienceConfig;
}

// Default portfolio for a trade-service SaaS like Sophiie:
const DEFAULT_PORTFOLIO: AudienceTier[] = [
  {
    tier: 'prospecting_broad',
    description: 'Broad/ADV+ targeting. Highest scale, relies on Meta algorithm + CAPI signals.',
    budget_allocation_pct: 40,
    target_cpa: 55,
    audience_config: {
      type: 'advantage_plus',
      geo: ['AU', 'UK', 'NZ', 'US'],
      age_min: 25,
      age_max: 55,
      // No interest targeting — let Meta find the audience via CAPI
    }
  },
  {
    tier: 'prospecting_lal',
    description: 'Lookalike audiences seeded from high-value conversions (SQLs, Customers).',
    budget_allocation_pct: 30,
    target_cpa: 45,
    audience_config: {
      type: 'lookalike',
      seed_sources: [
        { name: 'customers_lal_1pct', source: 'capi_purchase_events', percentage: 1 },
        { name: 'sql_lal_1pct', source: 'capi_contact_events', percentage: 1 },
        { name: 'customers_lal_3pct', source: 'capi_purchase_events', percentage: 3 },
      ],
      geo: ['AU', 'UK'],
    }
  },
  {
    tier: 'retargeting',
    description: 'Warm audiences: website visitors, engaged leads, video viewers.',
    budget_allocation_pct: 20,
    target_cpa: 30,
    audience_config: {
      type: 'custom_audience',
      sources: [
        { name: 'website_visitors_30d', source: 'pixel', retention_days: 30 },
        { name: 'video_viewers_75pct', source: 'engagement', engagement_type: 'video_view_75' },
        { name: 'lead_form_openers', source: 'engagement', engagement_type: 'lead_form_opened' },
      ],
      exclusions: ['existing_customers'],
    }
  },
  {
    tier: 'reactivation',
    description: 'Churned or paused customers. Win-back campaigns.',
    budget_allocation_pct: 10,
    target_cpa: 40,
    audience_config: {
      type: 'custom_audience',
      sources: [
        { name: 'churned_customers', source: 'capi', lifecycle_stage: 'churned' },
        { name: 'paused_subscriptions', source: 'capi', lifecycle_stage: 'paused' },
      ],
    }
  },
];
```

### 2b. Portfolio Table

```sql
CREATE TABLE IF NOT EXISTS public.audience_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default Portfolio',
  total_daily_budget_cents integer NOT NULL DEFAULT 500000, -- $5000/day in cents
  tiers jsonb NOT NULL,                  -- Array of AudienceTier objects
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audience_tier_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.audience_portfolios(id) ON DELETE CASCADE,
  tier text NOT NULL,                     -- 'prospecting_broad', 'prospecting_lal', etc.
  campaign_id uuid REFERENCES public.campaigns(id),
  meta_campaign_id text,
  meta_adset_id text,
  meta_audience_id text,                  -- Custom/LAL audience ID on Meta
  daily_budget_cents integer,
  status text DEFAULT 'draft',            -- draft, active, paused, completed
  performance_data jsonb,                 -- Latest metrics snapshot
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tier_campaigns_portfolio ON public.audience_tier_campaigns(portfolio_id);
CREATE INDEX idx_tier_campaigns_tier ON public.audience_tier_campaigns(tier);
```

### 2c. Portfolio Manager (Autonomous)

The autonomous loop gets a new evaluation layer that operates at the portfolio level:

```typescript
// In the autonomous evaluate function, add portfolio-level logic:

async function evaluatePortfolio(business_id: string) {
  const portfolio = await getActivePortfolio(business_id);
  if (!portfolio) return [];
  
  const actions: Action[] = [];
  const tierMetrics = await getMetricsPerTier(portfolio);
  
  for (const tier of portfolio.tiers) {
    const metrics = tierMetrics[tier.tier];
    if (!metrics) continue;
    
    // 1. Budget rebalancing: shift budget from underperforming tiers to winners
    if (metrics.cpa > tier.target_cpa * 1.5) {
      // This tier is overspending — reduce by 20%
      const savedBudget = metrics.daily_budget * 0.2;
      actions.push({
        type: 'reduce_budget',
        tier: tier.tier,
        reason: `${tier.tier} CPA $${metrics.cpa} exceeds target $${tier.target_cpa} by 50%+`,
        budget_change_cents: -savedBudget,
      });
      
      // Find the best-performing tier to receive the rebalanced budget
      const bestTier = findBestPerformingTier(tierMetrics, portfolio.tiers);
      if (bestTier) {
        actions.push({
          type: 'increase_budget',
          tier: bestTier.tier,
          reason: `Rebalancing $${savedBudget/100} from ${tier.tier} to ${bestTier.tier}`,
          budget_change_cents: savedBudget,
        });
      }
    }
    
    // 2. LAL audience refresh: if LAL performance degrades, rebuild with fresh seed data
    if (tier.tier === 'prospecting_lal' && metrics.frequency > 2.5) {
      actions.push({
        type: 'refresh_audience',
        tier: tier.tier,
        reason: `LAL frequency ${metrics.frequency} too high — audience saturated`,
        action_detail: 'Rebuild LAL from latest CAPI conversion data'
      });
    }
    
    // 3. Retargeting pool check: ensure retargeting audiences are being refilled
    if (tier.tier === 'retargeting' && metrics.reach < 1000) {
      actions.push({
        type: 'alert',
        tier: tier.tier,
        reason: 'Retargeting pool too small (<1000). Prospecting tiers may need more budget to refill the pool.',
      });
    }
  }
  
  return actions;
}
```

### 2d. New API Endpoints

```
POST /api/v1/portfolios/create          — Create a new audience portfolio
GET  /api/v1/portfolios/:id             — Get portfolio with tier performance
PUT  /api/v1/portfolios/:id             — Update portfolio config (tiers, budgets)
POST /api/v1/portfolios/:id/rebalance   — Manually trigger budget rebalancing
POST /api/v1/portfolios/:id/launch      — Launch all tier campaigns on Meta
GET  /api/v1/portfolios/:id/performance — Aggregated performance across all tiers
```

### 2e. MCP Tools

```typescript
// New MCP tools for audience management:

{
  name: "zuckerbot_create_portfolio",
  description: "Create an audience portfolio with budget allocation across tiers (broad, LAL, retargeting, reactivation). Returns a draft portfolio ready for review.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Business URL" },
      total_daily_budget_cents: { type: "number", description: "Total daily budget in cents across all tiers" },
      markets: { type: "array", items: { type: "string" }, description: "Target markets (e.g., ['AU', 'UK'])" },
    },
    required: ["url", "total_daily_budget_cents"]
  }
}

{
  name: "zuckerbot_portfolio_performance",
  description: "Get performance metrics for each audience tier in a portfolio. Shows spend, leads, CPA, and budget allocation efficiency.",
  inputSchema: {
    type: "object",
    properties: {
      portfolio_id: { type: "string" }
    },
    required: ["portfolio_id"]
  }
}

{
  name: "zuckerbot_rebalance_portfolio",
  description: "Trigger budget rebalancing across audience tiers based on current performance. Shifts budget from underperformers to winners.",
  inputSchema: {
    type: "object",
    properties: {
      portfolio_id: { type: "string" },
      dry_run: { type: "boolean", description: "Preview changes without executing" }
    },
    required: ["portfolio_id"]
  }
}
```

### 2f. LAL Audience Creation via Meta API

```typescript
// Creating a Lookalike Audience from CAPI events:

async function createLookalikeAudience(
  business: Business,
  seedSource: string,  // 'capi_purchase_events' or 'capi_contact_events'  
  percentage: number,  // 1-10
  countries: string[], // ['AU', 'GB']
) {
  // Step 1: Create a Custom Audience from CAPI events
  const customAudience = await fetch(
    `https://graph.facebook.com/v21.0/act_${business.meta_ad_account_id}/customaudiences`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: `ZB_${seedSource}_seed_${new Date().toISOString().slice(0,10)}`,
        subtype: 'CUSTOM',
        description: `Auto-generated seed audience from ${seedSource}`,
        customer_file_source: 'USER_PROVIDED_ONLY',
        access_token: business.facebook_access_token,
      })
    }
  );
  
  // Step 2: Upload hashed user data to the custom audience
  // (Pull emails/phones from capi_events table, hash them)
  const seedUsers = await getSeedUsersFromCAPI(business.id, seedSource);
  await uploadUsersToAudience(customAudience.id, seedUsers, business);
  
  // Step 3: Create Lookalike from the seed
  const lalAudience = await fetch(
    `https://graph.facebook.com/v21.0/act_${business.meta_ad_account_id}/customaudiences`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: `ZB_LAL_${percentage}pct_${seedSource}`,
        subtype: 'LOOKALIKE',
        origin_audience_id: customAudience.id,
        lookalike_spec: JSON.stringify({
          type: 'similarity',
          ratio: percentage / 100,  // 0.01 = 1%
          country: countries.join(','),
        }),
        access_token: business.facebook_access_token,
      })
    }
  );
  
  return lalAudience;
}
```

---

## Part 3: Connecting CAPI + Audience Architecture

The real power is when these two systems talk to each other:

1. **CAPI events feed LAL seed audiences.** Every time a contact becomes a Customer via CAPI, that contact is added to the LAL seed audience. The LAL audience automatically improves over time as more customers flow through.

2. **CAPI events optimise campaign delivery.** Meta's algorithm uses the CAPI events to understand which leads are high-value. Campaigns optimising for 'Purchase' (customer) events will naturally deliver to higher-quality prospects.

3. **Portfolio rebalancing uses CAPI data.** Instead of just optimising for CPL (form fills), the autonomous loop can optimise for **cost per SQL** or **cost per customer** using CAPI event data. This is the killer feature.

```typescript
// Enhanced autonomous evaluation using CAPI conversion data:

async function evaluateWithCAPI(campaign_id: string, business_id: string) {
  // Get standard Meta metrics
  const metaMetrics = await getCampaignMetrics(campaign_id);
  
  // Get CAPI downstream conversion data
  const capiMetrics = await supabase
    .from('capi_events')
    .select('lifecycle_stage')
    .eq('business_id', business_id)
    .gte('created_at', thirtyDaysAgo());
  
  // Calculate true cost metrics
  const costPerSQL = metaMetrics.spend / capiMetrics.filter(e => e.lifecycle_stage === 'salesqualifiedlead').length;
  const costPerCustomer = metaMetrics.spend / capiMetrics.filter(e => e.lifecycle_stage === 'customer').length;
  
  // A campaign with high CPL but low cost-per-customer is GOOD
  // A campaign with low CPL but high cost-per-customer is BAD
  // This is the insight that separates smart optimisation from dumb CPL chasing
  
  return {
    ...metaMetrics,
    cost_per_sql: costPerSQL,
    cost_per_customer: costPerCustomer,
    lead_to_customer_rate: capiMetrics.customerCount / capiMetrics.leadCount,
  };
}
```

---

## Build Order

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | CAPI events endpoint + capi_events table | 4-6 hrs | Immediate signal improvement to Meta |
| 2 | HubSpot webhook setup (4 workflows) | 1-2 hrs | Feeds events to endpoint |
| 3 | Audience portfolio table + API | 4-6 hrs | Foundation for tier management |
| 4 | LAL audience creation from CAPI seeds | 3-4 hrs | Better audiences from better data |
| 5 | Portfolio-level autonomous evaluation | 4-6 hrs | Budget rebalancing across tiers |
| 6 | MCP tools for portfolio management | 2-3 hrs | Manage from Claude/MCP clients |
| 7 | CAPI-enhanced cost metrics in evaluation | 2-3 hrs | Optimise for customers, not form fills |

**Total estimate: 3-5 days of focused Codex work.**

---

## Codex Prompts

### For Task 1 (CAPI Endpoint):
```
Add a Meta Conversions API integration to ZuckerBot.

Build POST /api/v1/capi/events endpoint that:
1. Receives webhook events from HubSpot with contact lifecycle stage changes
2. Maps lifecycle stages to Meta standard events (lead→Lead, sql→Contact, customer→Purchase)
3. Hashes all PII (email, phone, name) with SHA-256 before sending
4. Sends events to Meta Conversions API at POST /act_{pixel_id}/events
5. Logs all events to a new capi_events table

Use the business's meta_pixel_id and facebook_access_token from the businesses table.
Create the capi_events table migration with: business_id, event_name, hubspot_contact_id, 
lifecycle_stage, email_hash, meta_response, meta_event_id, match_quality, created_at.

Also add an MCP tool zuckerbot_capi_status that returns event delivery stats 
(counts by event type, match quality scores, any errors) for the last N days.
```

### For Task 3 (Audience Portfolio):
```
Add an audience portfolio system to ZuckerBot.

A portfolio is a coordinated set of audience tiers (broad, LAL, retargeting, reactivation) 
with budget allocation across them. Create:

1. audience_portfolios table (business_id, name, total_daily_budget_cents, tiers JSONB, is_active)
2. audience_tier_campaigns table (portfolio_id, tier, campaign_id, meta_campaign_id, 
   meta_adset_id, meta_audience_id, daily_budget_cents, status, performance_data)
3. API endpoints:
   - POST /api/v1/portfolios/create
   - GET /api/v1/portfolios/:id
   - PUT /api/v1/portfolios/:id
   - POST /api/v1/portfolios/:id/rebalance (shift budget from underperformers to winners)
   - GET /api/v1/portfolios/:id/performance
4. MCP tools: zuckerbot_create_portfolio, zuckerbot_portfolio_performance, zuckerbot_rebalance_portfolio

The rebalance logic should:
- Reduce budget 20% on tiers with CPA > 1.5x their target
- Increase budget on the best-performing tier by the same amount
- Alert if retargeting pool is too small (<1000 reach)
- Flag LAL audiences for refresh when frequency > 2.5
```

---

## Sophiie-Specific Configuration

### CAPI Event Thresholds (for Sophiie)
| HubSpot Stage | Meta Event | Custom Data |
|--------------|------------|-------------|
| Lead | Lead | `{value: 0, currency: 'AUD'}` |
| MQL | Lead | `{value: 50, currency: 'AUD'}` |
| SQL | Contact | `{value: 150, currency: 'AUD'}` |
| Opportunity | InitiateCheckout | `{value: 250, currency: 'AUD'}` |
| Customer | Purchase | `{value: 300, currency: 'AUD'}` |

### Default Portfolio (for Sophiie)
| Tier | Budget % | Daily Budget | Target CPA | Markets |
|------|----------|-------------|------------|---------|
| Broad ADV+ | 40% | $2,000 | $55 | AU, UK, NZ, US |
| LAL (Customer-seeded) | 30% | $1,500 | $45 | AU, UK |
| Retargeting | 20% | $1,000 | $30 | All |
| Reactivation (churned) | 10% | $500 | $40 | All |
| **Total** | **100%** | **$5,000/day** | | |

At $5,000/day = $150,000/month. At blended $45 CPL = 3,333 leads/month (3.4x current).

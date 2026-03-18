# ZuckerBot Audience & CAPI Spec — ADDENDUM: Per-Business Configuration

## CRITICAL: Nothing is hardcoded to Sophiie or any specific business

Every threshold, mapping, and budget allocation in the main spec MUST be
configurable per business. The system ships with sensible defaults that
businesses can override during setup.

---

## 1. CAPI Configuration Table (NEW)

Instead of hardcoding lifecycle stage mappings, store them per business:

```sql
CREATE TABLE IF NOT EXISTS public.capi_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  
  -- Lifecycle stage → Meta event mapping (fully customisable)
  -- Default shown below, but every business can override
  event_mapping jsonb NOT NULL DEFAULT '{
    "lead": {"meta_event": "Lead", "value": 0},
    "marketingqualifiedlead": {"meta_event": "Lead", "value": 0},
    "salesqualifiedlead": {"meta_event": "Contact", "value": 0},
    "opportunity": {"meta_event": "InitiateCheckout", "value": 0},
    "customer": {"meta_event": "Purchase", "value": 0}
  }'::jsonb,
  
  -- Currency for event values
  currency text NOT NULL DEFAULT 'USD',
  
  -- Webhook secret for validating inbound HubSpot webhooks
  webhook_secret text,
  
  -- Source CRM (future-proofing for Salesforce, Pipedrive, etc.)
  crm_source text NOT NULL DEFAULT 'hubspot',
  
  -- What to optimise for: 'lead', 'sql', 'customer'
  -- This controls which CAPI event the autonomous loop uses for CPA calculations
  optimise_for text NOT NULL DEFAULT 'lead',
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Why this matters:
- A plumber might have: Lead → Customer (2 stages, no MQL/SQL)
- A SaaS company might have: Lead → MQL → SQL → Opportunity → Customer (5 stages)
- An ecommerce business might have: ViewContent → AddToCart → Purchase (completely different)
- Deal values vary from $50 to $50,000

The `event_mapping` JSONB lets any business define their own pipeline stages
and what Meta event each maps to, without touching code.

### API Endpoints:
```
GET  /api/v1/capi/config           — Get CAPI config for current business
PUT  /api/v1/capi/config           — Update CAPI config (event mappings, currency, optimise_for)
POST /api/v1/capi/config/test      — Send a test event to verify Meta receives it
GET  /api/v1/capi/status           — Event delivery stats (last 7/30 days)
```

### MCP Tools:
```
zuckerbot_capi_config       — View/update CAPI configuration for a business
zuckerbot_capi_status       — Event delivery stats and match quality
zuckerbot_capi_test         — Send a test event to Meta
```

### Onboarding Flow:
When a new business connects their CRM, the system should:
1. Detect CRM type (HubSpot, Salesforce, etc.)
2. Pull their lifecycle stages / pipeline stages automatically
3. Suggest a default mapping (Lead→Lead, Customer→Purchase, etc.)
4. Let the user confirm or customise before enabling
5. Ask for their average deal value to populate event values

---

## 2. Audience Portfolio Templates (NOT hardcoded defaults)

Instead of one default portfolio, ship multiple templates:

```sql
CREATE TABLE IF NOT EXISTS public.portfolio_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,               -- 'SaaS', 'Local Services', 'Ecommerce', 'Custom'
  description text,
  business_type text,                -- Used for auto-suggestion
  tiers jsonb NOT NULL,              -- Default tier config for this template
  is_system boolean DEFAULT true,    -- System templates can't be deleted
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed system templates
INSERT INTO public.portfolio_templates (name, description, business_type, tiers) VALUES
(
  'SaaS / B2B',
  'Optimised for software and subscription businesses with longer sales cycles.',
  'saas',
  '[
    {"tier": "prospecting_broad", "budget_pct": 40, "target_cpa_multiplier": 1.1, "description": "Broad/ADV+ targeting"},
    {"tier": "prospecting_lal", "budget_pct": 30, "target_cpa_multiplier": 0.9, "description": "LAL from customers/SQLs"},
    {"tier": "retargeting", "budget_pct": 20, "target_cpa_multiplier": 0.6, "description": "Website visitors, engaged leads"},
    {"tier": "reactivation", "budget_pct": 10, "target_cpa_multiplier": 0.8, "description": "Churned/paused customers"}
  ]'::jsonb
),
(
  'Local Services',
  'Optimised for location-based service businesses (trades, medical, legal).',
  'local_services',
  '[
    {"tier": "prospecting_broad", "budget_pct": 50, "target_cpa_multiplier": 1.0, "description": "Broad local targeting"},
    {"tier": "prospecting_lal", "budget_pct": 25, "target_cpa_multiplier": 0.8, "description": "LAL from booked customers"},
    {"tier": "retargeting", "budget_pct": 25, "target_cpa_multiplier": 0.5, "description": "Website visitors, form abandoners"}
  ]'::jsonb
),
(
  'Ecommerce',
  'Optimised for online stores with direct purchase conversion.',
  'ecommerce',
  '[
    {"tier": "prospecting_broad", "budget_pct": 35, "target_cpa_multiplier": 1.2, "description": "Broad/interest targeting"},
    {"tier": "prospecting_lal", "budget_pct": 25, "target_cpa_multiplier": 0.9, "description": "LAL from purchasers"},
    {"tier": "retargeting", "budget_pct": 30, "target_cpa_multiplier": 0.5, "description": "Cart abandoners, product viewers"},
    {"tier": "reactivation", "budget_pct": 10, "target_cpa_multiplier": 0.7, "description": "Past purchasers, lapsed customers"}
  ]'::jsonb
),
(
  'Custom',
  'Start from scratch with your own tier configuration.',
  'custom',
  '[]'::jsonb
);
```

### Key design decisions:
- `target_cpa_multiplier` instead of absolute CPA. Each tier's target CPA = 
  business's base target CPA × multiplier. So if a business sets target CPA = $50,
  the retargeting tier auto-targets $30 (0.6 × $50). This scales across businesses.
- Budget percentages are defaults that can be overridden per business.
- Businesses pick a template during onboarding, then customise.

---

## 3. Enhanced Autonomous Policy (per-business, zero hardcoding)

The existing `autonomous_policies` table already supports per-business config.
Add these fields for CAPI-enhanced evaluation:

```sql
ALTER TABLE public.autonomous_policies
  ADD COLUMN IF NOT EXISTS optimise_for text DEFAULT 'lead',
  -- Options: 'lead' (CPL), 'sql' (cost per SQL), 'customer' (CAC)
  -- Only 'sql' and 'customer' require CAPI to be enabled
  
  ADD COLUMN IF NOT EXISTS capi_lookback_days integer DEFAULT 30,
  -- How many days of CAPI data to use for downstream conversion analysis
  
  ADD COLUMN IF NOT EXISTS min_spend_before_evaluation_cents integer DEFAULT 500,
  -- Minimum spend before a campaign is evaluated ($5 default)
  
  ADD COLUMN IF NOT EXISTS evaluation_frequency_hours integer DEFAULT 4;
  -- How often the autonomous loop runs (default 4h, some businesses want hourly)
```

### Evaluation logic becomes:
```
IF business has CAPI enabled AND optimise_for = 'customer':
    Use cost_per_customer for pause/scale decisions
ELSE IF business has CAPI enabled AND optimise_for = 'sql':
    Use cost_per_sql for pause/scale decisions
ELSE:
    Use CPL (form fills) — the default, no CAPI required
```

This means a new user with zero CAPI setup still gets full autonomous 
management based on CPL. CAPI just makes it smarter over time.

---

## 4. Business Onboarding Flow (NEW)

When a new business is set up, the system should guide them through:

### Step 1: Connect Meta Account
- OAuth flow (already exists)
- Select ad account (new ad account selector)
- Select Facebook page

### Step 2: Set Base Targets
```json
{
  "target_cpa_cents": 5000,       // "What's your target cost per lead?"
  "max_daily_budget_cents": 30000, // "What's your max daily ad spend?"
  "currency": "AUD",
  "markets": ["AU", "UK"]         // "Where are your customers?"
}
```

### Step 3: Choose Portfolio Template
- Auto-suggest based on business type (detected from URL or user input)
- Show template tiers with estimated CPAs based on their target
- Let them customise before confirming

### Step 4: Connect CRM (Optional)
- Detect CRM type
- Pull pipeline stages
- Suggest event mapping
- Set deal value for Purchase events
- Enable CAPI

### Step 5: Set Autonomous Policy
- Pre-fill from their target CPA and portfolio template
- Show what will be auto-managed vs what requires approval
- Confirm and activate

All of this should be accessible via both the dashboard UI and MCP tools,
so a user can set up their business through Claude or through the web app.

---

## 5. Codex Prompt (UPDATED — replaces the one in the main spec)

```
Add CAPI integration and audience portfolio system to ZuckerBot. 
CRITICAL: All configuration must be per-business. Nothing is hardcoded.

## CAPI

1. Create capi_configs table with: business_id (unique), is_enabled, 
   event_mapping (JSONB — maps CRM lifecycle stages to Meta events with values), 
   currency, crm_source, optimise_for ('lead'/'sql'/'customer'), webhook_secret.
   
   Default event_mapping:
   {"lead": {"meta_event": "Lead", "value": 0}, 
    "customer": {"meta_event": "Purchase", "value": 0}}
   But businesses MUST be able to override this with their own stages.

2. POST /api/v1/capi/events endpoint that:
   - Receives webhook from any CRM (HubSpot first)
   - Looks up the business's capi_config to get their event_mapping
   - Maps the incoming lifecycle stage to the correct Meta event using THEIR mapping
   - Hashes PII with SHA-256
   - Sends to Meta Conversions API using their pixel_id and access_token
   - Logs to capi_events table

3. GET/PUT /api/v1/capi/config for viewing and updating CAPI config per business

4. MCP tools: zuckerbot_capi_config, zuckerbot_capi_status, zuckerbot_capi_test

## Audience Portfolios

5. Create portfolio_templates table with system templates (SaaS, Local Services, 
   Ecommerce, Custom). Each template has tiers with budget_pct and 
   target_cpa_multiplier (NOT absolute CPA — multiplied by business's base target).

6. audience_portfolios table: business_id, template_id, total_daily_budget_cents, 
   tiers (JSONB, copied from template then customisable), is_active.
   
7. audience_tier_campaigns table: portfolio_id, tier, campaign_id, meta IDs, 
   daily_budget_cents, status, performance_data.

8. Portfolio API endpoints: create, get, update, rebalance, launch, performance.

9. MCP tools: zuckerbot_create_portfolio, zuckerbot_portfolio_performance, 
   zuckerbot_rebalance_portfolio.

## Autonomous Enhancement

10. Add optimise_for, capi_lookback_days, min_spend_before_evaluation_cents, 
    evaluation_frequency_hours to autonomous_policies table.

11. Evaluation logic: if CAPI is enabled and optimise_for is 'sql' or 'customer', 
    use downstream CAPI conversion data for pause/scale decisions instead of CPL.
    If CAPI is not enabled, fall back to CPL (default behaviour, unchanged).

## Key Principle
A brand new user with zero CAPI setup should get full autonomous management 
based on CPL out of the box. CAPI is an upgrade, not a requirement.
Every threshold, mapping, and budget split is stored per-business in the database.
```

---

## Summary: What's per-business vs what's system-level

| Config | Stored Where | Scope |
|--------|-------------|-------|
| Target CPA | autonomous_policies | Per business |
| Pause/scale thresholds | autonomous_policies | Per business |
| Frequency cap | autonomous_policies | Per business |
| Max daily budget | autonomous_policies | Per business |
| CAPI event mapping | capi_configs | Per business |
| CAPI deal values | capi_configs | Per business |
| Optimise for (lead/sql/customer) | capi_configs + autonomous_policies | Per business |
| Portfolio tier structure | audience_portfolios | Per business |
| Portfolio budget splits | audience_portfolios | Per business |
| Tier CPA targets | Derived (base CPA × multiplier) | Per business |
| Portfolio templates | portfolio_templates | System-level (shared) |
| Meta event name standards | Hardcoded (Lead, Contact, Purchase) | System-level |
| SHA-256 hashing logic | Hardcoded | System-level |
| Meta API endpoints | Hardcoded | System-level |

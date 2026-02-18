# ARCHITECTURE.md — ZuckerBot Autonomous Agency System

## North Star
One command → campaign live (with guardrails). Then expand into "that converts" via iteration loops, not by trying to predict winners upfront.

## System Architecture
Deterministic pipeline with an agent brain supervising, not improvising.

### Core Components

1. **Orchestrator (OpenClaw main agent)**
   - Owns the run
   - Calls sub-agents/tools
   - Enforces guardrails
   - Produces final report

2. **State + Memory**
   - Stores business profile, assets, decisions, IDs
   - Prevents repeat work across retries
   - Stores "what was launched" for audit and rollback

3. **Meta Execution Layer**
   - Pure functions / deterministic code
   - Marketing API calls
   - Idempotent operations (safe retries)

4. **Creative Factory**
   - Copy generation
   - Image/video generation (if available) or selection from site assets
   - Output validated against Meta policies + brand rules

5. **Monitoring + Iteration Loop**
   - Pulls performance
   - Decides keep/kill/iterate
   - Generates next creatives and updates ads

## Agent Roles (Clean Separation)

### A) BrandProfiler Agent
- **Input:** business URL + optional offer notes
- **Output:** `business_profile.json`
- **Fields:** industry, target customer, offer, key benefits, proof points, tone/voice, prohibited claims, geo focus, funnel goal (lead vs traffic vs sales)
- **Tools:** web scrape, basic site crawl (2-4 key pages max)

### B) CampaignPlanner Agent
- **Input:** `business_profile.json`
- **Output:** `campaign_plan.json`
- **Defines:** objective, campaign structure (ABO vs CBO), budget + schedule, placement strategy, event optimisation, targeting approach (broad + geo + age), creative angles (3 angles, 2 variants each), exclusions + safety constraints
- **This agent is where strategy lives.**

### C) CreativeGenerator Agent
- **Input:** `campaign_plan.json` + `business_profile.json`
- **Output:** `creatives/` folder + `ad_variants.json`
- **Creates:** 3 angles × 2 variants = 6 ads, 2-3 headlines each, primary text, description, CTA, UTM plan
- **Guardrails:** banned claims list, length limits, no policy-risk phrases

### D) MetaDeployer (NOT an agent — deterministic service/module)
- **Input:** `campaign_plan.json` + `ad_variants.json` + assets
- **Output:** `meta_deploy_result.json`
- **Responsibilities:** validate inputs, create campaign, create ad sets, upload creatives, create ads, publish, return IDs, idempotency keys
- **If anything is "agentic" here, you'll get phantom campaigns and a mess.**

### E) Reporter Agent
- **Input:** `meta_deploy_result.json` + plan
- **Output:** clean human report + next steps + links
- **Sends:** confirmation, preview links, what to expect next 24h, when it will optimise, what it'll change if results are weak

### F) Optimiser Agent (Phase 2)
- **Runs on schedule**
- **Input:** performance metrics + current ads
- **Output:** actions list
- **Actions:** pause losers, duplicate winners with new angle, rotate creative fatigue, adjust budget within guardrails, optionally refine targeting

## Data Model (What You Persist Every Run)
Make the run auditable and restartable.

```
run.json
├── run_id
├── timestamp
├── user_id
├── inputs (url, offer notes, budget cap)
├── selected objective + strategy decisions
├── creative angles chosen
├── Meta IDs returned
└── status (draft, deployed, failed, rolled_back)

business_profile.json
campaign_plan.json
ad_variants.json
meta_deploy_result.json
metrics_snapshots/ (daily pulls)
```

## Execution Flow (End-to-End)

**Step 0 — Guardrails (before anything)**
Budget cap, country/currency, max campaigns/day, allowed objectives, allowed targeting constraints, "No launch without confirmation?" toggle

**Step 1 — Profile:** BrandProfiler builds business profile
**Step 2 — Plan:** CampaignPlanner generates plan with explicit choices
**Step 3 — Generate:** CreativeGenerator outputs structured variants
**Step 4 — Validate:** Dry-run checks mandatory fields, policy-risk phrases, URL validity, image dimensions, UTM format, campaign naming
**Step 5 — Deploy:** MetaDeployer does the work
**Step 6 — Report:** Reporter sends results
**Step 7 — Iterate (later):** Optimiser runs on schedule

## Campaign Template (Default Starter)

- **Objective:** Leads (instant form) or Traffic
- **Structure:** ABO (1-2 ad sets)
- **Budget:** $10-$50/day (user-controlled)
- **Targeting:** broad + geo + age bracket only
- **Placements:** Advantage+ placements
- **Creatives:** 6 variants (3 angles × 2)
- **UTM:** always

## Guardrails (Non-Negotiable)

- Hard budget ceiling per day/week
- Never edit billing/people/accounts
- No campaign duplication without idempotency keys
- Only launch to a single test campaign initially
- Auto-pause if CPM/CTR thresholds are catastrophic
- Log everything with run_id

## Build Plan (Phased)

**Phase 1: "Campaign live" (1 week)**
- Deterministic deployer
- One campaign template
- Website scrape → copy → launch
- Reporting

**Phase 2: "Not embarrassing" (week 2)**
- Creative QA + policy filter
- Auto-screenshot ad previews
- Basic error recovery + retry

**Phase 3: "Starts converting" (weeks 3-4)**
- Scheduled optimiser
- A/B creative iteration
- Budget shifting
- Learning across runs (angle library)

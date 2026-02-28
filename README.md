# 🤖 ZuckerBot

**Facebook Ads infrastructure for AI agents.**

Build, launch, and manage Meta ad campaigns programmatically. ZuckerBot wraps the Meta Marketing API into a clean REST API and MCP server so AI agents and developers can run Facebook and Instagram ads without touching Business Manager.

[![npm version](https://img.shields.io/npm/v/zuckerbot-mcp?style=flat-square&color=blue)](https://www.npmjs.com/package/zuckerbot-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-purple?style=flat-square)](https://github.com/modelcontextprotocol/servers)

## Quick Start

```bash
npx zuckerbot-mcp
```

Get your API key at [zuckerbot.ai/developer](https://zuckerbot.ai/developer). Keys use the format `zb_live_` (production) or `zb_test_` (sandbox).

## What It Does

- **Campaign generation** - Give it a URL, get back a full ad strategy with targeting, budget, and copy
- **Ad creative generation** - AI-generated ad images via Google Imagen 4.0 and copy via Claude
- **Campaign management** - Launch, pause, and resume campaigns on the Meta Marketing API
- **Performance tracking** - Real-time metrics from Meta: impressions, clicks, spend, leads, CPL
- **Conversion feedback** - Feed lead quality back to Meta's algorithm to improve targeting
- **Market research** - Competitor ad analysis, review intelligence, and market benchmarks
- **API key provisioning** - Create and manage API keys programmatically

## API Endpoints

Base URL: `https://zuckerbot.ai/api/v1/`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/campaigns/preview` | Generate ad preview from a URL (no Meta account needed) |
| `POST` | `/campaigns/create` | Create full campaign with strategy, targeting, and creatives |
| `POST` | `/campaigns/:id/launch` | Launch a draft campaign on Meta (creates real ads) |
| `POST` | `/campaigns/:id/pause` | Pause or resume a live campaign |
| `GET` | `/campaigns/:id/performance` | Get real-time campaign metrics from Meta |
| `POST` | `/campaigns/:id/conversions` | Send lead quality feedback to Meta's conversion API |
| `POST` | `/research/reviews` | Get review intelligence for a business |
| `POST` | `/research/competitors` | Analyze competitor ads in a category and location |
| `POST` | `/research/market` | Get market size, trends, and ad benchmarks |
| `POST` | `/creatives/generate` | Generate ad copy and images independently |
| `POST` | `/keys/create` | Create a new API key |

All endpoints require `Authorization: Bearer zb_live_...` except where noted.

## MCP Server

ZuckerBot ships as an MCP server for AI agents that support the [Model Context Protocol](https://modelcontextprotocol.io). One `npx` command connects any MCP client to the full Facebook Ads API.

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zuckerbot": {
      "command": "npx",
      "args": ["-y", "zuckerbot-mcp"],
      "env": {
        "ZUCKERBOT_API_KEY": "zb_live_your_key_here"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "zuckerbot": {
      "command": "npx",
      "args": ["-y", "zuckerbot-mcp"],
      "env": {
        "ZUCKERBOT_API_KEY": "zb_live_your_key_here"
      }
    }
  }
}
```

### OpenClaw

```
/skill install zuckerbot
```

Or add to your OpenClaw MCP config:

```json
{
  "mcpServers": {
    "zuckerbot": {
      "command": "npx",
      "args": ["-y", "zuckerbot-mcp"],
      "env": {
        "ZUCKERBOT_API_KEY": "zb_live_your_key_here"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ZUCKERBOT_API_KEY` | Yes | - | Your API key (`zb_live_` or `zb_test_` prefix) |
| `ZUCKERBOT_API_URL` | No | `https://zuckerbot.ai/api/v1` | Override for self-hosted or staging |

## Code Examples

### Generate a campaign preview

```bash
curl -X POST https://zuckerbot.ai/api/v1/campaigns/preview \
  -H "Authorization: Bearer zb_live_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example-yoga.com",
    "ad_count": 2
  }'
```

Returns AI-generated ad headlines, copy, and rationale for each variant. No Meta account required.

### Generate ad creatives

```bash
curl -X POST https://zuckerbot.ai/api/v1/creatives/generate \
  -H "Authorization: Bearer zb_live_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "business_name": "Sunrise Yoga Studio",
    "description": "Hot yoga and meditation classes in Austin, TX",
    "count": 3,
    "generate_images": true
  }'
```

Returns ad copy variants with AI-generated images (powered by Imagen 4.0).

## Pricing

| Plan | Price | Previews/mo | Rate Limit |
|------|-------|-------------|------------|
| **Free** | $0 | 25 | 10 req/min |
| **Pro** | $49/mo | 500 | 60 req/min |
| **Enterprise** | Custom | Custom | 300 req/min |

All plans include access to every endpoint. [Get your API key](https://zuckerbot.ai/developer).

## Autonomous Execution (Approval Flow)

When ZuckerBot's `campaign_optimizer` agent detects anomalies, it logs recommended actions to `automation_runs` with `status = "needs_approval"`. Approving a run now **executes the actions** against the Meta Graph API and records results back in `automation_runs.output`.

### Approve a run (triggers real Meta API calls)

```bash
# Replace <JWT> with the user's Supabase JWT and <RUN_ID> with the automation_runs UUID

curl -X POST https://zuckerbot.ai/api/agents/execute-approval \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "run_id": "a1b2c3d4-...",
    "action": "approve"
  }'
```

**Example response:**

```json
{
  "run_id": "a1b2c3d4-...",
  "action": "approve",
  "status": "completed",
  "execution_summary": "2/3 actions succeeded, 1 failed/skipped",
  "execution_results": [
    {
      "action_type": "pause_campaign",
      "campaign_id": "uuid-of-campaign",
      "campaign_name": "Spring Promo",
      "ok": true,
      "status": "paused",
      "detail": { "meta_campaign_id": "23843..." }
    },
    {
      "action_type": "reduce_budget",
      "campaign_id": "uuid-of-another",
      "campaign_name": "Winter Sale",
      "ok": true,
      "status": "budget_updated",
      "detail": { "previous_budget_cents": 5000, "new_budget_cents": 3500, "pct_change": -0.3 }
    },
    {
      "action_type": "refresh_creative",
      "campaign_id": "uuid-...",
      "campaign_name": "Brand Awareness",
      "ok": false,
      "status": "unsupported",
      "error": "\"refresh_creative\" requires human action and cannot be automated"
    }
  ]
}
```

### Dismiss a run

```bash
curl -X POST https://zuckerbot.ai/api/agents/execute-approval \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "run_id": "a1b2c3d4-...", "action": "dismiss" }'
```

### What executes vs. what doesn't

| Action type | Executable | What happens |
|-------------|-----------|--------------|
| `pause_campaign` | Yes | `POST /{meta_campaign_id}` status=PAUSED; DB status → `paused` |
| `reduce_budget` | Yes | `POST /{meta_adset_id}` daily_budget=new_cents; DB `daily_budget_cents` updated |
| `increase_budget` | Yes | Same as reduce_budget with positive `pct_change` |
| `shift_budget` | Yes | Increases winner's budget by 30%; paired with a pause on the loser |
| `refresh_creative` | No | Returns `unsupported` — trigger the creative_director agent separately |
| `monitor` | No | Returns `no_action` — informational only |

### Budget safety

- Floor: **$5 (500 cents)**. No ad set budget will be set below this.
- Cap: defaults to **$100 (10 000 cents/day)**. Override by adding `max_daily_budget_cents` to the business's `automation_config` row.
- Formula: `clamp(current_budget × (1 + pct_change), min=500, max=10000)`

### Prerequisites

- Business must have `facebook_access_token` stored in the `businesses` table.
- Campaigns must have `meta_campaign_id` (for pause) and `meta_adset_id` (for budget) — written automatically on campaign launch via `/api/v1/campaigns/:id/launch`.

---

## Autonomous Mode (MVP)

Autonomous Mode runs a closed-loop policy on your campaigns: **metrics → evaluate → act → log**. The cron dispatcher calls it every 4 hours for any business that has an enabled policy.

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CRON_SECRET` | Yes | Shared secret for authenticating the cron dispatcher. Set in Vercel and in your cron schedule trigger. |

Set `CRON_SECRET` in your Vercel project settings (Settings → Environment Variables) and pass it as `Authorization: Bearer <CRON_SECRET>` when calling `/api/cron/dispatch-agents` or `/api/v1/autonomous/run` directly.

### New endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/autonomous/policies/upsert` | API key | Create or update autonomous policy for a business |
| `GET` | `/autonomous/metrics` | API key | Get normalized campaign metrics |
| `POST` | `/autonomous/evaluate` | API key | Evaluate policy and return action list (supports `dry_run`) |
| `POST` | `/autonomous/execute` | API key | Execute a list of actions and log results |
| `POST` | `/autonomous/run` | CRON_SECRET | Internal: evaluate + execute + log in one call |

### Database migration

Run the migration to create the `autonomous_policies` table:

```bash
supabase db push
# or apply manually:
psql $DATABASE_URL -f supabase/migrations/20260228_autonomous_mode.sql
```

### 1. Create a policy

```bash
curl -X POST https://zuckerbot.ai/api/v1/autonomous/policies/upsert \
  -H "Authorization: Bearer zb_live_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "business_id": "uuid-of-your-business",
    "target_cpa": 25,
    "pause_multiplier": 2.5,
    "scale_multiplier": 0.7,
    "max_daily_budget": 150,
    "scale_pct": 0.2,
    "min_conversions_to_scale": 3
  }'
```

Policy fields:

| Field | Default | Description |
|-------|---------|-------------|
| `target_cpa` | required | Target cost-per-acquisition in dollars |
| `pause_multiplier` | 2.5 | Pause campaign if `cpa > target_cpa × pause_multiplier` |
| `scale_multiplier` | 0.7 | Scale campaign if `cpa < target_cpa × scale_multiplier` |
| `frequency_cap` | 3.5 | Pause if ad frequency exceeds this (requires Meta insights) |
| `max_daily_budget` | 100 | Safety cap — never scale a budget above this dollar amount |
| `scale_pct` | 0.2 | Increase budget by this fraction on scale (0.2 = +20%) |
| `min_conversions_to_scale` | 3 | Minimum conversions required before scaling |

### 2. Fetch metrics

```bash
curl "https://zuckerbot.ai/api/v1/autonomous/metrics?business_id=uuid" \
  -H "Authorization: Bearer zb_live_your_key_here"
```

Returns a normalized array with `campaign_id, name, status, daily_budget, spend_today, impressions, clicks, conversions, cpa, ctr, cpc, frequency`.

> **Note:** `spend_today` is the lifetime spend stored in the DB (written when you call `GET /campaigns/:id/performance`). It is used as a proxy for same-day spend. For precise daily numbers, call the performance endpoint to sync from Meta first.
> `frequency` is always `null` in the MVP — it requires a live Meta Insights API call not currently wired into this endpoint.

### 3. Evaluate (dry run)

```bash
curl -X POST https://zuckerbot.ai/api/v1/autonomous/evaluate \
  -H "Authorization: Bearer zb_live_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"business_id": "uuid", "dry_run": true}'
```

Returns `{ policy, actions[], summary, dry_run: true }`. No changes are made.

### 4. Execute

```bash
curl -X POST https://zuckerbot.ai/api/v1/autonomous/execute \
  -H "Authorization: Bearer zb_live_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "business_id": "uuid",
    "actions": [
      {
        "type": "pause",
        "campaign_id": "internal-uuid",
        "meta_campaign_id": "23843...",
        "reason": "CPA $62.50 exceeds pause threshold"
      }
    ]
  }'
```

Each action result includes `{ ok, status, error?, meta? }`. Results are logged to `automation_runs` with `agent_type = "autonomous_loop"`.

**Supported actions:**
- `pause` — Sets Meta campaign status to `PAUSED`. Requires `meta_campaign_id`.
- `scale` — Increases the ad set's `daily_budget` by `scale_pct`, capped at `max_daily_budget`. Requires `meta_adset_id`. If `meta_adset_id` is not stored, returns `status: "not_supported"` with a clear message.

### 5. Cron integration

The cron dispatcher (`POST /api/cron/dispatch-agents`) automatically dispatches `autonomous/run` for every business that has an enabled autonomous policy and at least one active campaign. It fires every 4 hours alongside the existing `performance_monitor` agent.

To trigger manually:

```bash
curl -X POST https://zuckerbot.ai/api/v1/autonomous/run \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"business_id": "uuid"}'
```

### Safety guarantees

- **Minimum budget:** Never sets a daily budget below $5.
- **Maximum budget:** Scales are always capped to `max_daily_budget` from the policy.
- **Spend threshold:** Pause rules only apply to campaigns with > $5 lifetime spend (to avoid acting on brand-new campaigns).
- **One rule per campaign per cycle:** A campaign is only evaluated for the first matching rule (pause takes priority over scale).
- **Idempotent:** Calling execute twice with the same action is safe — Meta ignores status updates that are already in the target state.

### Known gaps / not yet implemented

| Gap | Status |
|-----|--------|
| Real-time `spend_today` from Meta Insights | Not implemented. Use stored DB value as proxy. |
| Ad `frequency` data | Not implemented. Requires `GET /{adset_id}/insights?fields=frequency`. |
| Creative evolution on pause/scale | Logged as `creative_evolution_not_implemented` in run output. |
| Per-adset budget update when `meta_adset_id` is missing | Returns `not_supported` with instructions. |

## Links

- [Website](https://zuckerbot.ai)
- [Documentation](https://zuckerbot.ai/docs)
- [npm package](https://www.npmjs.com/package/zuckerbot-mcp)
- [MCP Registry](https://github.com/modelcontextprotocol/servers)
- [Issues](https://github.com/DatalisHQ/zuckerbot/issues)

## License

MIT - see [LICENSE](./LICENSE)

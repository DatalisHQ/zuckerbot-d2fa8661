# zuckerbot-mcp

**CLI + MCP server for ZuckerBot — run Facebook ad campaigns from your terminal or AI agent.**

Install one package and get both:

- `zuckerbot` for humans running campaigns from the terminal
- `zuckerbot-mcp` for MCP-compatible AI agents
- `zuckerbot serve` as an alternative way to start MCP server mode

The CLI and MCP server both use the same ZuckerBot API client, authentication, and endpoints.

## Quick Start

### Human CLI

```bash
npm install -g zuckerbot-mcp
export ZUCKERBOT_API_KEY=zb_live_your_key_here

zuckerbot preview https://example.com
zuckerbot create https://example.com --budget 2000 --objective leads
zuckerbot meta status
```

### Global install

```bash
npm install -g zuckerbot-mcp
```

After global install, these commands are available:

- `zuckerbot`
- `zuckerbot-mcp`
- `zuckerbot serve`

### MCP Server: Claude Desktop

Add to your `claude_desktop_config.json`:

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

### MCP Server: OpenClaw

```
/skill install zuckerbot
```

Or add to your OpenClaw config:

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

### MCP Server: npx (standalone)

```bash
ZUCKERBOT_API_KEY=zb_live_your_key_here npx zuckerbot-mcp
```

### MCP Server: global install

```bash
npm install -g zuckerbot-mcp
ZUCKERBOT_API_KEY=zb_live_your_key_here zuckerbot-mcp
ZUCKERBOT_API_KEY=zb_live_your_key_here zuckerbot serve
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ZUCKERBOT_API_KEY` | ✅ | — | Your ZuckerBot API key. Get one at [zuckerbot.ai/dashboard](https://zuckerbot.ai/dashboard). |
| `ZUCKERBOT_API_URL` | — | `https://zuckerbot.ai/api/v1` | API base URL (override for self-hosted or staging). |

## CLI Commands

| Command | Description |
|---------|-------------|
| `zuckerbot preview <url>` | Generate an ad preview from a business URL |
| `zuckerbot create <url>` | Create a full campaign with strategy, targeting, and creatives |
| `zuckerbot launch <campaign_id>` | Launch a draft campaign on Meta |
| `zuckerbot status <campaign_id>` | Get real-time campaign performance metrics |
| `zuckerbot pause <campaign_id>` | Pause a running campaign |
| `zuckerbot resume <campaign_id>` | Resume a paused campaign |
| `zuckerbot creatives <business_name> <description>` | Generate ad creatives |
| `zuckerbot conversion <campaign_id> <lead_id> <quality>` | Sync lead quality feedback to Meta |
| `zuckerbot research reviews <url>` | Review intelligence |
| `zuckerbot research competitors <category> <location>` | Competitor analysis |
| `zuckerbot research market <industry> <location>` | Market intelligence |
| `zuckerbot meta status` | Check Meta connection status |
| `zuckerbot meta accounts` | List Meta ad accounts |
| `zuckerbot meta select-account <ad_account_id>` | Select a Meta ad account |
| `zuckerbot meta pages` | List Facebook pages |
| `zuckerbot meta select-page <page_id>` | Select a Facebook page |
| `zuckerbot meta credentials` | Check stored launch credentials |
| `zuckerbot serve` | Start MCP server mode from the unified CLI |

## MCP Tools

| Tool | Description | Required Inputs |
|------|-------------|-----------------|
| `zuckerbot_preview_campaign` | Generate ad preview from a URL (no Meta account needed) | `url` |
| `zuckerbot_create_campaign` | Create full campaign with strategy, targeting, and creatives | `url` |
| `zuckerbot_launch_campaign` | Launch one variant from a draft campaign on Meta (uses stored credentials when available) | `campaign_id` |
| `zuckerbot_launch_all_variants` | Launch all variants for A/B testing in one call | `campaign_id` |
| `zuckerbot_pause_campaign` | Pause or resume a live campaign | `campaign_id` |
| `zuckerbot_get_performance` | Get real-time campaign metrics | `campaign_id` |
| `zuckerbot_sync_conversion` | Send lead conversion feedback to Meta's algorithm | `campaign_id`, `lead_id`, `quality`, `meta_access_token` |
| `zuckerbot_research_reviews` | Get review intelligence for a business | `business_name` |
| `zuckerbot_research_competitors` | Analyze competitor ads in a category | `industry`, `location` |
| `zuckerbot_research_market` | Get market intelligence and ad benchmarks | `industry`, `location` |
| `zuckerbot_meta_status` | Check whether Meta is connected for this API key/user | none |
| `zuckerbot_list_ad_accounts` | List available Meta ad accounts and the current selection | none |
| `zuckerbot_select_ad_account` | Select/save a Meta ad account ID for future launches | `ad_account_id` |
| `zuckerbot_list_pixels` | List available Meta pixels for the selected ad account and the current selection | none |
| `zuckerbot_select_pixel` | Select/save a Meta pixel ID for future conversion tracking | `pixel_id` |
| `zuckerbot_list_meta_pages` | List available Facebook pages and current selected page | none |
| `zuckerbot_select_meta_page` | Select/save a Facebook page ID for future launches | `page_id` |
| `zuckerbot_get_launch_credentials` | Resolve stored launch credentials and report missing fields | none |
| `zuckerbot_generate_creatives` | Generate ad copy and creatives (images or Kling video) | `business_name`, `description` |
| `zuckerbot_generate_ad_creative` | Legacy alias for creative generation | `business_name`, `description` |
| `zuckerbot_capi_config` | Get or update the per-business CAPI configuration | none for read; config fields for update |
| `zuckerbot_capi_status` | Get 7-day and 30-day CAPI delivery and attribution status | none |
| `zuckerbot_capi_test` | Send a synthetic CAPI test event through the configured pipeline | none |
| `zuckerbot_create_portfolio` | Create a business-owned audience portfolio from a template | none |
| `zuckerbot_portfolio_performance` | Get tier-by-tier audience portfolio performance | `portfolio_id` |
| `zuckerbot_rebalance_portfolio` | Dry-run or apply a portfolio rebalance | `portfolio_id` |

## Example Conversation

> **User:** Can you set up Facebook ads for my yoga studio? Website is serenity-yoga.com
>
> **Agent:** Let me research your business first…
> *(calls `zuckerbot_research_reviews` + `zuckerbot_research_competitors` in parallel)*
>
> Your studio has a 4.9-star rating with 89 reviews! Customers love the "calming atmosphere" and "expert instructors." Your competitors are running generic discount ads — none mention reviews or instructor credentials. That's your edge.
>
> Let me generate a preview of what your ads would look like…
> *(calls `zuckerbot_preview_campaign`)*
>
> Here are two ad concepts:
> 1. **"4.9 Stars, 89 Reviews"** — Leads with social proof. Your competitors aren't doing this.
> 2. **"First Class Free"** — Low-commitment offer to get people in the door.
>
> Want me to create a full campaign with targeting and budget recommendations?
>
> **User:** Yes! Budget is $15/day.
>
> *(calls `zuckerbot_create_campaign` → reviews strategy → calls `zuckerbot_launch_campaign` with user's Meta credentials)*
>
> **Agent:** Your campaign is live! I'll check performance in 3 days.

## Typical Agent Flow

1. **Research** → `research_reviews` + `research_competitors` (parallel)
2. **Preview** → `preview_campaign` (show the user what ads look like)
3. **Create** → `create_campaign` (full strategy + creatives)
4. **Launch** → `launch_campaign` (go live on Meta)
5. **Monitor** → `get_performance` (check metrics periodically)
6. **Optimize** → `sync_conversion` (feed back lead quality)

## Development

```bash
git clone https://github.com/DatalisHQ/zuckerbot.git
cd zuckerbot/mcp-server
npm install
npm run build
npm start
```

Human CLI development:

```bash
node dist/cli.js --help
node dist/cli.js preview https://example.com
node dist/cli.js serve
```

## API Documentation

Full API reference: [zuckerbot.ai/docs](https://zuckerbot.ai/docs)

## License

MIT — see [LICENSE](./LICENSE)

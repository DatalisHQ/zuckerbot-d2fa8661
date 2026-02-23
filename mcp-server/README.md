# zuckerbot-mcp

**MCP server for ZuckerBot — let AI agents run Facebook ad campaigns.**

Give any MCP-compatible AI agent (Claude Desktop, OpenClaw, Cursor, etc.) the ability to create, launch, optimize, and monitor Meta ad campaigns through natural conversation.

## Quick Start

### Claude Desktop

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

### OpenClaw

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

### npx (standalone)

```bash
ZUCKERBOT_API_KEY=zb_live_your_key_here npx zuckerbot-mcp
```

### Install globally

```bash
npm install -g zuckerbot-mcp
ZUCKERBOT_API_KEY=zb_live_your_key_here zuckerbot-mcp
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ZUCKERBOT_API_KEY` | ✅ | — | Your ZuckerBot API key. Get one at [zuckerbot.ai/dashboard](https://zuckerbot.ai/dashboard). |
| `ZUCKERBOT_API_URL` | — | `https://zuckerbot.ai/api/v1` | API base URL (override for self-hosted or staging). |

## Tools

| Tool | Description | Required Inputs |
|------|-------------|-----------------|
| `zuckerbot_preview_campaign` | Generate ad preview from a URL (no Meta account needed) | `url` |
| `zuckerbot_create_campaign` | Create full campaign with strategy, targeting, and creatives | `url` |
| `zuckerbot_launch_campaign` | Launch a draft campaign on Meta (spends real money) | `campaign_id`, `meta_access_token`, `meta_ad_account_id`, `meta_page_id` |
| `zuckerbot_pause_campaign` | Pause or resume a live campaign | `campaign_id` |
| `zuckerbot_get_performance` | Get real-time campaign metrics | `campaign_id` |
| `zuckerbot_sync_conversion` | Send lead conversion feedback to Meta's algorithm | `campaign_id`, `lead_id`, `quality`, `meta_access_token` |
| `zuckerbot_research_reviews` | Get review intelligence for a business | `business_name` |
| `zuckerbot_research_competitors` | Analyze competitor ads in a category | `industry`, `location` |
| `zuckerbot_research_market` | Get market intelligence and ad benchmarks | `industry`, `location` |
| `zuckerbot_generate_creatives` | Generate ad copy and images independently | `business_name`, `description` |

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

## API Documentation

Full API reference: [zuckerbot.ai/docs](https://zuckerbot.ai/docs)

## License

MIT — see [LICENSE](./LICENSE)

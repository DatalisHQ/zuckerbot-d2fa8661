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

## Links

- [Website](https://zuckerbot.ai)
- [Documentation](https://zuckerbot.ai/docs)
- [npm package](https://www.npmjs.com/package/zuckerbot-mcp)
- [MCP Registry](https://github.com/modelcontextprotocol/servers)
- [Issues](https://github.com/DatalisHQ/zuckerbot/issues)

## License

MIT - see [LICENSE](./LICENSE)

#!/usr/bin/env node

// ── ZuckerBot MCP Server ─────────────────────────────────────────────
//
// Exposes the ZuckerBot API as MCP tools for AI agents.
// Connect via stdio transport (standard for MCP servers).
//
// Environment variables:
//   ZUCKERBOT_API_KEY  — Required. Your ZuckerBot API key.
//   ZUCKERBOT_API_URL  — Optional. API base URL (default: https://zuckerbot.ai/api/v1)
//

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ZuckerBotClient } from "./client.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  // Initialize the API client (validates ZUCKERBOT_API_KEY)
  const client = new ZuckerBotClient();

  // Create the MCP server
  const server = new McpServer({
    name: "zuckerbot",
    version: "0.1.0",
  });

  // Register all 10 tools
  registerTools(server, client);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting ZuckerBot MCP server:", err.message || err);
  process.exit(1);
});

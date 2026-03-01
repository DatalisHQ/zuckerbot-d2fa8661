// ── ZuckerBot MCP Tool Definitions ───────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ZuckerBotClient, ZuckerBotApiError } from "./client.js";

// ── Helpers ──────────────────────────────────────────────────────────

function formatResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function formatError(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  if (err instanceof ZuckerBotApiError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: true,
              code: err.errorCode,
              status: err.statusCode,
              message: err.message,
              ...(err.retryAfter ? { retry_after: err.retryAfter } : {}),
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      },
    ],
    isError: true,
  };
}

// ── Register all tools ───────────────────────────────────────────────

export function registerTools(server: McpServer, client: ZuckerBotClient): void {
  // ── 1. Preview Campaign ─────────────────────────────────────────
  server.tool(
    "zuckerbot_preview_campaign",
    "Generate a campaign preview from a business URL. Returns AI-generated ad creatives (headlines, copy, images) without needing a Meta account. Great for showing users what their ads would look like before they commit.",
    {
      url: z.string().describe("Business website URL to generate ads for"),
      ad_count: z
        .number()
        .int()
        .min(1)
        .max(3)
        .default(2)
        .describe("Number of ad variants to generate (1-3)"),
    },
    async ({ url, ad_count }) => {
      try {
        const result = await client.post("/campaigns/preview", {
          url,
          ad_count,
        });
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── 2. Create Campaign ──────────────────────────────────────────
  server.tool(
    "zuckerbot_create_campaign",
    "Create a full campaign with strategy, targeting, budget recommendations, and ad creatives. Returns a draft campaign ready to launch. Does NOT spend money or touch Meta until you call launch.",
    {
      url: z.string().describe("Business website URL"),
      business_name: z.string().optional().describe("Business name (auto-detected from URL if omitted)"),
      business_type: z
        .string()
        .optional()
        .describe("Business category (e.g., 'restaurant', 'fitness', 'roofing')"),
      location: z
        .object({
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          lat: z.number().optional(),
          lng: z.number().optional(),
        })
        .optional()
        .describe("Business location for geo-targeting"),
      budget_daily_cents: z
        .number()
        .int()
        .optional()
        .describe("Daily budget in cents (e.g., 2000 = $20/day)"),
      objective: z
        .enum(["leads", "traffic", "awareness"])
        .optional()
        .describe("Campaign objective"),
    },
    async ({ url, business_name, business_type, location, budget_daily_cents, objective }) => {
      try {
        const body: Record<string, unknown> = { url };
        if (business_name) body.business_name = business_name;
        if (business_type) body.business_type = business_type;
        if (location) body.location = location;
        if (budget_daily_cents !== undefined) body.budget_daily_cents = budget_daily_cents;
        if (objective) body.objective = objective;

        const result = await client.post("/campaigns/create", body);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── 3. Launch Campaign ──────────────────────────────────────────
  server.tool(
    "zuckerbot_launch_campaign",
    "Launch a draft campaign on Meta (Facebook/Instagram). This is the money endpoint — it creates real ads on the user's Meta ad account and starts spending their budget. Requires Meta credentials.",
    {
      campaign_id: z.string().describe("ZuckerBot campaign ID from the create step"),
      meta_access_token: z.string().optional().describe("User's Meta/Facebook access token. Optional if Facebook is connected on zuckerbot.ai"),
      meta_ad_account_id: z.string().optional().describe("Meta ad account ID (format: act_XXXXX). Optional if Facebook is connected on zuckerbot.ai"),
      meta_page_id: z.string().optional().describe("Facebook Page ID. Optional if Facebook is connected on zuckerbot.ai"),
      variant_index: z
        .number()
        .int()
        .default(0)
        .describe("Which creative variant to launch (0-indexed)"),
      daily_budget_cents: z
        .number()
        .int()
        .optional()
        .describe("Override daily budget in cents"),
      radius_km: z.number().int().optional().describe("Override targeting radius in km"),
    },
    async ({
      campaign_id,
      meta_access_token,
      meta_ad_account_id,
      meta_page_id,
      variant_index,
      daily_budget_cents,
      radius_km,
    }) => {
      try {
        const body: Record<string, unknown> = { variant_index };
        if (meta_access_token) body.meta_access_token = meta_access_token;
        if (meta_ad_account_id) body.meta_ad_account_id = meta_ad_account_id;
        if (meta_page_id) body.meta_page_id = meta_page_id;
        if (daily_budget_cents !== undefined) body.daily_budget_cents = daily_budget_cents;
        if (radius_km !== undefined) body.radius_km = radius_km;

        const result = await client.post(`/campaigns/${campaign_id}/launch`, body);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── 4. Pause / Resume Campaign ─────────────────────────────────
  server.tool(
    "zuckerbot_pause_campaign",
    "Pause or resume a running campaign on Meta. Pausing stops ad delivery and spend immediately. Resuming restarts delivery.",
    {
      campaign_id: z.string().describe("ZuckerBot campaign ID"),
      action: z
        .enum(["pause", "resume"])
        .default("pause")
        .describe("Whether to pause or resume the campaign"),
    },
    async ({ campaign_id, action }) => {
      try {
        const result = await client.post(`/campaigns/${campaign_id}/pause`, {
          action,
        });
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── 5. Get Performance ──────────────────────────────────────────
  server.tool(
    "zuckerbot_get_performance",
    "Get real-time performance metrics for a campaign. Returns impressions, clicks, spend, leads, cost-per-lead, click-through rate, and a performance status (learning/healthy/underperforming/paused).",
    {
      campaign_id: z.string().describe("ZuckerBot campaign ID"),
    },
    async ({ campaign_id }) => {
      try {
        const result = await client.get(`/campaigns/${campaign_id}/performance`);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── 6. Sync Conversion ─────────────────────────────────────────
  server.tool(
    "zuckerbot_sync_conversion",
    "Send conversion feedback to Meta's algorithm. When a lead converts (or doesn't), this teaches Meta to find more (or fewer) people like them. Critical for improving lead quality over time.",
    {
      campaign_id: z.string().describe("ZuckerBot campaign ID"),
      lead_id: z.string().describe("Lead ID to report conversion for"),
      quality: z
        .enum(["good", "bad"])
        .describe("Lead quality: 'good' = converted/contacted, 'bad' = lost/unresponsive"),
      meta_access_token: z.string().describe("User's Meta access token for CAPI"),
      user_data: z
        .object({
          email: z.string().optional(),
          phone: z.string().optional(),
          first_name: z.string().optional(),
          last_name: z.string().optional(),
        })
        .optional()
        .describe("Optional user data to improve match rate"),
    },
    async ({ campaign_id, lead_id, quality, meta_access_token, user_data }) => {
      try {
        const body: Record<string, unknown> = {
          lead_id,
          quality,
          meta_access_token,
        };
        if (user_data) body.user_data = user_data;

        const result = await client.post(`/campaigns/${campaign_id}/conversions`, body);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── 7. Research Reviews ─────────────────────────────────────────
  server.tool(
    "zuckerbot_research_reviews",
    "Get review intelligence for a business. Searches Google Reviews, Yelp, and other sources, then synthesizes themes, best quotes, and sentiment. Use this data to inform ad copy.",
    {
      business_name: z.string().describe("Business name to research"),
      location: z
        .string()
        .optional()
        .describe("City/region for more accurate results (e.g., 'Austin, TX')"),
    },
    async ({ business_name, location }) => {
      try {
        const body: Record<string, unknown> = { business_name };
        if (location) body.location = location;

        const result = await client.post("/research/reviews", body);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── 8. Research Competitors ─────────────────────────────────────
  server.tool(
    "zuckerbot_research_competitors",
    "Analyze competitor ads for a business category and location. Searches Meta Ad Library and web results to find active competitor campaigns, common hooks, and gaps you can exploit.",
    {
      industry: z.string().describe("Business category (e.g., 'pizza restaurant', 'yoga studio')"),
      location: z.string().describe("City/region (e.g., 'Austin, TX')"),
      country: z
        .string()
        .default("US")
        .describe("Country code (default: US)"),
    },
    async ({ industry, location, country }) => {
      try {
        const result = await client.post("/research/competitors", {
          industry,
          location,
          country,
        });
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── 9. Research Market ──────────────────────────────────────────
  server.tool(
    "zuckerbot_research_market",
    "Get market intelligence for an industry and location. Returns market size, trends, audience demographics, and advertising benchmarks to inform campaign strategy.",
    {
      industry: z.string().describe("Industry/business category (e.g., 'fitness', 'dental')"),
      location: z.string().describe("City/region (e.g., 'Austin, TX')"),
    },
    async ({ industry, location }) => {
      try {
        const result = await client.post("/research/market", {
          industry,
          location,
        });
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── 10. Meta Connection Status ─────────────────────────────────
  server.tool(
    "zuckerbot_meta_status",
    "Check if the user has connected their Facebook/Meta account. If not connected, returns a URL where they can connect. Always check this before attempting to launch a campaign.",
    {},
    async () => {
      try {
        const result = await client.get("/meta/status");
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── 11. Generate Creatives ──────────────────────────────────────
  server.tool(
    "zuckerbot_generate_creatives",
    "Generate ad creatives (copy + images) independently from campaign creation. Useful for refreshing creatives on an existing campaign or generating options to show a user.",
    {
      business_name: z.string().describe("Business name"),
      description: z.string().describe("Brief description of the business"),
      count: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(2)
        .describe("Number of creative variants to generate (1-5)"),
      generate_images: z
        .boolean()
        .default(true)
        .describe("Whether to generate AI images (set false for copy-only)"),
    },
    async ({ business_name, description, count, generate_images }) => {
      try {
        const result = await client.post("/creatives/generate", {
          business_name,
          description,
          count,
          generate_images,
        });
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );
}

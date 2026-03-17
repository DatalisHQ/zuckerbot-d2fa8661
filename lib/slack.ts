const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const SITE_URL = (process.env.SITE_URL || "https://zuckerbot.ai").replace(/\/+$/, "");

interface SlackBlockText {
  type: "mrkdwn" | "plain_text";
  text: string;
  emoji?: boolean;
}

interface SlackBlock {
  type: string;
  text?: SlackBlockText;
  fields?: SlackBlockText[];
  elements?: Array<Record<string, unknown>>;
  accessory?: Record<string, unknown>;
}

interface SlackPayload {
  text: string;
  blocks?: SlackBlock[];
}

interface ApprovalMetrics {
  spend_cents?: number | null;
  conversions?: number | null;
  cpa?: number | null;
  daily_budget_cents?: number | null;
  new_budget_cents?: number | null;
  frequency?: number | null;
  cpl_3d?: number | null;
  cpl_7d?: number | null;
}

interface ApprovalRequestArgs {
  runId: string;
  campaignName: string;
  actionType: string;
  reason: string;
  metrics?: ApprovalMetrics | null;
}

interface ApprovalDecisionArgs {
  runId: string;
  campaignName: string;
  actionType: string;
  decision: "approved" | "denied" | "failed";
  summary: string;
}

interface CreativeVariantPreview {
  headline?: string | null;
  body?: string | null;
  copy?: string | null;
  cta?: string | null;
  image_url?: string | null;
  theme?: string | null;
}

interface CreativeApprovalArgs {
  campaignName: string;
  reason: string;
  variants: CreativeVariantPreview[];
  queueIds?: string[];
}

interface CreativeLaunchArgs {
  campaignName: string;
  headline: string;
  queueId: string;
  metaAdId: string;
}

function moneyFromCents(cents?: number | null): string {
  if (typeof cents !== "number" || Number.isNaN(cents)) return "n/a";
  return `$${(cents / 100).toFixed(2)}`;
}

function moneyFromDollars(amount?: number | null): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "n/a";
  return `$${amount.toFixed(2)}`;
}

function actionLabel(actionType: string): string {
  switch (actionType) {
    case "pause":
    case "pause_campaign":
      return "PAUSE";
    case "scale":
    case "increase_budget":
      return "SCALE";
    case "reduce_budget":
      return "REDUCE BUDGET";
    case "shift_budget":
      return "SHIFT BUDGET";
    case "refresh_creative":
      return "REFRESH CREATIVE";
    default:
      return actionType.replace(/_/g, " ").toUpperCase();
  }
}

function buildApprovalButtons(runId: string) {
  const approveUrl = `${SITE_URL}/agency?approval_run_id=${encodeURIComponent(runId)}&decision=approve`;
  const denyUrl = `${SITE_URL}/agency?approval_run_id=${encodeURIComponent(runId)}&decision=deny`;

  return {
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Approve", emoji: true },
        style: "primary",
        url: approveUrl,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Deny", emoji: true },
        style: "danger",
        url: denyUrl,
      },
    ],
  };
}

async function postSlackMessage(payload: SlackPayload): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) return false;

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    console.error("[slack] Failed to send message:", error);
    return false;
  }
}

function buildMetricsField(metrics?: ApprovalMetrics | null): string | null {
  if (!metrics) return null;

  const parts: string[] = [];

  if (typeof metrics.spend_cents === "number") parts.push(`Spend ${moneyFromCents(metrics.spend_cents)}`);
  if (typeof metrics.conversions === "number") parts.push(`Leads ${metrics.conversions}`);
  if (typeof metrics.cpa === "number") parts.push(`CPA ${moneyFromDollars(metrics.cpa)}`);
  if (typeof metrics.frequency === "number") parts.push(`Freq ${metrics.frequency.toFixed(2)}`);
  if (typeof metrics.cpl_3d === "number") parts.push(`3d CPL ${moneyFromDollars(metrics.cpl_3d)}`);
  if (typeof metrics.cpl_7d === "number") parts.push(`7d CPL ${moneyFromDollars(metrics.cpl_7d)}`);

  if (
    typeof metrics.daily_budget_cents === "number"
    || typeof metrics.new_budget_cents === "number"
  ) {
    const budgetText = `${moneyFromCents(metrics.daily_budget_cents)} -> ${moneyFromCents(metrics.new_budget_cents)}`;
    parts.push(`Budget ${budgetText}`);
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

export async function sendSlackApprovalRequest(args: ApprovalRequestArgs): Promise<boolean> {
  const metricsText = buildMetricsField(args.metrics);
  const text = `ZuckerBot action required: ${args.campaignName} - ${actionLabel(args.actionType)}`;

  return postSlackMessage({
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*ZuckerBot Action Required*\n*Campaign:* ${args.campaignName}\n*Action:* ${actionLabel(args.actionType)}\n*Reason:* ${args.reason}`,
        },
      },
      ...(metricsText
        ? [{
            type: "section",
            text: { type: "mrkdwn", text: `*Current:* ${metricsText}` },
          } satisfies SlackBlock]
        : []),
      buildApprovalButtons(args.runId),
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Run ID: \`${args.runId}\``,
          },
        ],
      },
    ],
  });
}

export async function sendSlackApprovalDecision(args: ApprovalDecisionArgs): Promise<boolean> {
  const decisionLabel =
    args.decision === "approved"
      ? "Approved"
      : args.decision === "denied"
        ? "Denied"
        : "Failed";

  return postSlackMessage({
    text: `ZuckerBot approval ${decisionLabel.toLowerCase()}: ${args.campaignName}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*ZuckerBot Approval ${decisionLabel}*\n*Campaign:* ${args.campaignName}\n*Action:* ${actionLabel(args.actionType)}\n*Summary:* ${args.summary}`,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Run ID: \`${args.runId}\`` },
        ],
      },
    ],
  });
}

export async function sendSlackCreativeApproval(args: CreativeApprovalArgs): Promise<boolean> {
  const previewLines = args.variants.slice(0, 3).map((variant, index) => {
    const headline = variant.headline || `Variant ${index + 1}`;
    const body = (variant.body || variant.copy || "").slice(0, 120).trim();
    const cta = variant.cta ? ` | CTA: ${variant.cta}` : "";
    const theme = variant.theme ? ` | Theme: ${variant.theme}` : "";
    return `*${index + 1}.* ${headline}${cta}${theme}${body ? `\n${body}` : ""}`;
  });

  const targetQueueId = args.queueIds?.[0];
  const reviewUrl = targetQueueId
    ? `${SITE_URL}/agency?creative_queue_id=${encodeURIComponent(targetQueueId)}`
    : `${SITE_URL}/agency`;

  return postSlackMessage({
    text: `ZuckerBot creative refresh queued for ${args.campaignName}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Creative Refresh Queued*\n*Campaign:* ${args.campaignName}\n*Reason:* ${args.reason}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: previewLines.join("\n\n"),
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Review Variants", emoji: true },
            style: "primary",
            url: reviewUrl,
          },
        ],
      },
    ],
  });
}

export async function sendSlackCreativeLaunched(args: CreativeLaunchArgs): Promise<boolean> {
  return postSlackMessage({
    text: `ZuckerBot launched a new creative for ${args.campaignName}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*New Creative Launched*\n*Campaign:* ${args.campaignName}\n*Headline:* ${args.headline}\n*Meta Ad ID:* \`${args.metaAdId}\``,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Creative Queue ID: \`${args.queueId}\`` },
        ],
      },
    ],
  });
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Search,
  Star,
  Activity,
  SlidersHorizontal,
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronUp,
  Play,
  Inbox,
} from "lucide-react";

export interface AutomationRun {
  id: string;
  business_id: string;
  user_id: string;
  agent_type:
    | "creative_director"
    | "competitor_analyst"
    | "review_scout"
    | "performance_monitor"
    | "campaign_optimizer";
  status: "pending" | "running" | "completed" | "failed" | "needs_approval";
  trigger_type: "scheduled" | "manual" | "event";
  trigger_reason: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  summary: string | null;
  first_person_summary: string | null;
  error_message: string | null;
  tinyfish_replay_url: string | null;
  duration_ms: number | null;
  requires_approval: boolean;
  approved_at: string | null;
  approved_action: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ActivityFeedProps {
  runs: AutomationRun[];
  onRunClick?: (run: AutomationRun) => void;
  businessId?: string;
  userId?: string;
  onRefresh?: () => void;
}

const AGENT_CONFIG: Record<
  AutomationRun["agent_type"],
  { icon: typeof Sparkles; label: string }
> = {
  creative_director: { icon: Sparkles, label: "Creative Director" },
  competitor_analyst: { icon: Search, label: "Competitor Analyst" },
  review_scout: { icon: Star, label: "Review Scout" },
  performance_monitor: { icon: Activity, label: "Performance Monitor" },
  campaign_optimizer: { icon: SlidersHorizontal, label: "Campaign Optimizer" },
};

function getStatusBadge(status: AutomationRun["status"]) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20 hover:bg-green-500/20">
          Completed
        </Badge>
      );
    case "running":
      return (
        <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 hover:bg-blue-500/20">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20 hover:bg-red-500/20">
          Failed
        </Badge>
      );
    case "needs_approval":
      return (
        <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/20 hover:bg-yellow-500/20">
          Needs Approval
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary">Pending</Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function relativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateString).toLocaleDateString();
}

function renderExpandedOutput(run: AutomationRun) {
  const output = run.output as Record<string, unknown> | null;
  if (!output) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No output data available.
      </p>
    );
  }

  switch (run.agent_type) {
    case "competitor_analyst":
      return <CompetitorOutput data={output} />;
    case "review_scout":
      return <ReviewOutput data={output} />;
    case "creative_director":
      return <CreativeOutput data={output} />;
    case "performance_monitor":
      return <PerformanceOutput data={output} />;
    case "campaign_optimizer":
      return <OptimizerOutput data={output} />;
    default:
      return (
        <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
          {JSON.stringify(output, null, 2)}
        </pre>
      );
  }
}

function CompetitorOutput({ data }: { data: Record<string, unknown> }) {
  const ads = (data.ads || data.results || []) as Array<{
    page_name?: string;
    headline?: string;
    url?: string;
  }>;
  if (ads.length === 0) {
    return <p className="text-sm text-muted-foreground">No competitor ads found.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Ads found: {ads.length}</p>
      <ul className="space-y-1">
        {ads.slice(0, 10).map((ad, i) => (
          <li key={i} className="text-sm flex items-center gap-2">
            <Search className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <span className="font-medium">{ad.page_name || "Unknown Page"}</span>
            {ad.headline && (
              <span className="text-muted-foreground truncate">
                - {ad.headline}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewOutput({ data }: { data: Record<string, unknown> }) {
  const rating = data.rating as number | undefined;
  const reviewCount = data.review_count as number | undefined;
  const quotes = (data.top_quotes || data.quotes || []) as string[];

  return (
    <div className="space-y-2">
      {rating !== undefined && (
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
          <span className="text-sm font-medium">{rating}/5</span>
          {reviewCount !== undefined && (
            <span className="text-sm text-muted-foreground">
              ({reviewCount} reviews)
            </span>
          )}
        </div>
      )}
      {quotes.length > 0 && (
        <div className="space-y-1">
          {quotes.slice(0, 3).map((quote, i) => (
            <p key={i} className="text-sm text-muted-foreground italic pl-3 border-l-2 border-muted">
              "{String(quote)}"
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function CreativeOutput({ data }: { data: Record<string, unknown> }) {
  const creatives = (data.creatives || data.variations || []) as Array<{
    headline?: string;
    body?: string;
    primary_text?: string;
  }>;
  if (creatives.length === 0) {
    return (
      <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }
  return (
    <div className="space-y-3">
      {creatives.slice(0, 3).map((creative, i) => (
        <div key={i} className="p-3 bg-muted rounded-md space-y-1">
          {creative.headline && (
            <p className="text-sm font-semibold">{creative.headline}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {creative.body || creative.primary_text || ""}
          </p>
        </div>
      ))}
    </div>
  );
}

function PerformanceOutput({ data }: { data: Record<string, unknown> }) {
  const metrics = (data.metrics || data) as Record<string, unknown>;
  const entries = Object.entries(metrics).filter(
    ([, v]) => typeof v === "number" || typeof v === "string"
  );
  if (entries.length === 0) {
    return (
      <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-1 pr-4 font-medium text-muted-foreground">
              Metric
            </th>
            <th className="text-right py-1 font-medium text-muted-foreground">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.slice(0, 10).map(([key, val]) => (
            <tr key={key} className="border-b border-muted">
              <td className="py-1 pr-4 capitalize">
                {key.replace(/_/g, " ")}
              </td>
              <td className="py-1 text-right font-mono">{String(val)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OptimizerOutput({ data }: { data: Record<string, unknown> }) {
  const recommendations = (data.recommendations || data.actions || []) as Array<
    string | { text?: string; description?: string; action?: string }
  >;
  if (recommendations.length === 0) {
    return (
      <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }
  return (
    <ul className="space-y-1">
      {recommendations.slice(0, 8).map((rec, i) => {
        const text =
          typeof rec === "string"
            ? rec
            : rec.text || rec.description || rec.action || JSON.stringify(rec);
        return (
          <li key={i} className="text-sm flex items-start gap-2">
            <span className="text-primary font-bold mt-0.5">{i + 1}.</span>
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ActivityFeed({
  runs,
  onRunClick,
  businessId,
  userId,
  onRefresh,
}: ActivityFeedProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);

  const handleToggle = (runId: string) => {
    setExpandedId((prev) => (prev === runId ? null : runId));
  };

  const triggerAgent = async (agentSlug: string) => {
    if (!businessId || !userId) return;
    setTriggerLoading(agentSlug);
    try {
      const res = await fetch(`/api/agents/${agentSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, user_id: userId }),
      });
      if (!res.ok) {
        console.error("Agent trigger failed:", await res.text());
      }
      // Refresh after a brief delay to let the run start
      setTimeout(() => {
        onRefresh?.();
      }, 1500);
    } catch (err) {
      console.error("Agent trigger error:", err);
    } finally {
      setTriggerLoading(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-lg">Activity Feed</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerAgent("competitor-analyst")}
              disabled={!!triggerLoading}
            >
              {triggerLoading === "competitor-analyst" ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-1" />
              )}
              Run Competitor Analysis
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerAgent("review-scout")}
              disabled={!!triggerLoading}
            >
              {triggerLoading === "review-scout" ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-1" />
              )}
              Run Review Scout
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <div className="text-center py-12">
            <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No activity yet. Run your first analysis to see your agents in
              action.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {runs.map((run) => {
              const config = AGENT_CONFIG[run.agent_type];
              const AgentIcon = config.icon;
              const isExpanded = expandedId === run.id;
              const summaryText =
                run.first_person_summary || run.summary || "No summary available.";

              return (
                <div key={run.id} className="group">
                  <button
                    className="w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      handleToggle(run.id);
                      onRunClick?.(run);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Agent icon */}
                      <div className="flex-shrink-0 mt-0.5 p-1.5 rounded-md bg-muted">
                        <AgentIcon className="w-4 h-4 text-foreground" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {config.label}
                          </span>
                          {getStatusBadge(run.status)}
                          {run.tinyfish_replay_url && (
                            <a
                              href={run.tinyfish_replay_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Watch Replay
                            </a>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {summaryText}
                        </p>
                      </div>

                      {/* Timestamp + expand */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {relativeTime(run.created_at)}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="ml-10 mr-3 mb-3 p-4 bg-muted/30 rounded-lg border">
                      {run.error_message && (
                        <div className="mb-3 p-2 bg-red-500/10 rounded text-sm text-red-700 dark:text-red-300">
                          Error: {run.error_message}
                        </div>
                      )}
                      {renderExpandedOutput(run)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ActivityFeed;

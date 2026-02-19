import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Search,
  Star,
  Activity,
  SlidersHorizontal,
  Check,
  X,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { AutomationRun } from "./ActivityFeed";

interface ApprovalQueueProps {
  runs: AutomationRun[];
  onApprove: (runId: string) => Promise<void>;
  onDismiss: (runId: string) => Promise<void>;
}

const AGENT_ICONS: Record<AutomationRun["agent_type"], typeof Sparkles> = {
  creative_director: Sparkles,
  competitor_analyst: Search,
  review_scout: Star,
  performance_monitor: Activity,
  campaign_optimizer: SlidersHorizontal,
};

const AGENT_LABELS: Record<AutomationRun["agent_type"], string> = {
  creative_director: "Creative Director",
  competitor_analyst: "Competitor Analyst",
  review_scout: "Review Scout",
  performance_monitor: "Performance Monitor",
  campaign_optimizer: "Campaign Optimizer",
};

function renderOutputPreview(run: AutomationRun) {
  const output = run.output as Record<string, unknown> | null;
  if (!output) return null;

  if (run.agent_type === "creative_director") {
    const creatives = (output.creatives || output.variations || []) as Array<{
      headline?: string;
      body?: string;
      primary_text?: string;
    }>;
    if (creatives.length === 0) return null;
    return (
      <div className="space-y-2 mt-3">
        {creatives.slice(0, 2).map((c, i) => (
          <div key={i} className="p-3 bg-muted rounded-md">
            {c.headline && (
              <p className="text-sm font-semibold">{c.headline}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {c.body || c.primary_text || ""}
            </p>
          </div>
        ))}
      </div>
    );
  }

  if (run.agent_type === "campaign_optimizer") {
    const recommendations = (output.recommendations ||
      output.actions ||
      []) as Array<
      string | { text?: string; description?: string; action?: string }
    >;
    if (recommendations.length === 0) return null;
    return (
      <ul className="mt-3 space-y-1">
        {recommendations.slice(0, 3).map((rec, i) => {
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

  return null;
}

export function ApprovalQueue({
  runs,
  onApprove,
  onDismiss,
}: ApprovalQueueProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<
    "approve" | "dismiss" | null
  >(null);

  const pendingRuns = runs.filter(
    (r) => r.requires_approval && !r.approved_at
  );

  // Don't render the section at all if nothing to show
  if (pendingRuns.length === 0) return null;

  const handleApprove = async (runId: string) => {
    setLoadingId(runId);
    setLoadingAction("approve");
    try {
      await onApprove(runId);
    } finally {
      setLoadingId(null);
      setLoadingAction(null);
    }
  };

  const handleDismiss = async (runId: string) => {
    setLoadingId(runId);
    setLoadingAction("dismiss");
    try {
      await onDismiss(runId);
    } finally {
      setLoadingId(null);
      setLoadingAction(null);
    }
  };

  return (
    <Card className="border-yellow-500/30 dark:border-yellow-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          <CardTitle className="text-lg">Needs Your Approval</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {pendingRuns.map((run) => {
            const AgentIcon = AGENT_ICONS[run.agent_type];
            const isLoading = loadingId === run.id;

            return (
              <div
                key={run.id}
                className="p-4 border rounded-lg bg-card space-y-3"
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-yellow-500/10 dark:bg-yellow-500/20">
                    <AgentIcon className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <span className="text-sm font-medium">
                    {AGENT_LABELS[run.agent_type]}
                  </span>
                </div>

                {/* Summary */}
                <p className="text-sm text-muted-foreground">
                  {run.first_person_summary || run.summary || "Action requires your approval."}
                </p>

                {/* Output preview */}
                {renderOutputPreview(run)}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleApprove(run.id)}
                    disabled={isLoading}
                  >
                    {isLoading && loadingAction === "approve" ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 mr-1" />
                    )}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDismiss(run.id)}
                    disabled={isLoading}
                  >
                    {isLoading && loadingAction === "dismiss" ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <X className="w-4 h-4 mr-1" />
                    )}
                    Dismiss
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default ApprovalQueue;

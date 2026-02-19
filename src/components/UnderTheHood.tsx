import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Code2,
} from "lucide-react";
import type { AutomationRun } from "./ActivityFeed";

interface UnderTheHoodProps {
  runs: AutomationRun[];
  isExpanded: boolean;
  onToggle: () => void;
}

function statusDot(status: AutomationRun["status"]) {
  const colors: Record<string, string> = {
    completed: "bg-green-500",
    running: "bg-blue-500 animate-pulse",
    failed: "bg-red-500",
    needs_approval: "bg-yellow-500",
    pending: "bg-gray-400",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[status] || "bg-gray-400"}`}
    />
  );
}

function CollapsibleJson({
  label,
  data,
}: {
  label: string;
  data: unknown;
}) {
  const [open, setOpen] = useState(false);

  if (!data) return null;

  return (
    <div className="mt-1">
      <button
        className="text-xs text-primary hover:underline font-mono flex items-center gap-1"
        onClick={() => setOpen(!open)}
      >
        <Code2 className="w-3 h-3" />
        {label}
        {open ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>
      {open && (
        <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto max-h-60 font-mono">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function UnderTheHood({
  runs,
  isExpanded,
  onToggle,
}: UnderTheHoodProps) {
  const recentRuns = runs.slice(0, 10);

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="text-muted-foreground hover:text-foreground mb-2"
      >
        <Code2 className="w-4 h-4 mr-2" />
        Under the Hood
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 ml-1" />
        ) : (
          <ChevronDown className="w-4 h-4 ml-1" />
        )}
      </Button>

      {isExpanded && (
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-3">
            {recentRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground font-mono">
                No runs to display.
              </p>
            ) : (
              <div className="space-y-4">
                {recentRuns.map((run) => (
                  <div
                    key={run.id}
                    className="p-3 rounded-lg bg-muted/30 border border-muted font-mono text-xs space-y-2"
                  >
                    {/* Header row */}
                    <div className="flex items-center flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs font-mono">
                        {run.agent_type}
                      </Badge>
                      <div className="flex items-center gap-1.5">
                        {statusDot(run.status)}
                        <span className="capitalize">{run.status}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs font-mono">
                        {run.trigger_type}
                      </Badge>
                      {run.duration_ms !== null && run.duration_ms !== undefined && (
                        <span className="text-muted-foreground">
                          {(run.duration_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>

                    {/* Run ID */}
                    <div className="text-muted-foreground truncate">
                      id: {run.id}
                    </div>

                    {/* Timestamps */}
                    <div className="text-muted-foreground">
                      created: {new Date(run.created_at).toLocaleString()}
                      {run.started_at && (
                        <>
                          {" | "}started: {new Date(run.started_at).toLocaleString()}
                        </>
                      )}
                      {run.completed_at && (
                        <>
                          {" | "}completed: {new Date(run.completed_at).toLocaleString()}
                        </>
                      )}
                    </div>

                    {/* TinyFish replay URL */}
                    {run.tinyfish_replay_url && (
                      <a
                        href={run.tinyfish_replay_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        TinyFish Replay
                      </a>
                    )}

                    {/* Error */}
                    {run.error_message && (
                      <div className="text-red-500 dark:text-red-400">
                        error: {run.error_message}
                      </div>
                    )}

                    {/* Collapsible JSON sections */}
                    <CollapsibleJson label="input" data={run.input} />
                    <CollapsibleJson label="output" data={run.output} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default UnderTheHood;

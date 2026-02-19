import { Card, CardContent } from "@/components/ui/card";
import { Zap } from "lucide-react";

interface AgencyGreetingProps {
  pendingApprovals: number;
  recentRunCount: number;
  hasAnomalies: boolean;
  businessName?: string;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 23) return "Good evening";
  return "Good evening"; // late night, keep it neutral
}

export function AgencyGreeting({
  pendingApprovals,
  recentRunCount,
  hasAnomalies,
  businessName,
}: AgencyGreetingProps) {
  const greeting = getTimeGreeting();

  const contextLines: string[] = [];

  if (pendingApprovals > 0) {
    contextLines.push(
      `I have ${pendingApprovals} item${pendingApprovals === 1 ? "" : "s"} ready for your review.`
    );
  }

  if (hasAnomalies) {
    contextLines.push(
      "I noticed some issues with your campaigns that need attention."
    );
  }

  if (!hasAnomalies && !pendingApprovals && recentRunCount > 0) {
    contextLines.push(
      `Everything's running smoothly. I completed ${recentRunCount} task${recentRunCount === 1 ? "" : "s"} this week.`
    );
  }

  if (recentRunCount === 0 && pendingApprovals === 0) {
    contextLines.push(
      "I'm ready to start working for you. Let's run your first analysis."
    );
  }

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/5 via-background to-primary/10 dark:from-primary/10 dark:via-background dark:to-primary/5 shadow-md">
      {/* Subtle gradient accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

      <CardContent className="pt-8 pb-6 px-6">
        <div className="flex items-start gap-4">
          {/* ZuckerBot avatar */}
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center ring-2 ring-primary/20">
            <Zap className="w-6 h-6 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-foreground">
              {greeting}
              {businessName ? `, ${businessName}` : ""}.
            </h2>
            <p className="text-muted-foreground mt-1">
              Here's what I've been up to.
            </p>

            {contextLines.length > 0 && (
              <div className="mt-3 space-y-1">
                {contextLines.map((line, i) => (
                  <p
                    key={i}
                    className={`text-sm ${
                      line.includes("issues") || line.includes("review")
                        ? "text-foreground font-medium"
                        : "text-muted-foreground"
                    }`}
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AgencyGreeting;

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Activity,
  AlertCircle,
  DollarSign,
  TrendingUp,
  Target,
  Heart,
} from "lucide-react";

interface CampaignStats {
  totalSpend: number;
  totalLeads: number;
  avgCpa: number;
  status: string;
}

interface AgencyStatsProps {
  agentsEnabled: number;
  tasksThisWeek: number;
  pendingApprovals: number;
  campaigns?: CampaignStats;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyDecimal(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function AgencyStats({
  agentsEnabled,
  tasksThisWeek,
  pendingApprovals,
  campaigns,
}: AgencyStatsProps) {
  return (
    <div className="space-y-4">
      {/* Primary stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Agents Active */}
        <Card>
          <CardContent className="pt-6 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/20">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Agents Active
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {agentsEnabled}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    of 5
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tasks This Week */}
        <Card>
          <CardContent className="pt-6 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                <Activity className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Tasks This Week
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {tasksThisWeek}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pending Review */}
        <Card
          className={
            pendingApprovals > 0
              ? "ring-1 ring-yellow-400/50 dark:ring-yellow-500/30"
              : ""
          }
        >
          <CardContent className="pt-6 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  pendingApprovals > 0
                    ? "bg-yellow-500/10 dark:bg-yellow-500/20"
                    : "bg-muted"
                }`}
              >
                <AlertCircle
                  className={`w-5 h-5 ${
                    pendingApprovals > 0
                      ? "text-yellow-600 dark:text-yellow-400"
                      : "text-muted-foreground"
                  }`}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Pending Review
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {pendingApprovals}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Value vs Agency */}
        <Card>
          <CardContent className="pt-6 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10 dark:bg-green-500/20">
                <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Value vs Agency
                </p>
                <p className="text-lg font-bold text-foreground leading-tight">
                  $99/mo{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    vs ~$2,500/mo
                  </span>
                </p>
                <Badge
                  variant="secondary"
                  className="mt-1 text-[10px] bg-green-500/10 text-green-700 dark:text-green-300 border-0"
                >
                  96% savings
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign stats row (only if data provided) */}
      {campaigns && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Spend */}
          <Card>
            <CardContent className="pt-5 pb-4 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10 dark:bg-orange-500/20">
                  <TrendingUp className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Ad Spend
                  </p>
                  <p className="text-xl font-bold text-foreground">
                    {formatCurrency(campaigns.totalSpend)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Leads */}
          <Card>
            <CardContent className="pt-5 pb-4 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20">
                  <Target className="w-4 h-4 text-indigo-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Leads
                  </p>
                  <p className="text-xl font-bold text-foreground">
                    {campaigns.totalLeads}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Avg CPA */}
          <Card>
            <CardContent className="pt-5 pb-4 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 dark:bg-purple-500/20">
                  <DollarSign className="w-4 h-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Avg CPA
                  </p>
                  <p className="text-xl font-bold text-foreground">
                    {formatCurrencyDecimal(campaigns.avgCpa)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Health */}
          <Card>
            <CardContent className="pt-5 pb-4 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-pink-500/10 dark:bg-pink-500/20">
                  <Heart className="w-4 h-4 text-pink-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Health
                  </p>
                  <Badge
                    variant={
                      campaigns.status === "healthy"
                        ? "default"
                        : campaigns.status === "warning"
                          ? "secondary"
                          : "destructive"
                    }
                    className="mt-1"
                  >
                    {campaigns.status.charAt(0).toUpperCase() +
                      campaigns.status.slice(1)}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default AgencyStats;

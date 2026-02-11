import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  RefreshCw,
  Users,
  DollarSign,
  TrendingUp,
  Megaphone,
  ShieldCheck,
  Eye,
  MousePointerClick,
  Target,
  Zap,
  BarChart3,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  has_business: boolean;
  business_name: string | null;
  has_campaign: boolean;
  campaign_count: number;
  subscription_status: string;
  subscription_tier: string;
  subscription_end: string | null;
  facebook_connected: boolean;
  onboarding_completed: boolean;
}

interface AdminCampaign {
  id: string;
  name: string;
  status: string;
  daily_budget_cents: number;
  leads_count: number;
  spend_cents: number;
  impressions: number;
  clicks: number;
  cpl_cents: number | null;
  performance_status: string;
  created_at: string;
  launched_at: string | null;
  last_synced_at: string | null;
  business_id: string;
}

interface MarketingInsights {
  impressions: number;
  clicks: number;
  spend: string;
  ctr: string;
  cpc: string;
  cpp: string;
  reach: number;
  actions: Array<{ action_type: string; value: string }>;
}

interface AdminStats {
  total_users: number;
  active_trials: number;
  paying_customers: number;
  mrr_cents: number;
  conversion_rate: string;
  users: AdminUser[];
  total_businesses: number;
  total_campaigns: number;
  active_campaigns: number;
  total_leads: number;
  total_spend_cents: number;
  total_impressions: number;
  total_clicks: number;
  campaigns: AdminCampaign[];
  marketing_insights: MarketingInsights | null;
  fetched_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SUB_STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800",
  },
  trial: {
    label: "Trial",
    className: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800",
  },
  expired: {
    label: "Expired",
    className: "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800",
  },
  none: {
    label: "No Sub",
    className: "bg-gray-500/10 text-gray-500 border-gray-200 dark:text-gray-400 dark:border-gray-700",
  },
};

const CAMPAIGN_STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800",
  },
  paused: {
    label: "Paused",
    className: "bg-yellow-500/10 text-yellow-700 border-yellow-200 dark:text-yellow-400 dark:border-yellow-800",
  },
  draft: {
    label: "Draft",
    className: "bg-gray-500/10 text-gray-500 border-gray-200 dark:text-gray-400 dark:border-gray-700",
  },
  ended: {
    label: "Ended",
    className: "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800",
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

const Admin = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);

  const fetchStats = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        navigate("/auth");
        return;
      }

      const res = await fetch(
        `https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/admin-stats`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setError("Access denied. Admin only.");
        } else {
          setError(data.error || "Failed to fetch admin stats");
        }
        return;
      }

      setStats(data);
    } catch (err: any) {
      console.error("[Admin] Fetch error:", err);
      setError(err.message || "Failed to load admin data");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [navigate]);

  // ─── Loading ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center py-24">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Loading admin dashboard…</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Error / Forbidden ──────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center py-24">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="pt-6 text-center space-y-4">
              <ShieldCheck className="h-12 w-12 text-destructive mx-auto" />
              <div>
                <h2 className="text-xl font-bold">Admin Access Required</h2>
                <p className="text-sm text-muted-foreground mt-2">{error}</p>
              </div>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="space-y-8">
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-primary" />
                <h1 className="text-3xl font-bold">ZuckerBot Admin</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Last refreshed {stats.fetched_at ? formatDate(stats.fetched_at) : "—"}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => fetchStats(true)}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>

          {/* ── KPI Cards ──────────────────────────────────────────────── */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KPICard
              icon={Users}
              label="Total Sign-ups"
              value={String(stats.total_users)}
            />
            <KPICard
              icon={Zap}
              label="Active Trials"
              value={String(stats.active_trials)}
              accent="blue"
            />
            <KPICard
              icon={DollarSign}
              label="Paying Customers"
              value={String(stats.paying_customers)}
              accent="green"
            />
            <KPICard
              icon={TrendingUp}
              label="MRR"
              value={stats.mrr_cents > 0 ? formatCurrency(stats.mrr_cents) : "$0"}
              accent="green"
            />
            <KPICard
              icon={Target}
              label="Trial→Paid"
              value={`${stats.conversion_rate}%`}
            />
            <KPICard
              icon={Megaphone}
              label="Total Ad Spend"
              value={stats.total_spend_cents > 0 ? formatCurrency(stats.total_spend_cents) : "$0"}
            />
          </div>

          {/* ── Marketing Campaign (ZuckerBot's own ads) ───────────────── */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Marketing Campaign
            </h2>
            {stats.marketing_insights ? (
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                <MetricCard
                  label="Impressions"
                  value={stats.marketing_insights.impressions.toLocaleString()}
                />
                <MetricCard
                  label="Reach"
                  value={stats.marketing_insights.reach.toLocaleString()}
                />
                <MetricCard
                  label="Clicks"
                  value={stats.marketing_insights.clicks.toLocaleString()}
                />
                <MetricCard
                  label="CTR"
                  value={`${parseFloat(stats.marketing_insights.ctr).toFixed(2)}%`}
                />
                <MetricCard
                  label="Spend"
                  value={`$${parseFloat(stats.marketing_insights.spend).toFixed(2)}`}
                />
                <MetricCard
                  label="CPC"
                  value={`$${parseFloat(stats.marketing_insights.cpc).toFixed(2)}`}
                />
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No marketing campaign data available yet.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Campaign ID: {MARKETING_CAMPAIGN_ID}
                  </p>
                </CardContent>
              </Card>
            )}
          </section>

          {/* ── Sign-ups Table ─────────────────────────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Sign-ups
              </h2>
              <Badge variant="outline">{stats.total_users} users</Badge>
            </div>

            {stats.users.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No users yet.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Signed Up</TableHead>
                        <TableHead className="text-center">Business</TableHead>
                        <TableHead className="text-center">Campaigns</TableHead>
                        <TableHead className="text-center">FB</TableHead>
                        <TableHead>Subscription</TableHead>
                        <TableHead>Tier</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.users.map((user) => {
                        const subBadge = SUB_STATUS_BADGE[user.subscription_status] || SUB_STATUS_BADGE.none;
                        return (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium text-sm max-w-[200px] truncate">
                              {user.email || "—"}
                              {user.full_name && (
                                <span className="block text-xs text-muted-foreground truncate">
                                  {user.full_name}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              <span title={user.created_at ? formatDate(user.created_at) : ""}>
                                {user.created_at ? relativeTime(user.created_at) : "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              {user.has_business ? (
                                <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-200 text-xs">
                                  ✓
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {user.campaign_count > 0 ? (
                                <Badge variant="outline" className="text-xs">
                                  {user.campaign_count}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">0</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {user.facebook_connected ? (
                                <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-200 text-xs">
                                  ✓
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-xs ${subBadge.className}`}
                              >
                                {subBadge.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {user.subscription_tier !== "free" ? user.subscription_tier : "free"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </section>

          {/* ── Campaign Performance ───────────────────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                All Campaigns
              </h2>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{stats.active_campaigns} active</Badge>
                <Badge variant="secondary">{stats.total_campaigns} total</Badge>
              </div>
            </div>

            {stats.campaigns.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Megaphone className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No campaigns created yet.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Budget/day</TableHead>
                        <TableHead className="text-right">Impressions</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                        <TableHead className="text-right">CPL</TableHead>
                        <TableHead>Last Sync</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.campaigns.map((campaign) => {
                        const statusBadge = CAMPAIGN_STATUS_BADGE[campaign.status] || CAMPAIGN_STATUS_BADGE.draft;
                        const ctr = campaign.impressions > 0
                          ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2)
                          : "0.00";

                        return (
                          <TableRow key={campaign.id}>
                            <TableCell className="font-medium text-sm max-w-[180px]">
                              <span className="truncate block">{campaign.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {campaign.launched_at
                                  ? `Launched ${relativeTime(campaign.launched_at)}`
                                  : `Created ${relativeTime(campaign.created_at)}`}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-xs ${statusBadge.className}`}
                              >
                                {statusBadge.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatCurrency(campaign.daily_budget_cents)}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {campaign.impressions.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {campaign.clicks.toLocaleString()}
                              <span className="text-xs text-muted-foreground ml-1">
                                ({ctr}%)
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {campaign.leads_count}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatCurrency(campaign.spend_cents)}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {campaign.cpl_cents != null
                                ? formatCurrency(campaign.cpl_cents)
                                : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {campaign.last_synced_at
                                ? relativeTime(campaign.last_synced_at)
                                : "never"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold" colSpan={3}>
                          Totals
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {stats.total_impressions.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {stats.total_clicks.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {stats.total_leads}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(stats.total_spend_cents)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {stats.total_leads > 0
                            ? formatCurrency(Math.round(stats.total_spend_cents / stats.total_leads))
                            : "—"}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </CardContent>
              </Card>
            )}
          </section>

          {/* ── Quick Stats Footer ─────────────────────────────────────── */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Businesses</p>
                <p className="text-2xl font-bold">{stats.total_businesses}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Impressions</p>
                <p className="text-2xl font-bold">{stats.total_impressions.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Clicks</p>
                <p className="text-2xl font-bold">{stats.total_clicks.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Avg CPL (all)</p>
                <p className="text-2xl font-bold">
                  {stats.total_leads > 0
                    ? formatCurrency(Math.round(stats.total_spend_cents / stats.total_leads))
                    : "—"}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

// ─── KPI Card Sub-Component ─────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: "blue" | "green";
}) {
  const accentClasses = accent === "green"
    ? "bg-green-500/10 text-green-600"
    : accent === "blue"
    ? "bg-blue-500/10 text-blue-600"
    : "bg-primary/10 text-primary";

  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accentClasses}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Metric Card (for marketing insights) ───────────────────────────────────

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

// ─── Marketing Campaign ID constant ─────────────────────────────────────────
const MARKETING_CAMPAIGN_ID = "120241673514780057";

export default Admin;

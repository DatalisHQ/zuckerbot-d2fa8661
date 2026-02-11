import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/Navbar";
import { trackPageView } from "@/utils/analytics";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Plus,
  Megaphone,
  Users,
  TrendingUp,
  DollarSign,
  ArrowRight,
  Phone,
  Mail,
  MapPin,
  MessageSquare,
  Inbox,
  Eye,
  MousePointerClick,
  RefreshCw,
  Trash2,
  Pause,
  Play,
  Target,
  FileText,
} from "lucide-react";

// ─── Local Interfaces ──────────────────────────────────────────────────────

interface Business {
  id: string;
  user_id: string;
  name: string;
  trade: string;
  suburb: string;
}

interface Campaign {
  id: string;
  business_id: string;
  name: string;
  status: string;
  daily_budget_cents: number;
  leads_count: number;
  spend_cents: number;
  impressions: number;
  clicks: number;
  cpl_cents: number | null;
  performance_status: string;
  last_synced_at: string | null;
  created_at: string;
  launched_at: string | null;
  ad_headline: string | null;
  ad_copy: string | null;
  ad_image_url: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  radius_km: number;
}

interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  suburb: string | null;
  status: string;
  sms_sent: boolean;
  created_at: string;
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
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  paused: { label: "Paused", variant: "outline" },
  ended: { label: "Ended", variant: "destructive" },
};

const PERFORMANCE_BADGE: Record<string, { label: string; className: string }> = {
  learning: {
    label: "Learning",
    className: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800",
  },
  healthy: {
    label: "Healthy",
    className: "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800",
  },
  underperforming: {
    label: "Underperforming",
    className: "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800",
  },
  paused: {
    label: "Paused",
    className: "bg-gray-500/10 text-gray-700 border-gray-200 dark:text-gray-400 dark:border-gray-800",
  },
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800",
  contacted: "bg-yellow-500/10 text-yellow-700 border-yellow-200 dark:text-yellow-400 dark:border-yellow-800",
  won: "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800",
  lost: "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800",
};

// ─── Component ──────────────────────────────────────────────────────────────

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [business, setBusiness] = useState<Business | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadDashboard = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      navigate("/auth");
      return;
    }

    // Check if user has completed onboarding by checking for a business record
    const { data: bizCheck } = await supabase
      .from("businesses" as any)
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!bizCheck) {
      navigate("/onboarding");
      return;
    }

    // Get business
    const { data: bizData } = await supabase
      .from("businesses" as any)
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    const biz = bizData as unknown as Business | null;
    setBusiness(biz);

    if (biz) {
      // Get campaigns
      const { data: campData } = await supabase
        .from("campaigns" as any)
        .select("*")
        .eq("business_id", biz.id)
        .order("created_at", { ascending: false });

      setCampaigns((campData as unknown as Campaign[]) || []);

      // Get recent leads
      const { data: leadData } = await supabase
        .from("leads" as any)
        .select("*")
        .eq("business_id", biz.id)
        .order("created_at", { ascending: false })
        .limit(5);

      setLeads((leadData as unknown as Lead[]) || []);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    // Track page view
    trackPageView('/dashboard', 'ZuckerBot — Dashboard');
    loadDashboard();
  }, [navigate]);

  // ─── Refresh Stats Handler ────────────────────────────────────────────────

  const handleRefreshStats = async () => {
    setIsSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Not authenticated",
          description: "Please sign in again.",
          variant: "destructive",
        });
        return;
      }

      const res = await fetch(
        `https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/sync-performance`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ sync_all: true }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to sync");
      }

      toast({
        title: "Stats refreshed",
        description: data.message || "Campaign data synced from Meta.",
      });

      // Reload dashboard data
      await loadDashboard();
    } catch (err: any) {
      console.error("[Dashboard] Refresh stats error:", err);
      toast({
        title: "Sync failed",
        description: err.message || "Could not refresh stats. Try again.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // ─── Delete Campaign Handler ──────────────────────────────────────────────

  const handleDeleteCampaign = async (campaignId: string) => {
    setDeletingId(campaignId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Not authenticated",
          description: "Please sign in again.",
          variant: "destructive",
        });
        return;
      }

      const res = await fetch(
        `https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/delete-campaign`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ campaign_id: campaignId }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete campaign");
      }

      // Remove from local state
      setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));

      toast({
        title: "Campaign deleted",
        description: data.message || "Campaign has been removed.",
      });
    } catch (err: any) {
      console.error("[Dashboard] Delete campaign error:", err);
      toast({
        title: "Delete failed",
        description: err.message || "Could not delete campaign. Try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Pause/Resume Campaign Handler ────────────────────────────────────────

  const handleToggleCampaignStatus = async (campaign: Campaign) => {
    if (!campaign.meta_campaign_id) {
      toast({
        title: "Cannot toggle status",
        description: "This campaign has no Meta campaign ID.",
        variant: "destructive",
      });
      return;
    }

    const newStatus = campaign.status === "active" ? "PAUSED" : "ACTIVE";
    const newLocalStatus = newStatus === "ACTIVE" ? "active" : "paused";
    setTogglingId(campaign.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Not authenticated",
          description: "Please sign in again.",
          variant: "destructive",
        });
        return;
      }

      // Get the Facebook access token from the business
      const { data: bizData } = await supabase
        .from("businesses" as any)
        .select("facebook_access_token")
        .eq("id", campaign.business_id)
        .single();

      const biz = bizData as unknown as { facebook_access_token: string | null } | null;

      if (!biz?.facebook_access_token) {
        toast({
          title: "Facebook not connected",
          description: "Please reconnect your Facebook account.",
          variant: "destructive",
        });
        return;
      }

      // Call Meta API to update campaign status
      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${campaign.meta_campaign_id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            status: newStatus,
            access_token: biz.facebook_access_token,
          }),
        }
      );

      const metaData = await metaRes.json();

      if (!metaRes.ok && !metaData.success) {
        const errMsg = metaData?.error?.message || "Failed to update status on Meta";
        throw new Error(errMsg);
      }

      // Update local DB
      await supabase
        .from("campaigns" as any)
        .update({ status: newLocalStatus } as any)
        .eq("id", campaign.id);

      // Update local state
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaign.id
            ? { ...c, status: newLocalStatus, performance_status: newLocalStatus === "paused" ? "paused" : c.performance_status }
            : c
        )
      );

      toast({
        title: newLocalStatus === "active" ? "Campaign resumed" : "Campaign paused",
        description: `"${campaign.name}" is now ${newLocalStatus}.`,
      });
    } catch (err: any) {
      console.error("[Dashboard] Toggle status error:", err);
      toast({
        title: "Status update failed",
        description: err.message || "Could not update campaign status.",
        variant: "destructive",
      });
    } finally {
      setTogglingId(null);
    }
  };

  // ─── Computed Stats ─────────────────────────────────────────────────────

  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const totalLeads = campaigns.reduce((sum, c) => sum + (c.leads_count || 0), 0);
  const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend_cents || 0), 0);
  const avgCostPerLead =
    totalLeads > 0 ? Math.round(totalSpend / totalLeads) : null;

  // ─── Loading ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground mt-1">
                {business
                  ? `${business.name} — ${business.trade}, ${business.suburb}`
                  : "Welcome back!"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleRefreshStats}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh Stats
              </Button>
              <Button onClick={() => navigate("/campaign/new")}>
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Megaphone}
              label="Active Campaigns"
              value={String(activeCampaigns)}
            />
            <StatCard
              icon={Users}
              label="Total Leads"
              value={String(totalLeads)}
            />
            <StatCard
              icon={DollarSign}
              label="Total Spend"
              value={totalSpend > 0 ? formatCurrency(totalSpend) : "$0.00"}
            />
            <StatCard
              icon={TrendingUp}
              label="Avg Cost / Lead"
              value={avgCostPerLead !== null ? formatCurrency(avgCostPerLead) : "—"}
            />
          </div>

          {/* Active Campaigns */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Campaigns</h2>
              <Badge variant="outline">{campaigns.length} total</Badge>
            </div>

            {campaigns.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent className="space-y-4">
                  <Megaphone className="h-10 w-10 text-muted-foreground mx-auto" />
                  <div>
                    <h3 className="font-semibold">No campaigns yet</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create your first campaign to start getting leads.
                    </p>
                  </div>
                  <Button onClick={() => navigate("/campaign/new")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {campaigns.map((campaign) => {
                  const badge = STATUS_BADGE[campaign.status] || STATUS_BADGE.draft;
                  const perfBadge =
                    PERFORMANCE_BADGE[campaign.performance_status] ||
                    PERFORMANCE_BADGE.learning;
                  const isDeleting = deletingId === campaign.id;
                  const isToggling = togglingId === campaign.id;
                  const canToggle = campaign.meta_campaign_id && (campaign.status === "active" || campaign.status === "paused");

                  return (
                    <Card
                      key={campaign.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() =>
                        toast({
                          title: "Campaign detail coming soon",
                          description: "We're building this page next!",
                        })
                      }
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">
                            {campaign.name}
                          </CardTitle>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge
                              variant="outline"
                              className={`text-xs ${perfBadge.className}`}
                            >
                              {perfBadge.label}
                            </Badge>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </div>
                        </div>
                        <CardDescription>
                          {campaign.launched_at
                            ? `Launched ${relativeTime(campaign.launched_at)}`
                            : `Created ${relativeTime(campaign.created_at)}`}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Ad headline + copy snippet */}
                        {(campaign.ad_headline || campaign.ad_copy) && (
                          <div className="space-y-1 border-l-2 border-primary/20 pl-3">
                            {campaign.ad_headline && (
                              <p className="text-sm font-medium flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {campaign.ad_headline}
                              </p>
                            )}
                            {campaign.ad_copy && (
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {truncateText(campaign.ad_copy, 80)}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Stats row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">
                              ${(campaign.daily_budget_cents / 100).toFixed(0)}
                            </strong>
                            /day
                          </span>
                          {campaign.radius_km > 0 && (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Target className="h-3.5 w-3.5" />
                              <strong className="text-foreground">
                                {campaign.radius_km}
                              </strong>
                              km
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">
                              {campaign.leads_count}
                            </strong>{" "}
                            leads
                          </span>
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Eye className="h-3.5 w-3.5" />
                            <strong className="text-foreground">
                              {campaign.impressions?.toLocaleString() || 0}
                            </strong>
                          </span>
                          <span className="text-muted-foreground flex items-center gap-1">
                            <MousePointerClick className="h-3.5 w-3.5" />
                            <strong className="text-foreground">
                              {campaign.clicks || 0}
                            </strong>
                          </span>
                          {campaign.cpl_cents != null && (
                            <span className="text-muted-foreground">
                              <strong className="text-foreground">
                                {formatCurrency(campaign.cpl_cents)}
                              </strong>
                              /lead
                            </span>
                          )}
                        </div>

                        {campaign.last_synced_at && (
                          <p className="text-xs text-muted-foreground">
                            Last synced {relativeTime(campaign.last_synced_at)}
                          </p>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          {/* Pause/Resume button */}
                          {canToggle && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isToggling}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleCampaignStatus(campaign);
                              }}
                            >
                              {isToggling ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : campaign.status === "active" ? (
                                <Pause className="h-3.5 w-3.5 mr-1.5" />
                              ) : (
                                <Play className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              {campaign.status === "active" ? "Pause" : "Resume"}
                            </Button>
                          )}

                          {/* Delete button with confirmation */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={isDeleting}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isDeleting ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{campaign.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will delete the campaign from Facebook and remove all data.
                                  This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCampaign(campaign.id);
                                  }}
                                >
                                  Delete Campaign
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent Leads */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Recent Leads</h2>
              <Link
                to="/leads"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                View all leads
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {leads.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent className="space-y-4">
                  <Inbox className="h-10 w-10 text-muted-foreground mx-auto" />
                  <div>
                    <h3 className="font-semibold">No leads yet</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Launch a campaign to start getting customers!
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {leads.map((lead) => (
                  <Card key={lead.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {lead.name || "Unknown"}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-xs ${LEAD_STATUS_COLORS[lead.status] || ""}`}
                            >
                              {lead.status}
                            </Badge>
                            {lead.sms_sent && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <MessageSquare className="h-3 w-3" />
                                SMS
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            {lead.phone && (
                              <a
                                href={`tel:${lead.phone}`}
                                className="flex items-center gap-1 hover:text-primary"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="h-3 w-3" />
                                {lead.phone}
                              </a>
                            )}
                            {lead.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {lead.email}
                              </span>
                            )}
                            {lead.suburb && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {lead.suburb}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {relativeTime(lead.created_at)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

// ─── Stat Card Sub-Component ────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default Dashboard;

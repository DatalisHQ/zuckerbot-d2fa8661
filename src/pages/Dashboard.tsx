import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/Navbar";
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
  created_at: string;
  launched_at: string | null;
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

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  paused: { label: "Paused", variant: "outline" },
  ended: { label: "Ended", variant: "destructive" },
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
  const [business, setBusiness] = useState<Business | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    const loadDashboard = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/auth");
        return;
      }

      // Check onboarding status
      const { data: profileData } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!profileData?.onboarding_completed) {
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

    loadDashboard();
  }, [navigate]);

  // ─── Computed Stats ─────────────────────────────────────────────────────

  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const totalLeads = campaigns.reduce((sum, c) => sum + (c.leads_count || 0), 0);
  
  // Leads this week
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const leadsThisWeek = leads.filter(
    (l) => new Date(l.created_at) >= oneWeekAgo
  ).length;

  // Cost per lead
  const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend_cents || 0), 0);
  const avgCostPerLead =
    totalLeads > 0 ? (totalSpend / 100 / totalLeads).toFixed(2) : null;

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
            <Button onClick={() => navigate("/campaign/new")}>
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
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
              icon={TrendingUp}
              label="Leads This Week"
              value={String(leadsThisWeek)}
            />
            <StatCard
              icon={DollarSign}
              label="Avg Cost / Lead"
              value={avgCostPerLead ? `$${avgCostPerLead}` : "—"}
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
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>
                        <CardDescription>
                          {campaign.launched_at
                            ? `Launched ${relativeTime(campaign.launched_at)}`
                            : `Created ${relativeTime(campaign.created_at)}`}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">
                              ${(campaign.daily_budget_cents / 100).toFixed(0)}
                            </strong>
                            /day
                          </span>
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">
                              {campaign.leads_count}
                            </strong>{" "}
                            leads
                          </span>
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

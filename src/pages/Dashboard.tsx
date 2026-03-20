import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import StrategyBrief from "@/components/StrategyBrief";
import { trackPageView } from "@/utils/analytics";
import { GlassCard } from "@/components/ui/GlassCard";
import { GradientButton } from "@/components/ui/GradientButton";
import { MetricCard } from "@/components/ui/MetricCard";
import { NavBar } from "@/components/ui/NavBar";
import { SidebarShell } from "@/components/ui/SidebarShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CodeBlock } from "@/components/ui/CodeBlock";
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
  ShieldCheck,
  BarChart3,
  Zap,
  CreditCard,
  ExternalLink,
  Bot,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Palette,
  SlidersHorizontal,
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

// ─── Admin Interfaces ──────────────────────────────────────────────────────

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
  business_name: string;
  user_email: string;
}

interface StripePayment {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  refunded: boolean;
  customer_email: string | null;
  customer_name: string | null;
  description: string | null;
  invoice_url: string | null;
  created: number;
}

interface StripeSubscription {
  id: string;
  status: string;
  customer_id: string;
  plan_amount_cents: number;
  plan_currency: string;
  plan_interval: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
  created: number;
}

interface StripeSummary {
  total_revenue_cents: number;
  failed_count: number;
  refunded_count: number;
  active_subscriptions: number;
}

interface StripeData {
  payments: StripePayment[];
  subscriptions: StripeSubscription[];
  summary: StripeSummary;
  fetched_at: string;
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

interface GA4Analytics {
  property_id?: string;
  last_30_days?: {
    page_views: string | number;
    sessions: string | number;
    users: string | number;
    conversion_rate: string | number;
  };
  top_pages?: Array<{
    path: string;
    views: string | number;
  }>;
  traffic_sources?: Array<{
    source: string;
    sessions: string | number;
  }>;
  configured: boolean;
  setup_needed?: boolean;
  message?: string;
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
  ga4_analytics?: GA4Analytics | null;
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

const SUB_STATUS_BADGE: Record<string, { label: string; className: string }> = {
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

const CAMPAIGN_STATUS_BADGE: Record<string, { label: string; className: string }> = {
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

const DASHBOARD_NAV_ITEMS = [
  { id: "overview", label: "Overview", href: "#overview", icon: LayoutDashboard },
  { id: "analytics", label: "Analytics", href: "#performance", icon: BarChart3 },
  { id: "ad-sets", label: "Ad Sets", href: "#campaigns", icon: Megaphone },
  { id: "creatives", label: "Creatives", href: "#workspace", icon: Palette },
  { id: "ai-insights", label: "AI Insights", href: "#agents", icon: BrainCircuit },
];

function parseMultiplier(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/([\d.]+)/);
  return match ? Number(match[1]) : null;
}

function normalizeCampaignStatus(status: string): "active" | "paused" | "completed" {
  if (status === "active") return "active";
  if (status === "paused") return "paused";
  return "completed";
}

function displayCampaignStatus(status: string): string {
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  return "Completed";
}

function getCompletedAgentSteps(run: any): number {
  return [
    !!run?.brand_data,
    !!run?.competitor_data,
    !!run?.creative_data,
    !!run?.campaign_plan,
    !!run?.analytics_projections,
  ].filter(Boolean).length;
}

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
  const [campaignView, setCampaignView] = useState<"active" | "archived">("active");
  const [showSpendOnly, setShowSpendOnly] = useState(false);
  const [campaignPage, setCampaignPage] = useState(1);
  const [activeNavItem, setActiveNavItem] = useState("overview");
  
  // ─── Agent Runs State ────────────────────────────────────────────────────
  const [agentRuns, setAgentRuns] = useState<any[]>([]);
  const [isLoadingAgentRuns, setIsLoadingAgentRuns] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // ─── Admin State ────────────────────────────────────────────────────────
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
  const [stripeData, setStripeData] = useState<StripeData | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [isLoadingStripe, setIsLoadingStripe] = useState(false);

  const loadDashboard = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      navigate("/auth");
      return;
    }

    // Check if this is an admin user
    const isAdminUser = session.user.email === 'davisgrainger@gmail.com';
    setIsAdmin(isAdminUser);

    // Check if user has completed onboarding by checking for a business record
    const { data: bizCheck } = await supabase
      .from("businesses" as any)
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!bizCheck && !isAdminUser) {
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

    // ─── Link anonymous agent_run from localStorage ───────────────────────
    const storedRunId = localStorage.getItem("zuckerbot_run_id");
    if (storedRunId) {
      try {
        await supabase
          .from("agent_runs" as any)
          .update({ user_id: session.user.id } as any)
          .eq("id", storedRunId)
          .is("user_id", null);
      } catch (err) {
        console.error("[Dashboard] Error linking agent_run:", err);
      }
      localStorage.removeItem("zuckerbot_run_id");
    }

    // ─── Load Agent Runs ─────────────────────────────────────────────────
    setIsLoadingAgentRuns(true);
    try {
      const { data: runsData } = await supabase
        .from("agent_runs" as any)
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(3);

      setAgentRuns((runsData as any[]) || []);
    } catch (err) {
      console.error("[Dashboard] Error loading agent_runs:", err);
    } finally {
      setIsLoadingAgentRuns(false);
    }

    // Load admin data if admin user
    if (isAdminUser) {
      await loadAdminData();
    }

    setIsLoading(false);
  };

  // ─── Load Admin Data ───────────────────────────────────────────────────────

  const loadAdminData = async () => {
    setIsLoadingAdmin(true);
    setAdminError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // Fetch all admin data from edge function (bypasses RLS)
      const res = await fetch(
        `https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/simple-admin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Admin data fetch failed (${res.status})`);
      }

      const data = await res.json();
      setAdminStats(data);

      // Also fetch Stripe data separately
      await fetchStripePayments(session.access_token);
    } catch (error: any) {
      console.error('[Dashboard] Admin data error:', error);
      setAdminError(error.message || 'Failed to load admin data');
    } finally {
      setIsLoadingAdmin(false);
    }
  };

  const fetchUserStats = async () => {
    try {
      // Get total users and recent signups
      const { data: users, error: usersError } = await supabase
        .from("profiles" as any)
        .select(`
          user_id,
          email,
          full_name,
          created_at,
          facebook_connected,
          onboarding_completed
        `)
        .order("created_at", { ascending: false })
        .limit(10);

      if (usersError) throw usersError;

      // Get businesses count
      const { count: businessCount } = await supabase
        .from("businesses" as any)
        .select("*", { count: 'exact', head: true });

      // Transform users data
      const adminUsers: AdminUser[] = (users || []).map((user: any) => ({
        id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        created_at: user.created_at,
        has_business: false, // We'll update this below
        business_name: null,
        has_campaign: false,
        campaign_count: 0,
        subscription_status: 'none',
        subscription_tier: 'free',
        subscription_end: null,
        facebook_connected: user.facebook_connected || false,
        onboarding_completed: user.onboarding_completed || false,
      }));

      setAdminStats(prev => prev ? {
        ...prev,
        total_users: users?.length || 0,
        users: adminUsers,
        total_businesses: businessCount || 0,
        fetched_at: new Date().toISOString(),
      } : {
        total_users: users?.length || 0,
        active_trials: 0,
        paying_customers: 0,
        mrr_cents: 0,
        conversion_rate: "0",
        users: adminUsers,
        total_businesses: businessCount || 0,
        total_campaigns: 0,
        active_campaigns: 0,
        total_leads: 0,
        total_spend_cents: 0,
        total_impressions: 0,
        total_clicks: 0,
        campaigns: [],
        marketing_insights: null,
        fetched_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Dashboard] User stats error:', error);
    }
  };

  const fetchCampaignStats = async () => {
    try {
      // Get all campaigns with business info
      const { data: campaigns, error: campaignsError } = await supabase
        .from("campaigns" as any)
        .select(`
          *,
          businesses!inner (
            name,
            user_id,
            profiles!inner (
              email
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (campaignsError) throw campaignsError;

      const adminCampaigns: AdminCampaign[] = (campaigns || []).map((camp: any) => ({
        id: camp.id,
        name: camp.name,
        status: camp.status,
        daily_budget_cents: camp.daily_budget_cents,
        leads_count: camp.leads_count || 0,
        spend_cents: camp.spend_cents || 0,
        impressions: camp.impressions || 0,
        clicks: camp.clicks || 0,
        cpl_cents: camp.cpl_cents,
        performance_status: camp.performance_status,
        created_at: camp.created_at,
        launched_at: camp.launched_at,
        last_synced_at: camp.last_synced_at,
        business_id: camp.business_id,
        business_name: camp.businesses?.name || 'Unknown',
        user_email: camp.businesses?.profiles?.email || 'Unknown',
      }));

      // Calculate totals
      const totalSpend = adminCampaigns.reduce((sum, c) => sum + (c.spend_cents || 0), 0);
      const totalLeads = adminCampaigns.reduce((sum, c) => sum + (c.leads_count || 0), 0);
      const totalImpressions = adminCampaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
      const totalClicks = adminCampaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
      const activeCampaigns = adminCampaigns.filter(c => c.status === 'active').length;

      setAdminStats(prev => prev ? {
        ...prev,
        total_campaigns: adminCampaigns.length,
        active_campaigns: activeCampaigns,
        total_leads: totalLeads,
        total_spend_cents: totalSpend,
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        campaigns: adminCampaigns,
        fetched_at: new Date().toISOString(),
      } : null);
    } catch (error) {
      console.error('[Dashboard] Campaign stats error:', error);
    }
  };

  const fetchMarketingInsights = async () => {
    try {
      // Try to fetch Meta marketing insights for our own campaign
      const MARKETING_CAMPAIGN_ID = "120241673514780057";
      
      // This would require Facebook access token - for now we'll skip it
      // In a real implementation, you'd need to store a long-lived access token
      console.log('[Dashboard] Marketing insights fetch skipped - would need FB token');
      
      setAdminStats(prev => prev ? {
        ...prev,
        marketing_insights: null,
        fetched_at: new Date().toISOString(),
      } : null);
    } catch (error) {
      console.error('[Dashboard] Marketing insights error:', error);
    }
  };

  const fetchStripePayments = async (accessToken: string) => {
    setIsLoadingStripe(true);
    setStripeError(null);
    try {
      const res = await fetch(
        `https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/admin-stripe-payments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load Stripe data");
      }
      setStripeData(data);
    } catch (error: any) {
      console.error("[Dashboard] Stripe payments error:", error);
      setStripeError(error.message || "Failed to load Stripe data");
    } finally {
      setIsLoadingStripe(false);
    }
  };

  useEffect(() => {
    // Track page view
    trackPageView('/dashboard', 'ZuckerBot — Dashboard');
    loadDashboard();
  }, [navigate]);

  useEffect(() => {
    setCampaignPage(1);
  }, [campaignView, showSpendOnly]);

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
  const latestRun = agentRuns[0] ?? null;
  const projectedRoiValues = agentRuns
    .map((run) => parseMultiplier(run?.analytics_projections?.estimated_roi))
    .filter((value): value is number => value !== null);
  const averageProjectedRoas = projectedRoiValues.length
    ? `${(projectedRoiValues.reduce((sum, value) => sum + value, 0) / projectedRoiValues.length).toFixed(1)}x`
    : "—";
  const latestProjectedRoas = latestRun?.analytics_projections?.estimated_roi || averageProjectedRoas;
  const dailyBurnRate = campaigns
    .filter((campaign) => campaign.status === "active")
    .reduce((sum, campaign) => sum + (campaign.daily_budget_cents || 0), 0);
  const aiEfficiency = agentRuns.length
    ? Math.round(
        (agentRuns.reduce((sum, run) => sum + getCompletedAgentSteps(run), 0) /
          (agentRuns.length * 5)) *
          100
      )
    : 0;

  const performanceSeries = campaigns.slice(0, 6).reverse();
  const maxSeriesSpend = Math.max(
    1,
    ...performanceSeries.map((campaign) => Math.max(1, campaign.spend_cents / 100))
  );
  const maxSeriesLeads = Math.max(1, ...performanceSeries.map((campaign) => campaign.leads_count || 0));

  const campaignSummaries = campaigns.filter((campaign) =>
    campaignView === "active" ? campaign.status !== "ended" : campaign.status === "ended"
  );
  const filteredCampaigns = campaignSummaries.filter((campaign) =>
    showSpendOnly ? campaign.spend_cents > 0 : true
  );
  const campaignsPerPage = 4;
  const totalCampaignPages = Math.max(1, Math.ceil(filteredCampaigns.length / campaignsPerPage));
  const safeCampaignPage = Math.min(campaignPage, totalCampaignPages);
  const paginatedCampaigns = filteredCampaigns.slice(
    (safeCampaignPage - 1) * campaignsPerPage,
    safeCampaignPage * campaignsPerPage
  );

  const aiAgents = [
    {
      name: "Brand Analyst",
      status: latestRun ? (latestRun.brand_data ? "completed" : "active") : "paused",
      detail:
        latestRun?.brand_data?.brand_name ||
        latestRun?.brand_data?.business_type ||
        "Waiting for intake data",
    },
    {
      name: "Competitor Watch",
      status: latestRun ? (latestRun.competitor_data ? "completed" : "active") : "paused",
      detail: latestRun?.competitor_data ? "Market scan completed" : "No competitor sweep yet",
    },
    {
      name: "Creative Engine",
      status: latestRun ? (latestRun.creative_data ? "completed" : "active") : "paused",
      detail: latestRun?.creative_data ? "Creative recommendations ready" : "Creative generation idle",
    },
    {
      name: "Campaign Planner",
      status: latestRun ? (latestRun.campaign_plan ? "completed" : "active") : "paused",
      detail: latestRun?.campaign_plan?.objective || "Awaiting launch plan",
    },
  ] as const;

  // ─── Loading ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface text-on-surface">
        <NavBar
          links={[
            { label: "Landing", href: "/" },
            { label: "Dashboard", href: "/dashboard" },
            { label: "Campaigns", href: "#campaigns" },
            { label: "Automation", href: "#agents" },
          ]}
          secondaryAction={{ label: "Docs", href: "/docs", variant: "tertiary" }}
          primaryAction={{ label: "New Campaign", href: "/campaign/new" }}
        />
        <div className="flex items-center justify-center py-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <NavBar
        links={[
          { label: "Landing", href: "/" },
          { label: "Dashboard", href: "/dashboard" },
          { label: "Campaigns", href: "#campaigns" },
          { label: "Automation", href: "#agents" },
        ]}
        secondaryAction={{ label: "Docs", href: "/docs", variant: "tertiary" }}
        primaryAction={{ label: "New Campaign", href: "/campaign/new" }}
      />

      <div className="pt-16">
        <div className="fixed left-0 top-16 hidden h-[calc(100vh-4rem)] w-[18rem] lg:block">
          <SidebarShell
            items={DASHBOARD_NAV_ITEMS}
            activeItem={activeNavItem}
            onItemClick={(item) => setActiveNavItem(item.id)}
            ctaHref="/campaign/new"
            ctaLabel="Create Campaign"
            className="h-full"
          />
        </div>

        <main className="px-6 py-8 lg:ml-[18rem] lg:px-10">
          <div className="mx-auto max-w-7xl space-y-8">
            <section id="overview" className="space-y-8">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-3">
                  <StatusBadge status="ai">Performance Dashboard</StatusBadge>
                  <div>
                    <h1 className="font-headline text-4xl font-black tracking-tight text-on-surface lg:text-5xl">
                      Overview Metrics
                    </h1>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-on-surface-variant">
                      {business
                        ? `${business.name}${business.suburb ? ` — ${business.suburb}` : ""} is running inside the Synthetix Indigo shell. Metrics and campaign controls below keep the existing live data and handlers intact.`
                        : "Live campaign performance, AI execution status, and campaign controls in one surface."}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <GradientButton
                    size="md"
                    variant="secondary"
                    onClick={handleRefreshStats}
                    disabled={isSyncing}
                  >
                    {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh Stats
                  </GradientButton>
                  <GradientButton size="md" onClick={() => navigate("/campaign/new")}>
                    <Plus className="h-4 w-4" />
                    New Campaign
                  </GradientButton>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Total Spend"
                  value={totalSpend > 0 ? formatCurrency(totalSpend) : "$0.00"}
                  trend={campaigns.length ? `${campaigns.length} tracked campaigns` : "No spend yet"}
                  tone="primary"
                  icon={<DollarSign className="h-4 w-4" />}
                />
                <MetricCard
                  label="Conversions"
                  value={String(totalLeads)}
                  trend={totalLeads > 0 ? "Lead events captured" : "Awaiting conversion data"}
                  tone="tertiary"
                  icon={<Users className="h-4 w-4" />}
                />
                <MetricCard
                  label="ROAS"
                  value={latestProjectedRoas}
                  trend={projectedRoiValues.length ? "Projected from AI runs" : "No ROI projection yet"}
                  tone="tertiary"
                  icon={<TrendingUp className="h-4 w-4" />}
                />
                <MetricCard
                  label="Active Campaigns"
                  value={String(activeCampaigns)}
                  trend={campaigns.length ? `${campaigns.length} total campaigns` : "Create your first campaign"}
                  tone="primary"
                  icon={<Megaphone className="h-4 w-4" />}
                />
              </div>

              <div id="performance" className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                <GlassCard className="p-8">
                  <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="font-headline text-2xl font-bold text-on-surface">Campaign Performance</h2>
                      <p className="mt-2 text-sm text-on-surface-variant">
                        Spend and lead volume across your latest campaign set.
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-xs text-outline">
                        <span className="h-3 w-3 rounded-full bg-primary" />
                        Spend
                      </div>
                      <div className="flex items-center gap-2 text-xs text-outline">
                        <span className="h-3 w-3 rounded-full bg-tertiary" />
                        Leads
                      </div>
                    </div>
                  </div>

                  {performanceSeries.length === 0 ? (
                    <div className="flex h-[18rem] items-center justify-center rounded-[1.5rem] bg-surface-container-low text-sm text-on-surface-variant">
                      Launch a campaign to populate the performance chart.
                    </div>
                  ) : (
                    <div className="grid grid-cols-6 gap-3 rounded-[1.5rem] bg-surface-container-low p-6">
                      {performanceSeries.map((campaign) => {
                        const spendHeight = `${Math.max(12, ((campaign.spend_cents / 100) / maxSeriesSpend) * 100)}%`;
                        const leadsHeight = `${Math.max(8, ((campaign.leads_count || 0) / maxSeriesLeads) * 100)}%`;

                        return (
                          <div key={campaign.id} className="flex min-w-0 flex-col items-center gap-3">
                            <div className="flex h-64 w-full items-end justify-center gap-2 rounded-2xl bg-surface p-4">
                              <div className="w-3 rounded-full bg-primary/75" style={{ height: spendHeight }} />
                              <div className="w-3 rounded-full bg-tertiary/75" style={{ height: leadsHeight }} />
                            </div>
                            <div className="text-center">
                              <p className="truncate font-label text-[10px] uppercase tracking-[0.18em] text-outline">
                                {truncateText(campaign.name, 12)}
                              </p>
                              <p className="mt-1 text-xs text-on-surface-variant">
                                {formatCurrency(campaign.spend_cents)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </GlassCard>

                <GlassCard id="agents" className="p-8">
                  <div className="mb-6">
                    <h2 className="font-headline text-2xl font-bold text-on-surface">Active AI Agents</h2>
                    <p className="mt-2 text-sm text-on-surface-variant">
                      Status signals pulled from your most recent agent runs.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {aiAgents.map((agent) => (
                      <div key={agent.name} className="rounded-[1.25rem] bg-surface-container p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-body text-sm font-semibold text-on-surface">{agent.name}</p>
                            <p className="mt-1 text-xs text-on-surface-variant">{agent.detail}</p>
                          </div>
                          <StatusBadge status={agent.status}>{displayCampaignStatus(agent.status)}</StatusBadge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <MetricCard
                      label="AI Efficiency"
                      value={`${aiEfficiency}%`}
                      trend={agentRuns.length ? "Completion rate across recent runs" : "No automation history yet"}
                      tone="tertiary"
                      icon={<Bot className="h-4 w-4" />}
                      className="bg-surface-container-low"
                    />
                    <MetricCard
                      label="Avg Cost / Lead"
                      value={avgCostPerLead !== null ? formatCurrency(avgCostPerLead) : "—"}
                      trend={avgCostPerLead !== null ? "Current blended CPL" : "Waiting for lead data"}
                      tone="primary"
                      icon={<Target className="h-4 w-4" />}
                      className="bg-surface-container-low"
                    />
                  </div>

                  <CodeBlock title="latest_agent_target" className="mt-6">
                    {latestRun?.url || "No recent agent target recorded."}
                  </CodeBlock>
                </GlassCard>
              </div>
            </section>

            {business && (
              <section id="workspace" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-headline text-2xl font-bold text-on-surface">Creative Workspace</h2>
                    <p className="mt-2 text-sm text-on-surface-variant">
                      Existing planning and creative logic, reskinned into the new dashboard shell.
                    </p>
                  </div>
                  <GradientButton asChild size="md" variant="secondary">
                    <Link to="/workspace">Open Workspace</Link>
                  </GradientButton>
                </div>
                <StrategyBrief businessId={business.id} businessName={business.name} />
              </section>
            )}

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-headline text-2xl font-bold text-on-surface">Recent AI Runs</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Detailed execution history from the current automation pipeline.
                  </p>
                </div>
                <StatusBadge status="live">{agentRuns.length} tracked</StatusBadge>
              </div>

              {isLoadingAgentRuns ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : agentRuns.length === 0 ? (
                <GlassCard className="p-10 text-center">
                  <Zap className="mx-auto h-10 w-10 text-outline" />
                  <h3 className="mt-4 font-headline text-xl font-semibold text-on-surface">No AI agent runs yet</h3>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Start a workspace run to populate this panel with brand, competitor, creative, and projection data.
                  </p>
                </GlassCard>
              ) : (
                <div className="grid gap-4">
                  {agentRuns.map((run: any) => {
                    const brandData = run.brand_data || {};
                    const competitorData = run.competitor_data || {};
                    const creativeData = run.creative_data || {};
                    const campaignPlan = run.campaign_plan || {};
                    const projections = run.analytics_projections || {};
                    const isExpanded = expandedRunId === run.id;
                    const agentSteps = [
                      { label: "Brand", done: !!run.brand_data },
                      { label: "Competitors", done: !!run.competitor_data },
                      { label: "Creatives", done: !!run.creative_data },
                      { label: "Campaign", done: !!run.campaign_plan },
                      { label: "Projections", done: !!run.analytics_projections },
                    ];

                    return (
                      <GlassCard key={run.id} className="p-6">
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <h3 className="font-body text-base font-semibold text-on-surface">{run.url || "Agent Run"}</h3>
                              <p className="mt-1 text-sm text-on-surface-variant">
                                {run.created_at ? relativeTime(run.created_at) : "—"}
                                {brandData.business_type ? ` · ${brandData.business_type}` : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {agentSteps.map((step) => (
                                <StatusBadge
                                  key={step.label}
                                  status={step.done ? "completed" : "paused"}
                                  className="text-[9px]"
                                >
                                  {step.label}
                                </StatusBadge>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-sm text-on-surface-variant">
                            {Array.isArray(competitorData.ads) && competitorData.ads.length > 0 ? (
                              <span>
                                <strong className="text-on-surface">{competitorData.ads.length}</strong> competitor ads
                              </span>
                            ) : null}
                            {Array.isArray(creativeData.creatives) && creativeData.creatives.length > 0 ? (
                              <span>
                                <strong className="text-on-surface">{creativeData.creatives.length}</strong> ad creatives
                              </span>
                            ) : null}
                            {campaignPlan.daily_budget ? (
                              <span>
                                <strong className="text-on-surface">${campaignPlan.daily_budget}</strong>/day
                              </span>
                            ) : null}
                            {projections.estimated_roi ? (
                              <span>
                                Projected ROI <strong className="text-tertiary">{projections.estimated_roi}</strong>
                              </span>
                            ) : null}
                          </div>

                          {isExpanded ? (
                            <div className="rounded-[1.25rem] bg-surface-container-low p-4 text-sm text-on-surface-variant">
                              {brandData.brand_name ? <p><span className="text-outline">Brand:</span> {brandData.brand_name}</p> : null}
                              {brandData.target_audience ? (
                                <p className="mt-2"><span className="text-outline">Audience:</span> {brandData.target_audience}</p>
                              ) : null}
                              {campaignPlan.objective ? (
                                <p className="mt-2"><span className="text-outline">Objective:</span> {campaignPlan.objective}</p>
                              ) : null}
                              {campaignPlan.duration ? (
                                <p className="mt-2"><span className="text-outline">Duration:</span> {campaignPlan.duration}</p>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="flex flex-wrap gap-3">
                            <GradientButton
                              size="sm"
                              variant="secondary"
                              onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                            >
                              {isExpanded ? "Hide Details" : "View Details"}
                            </GradientButton>
                            <GradientButton asChild size="sm" variant="tertiary">
                              <Link to="/workspace">Open in Workspace</Link>
                            </GradientButton>
                          </div>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </section>

            <section id="campaigns" className="space-y-6">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h2 className="font-headline text-4xl font-bold tracking-tight text-on-surface">Campaign Management</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-on-surface-variant">
                    Oversee and optimize your automated Meta marketing flows. AI-driven budget reallocation is
                    currently <span className="font-semibold text-tertiary">active</span> across your live ad sets.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-[1rem] bg-surface-container-low p-1">
                    <button
                      type="button"
                      onClick={() => setCampaignView("active")}
                      className={`rounded-[0.85rem] px-4 py-2 font-label text-sm ${
                        campaignView === "active"
                          ? "bg-surface-container text-on-surface"
                          : "text-on-surface-variant"
                      }`}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      onClick={() => setCampaignView("archived")}
                      className={`rounded-[0.85rem] px-4 py-2 font-label text-sm ${
                        campaignView === "archived"
                          ? "bg-surface-container text-on-surface"
                          : "text-on-surface-variant"
                      }`}
                    >
                      Archived
                    </button>
                  </div>

                  <GradientButton
                    size="md"
                    variant={showSpendOnly ? "primary" : "secondary"}
                    onClick={() => setShowSpendOnly((value) => !value)}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Filter
                  </GradientButton>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Live Campaigns"
                  value={String(activeCampaigns)}
                  trend={campaignView === "active" ? `${filteredCampaigns.length} visible` : "Archive view"}
                  tone="primary"
                  icon={<Megaphone className="h-4 w-4" />}
                />
                <MetricCard
                  label="Avg ROAS"
                  value={averageProjectedRoas}
                  trend={projectedRoiValues.length ? "Projected across AI runs" : "Awaiting ROI estimates"}
                  tone="tertiary"
                  icon={<TrendingUp className="h-4 w-4" />}
                />
                <MetricCard
                  label="Daily Burn Rate"
                  value={dailyBurnRate > 0 ? formatCurrency(dailyBurnRate) : "$0.00"}
                  trend={showSpendOnly ? "Spend-only filter enabled" : "Sum of active daily budgets"}
                  tone="neutral"
                  icon={<DollarSign className="h-4 w-4" />}
                />
                <MetricCard
                  label="AI Efficiency"
                  value={`${aiEfficiency}%`}
                  trend={agentRuns.length ? "Automation completion rate" : "No runs yet"}
                  tone="tertiary"
                  icon={<Bot className="h-4 w-4" />}
                  className="bg-tertiary-container/20"
                />
              </div>

              <GlassCard className="overflow-hidden p-0">
                {filteredCampaigns.length === 0 ? (
                  <div className="p-10 text-center">
                    <Megaphone className="mx-auto h-10 w-10 text-outline" />
                    <h3 className="mt-4 font-headline text-xl font-semibold text-on-surface">No campaigns in this view</h3>
                    <p className="mt-2 text-sm text-on-surface-variant">
                      Adjust the active/archive toggle or filter to view more campaign rows.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse text-left">
                        <thead>
                          <tr className="bg-surface-container-high/60">
                            <th className="px-6 py-5 font-label text-[10px] uppercase tracking-[0.2em] text-outline">Campaign Name</th>
                            <th className="px-6 py-5 font-label text-[10px] uppercase tracking-[0.2em] text-outline">Status</th>
                            <th className="px-6 py-5 font-label text-[10px] uppercase tracking-[0.2em] text-outline">Current ROAS</th>
                            <th className="px-6 py-5 font-label text-[10px] uppercase tracking-[0.2em] text-outline">Daily Budget</th>
                            <th className="px-6 py-5 text-right font-label text-[10px] uppercase tracking-[0.2em] text-outline">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedCampaigns.map((campaign) => {
                            const isDeleting = deletingId === campaign.id;
                            const isToggling = togglingId === campaign.id;
                            const canToggle =
                              !!campaign.meta_campaign_id &&
                              (campaign.status === "active" || campaign.status === "paused");
                            const roasDisplay =
                              campaign.cpl_cents != null && avgCostPerLead
                                ? `${Math.max(0.4, avgCostPerLead / Math.max(campaign.cpl_cents, 1)).toFixed(1)}x`
                                : latestProjectedRoas;

                            return (
                              <tr key={campaign.id} className="border-t border-outline-variant/10 transition-colors hover:bg-surface-container-low/60">
                                <td className="px-6 py-6">
                                  <div className="flex items-start gap-4">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-highest text-primary">
                                      <Megaphone className="h-4 w-4" />
                                    </div>
                                    <div className="space-y-1">
                                      <div className="font-body text-sm font-semibold text-on-surface">{campaign.name}</div>
                                      <div className="text-xs text-on-surface-variant">
                                        {campaign.meta_campaign_id ? "AI-Smart scaling enabled" : "Manual management"}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-6">
                                  <StatusBadge status={normalizeCampaignStatus(campaign.status)}>
                                    {displayCampaignStatus(campaign.status)}
                                  </StatusBadge>
                                </td>
                                <td className="px-6 py-6">
                                  <div className="space-y-2">
                                    <div className="font-headline text-lg font-bold text-tertiary">{roasDisplay}</div>
                                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-container-highest">
                                      <div
                                        className="h-full rounded-full bg-tertiary"
                                        style={{
                                          width: `${Math.min(100, Math.max(18, (parseMultiplier(roasDisplay) || 1) * 18))}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-6">
                                  <div className="font-body text-sm font-semibold text-on-surface">
                                    {formatCurrency(campaign.daily_budget_cents)}
                                  </div>
                                  <div className="mt-1 text-[10px] font-label uppercase tracking-[0.16em] text-on-surface-variant">
                                    {campaign.status === "active" ? "Live budget" : "Campaign inactive"}
                                  </div>
                                </td>
                                <td className="px-6 py-6">
                                  <div className="flex items-center justify-end gap-2">
                                    {canToggle ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isToggling}
                                        onClick={() => handleToggleCampaignStatus(campaign)}
                                      >
                                        {isToggling ? (
                                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                        ) : campaign.status === "active" ? (
                                          <Pause className="mr-1.5 h-3.5 w-3.5" />
                                        ) : (
                                          <Play className="mr-1.5 h-3.5 w-3.5" />
                                        )}
                                        {campaign.status === "active" ? "Pause" : "Resume"}
                                      </Button>
                                    ) : null}

                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                          disabled={isDeleting}
                                        >
                                          {isDeleting ? (
                                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                          )}
                                          Delete
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete "{campaign.name}"?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            This will delete the campaign from Facebook and remove all associated data.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            onClick={() => handleDeleteCampaign(campaign.id)}
                                          >
                                            Delete Campaign
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col gap-4 border-t border-outline-variant/10 bg-surface-container-high/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-label text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
                        Showing {paginatedCampaigns.length} of {filteredCampaigns.length} campaigns
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={safeCampaignPage === 1}
                          onClick={() => setCampaignPage((page) => Math.max(1, page - 1))}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-primary-container px-3 font-label text-xs font-bold text-on-primary-container">
                          {safeCampaignPage}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={safeCampaignPage >= totalCampaignPages}
                          onClick={() => setCampaignPage((page) => Math.min(totalCampaignPages, page + 1))}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </GlassCard>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-headline text-2xl font-bold text-on-surface">Recent Leads</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">The latest captured contacts from your live campaigns.</p>
                </div>
                <GradientButton asChild size="sm" variant="tertiary">
                  <Link to="/leads">View all leads</Link>
                </GradientButton>
              </div>

              {leads.length === 0 ? (
                <GlassCard className="p-10 text-center">
                  <Inbox className="mx-auto h-10 w-10 text-outline" />
                  <h3 className="mt-4 font-headline text-xl font-semibold text-on-surface">No leads yet</h3>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Launch a campaign to start populating your lead inbox.
                  </p>
                </GlassCard>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {leads.map((lead) => (
                    <GlassCard key={lead.id} className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-body text-sm font-semibold text-on-surface">{lead.name || "Unknown"}</p>
                            <StatusBadge status={lead.status === "won" ? "completed" : lead.status === "new" ? "active" : "paused"}>
                              {lead.status}
                            </StatusBadge>
                            {lead.sms_sent ? <StatusBadge status="live">SMS</StatusBadge> : null}
                          </div>
                          <div className="space-y-1 text-xs text-on-surface-variant">
                            {lead.phone ? <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{lead.phone}</p> : null}
                            {lead.email ? <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{lead.email}</p> : null}
                            {lead.suburb ? <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{lead.suburb}</p> : null}
                          </div>
                        </div>
                        <span className="font-label text-[10px] uppercase tracking-[0.18em] text-outline">
                          {relativeTime(lead.created_at)}
                        </span>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </section>

          {/* ─── Admin Section ───────────────────────────────────────────── */}
          {isAdmin && (
            <>
              {/* Admin divider */}
              <div className="border-t pt-8">
                <div className="flex items-center gap-2 mb-6">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Admin Overview</h2>
                  <Badge variant="outline" className="text-xs">
                    Admin Mode
                  </Badge>
                </div>

                {adminError && (
                  <Card className="mb-6">
                    <CardContent className="py-4">
                      <p className="text-sm text-destructive">
                        Unable to load admin data: {adminError}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {isLoadingAdmin && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading admin data...</span>
                  </div>
                )}

                {adminStats && (
                  <div className="space-y-6">
                    {/* Admin Stats Row */}
                    <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                      <AdminStatCard
                        icon={Users}
                        label="Total Sign-ups"
                        value={String(adminStats.total_users)}
                      />
                      <AdminStatCard
                        icon={Zap}
                        label="Active Trials"
                        value={String(adminStats.active_trials)}
                        accent="blue"
                      />
                      <AdminStatCard
                        icon={DollarSign}
                        label="Paying Customers"
                        value={String(adminStats.paying_customers)}
                        accent="green"
                      />
                      <AdminStatCard
                        icon={TrendingUp}
                        label="MRR"
                        value={adminStats.mrr_cents > 0 ? formatCurrency(adminStats.mrr_cents) : "$0"}
                        accent="green"
                      />
                      <AdminStatCard
                        icon={Target}
                        label="Trial→Paid"
                        value={`${adminStats.conversion_rate}%`}
                      />
                      <AdminStatCard
                        icon={Megaphone}
                        label="Total Ad Spend"
                        value={adminStats.total_spend_cents > 0 ? formatCurrency(adminStats.total_spend_cents) : "$0"}
                      />
                    </div>

                    {/* Marketing Campaign Performance */}
                    <section className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        Marketing Campaign Performance
                      </h3>
                      {adminStats.marketing_insights ? (
                        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                          <AdminMetricCard
                            label="Impressions"
                            value={adminStats.marketing_insights.impressions.toLocaleString()}
                          />
                          <AdminMetricCard
                            label="Reach"
                            value={adminStats.marketing_insights.reach.toLocaleString()}
                          />
                          <AdminMetricCard
                            label="Clicks"
                            value={adminStats.marketing_insights.clicks.toLocaleString()}
                          />
                          <AdminMetricCard
                            label="CTR"
                            value={`${parseFloat(adminStats.marketing_insights.ctr).toFixed(2)}%`}
                          />
                          <AdminMetricCard
                            label="Spend"
                            value={`$${parseFloat(adminStats.marketing_insights.spend).toFixed(2)}`}
                          />
                          <AdminMetricCard
                            label="CPC"
                            value={`$${parseFloat(adminStats.marketing_insights.cpc).toFixed(2)}`}
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
                              Campaign ID: 120241673514780057
                            </p>
                          </CardContent>
                        </Card>
                      )}
                    </section>

                    {/* GA4 Analytics */}
                    <section className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Website Analytics (GA4)
                      </h3>
                      {adminStats.ga4_analytics?.configured ? (
                        <div className="space-y-4">
                          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                            <AdminMetricCard
                              label="Page Views (30d)"
                              value={adminStats.ga4_analytics.last_30_days?.page_views?.toLocaleString() || "—"}
                            />
                            <AdminMetricCard
                              label="Sessions (30d)"
                              value={adminStats.ga4_analytics.last_30_days?.sessions?.toLocaleString() || "—"}
                            />
                            <AdminMetricCard
                              label="Users (30d)"
                              value={adminStats.ga4_analytics.last_30_days?.users?.toLocaleString() || "—"}
                            />
                            <AdminMetricCard
                              label="Conversion Rate"
                              value={`${adminStats.ga4_analytics.last_30_days?.conversion_rate || "0"}%`}
                            />
                          </div>
                          
                          <div className="grid md:grid-cols-2 gap-4">
                            {/* Top Pages */}
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-sm">Top Pages</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-2">
                                  {adminStats.ga4_analytics.top_pages?.map((page, i) => (
                                    <div key={i} className="flex justify-between text-sm">
                                      <span className="truncate">{page.path}</span>
                                      <span className="text-muted-foreground">{page.views}</span>
                                    </div>
                                  )) || <p className="text-sm text-muted-foreground">No data</p>}
                                </div>
                              </CardContent>
                            </Card>

                            {/* Traffic Sources */}
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-sm">Traffic Sources</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-2">
                                  {adminStats.ga4_analytics.traffic_sources?.map((source, i) => (
                                    <div key={i} className="flex justify-between text-sm">
                                      <span className="capitalize">{source.source}</span>
                                      <span className="text-muted-foreground">{source.sessions}</span>
                                    </div>
                                  )) || <p className="text-sm text-muted-foreground">No data</p>}
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      ) : (
                        <Card>
                          <CardContent className="py-8 text-center">
                            <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">
                              GA4 Analytics not configured yet.
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {adminStats.ga4_analytics?.message || "Add GA4_MEASUREMENT_ID to environment variables"}
                            </p>
                          </CardContent>
                        </Card>
                      )}
                    </section>

                    {/* Recent Signups Table */}
                    <section className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" />
                          Recent Sign-ups
                        </h3>
                        <Badge variant="outline">{adminStats.total_users} users</Badge>
                      </div>

                      {adminStats.users.length === 0 ? (
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
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {adminStats.users.map((user) => {
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
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      )}
                    </section>

                    {/* All User Campaigns Overview */}
                    <section className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Megaphone className="h-4 w-4 text-primary" />
                          All User Campaigns
                        </h3>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{adminStats.active_campaigns} active</Badge>
                          <Badge variant="secondary">{adminStats.total_campaigns} total</Badge>
                        </div>
                      </div>

                      {adminStats.campaigns.length === 0 ? (
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
                                  <TableHead>User</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="text-right">Budget/day</TableHead>
                                  <TableHead className="text-right">Impressions</TableHead>
                                  <TableHead className="text-right">Clicks</TableHead>
                                  <TableHead className="text-right">Leads</TableHead>
                                  <TableHead className="text-right">Spend</TableHead>
                                  <TableHead className="text-right">CPL</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {adminStats.campaigns.map((campaign) => {
                                  const statusBadge = CAMPAIGN_STATUS_BADGE[campaign.status] || CAMPAIGN_STATUS_BADGE.draft;
                                  const ctr = campaign.impressions > 0
                                    ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2)
                                    : "0.00";

                                  return (
                                    <TableRow key={campaign.id}>
                                      <TableCell className="font-medium text-sm max-w-[180px]">
                                        <span className="truncate block">{campaign.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {campaign.business_name}
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-sm max-w-[150px] truncate">
                                        {campaign.user_email}
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
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                              <TableFooter>
                                <TableRow>
                                  <TableCell className="font-semibold" colSpan={4}>
                                    Totals
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {adminStats.total_impressions.toLocaleString()}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {adminStats.total_clicks.toLocaleString()}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {adminStats.total_leads}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {formatCurrency(adminStats.total_spend_cents)}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {adminStats.total_leads > 0
                                      ? formatCurrency(Math.round(adminStats.total_spend_cents / adminStats.total_leads))
                                      : "—"}
                                  </TableCell>
                                </TableRow>
                              </TableFooter>
                            </Table>
                          </CardContent>
                        </Card>
                      )}
                    </section>

                    {/* ─── Stripe Payments Section ─────────────────────────── */}
                    <section className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-primary" />
                          Stripe Payments
                        </h3>
                        {stripeData && (
                          <Badge variant="outline" className="text-xs">
                            {stripeData.payments.length} recent
                          </Badge>
                        )}
                      </div>

                      {isLoadingStripe && (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <span className="ml-2 text-sm text-muted-foreground">Loading Stripe data...</span>
                        </div>
                      )}

                      {stripeError && (
                        <Card>
                          <CardContent className="py-4">
                            <p className="text-sm text-destructive">
                              Unable to load Stripe data: {stripeError}
                            </p>
                          </CardContent>
                        </Card>
                      )}

                      {stripeData && (
                        <div className="space-y-4">
                          {/* Summary Stats */}
                          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                            <AdminStatCard
                              icon={DollarSign}
                              label="Total Revenue"
                              value={`$${(stripeData.summary.total_revenue_cents / 100).toFixed(2)}`}
                              accent="green"
                            />
                            <AdminStatCard
                              icon={CreditCard}
                              label="Active Subs"
                              value={String(stripeData.summary.active_subscriptions)}
                              accent="blue"
                            />
                            <AdminStatCard
                              icon={Zap}
                              label="Failed Payments"
                              value={String(stripeData.summary.failed_count)}
                            />
                            <AdminStatCard
                              icon={RefreshCw}
                              label="Refunded"
                              value={String(stripeData.summary.refunded_count)}
                            />
                          </div>

                          {/* Payments Table */}
                          {stripeData.payments.length === 0 ? (
                            <Card>
                              <CardContent className="py-12 text-center">
                                <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                              </CardContent>
                            </Card>
                          ) : (
                            <Card>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-base">Recent Payments</CardTitle>
                              </CardHeader>
                              <CardContent className="p-0">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Date</TableHead>
                                      <TableHead>Customer</TableHead>
                                      <TableHead className="text-right">Amount (AUD)</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead className="text-center">Receipt</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {stripeData.payments.map((payment) => {
                                      const paymentDate = new Date(payment.created * 1000);
                                      const displayStatus = payment.refunded
                                        ? "refunded"
                                        : payment.status;
                                      const statusClass =
                                        displayStatus === "succeeded"
                                          ? "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800"
                                          : displayStatus === "failed"
                                          ? "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800"
                                          : displayStatus === "refunded"
                                          ? "bg-yellow-500/10 text-yellow-700 border-yellow-200 dark:text-yellow-400 dark:border-yellow-800"
                                          : "bg-gray-500/10 text-gray-500 border-gray-200";

                                      return (
                                        <TableRow key={payment.id}>
                                          <TableCell className="text-sm whitespace-nowrap">
                                            {paymentDate.toLocaleDateString("en-AU", {
                                              day: "numeric",
                                              month: "short",
                                              year: "numeric",
                                            })}
                                            <span className="block text-xs text-muted-foreground">
                                              {paymentDate.toLocaleTimeString("en-AU", {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                              })}
                                            </span>
                                          </TableCell>
                                          <TableCell className="text-sm max-w-[200px] truncate">
                                            {payment.customer_email || "—"}
                                            {payment.customer_name && (
                                              <span className="block text-xs text-muted-foreground truncate">
                                                {payment.customer_name}
                                              </span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right text-sm font-medium">
                                            ${(payment.amount_cents / 100).toFixed(2)}
                                          </TableCell>
                                          <TableCell>
                                            <Badge
                                              variant="outline"
                                              className={`text-xs capitalize ${statusClass}`}
                                            >
                                              {displayStatus}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="text-center">
                                            {payment.invoice_url ? (
                                              <a
                                                href={payment.invoice_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <ExternalLink className="h-3 w-3" />
                                                View
                                              </a>
                                            ) : (
                                              <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </CardContent>
                            </Card>
                          )}

                          {/* Active Subscriptions */}
                          {stripeData.subscriptions.length > 0 && (
                            <Card>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-base">Active Subscriptions</CardTitle>
                              </CardHeader>
                              <CardContent className="p-0">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Subscription ID</TableHead>
                                      <TableHead className="text-right">Amount</TableHead>
                                      <TableHead>Interval</TableHead>
                                      <TableHead>Renews</TableHead>
                                      <TableHead>Status</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {stripeData.subscriptions.map((sub) => (
                                      <TableRow key={sub.id}>
                                        <TableCell className="text-sm font-mono text-xs max-w-[200px] truncate">
                                          {sub.id}
                                        </TableCell>
                                        <TableCell className="text-right text-sm font-medium">
                                          ${(sub.plan_amount_cents / 100).toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-sm capitalize">
                                          {sub.plan_interval}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                          {new Date(sub.current_period_end * 1000).toLocaleDateString("en-AU", {
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric",
                                          })}
                                          {sub.cancel_at_period_end && (
                                            <span className="block text-xs text-yellow-600">Cancels at end</span>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <Badge
                                            variant="outline"
                                            className="text-xs bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800 capitalize"
                                          >
                                            {sub.status}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  </div>
  );
};

// ─── Helper Functions ──────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

// ─── Admin Stat Card Sub-Component ──────────────────────────────────────────

function AdminStatCard({
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

// ─── Admin Metric Card (for marketing insights) ────────────────────────────

function AdminMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

export default Dashboard;

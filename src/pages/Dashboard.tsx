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
        <Navbar isAdmin={isAdmin} />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Navbar isAdmin={isAdmin} />
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

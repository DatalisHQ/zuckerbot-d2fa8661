import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { trackPageView } from "@/utils/analytics";
import { Navbar } from "@/components/Navbar";
import AgencyGreeting from "@/components/AgencyGreeting";
import AgencyStats from "@/components/AgencyStats";
import ApprovalQueue from "@/components/ApprovalQueue";
import ActivityFeed from "@/components/ActivityFeed";
import type { AutomationRun } from "@/components/ActivityFeed";
import UnderTheHood from "@/components/UnderTheHood";
import { Loader2 } from "lucide-react";

const ADMIN_EMAIL = "davisgrainger@gmail.com";

export default function AgencyDashboard() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | undefined>(
    undefined
  );
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [agentsEnabled, setAgentsEnabled] = useState(5);
  const [hoodExpanded, setHoodExpanded] = useState(false);

  // Derived stats
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const tasksThisWeek = runs.filter(
    (r) => new Date(r.created_at).getTime() > oneWeekAgo
  ).length;
  const pendingApprovals = runs.filter(
    (r) => r.requires_approval && !r.approved_at
  ).length;
  const hasAnomalies = runs.some(
    (r) =>
      r.status === "failed" ||
      (r.agent_type === "performance_monitor" &&
        r.status === "needs_approval")
  );

  const isAdmin = userEmail === ADMIN_EMAIL;

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      // Get current user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        navigate("/auth");
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email ?? null);

      // Fetch business
      const { data: businesses, error: bizError } = await supabase
        .from("businesses")
        .select("id, name")
        .eq("user_id", user.id)
        .limit(1);

      if (bizError) {
        console.error("[AgencyDashboard] Error fetching business:", bizError);
      }

      if (!businesses || businesses.length === 0) {
        navigate("/onboarding");
        return;
      }

      const biz = businesses[0];
      setBusinessId(biz.id);
      setBusinessName(biz.name || undefined);

      // Fetch automation runs
      const { data: runsData, error: runsError } = await supabase
        .from("automation_runs")
        .select("*")
        .eq("business_id", biz.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (runsError) {
        console.error(
          "[AgencyDashboard] Error fetching automation_runs:",
          runsError
        );
      }

      setRuns((runsData as unknown as AutomationRun[]) || []);

      // Fetch automation config (optional, may not exist)
      const { data: configData } = await supabase
        .from("automation_config")
        .select("enabled_agents")
        .eq("business_id", biz.id)
        .limit(1)
        .maybeSingle();

      if (configData?.enabled_agents) {
        const agents = configData.enabled_agents as unknown;
        if (Array.isArray(agents)) {
          setAgentsEnabled(agents.length);
        } else if (typeof agents === "number") {
          setAgentsEnabled(agents);
        }
      }
    } catch (err) {
      console.error("[AgencyDashboard] Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchData();
    trackPageView("/agency", "Agency Dashboard");
  }, [fetchData]);

  // Handlers
  const handleApprove = async (runId: string) => {
    try {
      const res = await fetch("/api/agents/execute-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, action: "approve" }),
      });
      if (!res.ok) {
        console.error("Approve failed:", await res.text());
      }
      // Refresh data
      await fetchData();
    } catch (err) {
      console.error("Approve error:", err);
    }
  };

  const handleDismiss = async (runId: string) => {
    try {
      const res = await fetch("/api/agents/execute-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, action: "dismiss" }),
      });
      if (!res.ok) {
        console.error("Dismiss failed:", await res.text());
      }
      await fetchData();
    } catch (err) {
      console.error("Dismiss error:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar isAdmin={isAdmin} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Greeting */}
        <AgencyGreeting
          pendingApprovals={pendingApprovals}
          recentRunCount={tasksThisWeek}
          hasAnomalies={hasAnomalies}
          businessName={businessName}
        />

        {/* Stats */}
        <AgencyStats
          agentsEnabled={agentsEnabled}
          tasksThisWeek={tasksThisWeek}
          pendingApprovals={pendingApprovals}
        />

        {/* Approval Queue (only if pending items) */}
        <ApprovalQueue
          runs={runs}
          onApprove={handleApprove}
          onDismiss={handleDismiss}
        />

        {/* Activity Feed */}
        <ActivityFeed
          runs={runs}
          businessId={businessId || undefined}
          userId={userId || undefined}
          onRefresh={fetchData}
        />

        {/* Under the Hood */}
        <UnderTheHood
          runs={runs}
          isExpanded={hoodExpanded}
          onToggle={() => setHoodExpanded((v) => !v)}
        />
      </main>
    </div>
  );
}

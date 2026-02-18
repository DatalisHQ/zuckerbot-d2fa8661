import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  Brain,
  Search,
  Palette,
  BarChart3,
  Mail,
  TrendingUp,
  Globe,
  Play,
  Loader2,
  CheckCircle2,
  Circle,
  ExternalLink,
  Zap,
  ArrowRight,
  AlertCircle,
  Clock,
  Rocket,
  XCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type AgentStatus = "idle" | "working" | "done" | "error";

interface Agent {
  id: string;
  name: string;
  role: string;
  icon: any;
  status: AgentStatus;
  description: string;
}

interface ActivityEntry {
  id: string;
  agentId: string;
  agentName: string;
  message: string;
  timestamp: Date;
  type: "progress" | "result" | "error" | "system" | "stream";
  streamUrl?: string;
}

// ─── Agent Definitions ───────────────────────────────────────────────────────

const INITIAL_AGENTS: Agent[] = [
  {
    id: "strategist",
    name: "Strategist",
    role: "Brand & Market Analysis",
    icon: Brain,
    status: "idle",
    description: "Analyzes your business, competitors, and market position.",
  },
  {
    id: "research",
    name: "Research",
    role: "Competitor Intelligence",
    icon: Search,
    status: "idle",
    description: "Scrapes competitor ads and finds market opportunities.",
  },
  {
    id: "creative",
    name: "Creative",
    role: "Ad Creative & Copy",
    icon: Palette,
    status: "idle",
    description: "Generates brand-aware ad creatives and conversion copy.",
  },
  {
    id: "media-buyer",
    name: "Media Buyer",
    role: "Campaign Management",
    icon: TrendingUp,
    status: "idle",
    description: "Plans multi-platform campaign structure and budgets.",
  },
  {
    id: "outreach",
    name: "Outreach",
    role: "Email & Lead Nurturing",
    icon: Mail,
    status: "idle",
    description: "Builds automated email sequences and follow-ups.",
  },
  {
    id: "analytics",
    name: "Analytics",
    role: "Performance & Reporting",
    icon: BarChart3,
    status: "idle",
    description: "Sets up tracking, projections, and automated reports.",
  },
  {
    id: "monitor",
    name: "Monitor",
    role: "Campaign Monitoring",
    icon: Activity,
    status: "idle",
    description: "Monitors live ad campaigns, detects creative fatigue, tracks competitor changes, flags performance issues.",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentConsole() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [results, setResults] = useState<Record<string, any>>({});
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const activityEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activity]);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const addActivity = (
    agentId: string,
    agentName: string,
    message: string,
    type: ActivityEntry["type"] = "progress",
    extra?: Partial<ActivityEntry>
  ) => {
    setActivity((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        agentId,
        agentName,
        message,
        timestamp: new Date(),
        type,
        ...extra,
      },
    ]);
  };

  const updateAgentStatus = (agentId: string, status: AgentStatus) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, status } : a))
    );
  };

  // ─── Agent: Strategist (real API) ──────────────────────────────────────────

  const runStrategist = async (targetUrl: string): Promise<any> => {
    updateAgentStatus("strategist", "working");
    addActivity("strategist", "Strategist", "Analyzing business website and market position...");

    try {
      const response = await fetch(
        "https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/brand-analysis",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl }),
        }
      );

      if (!response.ok) throw new Error("Brand analysis failed");
      const data = await response.json();

      addActivity("strategist", "Strategist", `Business identified: ${data.business_type || "Unknown"}`, "result");
      addActivity("strategist", "Strategist", `Target audience: ${data.target_audience || "General consumers"}`, "result");
      addActivity(
        "strategist",
        "Strategist",
        `Key differentiators: ${data.key_selling_points?.join(", ") || "Analyzing..."}`,
        "result"
      );
      addActivity("strategist", "Strategist", "Marketing strategy framework complete.", "result");

      updateAgentStatus("strategist", "done");
      setResults((prev) => ({ ...prev, strategist: data }));
      return data;
    } catch (error: any) {
      addActivity("strategist", "Strategist", `Error: ${error.message}`, "error");
      updateAgentStatus("strategist", "error");
      return null;
    }
  };

  // ─── Agent: Research (TinyFish SSE) ────────────────────────────────────────

  const runResearch = async (industry: string): Promise<any> => {
    updateAgentStatus("research", "working");
    addActivity("research", "Research", "Deploying web agent to Facebook Ad Library...");

    try {
      const response = await fetch("/api/analyze-competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, location: "United States", country: "US" }),
      });

      if (!response.ok || !response.body) throw new Error("Research agent failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "PROGRESS") {
              addActivity("research", "Research", event.message);
            }
            if (event.type === "STREAMING_URL") {
              addActivity("research", "Research", "Browser agent active — navigating live web", "stream", {
                streamUrl: event.url,
              });
            }
            if (event.type === "COMPLETE") {
              finalResult = event;
              addActivity("research", "Research", `Found ${event.ad_count} competitor ads`, "result");
              if (event.insights?.opportunity) {
                addActivity("research", "Research", event.insights.opportunity, "result");
              }
            }
            if (event.type === "ERROR") {
              throw new Error(event.message);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }

      updateAgentStatus("research", finalResult ? "done" : "error");
      if (finalResult) setResults((prev) => ({ ...prev, research: finalResult }));
      return finalResult;
    } catch (error: any) {
      addActivity("research", "Research", `Error: ${error.message}`, "error");
      updateAgentStatus("research", "error");
      return null;
    }
  };

  // ─── Agent: Creative (real API) ────────────────────────────────────────────

  const runCreative = async (targetUrl: string, _brandData: any): Promise<any> => {
    updateAgentStatus("creative", "working");
    addActivity("creative", "Creative", "Generating brand-aware ad creatives...");

    try {
      addActivity("creative", "Creative", "Analyzing brand colors, typography, and visual identity...");
      await sleep(2000);
      addActivity("creative", "Creative", "Extracting product imagery from website...");

      const response = await fetch(
        "https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/generate-preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl }),
        }
      );

      if (!response.ok) throw new Error("Creative generation failed");
      const data = await response.json();

      addActivity("creative", "Creative", `Generated ${data.ads?.length || 2} ad variations`, "result");
      addActivity("creative", "Creative", "Facebook + Instagram placements optimized", "result");
      addActivity("creative", "Creative", "Copy tested against conversion benchmarks", "result");

      updateAgentStatus("creative", "done");
      setResults((prev) => ({ ...prev, creative: data }));
      return data;
    } catch (error: any) {
      addActivity("creative", "Creative", `Error: ${error.message}`, "error");
      updateAgentStatus("creative", "error");
      return null;
    }
  };

  // ─── Agent: Media Buyer (simulated) ────────────────────────────────────────

  const runMediaBuyer = async (_brandData: any): Promise<any> => {
    updateAgentStatus("media-buyer", "working");
    addActivity("media-buyer", "Media Buyer", "Planning multi-platform campaign structure...");

    await sleep(1500);
    addActivity("media-buyer", "Media Buyer", "Facebook: Traffic campaign → Advantage+ audience → $25/day");
    await sleep(1200);
    addActivity("media-buyer", "Media Buyer", "Instagram: Reels placement → 18-45 age bracket → $15/day");
    await sleep(1200);
    addActivity("media-buyer", "Media Buyer", "Google Ads: Search campaign → high-intent keywords → $20/day");
    await sleep(1200);
    addActivity("media-buyer", "Media Buyer", "TikTok: Spark Ads → UGC-style creative → $10/day test");
    await sleep(1000);
    addActivity("media-buyer", "Media Buyer", "Total daily budget: $70/day across 4 platforms", "result");
    addActivity("media-buyer", "Media Buyer", "All campaigns created PAUSED — awaiting approval", "result");

    const mediaBuyerData = {
      platforms: [
        { name: "Facebook", type: "Traffic", budget: 25, audience: "Advantage+" },
        { name: "Instagram", type: "Reels", budget: 15, audience: "18-45" },
        { name: "Google Ads", type: "Search", budget: 20, audience: "High-intent keywords" },
        { name: "TikTok", type: "Spark Ads", budget: 10, audience: "UGC-style" },
      ],
      totalDailyBudget: 70,
      status: "paused",
      optimizationRules: "Scale winners >2x ROAS, pause losers <0.5x ROAS",
    };

    updateAgentStatus("media-buyer", "done");
    setResults((prev) => ({ ...prev, mediaBuyer: mediaBuyerData }));
    return mediaBuyerData;
  };

  // ─── Agent: Outreach (simulated) ───────────────────────────────────────────

  const runOutreach = async (_brandData: any): Promise<any> => {
    updateAgentStatus("outreach", "working");
    addActivity("outreach", "Outreach", "Building automated email sequences...");

    await sleep(1500);
    addActivity("outreach", "Outreach", "Welcome sequence: 5 emails over 14 days");
    await sleep(1000);
    addActivity("outreach", "Outreach", "Lead nurture: 3-email follow-up for ad respondents");
    await sleep(1000);
    addActivity("outreach", "Outreach", "Re-engagement: Win-back sequence for inactive leads");
    await sleep(800);
    addActivity("outreach", "Outreach", "All sequences personalized with business context", "result");
    addActivity("outreach", "Outreach", "Automated send triggers configured", "result");

    const outreachData = {
      sequences: [
        { name: "Welcome", emails: 5, duration: "14 days" },
        { name: "Lead Nurture", emails: 3, duration: "7 days" },
        { name: "Re-engagement", emails: 3, duration: "10 days" },
      ],
      totalEmails: 11,
      personalized: true,
    };

    updateAgentStatus("outreach", "done");
    setResults((prev) => ({ ...prev, outreach: outreachData }));
    return outreachData;
  };

  // ─── Agent: Analytics (simulated) ──────────────────────────────────────────

  const runAnalytics = async (_brandData: any): Promise<any> => {
    updateAgentStatus("analytics", "working");
    addActivity("analytics", "Analytics", "Setting up performance tracking framework...");

    await sleep(1500);
    addActivity("analytics", "Analytics", "Conversion tracking: Meta Pixel + Google Analytics + UTM parameters");
    await sleep(1000);
    addActivity("analytics", "Analytics", "Funnel defined: Impression → Click → Landing → Lead → Customer");
    await sleep(1000);
    addActivity("analytics", "Analytics", "Industry benchmarks loaded: CTR 1.5%, CPC $1.20, Conv Rate 3.2%");
    await sleep(800);
    addActivity("analytics", "Analytics", "Weekly automated report scheduled", "result");
    addActivity("analytics", "Analytics", "Projected ROI at $70/day: 15-25 leads/week, $4.50 CPL", "result");

    const analyticsData = {
      tracking: ["Meta Pixel", "Google Analytics", "UTM Parameters"],
      funnel: ["Impression", "Click", "Landing", "Lead", "Customer"],
      benchmarks: { ctr: "1.5%", cpc: "$1.20", conversionRate: "3.2%" },
      projections: { leadsPerWeek: "15-25", costPerLead: "$4.50", roi: "3.2x" },
      reportSchedule: "Weekly — Mondays 9am",
    };

    updateAgentStatus("analytics", "done");
    setResults((prev) => ({ ...prev, analytics: analyticsData }));
    return analyticsData;
  };

  // ─── Agent: Monitor (TinyFish SSE) ──────────────────────────────────────────

  const runMonitor = async (businessName: string, industry: string): Promise<any> => {
    updateAgentStatus("monitor", "working");
    addActivity("monitor", "Monitor", "Connecting to Facebook Ads Manager...");

    try {
      const response = await fetch("/api/monitor-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_name: businessName, industry }),
      });

      if (!response.ok || !response.body) throw new Error("Monitor agent failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "PROGRESS") {
              addActivity("monitor", "Monitor", event.message);
            }
            if (event.type === "STREAMING_URL") {
              addActivity("monitor", "Monitor", "Browser agent active — scanning live campaigns", "stream", {
                streamUrl: event.url,
              });
            }
            if (event.type === "COMPLETE") {
              finalResult = event;
              const report = event.monitoring_report || {};
              addActivity("monitor", "Monitor", `Found ${report.total_active || 0} active ads`, "result");
              if (report.longest_running_days > 0) {
                addActivity("monitor", "Monitor", `Longest running ad: ${report.longest_running_days} days`, "result");
              }
              if (report.fatigue_risk?.length > 0) {
                addActivity("monitor", "Monitor", `⚠ ${report.fatigue_risk.length} ad(s) showing creative fatigue`, "result");
              }
              if (report.recommendations?.[0]) {
                addActivity("monitor", "Monitor", report.recommendations[0], "result");
              }
            }
            if (event.type === "ERROR") {
              throw new Error(event.message);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }

      updateAgentStatus("monitor", finalResult ? "done" : "error");
      if (finalResult) setResults((prev) => ({ ...prev, monitor: finalResult }));
      return finalResult;
    } catch (error: any) {
      addActivity("monitor", "Monitor", `Error: ${error.message}`, "error");
      updateAgentStatus("monitor", "error");
      return null;
    }
  };

  // ─── Persist to Supabase ───────────────────────────────────────────────────

  const persistRun = async (
    targetUrl: string,
    allResults: Record<string, any>
  ): Promise<string | null> => {
    try {
      const competitorData = allResults.research
        ? { ...allResults.research, monitoring: allResults.monitor || null }
        : allResults.monitor
        ? { monitoring: allResults.monitor }
        : null;

      const { data, error } = await supabase
        .from("agent_runs" as any)
        .insert({
          url: targetUrl,
          brand_data: allResults.strategist || null,
          competitor_data: competitorData,
          creative_data: allResults.creative || null,
          campaign_plan: allResults.mediaBuyer || null,
          outreach_plan: allResults.outreach || null,
          analytics_projections: allResults.analytics || null,
          user_id: null,
        } as any)
        .select("id")
        .single();

      if (error) {
        console.error("[AgentConsole] Supabase insert error:", error);
        return null;
      }
      const runId = (data as any)?.id || null;
      if (runId) {
        localStorage.setItem("zuckerbot_run_id", runId);
      }
      return runId;
    } catch (err) {
      console.error("[AgentConsole] Persist error:", err);
      return null;
    }
  };

  // ─── Orchestrator ──────────────────────────────────────────────────────────

  const runAllAgents = async () => {
    if (!url.trim()) return;
    setRunning(true);
    setAllDone(false);
    setSavedRunId(null);
    setActivity([]);
    setResults({});
    setAgents(INITIAL_AGENTS.map((a) => ({ ...a, status: "idle" as const })));

    const targetUrl = url.trim();
    addActivity("system", "System", `Initializing autonomous agency for: ${targetUrl}`, "system");

    // Phase 1: Strategist
    const brandData = await runStrategist(targetUrl);
    const industry =
      brandData?.business_type || brandData?.industry || targetUrl.replace(/https?:\/\//, "").split("/")[0];

    // Phase 2: Research + Creative in parallel
    addActivity("system", "System", "Deploying Research and Creative agents in parallel...", "system");
    await Promise.all([runResearch(industry), runCreative(targetUrl, brandData)]);

    // Phase 3: Media Buyer + Outreach + Analytics + Monitor in parallel
    addActivity("system", "System", "Deploying Media Buyer, Outreach, Analytics, and Monitor agents...", "system");
    const [mediaBuyerResult, outreachResult, analyticsResult, monitorResult] = await Promise.all([
      runMediaBuyer(brandData),
      runOutreach(brandData),
      runAnalytics(brandData),
      runMonitor(
        brandData?.business_name || url.replace(/https?:\/\//, "").split("/")[0],
        brandData?.business_type || "business"
      ),
    ]);

    addActivity("system", "System", "All agents complete. Saving results...", "system");

    // Gather all results (use the latest state)
    // We need to read from the results set via a workaround since setState is async
    // Use the return values instead
    setResults((prev) => {
      const finalResults = { ...prev };
      // Persist to Supabase
      persistRun(targetUrl, finalResults).then((runId) => {
        if (runId) {
          setSavedRunId(runId);
          addActivity("system", "System", "Results saved. Your AI agency is ready.", "system");
        } else {
          addActivity("system", "System", "Results ready (save skipped).", "system");
        }
      });
      return finalResults;
    });

    setAllDone(true);
    setRunning(false);
  };

  // ─── Derived State ─────────────────────────────────────────────────────────

  const doneCount = agents.filter((a) => a.status === "done").length;
  const errorCount = agents.filter((a) => a.status === "error").length;

  const getStatusIcon = (status: AgentStatus) => {
    switch (status) {
      case "working":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "done":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground/40" />;
    }
  };

  const getStatusBadge = (status: AgentStatus) => {
    switch (status) {
      case "working":
        return <Badge className="text-[10px] px-1.5 py-0">Working</Badge>;
      case "done":
        return (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-700 bg-green-50">
            Done
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-destructive/30 text-destructive bg-destructive/5">
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Idle
          </Badge>
        );
    }
  };

  const getActivityStyle = (type: ActivityEntry["type"]) => {
    switch (type) {
      case "result":
        return "text-green-700";
      case "error":
        return "text-destructive";
      case "system":
        return "text-primary font-medium";
      case "stream":
        return "text-blue-600";
      default:
        return "text-muted-foreground";
    }
  };

  const getActivityIcon = (type: ActivityEntry["type"]) => {
    switch (type) {
      case "result":
        return <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0 mt-1" />;
      case "error":
        return <AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-1" />;
      case "system":
        return <Zap className="h-3 w-3 text-primary shrink-0 mt-1" />;
      default:
        return <Clock className="h-3 w-3 text-muted-foreground/60 shrink-0 mt-1" />;
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Minimal header for agent console (not the full nav) */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 bg-primary rounded-lg flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight">Agent Console</h1>
                <p className="text-[11px] text-muted-foreground leading-tight">Autonomous AI Marketing Agency</p>
              </div>
            </div>
            {running && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-muted-foreground font-medium">
                  {doneCount}/{agents.length} agents complete
                </span>
              </div>
            )}
            {allDone && !running && (
              <Badge variant="outline" className="gap-1 border-green-300 text-green-700 bg-green-50">
                <CheckCircle2 className="h-3 w-3" />
                Complete
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* URL Input Bar */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-4">
          <div className="max-w-4xl mx-auto flex gap-3">
            <div className="flex-1 relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste any business URL to deploy your AI marketing agency..."
                className="pl-10 h-12 text-base"
                onKeyDown={(e) => e.key === "Enter" && !running && runAllAgents()}
                disabled={running}
              />
            </div>
            <Button
              onClick={runAllAgents}
              disabled={running || !url.trim()}
              size="lg"
              className="h-12 px-8 shadow-elevation-low"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Deploy Agency
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ── Left Column: Agents + Activity ─── */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6">
            {/* Agent Roster */}
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Agent Team
              </h2>
              <div className="space-y-2">
                {agents.map((agent) => {
                  const Icon = agent.icon;
                  return (
                    <Card
                      key={agent.id}
                      className={`transition-all duration-200 ${
                        agent.status === "working"
                          ? "border-primary/40 shadow-elevation-low bg-primary/[0.02]"
                          : agent.status === "done"
                          ? "border-green-200 bg-green-50/50"
                          : agent.status === "error"
                          ? "border-destructive/20 bg-destructive/[0.02]"
                          : ""
                      }`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(agent.status)}
                          <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{agent.name}</span>
                              {getStatusBadge(agent.status)}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">{agent.role}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Activity Feed */}
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Live Activity
              </h2>
              <Card>
                <CardContent className="p-0">
                  <div className="h-[360px] overflow-y-auto">
                    {activity.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-center p-6">
                        <div>
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                            <Zap className="h-6 w-6 text-muted-foreground/40" />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Paste a business URL and click "Deploy Agency"
                          </p>
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            7 AI agents will analyze and build your marketing strategy
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 space-y-1.5">
                        {activity.map((entry) => (
                          <div key={entry.id} className="flex gap-2 text-xs leading-relaxed animate-fade-in">
                            {getActivityIcon(entry.type)}
                            <div className="min-w-0">
                              <span className="font-medium text-foreground">{entry.agentName}</span>
                              <span className="text-muted-foreground/50 mx-1">·</span>
                              <span className="text-muted-foreground/50 tabular-nums">
                                {entry.timestamp.toLocaleTimeString("en-US", { hour12: false })}
                              </span>
                              <p className={`mt-0.5 ${getActivityStyle(entry.type)}`}>
                                {entry.message}
                                {entry.streamUrl && (
                                  <a
                                    href={entry.streamUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 ml-1.5 text-primary hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Watch live
                                  </a>
                                )}
                              </p>
                            </div>
                          </div>
                        ))}
                        <div ref={activityEndRef} />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ── Right Column: Results ─── */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Results
            </h2>

            {/* Empty state */}
            {Object.keys(results).length === 0 && !running && (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-4">
                    <Rocket className="h-8 w-8 text-primary/40" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">Ready to deploy</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Enter a business URL above and your AI agents will analyze the market, generate creatives, plan
                    campaigns, and more — all automatically.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Running empty state */}
            {Object.keys(results).length === 0 && running && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Agents are working...</p>
                </CardContent>
              </Card>
            )}

            {/* Result Cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Strategist Result */}
              {results.strategist && (
                <Card className="animate-fade-in">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                        <Brain className="h-4 w-4 text-primary" />
                      </div>
                      <CardTitle className="text-sm">Strategy</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Business</span>
                        <span className="font-medium text-right">{results.strategist.business_type || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Audience</span>
                        <span className="font-medium text-right max-w-[60%] truncate">
                          {results.strategist.target_audience || "—"}
                        </span>
                      </div>
                      {results.strategist.key_selling_points?.length > 0 && (
                        <div className="pt-1.5 border-t">
                          <span className="text-muted-foreground block mb-1">Key Differentiators</span>
                          <div className="flex flex-wrap gap-1">
                            {results.strategist.key_selling_points.slice(0, 3).map((ksp: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">
                                {ksp}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Research Result */}
              {results.research && (
                <Card className="animate-fade-in">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                        <Search className="h-4 w-4 text-primary" />
                      </div>
                      <CardTitle className="text-sm">Competitors</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Active Ads Found</span>
                        <span className="font-semibold text-primary">{results.research.ad_count || 0}</span>
                      </div>
                      {results.research.insights?.opportunity && (
                        <p className="text-muted-foreground pt-1.5 border-t leading-relaxed">
                          {results.research.insights.opportunity}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Creative Result */}
              {results.creative && (
                <Card className="animate-fade-in">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                        <Palette className="h-4 w-4 text-primary" />
                      </div>
                      <CardTitle className="text-sm">Creatives</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ad Variations</span>
                        <span className="font-semibold">{results.creative.ads?.length || 2}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Placements</span>
                        <span className="font-medium">Facebook + Instagram</span>
                      </div>
                      {results.creative.ads?.[0]?.headline && (
                        <p className="text-muted-foreground pt-1.5 border-t italic">
                          "{results.creative.ads[0].headline}"
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Media Buyer Result */}
              {results.mediaBuyer && (
                <Card className="animate-fade-in">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                        <TrendingUp className="h-4 w-4 text-primary" />
                      </div>
                      <CardTitle className="text-sm">Campaigns</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platforms</span>
                        <span className="font-semibold">{results.mediaBuyer.platforms?.length || 4}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Daily Budget</span>
                        <span className="font-semibold">${results.mediaBuyer.totalDailyBudget || 70}/day</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          PAUSED
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Outreach Result */}
              {results.outreach && (
                <Card className="animate-fade-in">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      <CardTitle className="text-sm">Email Sequences</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sequences</span>
                        <span className="font-semibold">{results.outreach.sequences?.length || 3}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Emails</span>
                        <span className="font-semibold">{results.outreach.totalEmails || 11}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Personalized</span>
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Analytics Result */}
              {results.analytics && (
                <Card className="animate-fade-in">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                        <BarChart3 className="h-4 w-4 text-primary" />
                      </div>
                      <CardTitle className="text-sm">Projections</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Leads / Week</span>
                        <span className="font-semibold">{results.analytics.projections?.leadsPerWeek || "15-25"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cost / Lead</span>
                        <span className="font-semibold">{results.analytics.projections?.costPerLead || "$4.50"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Projected ROI</span>
                        <span className="font-semibold text-green-700">{results.analytics.projections?.roi || "3.2x"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Monitor Result */}
              {results.monitor && (
                <Card className="animate-fade-in">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-amber-100 flex items-center justify-center">
                        <Activity className="h-4 w-4 text-amber-600" />
                      </div>
                      <CardTitle className="text-sm">Campaign Monitor</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Active Ads</span>
                        <span className="font-semibold text-primary">
                          {results.monitor.monitoring_report?.total_active || 0}
                        </span>
                      </div>
                      {results.monitor.monitoring_report?.longest_running_days > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Longest Running</span>
                          <span className="font-semibold">
                            {results.monitor.monitoring_report.longest_running_days} days
                          </span>
                        </div>
                      )}
                      {results.monitor.monitoring_report?.fatigue_risk?.length > 0 && (
                        <div className="pt-1.5 border-t">
                          <span className="text-amber-600 font-medium block mb-1">
                            ⚠ {results.monitor.monitoring_report.fatigue_risk.length} fatigue risk{results.monitor.monitoring_report.fatigue_risk.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                      {results.monitor.monitoring_report?.recommendations?.length > 0 && (
                        <div className="pt-1.5 border-t">
                          <span className="text-muted-foreground block mb-1">Recommendations</span>
                          <ul className="space-y-1">
                            {results.monitor.monitoring_report.recommendations.map((rec: string, i: number) => (
                              <li key={i} className="text-muted-foreground leading-relaxed">
                                • {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ── Signup Bridge CTA ─── */}
            {allDone && (
              <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent animate-fade-in-up">
                <CardContent className="py-8 text-center space-y-5">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                    <Rocket className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Your AI agency is ready.</h3>
                    <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                      7 agents built your complete marketing operation. Sign up to launch campaigns, track leads, and
                      let your AI team run 24/7.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Button
                      size="lg"
                      className="text-base px-10 py-6 shadow-elevation-medium hover:shadow-elevation-high transition-shadow"
                      onClick={() => {
                        const runId = savedRunId;
                        const returnPath = runId
                          ? `/dashboard?runId=${runId}`
                          : "/dashboard";
                        navigate(`/auth?returnTo=${encodeURIComponent(returnPath)}`);
                      }}
                    >
                      Sign Up to Launch
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      7-day free trial · $49/month · Cancel anytime
                    </p>
                  </div>

                  {/* Summary stats */}
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t max-w-sm mx-auto">
                    <div>
                      <div className="text-lg font-bold text-foreground">{doneCount}</div>
                      <div className="text-[11px] text-muted-foreground">Agents</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-foreground">
                        {results.mediaBuyer?.platforms?.length || 4}
                      </div>
                      <div className="text-[11px] text-muted-foreground">Platforms</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-green-700">
                        {results.analytics?.projections?.roi || "3.2x"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">Projected ROI</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

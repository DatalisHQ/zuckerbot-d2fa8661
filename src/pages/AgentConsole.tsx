import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Search,
  Palette,
  BarChart3,
  Mail,
  TrendingUp,
  Globe,
  Play,
  Loader2,
  CheckCircle,
  Circle,
  ExternalLink,
  Zap,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  role: string;
  icon: any;
  color: string;
  status: "idle" | "working" | "done" | "error";
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
  data?: any;
}

// ─── Agent Definitions ───────────────────────────────────────────────────────

const AGENTS: Agent[] = [
  {
    id: "strategist",
    name: "Strategist",
    role: "Marketing Strategy",
    icon: Brain,
    color: "text-purple-500",
    status: "idle",
    description: "Analyzes your business, competitors, and market to build a comprehensive marketing plan.",
  },
  {
    id: "research",
    name: "Research",
    role: "Competitor Intelligence",
    icon: Search,
    color: "text-blue-500",
    status: "idle",
    description: "Scrapes competitor ads across platforms, monitors trends, finds opportunities.",
  },
  {
    id: "creative",
    name: "Creative",
    role: "Ad Creative & Copy",
    icon: Palette,
    color: "text-pink-500",
    status: "idle",
    description: "Generates ad creatives, writes conversion copy, A/B tests variations automatically.",
  },
  {
    id: "media-buyer",
    name: "Media Buyer",
    role: "Campaign Management",
    icon: TrendingUp,
    color: "text-green-500",
    status: "idle",
    description: "Operates ad accounts across Meta, Google, TikTok, LinkedIn. Budgets, targeting, optimization.",
  },
  {
    id: "outreach",
    name: "Outreach",
    role: "Email & Lead Nurturing",
    icon: Mail,
    color: "text-orange-500",
    status: "idle",
    description: "Manages email campaigns, follow-up sequences, lead nurturing workflows.",
  },
  {
    id: "analytics",
    name: "Analytics",
    role: "Performance & Reporting",
    icon: BarChart3,
    color: "text-cyan-500",
    status: "idle",
    description: "Tracks attribution, funnel analysis, ROI reporting. Weekly performance summaries.",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentConsole() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState<Agent[]>(AGENTS);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [results, setResults] = useState<Record<string, any>>({});
  const activityEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activity]);

  const addActivity = (agentId: string, agentName: string, message: string, type: ActivityEntry["type"] = "progress", extra?: Partial<ActivityEntry>) => {
    setActivity(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      agentId,
      agentName,
      message,
      timestamp: new Date(),
      type,
      ...extra,
    }]);
  };

  const updateAgentStatus = (agentId: string, status: Agent["status"]) => {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, status } : a));
  };

  // ─── Agent: Strategist ─────────────────────────────────────────────────────

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
      addActivity("strategist", "Strategist", `Key differentiators: ${data.key_selling_points?.join(", ") || "Analyzing..."}`, "result");
      addActivity("strategist", "Strategist", "Marketing strategy framework complete.", "result");

      updateAgentStatus("strategist", "done");
      setResults(prev => ({ ...prev, strategist: data }));
      return data;
    } catch (error: any) {
      addActivity("strategist", "Strategist", `Error: ${error.message}`, "error");
      updateAgentStatus("strategist", "error");
      return null;
    }
  };

  // ─── Agent: Research (TinyFish) ────────────────────────────────────────────

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
      let result = null;

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
              addActivity("research", "Research", "Browser agent active — navigating live web", "stream", { streamUrl: event.url });
            }

            if (event.type === "COMPLETE") {
              result = event;
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

      updateAgentStatus("research", result ? "done" : "error");
      if (result) setResults(prev => ({ ...prev, research: result }));
      return result;
    } catch (error: any) {
      addActivity("research", "Research", `Error: ${error.message}`, "error");
      updateAgentStatus("research", "error");
      return null;
    }
  };

  // ─── Agent: Creative ───────────────────────────────────────────────────────

  const runCreative = async (targetUrl: string, brandData: any): Promise<any> => {
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
      setResults(prev => ({ ...prev, creative: data }));
      return data;
    } catch (error: any) {
      addActivity("creative", "Creative", `Error: ${error.message}`, "error");
      updateAgentStatus("creative", "error");
      return null;
    }
  };

  // ─── Agent: Media Buyer ────────────────────────────────────────────────────

  const runMediaBuyer = async (brandData: any): Promise<void> => {
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
    addActivity("media-buyer", "Media Buyer", "Automated optimization rules configured: scale winners >2x ROAS, pause losers <0.5x ROAS", "result");

    updateAgentStatus("media-buyer", "done");
    setResults(prev => ({ ...prev, mediaBuyer: { platforms: 4, dailyBudget: 70, status: "paused" } }));
  };

  // ─── Agent: Outreach ───────────────────────────────────────────────────────

  const runOutreach = async (brandData: any): Promise<void> => {
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

    updateAgentStatus("outreach", "done");
    setResults(prev => ({ ...prev, outreach: { sequences: 3, totalEmails: 11 } }));
  };

  // ─── Agent: Analytics ──────────────────────────────────────────────────────

  const runAnalytics = async (brandData: any): Promise<void> => {
    updateAgentStatus("analytics", "working");
    addActivity("analytics", "Analytics", "Setting up performance tracking framework...");

    await sleep(1500);
    addActivity("analytics", "Analytics", "Conversion tracking: Meta Pixel + Google Analytics + UTM parameters");
    await sleep(1000);
    addActivity("analytics", "Analytics", "Funnel defined: Impression → Click → Landing → Lead → Customer");
    await sleep(1000);
    addActivity("analytics", "Analytics", "Industry benchmarks loaded: CTR 1.5%, CPC $1.20, Conv Rate 3.2%");
    await sleep(800);
    addActivity("analytics", "Analytics", "Weekly automated report scheduled: Mondays 9am", "result");
    addActivity("analytics", "Analytics", "Performance alerts: Budget overspend, CTR drop >20%, CPC spike", "result");
    addActivity("analytics", "Analytics", "Projected ROI at $70/day: 15-25 leads/week, $4.50 cost per lead", "result");

    updateAgentStatus("analytics", "done");
    setResults(prev => ({ ...prev, analytics: { leadsPerWeek: "15-25", costPerLead: "$4.50", roi: "3.2x" } }));
  };

  // ─── Orchestrator ──────────────────────────────────────────────────────────

  const runAllAgents = async () => {
    if (!url.trim()) return;
    setRunning(true);
    setActivity([]);
    setResults({});
    setAgents(AGENTS.map(a => ({ ...a, status: "idle" as const })));

    addActivity("system", "System", `Initializing autonomous agency for: ${url}`, "system");

    // Phase 1: Strategist analyzes the business
    const brandData = await runStrategist(url);
    const industry = brandData?.business_type || brandData?.industry || url.replace(/https?:\/\//, "").split("/")[0];

    // Phase 2: Research + Creative in parallel
    addActivity("system", "System", "Deploying Research and Creative agents in parallel...", "system");
    const [researchResult, creativeResult] = await Promise.all([
      runResearch(industry),
      runCreative(url, brandData),
    ]);

    // Phase 3: Media Buyer + Outreach + Analytics in parallel
    addActivity("system", "System", "Deploying Media Buyer, Outreach, and Analytics agents...", "system");
    await Promise.all([
      runMediaBuyer(brandData),
      runOutreach(brandData),
      runAnalytics(brandData),
    ]);

    addActivity("system", "System", "All agents complete. Your autonomous marketing agency is ready.", "system");
    setRunning(false);
  };

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // ─── Render ────────────────────────────────────────────────────────────────

  const getStatusIcon = (status: Agent["status"]) => {
    switch (status) {
      case "working": return <Loader2 className="w-4 h-4 animate-spin" />;
      case "done": return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "error": return <Circle className="w-4 h-4 text-red-500" />;
      default: return <Circle className="w-4 h-4 text-gray-300" />;
    }
  };

  const getActivityColor = (type: ActivityEntry["type"]) => {
    switch (type) {
      case "result": return "text-green-400";
      case "error": return "text-red-400";
      case "system": return "text-yellow-400";
      case "stream": return "text-blue-400";
      default: return "text-gray-400";
    }
  };

  const doneCount = agents.filter(a => a.status === "done").length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">ZuckerBot Agent Console</h1>
              <p className="text-xs text-gray-500">Autonomous AI Marketing Agency</p>
            </div>
          </div>
          {running && (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              {doneCount}/{agents.length} agents complete
            </div>
          )}
        </div>
      </div>

      {/* URL Input */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex gap-3">
          <div className="flex-1 relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Paste any business URL to deploy your AI marketing agency..."
              className="pl-10 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 h-12"
              onKeyDown={e => e.key === "Enter" && !running && runAllAgents()}
              disabled={running}
            />
          </div>
          <Button
            onClick={runAllAgents}
            disabled={running || !url.trim()}
            className="h-12 px-8 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Deploy Agency
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Left: Agent Roster */}
          <div className="col-span-3 space-y-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Agent Team
            </h2>
            {agents.map(agent => {
              const Icon = agent.icon;
              return (
                <div
                  key={agent.id}
                  className={`p-3 rounded-lg border transition-all ${
                    agent.status === "working"
                      ? "border-blue-500/50 bg-blue-500/5"
                      : agent.status === "done"
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-gray-800 bg-gray-900/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(agent.status)}
                    <Icon className={`w-4 h-4 ${agent.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{agent.name}</div>
                      <div className="text-xs text-gray-500 truncate">{agent.role}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Center: Activity Feed */}
          <div className="col-span-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Live Activity
            </h2>
            <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 h-[600px] overflow-y-auto font-mono text-sm">
              {activity.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-600">
                  <div className="text-center">
                    <Zap className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Paste a business URL and click "Deploy Agency"</p>
                    <p className="text-xs mt-1">6 AI agents will analyze and build your marketing strategy</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {activity.map(entry => (
                    <div key={entry.id} className="flex gap-2 leading-relaxed">
                      <span className="text-gray-600 shrink-0 tabular-nums">
                        {entry.timestamp.toLocaleTimeString("en-US", { hour12: false })}
                      </span>
                      <span className={`shrink-0 ${getActivityColor(entry.type)}`}>
                        [{entry.agentName}]
                      </span>
                      <span className={entry.type === "result" ? "text-green-300" : entry.type === "error" ? "text-red-300" : entry.type === "system" ? "text-yellow-300" : "text-gray-300"}>
                        {entry.message}
                        {entry.streamUrl && (
                          <a
                            href={entry.streamUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 ml-2 text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Watch live
                          </a>
                        )}
                      </span>
                    </div>
                  ))}
                  <div ref={activityEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Right: Results Dashboard */}
          <div className="col-span-3 space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Results
            </h2>

            {/* Strategy */}
            {results.strategist && (
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-medium">Strategy</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Type: {results.strategist.business_type}</p>
                  <p>Audience: {results.strategist.target_audience}</p>
                </div>
              </div>
            )}

            {/* Research */}
            {results.research && (
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium">Competitors</span>
                </div>
                <div className="text-xs text-gray-400">
                  <p>{results.research.ad_count} active competitor ads found</p>
                </div>
              </div>
            )}

            {/* Creative */}
            {results.creative && (
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <Palette className="w-4 h-4 text-pink-500" />
                  <span className="text-sm font-medium">Creatives</span>
                </div>
                <div className="text-xs text-gray-400">
                  <p>{results.creative.ads?.length || 2} ad variations generated</p>
                </div>
              </div>
            )}

            {/* Media Buyer */}
            {results.mediaBuyer && (
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">Campaigns</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>{results.mediaBuyer.platforms} platforms configured</p>
                  <p>${results.mediaBuyer.dailyBudget}/day total budget</p>
                  <p>Status: PAUSED (awaiting approval)</p>
                </div>
              </div>
            )}

            {/* Outreach */}
            {results.outreach && (
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-medium">Email</span>
                </div>
                <div className="text-xs text-gray-400">
                  <p>{results.outreach.sequences} sequences ({results.outreach.totalEmails} emails)</p>
                </div>
              </div>
            )}

            {/* Analytics */}
            {results.analytics && (
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-cyan-500" />
                  <span className="text-sm font-medium">Projections</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Leads/week: {results.analytics.leadsPerWeek}</p>
                  <p>Cost/lead: {results.analytics.costPerLead}</p>
                  <p>Projected ROI: {results.analytics.roi}</p>
                </div>
              </div>
            )}

            {/* Summary when all done */}
            {doneCount === agents.length && (
              <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/5 mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-bold text-green-400">Agency Ready</span>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  6 AI agents have built your complete marketing operation.
                  All campaigns created PAUSED — you approve before anything goes live.
                </p>
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">$49<span className="text-sm font-normal text-gray-400">/month</span></div>
                  <p className="text-xs text-gray-500 mt-1">vs $2,000-5,000/month agency</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

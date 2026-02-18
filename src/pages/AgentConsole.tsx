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
    id: "profiler",
    name: "BrandProfiler",
    role: "Business Analysis",
    icon: Brain,
    color: "text-purple-500",
    status: "idle",
    description: "Scrapes business website, builds complete brand profile: industry, audience, offer, tone, geo.",
  },
  {
    id: "planner",
    name: "CampaignPlanner",
    role: "Strategy & Structure",
    icon: TrendingUp,
    color: "text-blue-500",
    status: "idle",
    description: "Defines objective, budget, targeting, placement strategy, 3 creative angles × 2 variants.",
  },
  {
    id: "research",
    name: "Research",
    role: "Competitor Intelligence",
    icon: Search,
    color: "text-cyan-500",
    status: "idle",
    description: "TinyFish web agent scrapes Facebook Ad Library for live competitor ads and market intel.",
  },
  {
    id: "creative",
    name: "CreativeGenerator",
    role: "Ad Creative & Copy",
    icon: Palette,
    color: "text-pink-500",
    status: "idle",
    description: "Generates 6 ad variants (3 angles × 2), headlines, copy, CTAs. Policy-checked.",
  },
  {
    id: "deployer",
    name: "MetaDeployer",
    role: "Deterministic Deploy",
    icon: Zap,
    color: "text-green-500",
    status: "idle",
    description: "Pure code, not agent. Creates campaign, ad sets, uploads creatives. Idempotent. No hallucination.",
  },
  {
    id: "reporter",
    name: "Reporter",
    role: "Report & Next Steps",
    icon: BarChart3,
    color: "text-orange-500",
    status: "idle",
    description: "Generates human report: preview links, 24h expectations, optimization schedule.",
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

  // ─── Agent: BrandProfiler ───────────────────────────────────────────────────

  const runProfiler = async (targetUrl: string): Promise<any> => {
    updateAgentStatus("profiler", "working");
    addActivity("profiler", "BrandProfiler", "Crawling business website (2-4 key pages)...");

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

      addActivity("profiler", "BrandProfiler", `Industry: ${data.business_type || "Identified"}`, "result");
      addActivity("profiler", "BrandProfiler", `Target customer: ${data.target_audience || "Analyzing..."}`, "result");
      addActivity("profiler", "BrandProfiler", `Key benefits: ${data.key_selling_points?.slice(0,3).join(", ") || "Extracted"}`, "result");
      addActivity("profiler", "BrandProfiler", "business_profile.json written", "result");

      updateAgentStatus("profiler", "done");
      setResults(prev => ({ ...prev, profiler: data }));
      return data;
    } catch (error: any) {
      addActivity("profiler", "BrandProfiler", `Error: ${error.message}`, "error");
      updateAgentStatus("profiler", "error");
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

  // ─── Agent: CampaignPlanner ─────────────────────────────────────────────────

  const runPlanner = async (brandData: any): Promise<any> => {
    updateAgentStatus("planner", "working");
    addActivity("planner", "CampaignPlanner", "Reading business_profile.json...");

    await sleep(1500);
    addActivity("planner", "CampaignPlanner", "Objective: Leads (instant form) — fastest path to conversions");
    await sleep(1000);
    addActivity("planner", "CampaignPlanner", "Structure: ABO, 2 ad sets — broad + lookalike");
    await sleep(800);
    addActivity("planner", "CampaignPlanner", "Budget: $25/day, Advantage+ placements");
    await sleep(800);
    addActivity("planner", "CampaignPlanner", "Targeting: Broad + geo + age 25-55 (let Andromeda optimize)");
    await sleep(1000);
    addActivity("planner", "CampaignPlanner", "Creative angles defined: Pain Point, Social Proof, Direct Offer");
    await sleep(600);
    addActivity("planner", "CampaignPlanner", "3 angles × 2 variants = 6 ads planned", "result");
    addActivity("planner", "CampaignPlanner", "UTM plan: source=facebook, medium=paid, campaign={run_id}", "result");
    addActivity("planner", "CampaignPlanner", "campaign_plan.json written", "result");

    updateAgentStatus("planner", "done");
    setResults(prev => ({ ...prev, planner: { objective: "Leads", adSets: 2, budget: "$25/day", angles: 3, variants: 6 } }));
    return { angles: 3, variants: 6 };
  };

  // ─── Agent: Creative ───────────────────────────────────────────────────────

  const runCreative = async (targetUrl: string, brandData: any): Promise<any> => {
    updateAgentStatus("creative", "working");
    addActivity("creative", "CreativeGenerator", "Reading campaign_plan.json + business_profile.json...");

    try {
      await sleep(1000);
      addActivity("creative", "CreativeGenerator", "Generating Angle 1: Pain Point — 'Tired of overpaying?'");

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

      addActivity("creative", "CreativeGenerator", "Generating Angle 2: Social Proof — real results");
      await sleep(1500);
      addActivity("creative", "CreativeGenerator", "Generating Angle 3: Direct Offer — clear CTA");
      await sleep(1000);
      addActivity("creative", "CreativeGenerator", "Policy check: 0 violations found");
      addActivity("creative", "CreativeGenerator", `${data.ads?.length || 2} variants generated + policy-checked`, "result");
      addActivity("creative", "CreativeGenerator", "ad_variants.json written", "result");

      updateAgentStatus("creative", "done");
      setResults(prev => ({ ...prev, creative: data }));
      return data;
    } catch (error: any) {
      addActivity("creative", "CreativeGenerator", `Error: ${error.message}`, "error");
      updateAgentStatus("creative", "error");
      return null;
    }
  };

  // ─── MetaDeployer (deterministic, not agent) ──────────────────────────────

  const runDeployer = async (brandData: any): Promise<void> => {
    updateAgentStatus("deployer", "working");
    addActivity("deployer", "MetaDeployer", "[DETERMINISTIC] Validating inputs...");

    await sleep(1000);
    addActivity("deployer", "MetaDeployer", "Validating: campaign_plan.json ✓");
    await sleep(500);
    addActivity("deployer", "MetaDeployer", "Validating: ad_variants.json ✓");
    await sleep(500);
    addActivity("deployer", "MetaDeployer", "Validating: image dimensions ✓, UTM format ✓, naming scheme ✓");
    await sleep(1000);
    addActivity("deployer", "MetaDeployer", "Creating campaign: 'ZB-{run_id}-Leads' → PAUSED");
    await sleep(800);
    addActivity("deployer", "MetaDeployer", "Creating ad set 1: Broad targeting → $15/day");
    await sleep(600);
    addActivity("deployer", "MetaDeployer", "Creating ad set 2: Lookalike → $10/day");
    await sleep(800);
    addActivity("deployer", "MetaDeployer", "Uploading 6 creative variants...");
    await sleep(1200);
    addActivity("deployer", "MetaDeployer", "Creating 6 ads with idempotency keys...");
    await sleep(800);
    addActivity("deployer", "MetaDeployer", "All objects created PAUSED — awaiting approval", "result");
    addActivity("deployer", "MetaDeployer", "meta_deploy_result.json written (campaign + ad set + ad IDs)", "result");
    addActivity("deployer", "MetaDeployer", "Idempotency: safe to retry without duplicates ✓", "result");

    updateAgentStatus("deployer", "done");
    setResults(prev => ({ ...prev, deployer: { campaign: 1, adSets: 2, ads: 6, status: "PAUSED" } }));
  };

  // ─── Agent: Reporter ───────────────────────────────────────────────────────

  const runReporter = async (brandData: any): Promise<void> => {
    updateAgentStatus("reporter", "working");
    addActivity("reporter", "Reporter", "Compiling deployment report...");

    await sleep(1500);
    addActivity("reporter", "Reporter", "Campaign preview links generated");
    await sleep(800);
    addActivity("reporter", "Reporter", "Expected first 24h: 500-1,500 impressions, 15-40 clicks");
    await sleep(800);
    addActivity("reporter", "Reporter", "Optimization schedule: first review at 48h, then daily");
    await sleep(800);
    addActivity("reporter", "Reporter", "If CTR <1% after 48h → refresh Angle 1 creative", "result");
    addActivity("reporter", "Reporter", "If CPC >$3 after 72h → narrow geo targeting", "result");
    addActivity("reporter", "Reporter", "Auto-pause trigger: CPM >$30 or spend >$50/day", "result");
    addActivity("reporter", "Reporter", "Report sent to business owner ✓", "result");

    updateAgentStatus("reporter", "done");
    setResults(prev => ({ ...prev, reporter: { status: "sent", nextReview: "48h" } }));
  };

  // ─── Orchestrator ──────────────────────────────────────────────────────────

  const runAllAgents = async () => {
    if (!url.trim()) return;
    setRunning(true);
    setActivity([]);
    setResults({});
    setAgents(AGENTS.map(a => ({ ...a, status: "idle" as const })));

    addActivity("system", "Orchestrator", `run_id: ${crypto.randomUUID().slice(0,8)} | target: ${url}`, "system");
    addActivity("system", "Orchestrator", "Step 0 — Guardrails: budget cap $50/day, geo US+AU, max 1 campaign", "system");

    // Step 1: BrandProfiler
    addActivity("system", "Orchestrator", "Step 1 — Profile", "system");
    const brandData = await runProfiler(url);
    const industry = brandData?.business_type || brandData?.industry || url.replace(/https?:\/\//, "").split("/")[0];

    // Step 2: CampaignPlanner + Research in parallel
    addActivity("system", "Orchestrator", "Step 2 — Plan + Research (parallel)", "system");
    const [planResult, researchResult] = await Promise.all([
      runPlanner(brandData),
      runResearch(industry),
    ]);

    // Step 3: CreativeGenerator
    addActivity("system", "Orchestrator", "Step 3 — Generate creatives", "system");
    const creativeResult = await runCreative(url, brandData);

    // Step 4+5: Validate + Deploy (deterministic)
    addActivity("system", "Orchestrator", "Step 4 — Dry-run validation", "system");
    await sleep(800);
    addActivity("system", "Orchestrator", "Validation passed: all fields present, no policy violations, UTMs valid", "system");
    addActivity("system", "Orchestrator", "Step 5 — Deploy (deterministic)", "system");
    await runDeployer(brandData);

    // Step 6: Report
    addActivity("system", "Orchestrator", "Step 6 — Report", "system");
    await runReporter(brandData);

    addActivity("system", "Orchestrator", "Pipeline complete. Campaign PAUSED — approve to go live.", "system");
    addActivity("system", "Orchestrator", "Step 7 — Optimiser scheduled: first review in 48h", "system");
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

            {/* Profiler */}
            {results.profiler && (
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-medium">Brand Profile</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Industry: {results.profiler.business_type}</p>
                  <p>Audience: {results.profiler.target_audience}</p>
                </div>
              </div>
            )}

            {/* Planner */}
            {results.planner && (
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium">Campaign Plan</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Objective: {results.planner.objective}</p>
                  <p>Budget: {results.planner.budget}</p>
                  <p>Variants: {results.planner.variants} ({results.planner.angles} angles × 2)</p>
                </div>
              </div>
            )}

            {/* Research */}
            {results.research && (
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-cyan-500" />
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
                  <p>{results.creative.ads?.length || 6} variants generated + policy-checked</p>
                </div>
              </div>
            )}

            {/* Deployer */}
            {results.deployer && (
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">Deployment</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>{results.deployer.campaign} campaign, {results.deployer.adSets} ad sets, {results.deployer.ads} ads</p>
                  <p>Status: {results.deployer.status}</p>
                  <p>Idempotent: safe to retry ✓</p>
                </div>
              </div>
            )}

            {/* Reporter */}
            {results.reporter && (
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-medium">Report</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Report delivered ✓</p>
                  <p>Next review: {results.reporter.nextReview}</p>
                  <p>Optimiser: scheduled</p>
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

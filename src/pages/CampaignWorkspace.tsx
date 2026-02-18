import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import FacebookAdCard from "@/components/FacebookAdCard";
import { CompetitorInsights } from "@/components/CompetitorInsights";
import {
  Globe,
  Play,
  Loader2,
  CheckCircle2,
  Building,
  Target,
  Users,
  Sparkles,
  TrendingUp,
  DollarSign,
  BarChart3,
  Rocket,
  ArrowRight,
  ExternalLink,
  ImageIcon,
  Layers,
  Search,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PipelineResults {
  business: any | null;
  competitors: any | null;
  creatives: any | null;
  campaign: any | null;
  launch: any | null;
}

interface BusinessInfo {
  name: string;
  trade: string;
  suburb: string;
  state: string;
  website?: string;
}

// ─── Pipeline Step Config ────────────────────────────────────────────────────

const STEPS = [
  { label: "Analyzing", description: "Analyzing your business..." },
  { label: "Researching", description: "Researching competitors..." },
  { label: "Creating", description: "Generating ad creatives..." },
  { label: "Planning", description: "Building campaign structure..." },
  { label: "Ready", description: "Preparing launch plan..." },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function CampaignWorkspace() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [stepLabel, setStepLabel] = useState("");
  const [results, setResults] = useState<PipelineResults>({
    business: null,
    competitors: null,
    creatives: null,
    campaign: null,
    launch: null,
  });
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [competitorStreamUrl, setCompetitorStreamUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("business");
  const [isAdmin, setIsAdmin] = useState(false);

  const hasAutoStarted = useRef(false);

  // ─── Load business data + auto-start from URL param ────────────────────

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        // Check admin
        setIsAdmin(session.user.email === "davisgrainger@gmail.com");

        const { data: biz } = await supabase
          .from("businesses" as any)
          .select("name, trade, suburb, state, website")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (biz) {
          const b = biz as any;
          setBusinessInfo({ name: b.name, trade: b.trade, suburb: b.suburb, state: b.state, website: b.website });

          // Pre-fill URL from business website or last agent_run
          const urlParam = searchParams.get("url");
          if (urlParam) {
            setUrl(urlParam);
          } else if (b.website) {
            setUrl(b.website);
          } else {
            const { data: prevRun } = await supabase
              .from("agent_runs" as any)
              .select("url")
              .eq("user_id", session.user.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (prevRun && (prevRun as any).url) {
              setUrl((prevRun as any).url);
            }
          }
        } else {
          const urlParam = searchParams.get("url");
          if (urlParam) setUrl(urlParam);
        }
      } catch (err) {
        console.error("[CampaignWorkspace] Error loading business:", err);
      }
    };
    init();
  }, [searchParams]);

  // Auto-start pipeline if ?url= param present
  useEffect(() => {
    const urlParam = searchParams.get("url");
    if (urlParam && url && !running && !hasAutoStarted.current && step === -1) {
      hasAutoStarted.current = true;
      runPipeline();
    }
  }, [url, searchParams]);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const progressPercent =
    step < 0 ? 0 : step >= STEPS.length - 1 && !running ? 100 : ((step + 1) / STEPS.length) * 100;

  // ─── Pipeline: Step 0 — Brand Analysis ─────────────────────────────────

  const runBrandAnalysis = async (targetUrl: string): Promise<any> => {
    setStep(0);
    setStepLabel(STEPS[0].description);

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
      setResults((prev) => ({ ...prev, business: data }));
      return data;
    } catch (error: any) {
      console.error("[CampaignWorkspace] Brand analysis error:", error);
      return null;
    }
  };

  // ─── Pipeline: Step 1 — Competitor Research (SSE) ──────────────────────

  const runCompetitorResearch = async (industry: string): Promise<any> => {
    setStep(1);
    setStepLabel(STEPS[1].description);

    try {
      const response = await fetch("/api/analyze-competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, location: "United States", country: "US" }),
      });

      if (!response.ok || !response.body) throw new Error("Competitor research failed");

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

            if (event.type === "STREAMING_URL") {
              setCompetitorStreamUrl(event.url);
            }
            if (event.type === "COMPLETE") {
              finalResult = event;
            }
            if (event.type === "ERROR") {
              throw new Error(event.message);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }

      if (finalResult) {
        setResults((prev) => ({ ...prev, competitors: finalResult }));
      }
      return finalResult;
    } catch (error: any) {
      console.error("[CampaignWorkspace] Competitor research error:", error);
      return null;
    }
  };

  // ─── Pipeline: Step 2 — Creative Generation ───────────────────────────

  const runCreativeGeneration = async (targetUrl: string): Promise<any> => {
    setStep(2);
    setStepLabel(STEPS[2].description);

    try {
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
      setResults((prev) => ({ ...prev, creatives: data }));
      return data;
    } catch (error: any) {
      console.error("[CampaignWorkspace] Creative generation error:", error);
      return null;
    }
  };

  // ─── Pipeline: Step 3 — Campaign Structure (simulated) ────────────────

  const runCampaignPlanning = async (): Promise<any> => {
    setStep(3);
    setStepLabel(STEPS[3].description);

    await sleep(2500);

    const campaignData = {
      platforms: [
        { name: "Facebook", type: "Traffic", budget: 25, audience: "Advantage+" },
        { name: "Instagram", type: "Reels", budget: 15, audience: "18-45" },
        { name: "Google Ads", type: "Search", budget: 20, audience: "High-intent keywords" },
        { name: "TikTok", type: "Spark Ads", budget: 10, audience: "UGC-style" },
      ],
      totalDailyBudget: 70,
      status: "paused",
      targetingStrategy: "Advantage+ broad targeting with interest layering based on brand analysis",
      optimizationRules: "Scale winners >2x ROAS, pause losers <0.5x ROAS after 3-day learning period",
    };

    setResults((prev) => ({ ...prev, campaign: campaignData }));
    return campaignData;
  };

  // ─── Pipeline: Step 4 — Launch Plan (simulated) ───────────────────────

  const runLaunchPlan = async (): Promise<any> => {
    setStep(4);
    setStepLabel(STEPS[4].description);

    await sleep(1500);

    const launchData = {
      totalPlatforms: 4,
      dailyBudget: 70,
      projectedLeadsPerWeek: "15-25",
      projectedCostPerLead: "$4.50",
      projectedROI: "3.2x",
      tracking: ["Meta Pixel", "Google Analytics", "UTM Parameters"],
      reportSchedule: "Weekly — Mondays 9am",
    };

    setResults((prev) => ({ ...prev, launch: launchData }));
    return launchData;
  };

  // ─── Persist to Supabase ───────────────────────────────────────────────

  const persistRun = async (targetUrl: string, allResults: PipelineResults): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;

      const { data, error } = await supabase
        .from("agent_runs" as any)
        .insert({
          url: targetUrl,
          brand_data: allResults.business || null,
          competitor_data: allResults.competitors || null,
          creative_data: allResults.creatives || null,
          campaign_plan: allResults.campaign || null,
          outreach_plan: null,
          analytics_projections: allResults.launch || null,
          user_id: userId,
        } as any)
        .select("id")
        .single();

      if (error) {
        console.error("[CampaignWorkspace] Supabase insert error:", error);
        return null;
      }

      const runId = (data as any)?.id || null;
      if (runId) {
        localStorage.setItem("zuckerbot_run_id", runId);
      }

      // Save website URL to business profile if logged in
      if (userId && targetUrl) {
        await supabase
          .from("businesses" as any)
          .update({ website: targetUrl } as any)
          .eq("user_id", userId);
      }

      return runId;
    } catch (err) {
      console.error("[CampaignWorkspace] Persist error:", err);
      return null;
    }
  };

  // ─── Orchestrator ──────────────────────────────────────────────────────

  const runPipeline = async () => {
    if (!url.trim()) return;
    setRunning(true);
    setSavedRunId(null);
    setCompetitorStreamUrl(null);
    setResults({ business: null, competitors: null, creatives: null, campaign: null, launch: null });

    const targetUrl = url.trim();

    // Step 0: Brand analysis first
    const brandData = await runBrandAnalysis(targetUrl);
    const industry =
      brandData?.business_type || brandData?.industry || targetUrl.replace(/https?:\/\//, "").split("/")[0];

    // Steps 1+2 in parallel
    await Promise.all([
      runCompetitorResearch(industry),
      runCreativeGeneration(targetUrl),
    ]);

    // Steps 3+4 in parallel
    await Promise.all([
      runCampaignPlanning(),
      runLaunchPlan(),
    ]);

    // Persist results
    setResults((prev) => {
      persistRun(targetUrl, prev).then((runId) => {
        if (runId) setSavedRunId(runId);
      });
      return prev;
    });

    setRunning(false);
    setStepLabel("Analysis complete");
  };

  // ─── Derived ───────────────────────────────────────────────────────────

  const allDone = !running && step >= 4;
  const hasAnyResults = results.business || results.competitors || results.creatives || results.campaign || results.launch;

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar isAdmin={isAdmin} />

      {/* URL Input Bar */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-4">
          {businessInfo && (
            <div className="max-w-4xl mx-auto mb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building className="h-4 w-4" />
                <span>
                  Campaign for <strong className="text-foreground">{businessInfo.name}</strong>
                  {businessInfo.trade && <> · <span className="capitalize">{businessInfo.trade}</span></>}
                  {businessInfo.suburb && <> · {businessInfo.suburb}, {businessInfo.state}</>}
                </span>
              </div>
            </div>
          )}
          <div className="max-w-4xl mx-auto flex gap-3">
            <div className="flex-1 relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={
                  businessInfo
                    ? `Enter ${businessInfo.name}'s website URL...`
                    : "Enter your business URL to get started..."
                }
                className="pl-10 h-12 text-base"
                onKeyDown={(e) => e.key === "Enter" && !running && runPipeline()}
                disabled={running}
              />
            </div>
            <Button
              onClick={runPipeline}
              disabled={running || !url.trim()}
              size="lg"
              className="h-12 px-8 shadow-elevation-low"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Analyze
                </>
              )}
            </Button>
          </div>

          {/* Progress Bar */}
          {(running || allDone) && (
            <div className="max-w-4xl mx-auto mt-4">
              <div className="flex items-center gap-2 mb-2">
                {STEPS.map((s, i) => {
                  const isDone = step > i || (step === i && !running && allDone);
                  const isCurrent = step === i && running;
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : isCurrent ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                      )}
                      <span
                        className={`text-xs ${
                          isDone
                            ? "text-green-700 font-medium"
                            : isCurrent
                            ? "text-primary font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        {s.label}
                      </span>
                      {i < STEPS.length - 1 && (
                        <div className={`w-6 h-px ${isDone ? "bg-green-300" : "bg-muted-foreground/20"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
              <Progress value={progressPercent} className="h-1.5" />
              {running && stepLabel && (
                <p className="text-xs text-muted-foreground mt-1.5">{stepLabel}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Empty state before any run */}
        {!hasAnyResults && !running && (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-4">
                <Rocket className="h-8 w-8 text-primary/40" />
              </div>
              <h3 className="font-semibold text-lg mb-1">Ready to analyze</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Enter a business URL above and we'll analyze your market, generate ad creatives, plan campaigns, and
                build your launch strategy — all automatically.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Running empty state */}
        {!hasAnyResults && running && (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{stepLabel || "Starting analysis..."}</p>
            </CardContent>
          </Card>
        )}

        {/* Tabbed Results */}
        {hasAnyResults && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-5 h-auto">
              <TabsTrigger value="business" className="gap-1.5 text-xs sm:text-sm py-2.5">
                <Building className="h-4 w-4 hidden sm:block" />
                Business
              </TabsTrigger>
              <TabsTrigger value="competitors" className="gap-1.5 text-xs sm:text-sm py-2.5">
                <Search className="h-4 w-4 hidden sm:block" />
                Competitors
              </TabsTrigger>
              <TabsTrigger value="creatives" className="gap-1.5 text-xs sm:text-sm py-2.5">
                <ImageIcon className="h-4 w-4 hidden sm:block" />
                Creatives
              </TabsTrigger>
              <TabsTrigger value="campaign" className="gap-1.5 text-xs sm:text-sm py-2.5">
                <Layers className="h-4 w-4 hidden sm:block" />
                Campaign
              </TabsTrigger>
              <TabsTrigger value="launch" className="gap-1.5 text-xs sm:text-sm py-2.5">
                <Rocket className="h-4 w-4 hidden sm:block" />
                Launch
              </TabsTrigger>
            </TabsList>

            {/* ─── Business Profile Tab ──────────────────────────────── */}
            <TabsContent value="business" className="space-y-4">
              {results.business ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Building className="h-4 w-4 text-primary" />
                        Business Overview
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      {results.business.business_name && (
                        <div>
                          <span className="text-muted-foreground">Name</span>
                          <p className="font-medium">{results.business.business_name}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Type</span>
                        <p className="font-medium">{results.business.business_type || "—"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Target Audience</span>
                        <p className="font-medium">{results.business.target_audience || "—"}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Key Selling Points
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {results.business.key_selling_points?.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {results.business.key_selling_points.map((ksp: string, i: number) => (
                            <Badge key={i} variant="secondary">
                              {ksp}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No selling points identified yet.</p>
                      )}
                    </CardContent>
                  </Card>

                  {results.business.brand_personality && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" />
                          Brand Personality
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">{results.business.brand_personality}</p>
                      </CardContent>
                    </Card>
                  )}

                  {results.business.marketing_angles?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Target className="h-4 w-4 text-primary" />
                          Marketing Angles
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-1.5 text-sm">
                          {results.business.marketing_angles.map((angle: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <ArrowRight className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                              <span>{angle}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <Building className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Run analysis to see your business profile
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ─── Competitors Tab ───────────────────────────────────── */}
            <TabsContent value="competitors" className="space-y-6">
              {/* Live CompetitorInsights component */}
              <CompetitorInsights
                industry={
                  results.business?.business_type ||
                  results.business?.industry ||
                  businessInfo?.trade ||
                  ""
                }
                location="United States"
                country="US"
                businessName={
                  results.business?.business_name || businessInfo?.name || ""
                }
              />

              {/* Pipeline competitor results */}
              {results.competitors && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Search className="h-4 w-4 text-primary" />
                      Pipeline Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Active Ads Found</span>
                      <span className="font-semibold text-primary">{results.competitors.ad_count || 0}</span>
                    </div>
                    {results.competitors.insights?.opportunity && (
                      <div className="pt-2 border-t">
                        <span className="text-muted-foreground text-xs block mb-1">Market Opportunity</span>
                        <p className="text-sm leading-relaxed">{results.competitors.insights.opportunity}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Streaming URL */}
              {competitorStreamUrl && running && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-muted-foreground">Agent browsing live —</span>
                  <a
                    href={competitorStreamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    Watch agent live
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {!results.competitors && !running && (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Run analysis to see competitor insights
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ─── Creatives Tab ─────────────────────────────────────── */}
            <TabsContent value="creatives" className="space-y-6">
              {results.creatives?.ads?.length > 0 ? (
                <>
                  <div className="grid sm:grid-cols-2 gap-6">
                    {results.creatives.ads.map((ad: any, i: number) => (
                      <FacebookAdCard
                        key={i}
                        ad={ad}
                        businessName={results.creatives.business_name || businessInfo?.name || "Business"}
                      />
                    ))}
                  </div>
                  {results.creatives.description && (
                    <Card>
                      <CardContent className="py-4">
                        <p className="text-sm text-muted-foreground">
                          <strong className="text-foreground">{results.creatives.business_name}</strong>
                          {" — "}
                          {results.creatives.description}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Run analysis to see generated ad creatives
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ─── Campaign Plan Tab ─────────────────────────────────── */}
            <TabsContent value="campaign" className="space-y-4">
              {results.campaign ? (
                <>
                  {/* Platform breakdown */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {results.campaign.platforms?.map((platform: any, i: number) => (
                      <Card key={i}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-sm">{platform.name}</h4>
                            <Badge variant="outline" className="text-xs">
                              ${platform.budget}/day
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div className="flex justify-between">
                              <span>Campaign Type</span>
                              <span className="font-medium text-foreground">{platform.type}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Audience</span>
                              <span className="font-medium text-foreground">{platform.audience}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Summary */}
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Total Daily Budget</span>
                        <span className="font-bold text-lg">${results.campaign.totalDailyBudget}/day</span>
                      </div>
                      {results.campaign.targetingStrategy && (
                        <div className="text-sm border-t pt-3">
                          <span className="text-muted-foreground block mb-1">Targeting Strategy</span>
                          <p>{results.campaign.targetingStrategy}</p>
                        </div>
                      )}
                      {results.campaign.optimizationRules && (
                        <div className="text-sm border-t pt-3">
                          <span className="text-muted-foreground block mb-1">Optimization Rules</span>
                          <p>{results.campaign.optimizationRules}</p>
                        </div>
                      )}
                      <div className="border-t pt-3 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-yellow-300 text-yellow-700 bg-yellow-50">
                          PAUSED
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          All campaigns created PAUSED — you approve before anything goes live
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <Layers className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Run analysis to see your campaign plan
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ─── Launch Plan Tab ────────────────────────────────────── */}
            <TabsContent value="launch" className="space-y-6">
              {results.launch ? (
                <>
                  {/* Summary Stats */}
                  <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{results.launch.totalPlatforms}</p>
                        <p className="text-xs text-muted-foreground mt-1">Platforms</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">${results.launch.dailyBudget}/day</p>
                        <p className="text-xs text-muted-foreground mt-1">Daily Budget</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{results.launch.projectedLeadsPerWeek}</p>
                        <p className="text-xs text-muted-foreground mt-1">Leads / Week</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-green-700">{results.launch.projectedROI}</p>
                        <p className="text-xs text-muted-foreground mt-1">Projected ROI</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Additional metrics */}
                  <Card>
                    <CardContent className="p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cost per Lead</span>
                        <span className="font-medium">{results.launch.projectedCostPerLead}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tracking</span>
                        <span className="font-medium">{results.launch.tracking?.join(", ")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reports</span>
                        <span className="font-medium">{results.launch.reportSchedule}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Timeline */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Timeline
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        <div className="flex items-start gap-3">
                          <Badge variant="secondary" className="shrink-0">Week 1</Badge>
                          <span>Learning phase — algorithms optimizing delivery</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <Badge variant="secondary" className="shrink-0">Week 2-4</Badge>
                          <span>Optimization — scaling winners, pausing underperformers</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <Badge variant="secondary" className="shrink-0">Month 2+</Badge>
                          <span>Scaling — increasing budget on proven campaigns</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Next Steps Checklist */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Next Steps</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {[
                          "Connect Facebook account",
                          "Review and approve creatives",
                          "Set your budget",
                          "Launch campaign",
                        ].map((item, i) => (
                          <label key={i} className="flex items-center gap-3 text-sm cursor-pointer">
                            <input type="checkbox" className="rounded border-muted-foreground/30" disabled />
                            <span>{item}</span>
                          </label>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Big CTA */}
                  <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
                    <CardContent className="py-8 text-center space-y-4">
                      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                        <Rocket className="h-7 w-7 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">Your campaign is ready to launch.</h3>
                        <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                          Connect your Facebook account and we'll set everything up. You approve before anything goes live.
                        </p>
                      </div>
                      <Button
                        size="lg"
                        className="text-base px-10 py-6 shadow-elevation-medium hover:shadow-elevation-high transition-shadow"
                        onClick={() => navigate("/profile")}
                      >
                        Connect Facebook & Launch
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        7-day free trial · $49/month · Cancel anytime
                      </p>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <Rocket className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Run analysis to see your launch plan
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

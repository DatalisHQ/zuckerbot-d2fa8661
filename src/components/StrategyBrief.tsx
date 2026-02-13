import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Sparkles,
  Download,
  RefreshCw,
  Target,
  Users,
  DollarSign,
  Calendar,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BriefData {
  brief_id: string;
  markdown: string;
  execution_plan: any;
  presentation_url: string | null;
  created_at: string;
  cached: boolean;
}

interface StrategyBriefProps {
  businessId: string;
  businessName: string;
  autoGenerate?: boolean;
}

// ─── Markdown renderer (simple) ──────────────────────────────────────────────

function renderMarkdown(md: string): string {
  return md
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2 text-foreground">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-8 mb-3 text-foreground border-b border-border/50 pb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-4 text-foreground">$1</h1>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Bullet lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-muted-foreground">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-muted-foreground list-decimal">$1</li>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p class="text-muted-foreground leading-relaxed mb-3">')
    // Line breaks
    .replace(/\n/g, "<br/>");
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StrategyBrief({ businessId, businessName, autoGenerate = false }: StrategyBriefProps) {
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const { toast } = useToast();

  // Check for existing brief on mount
  useEffect(() => {
    checkExistingBrief();
  }, [businessId]);

  const checkExistingBrief = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke("generate-strategy-brief", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (data?.cached) {
        setBrief(data);
      } else if (data?.markdown) {
        setBrief(data);
      }
    } catch (err) {
      // No existing brief — that's fine
      console.log("[StrategyBrief] No existing brief or error:", err);
    } finally {
      setLoading(false);
      setHasChecked(true);
    }
  };

  const generateBrief = async (regenerate = false) => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Please sign in", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.functions.invoke("generate-strategy-brief", {
        body: regenerate ? { regenerate: true } : {},
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;

      setBrief(data);
      setExpanded(true);

      toast({
        title: "Strategy brief ready! 🎯",
        description: "Your personalized ad strategy has been generated.",
      });
    } catch (err: any) {
      console.error("[StrategyBrief] Generation error:", err);
      toast({
        title: "Failed to generate brief",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate on first load if no brief exists
  useEffect(() => {
    if (autoGenerate && hasChecked && !brief && !loading) {
      generateBrief();
    }
  }, [autoGenerate, hasChecked, brief]);

  // Extract key metrics from execution plan
  const plan = brief?.execution_plan;
  const primaryAudience = plan?.target_audiences?.[0];
  const firstCampaign = plan?.campaigns?.[0];
  const totalDailyBudget = plan?.campaigns?.reduce(
    (sum: number, c: any) => sum + (c.budget_daily_cents || 0), 0
  ) || 0;

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading && !brief) {
    return (
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary animate-pulse" />
            </div>
            <div>
              <CardTitle>Generating Your Strategy Brief...</CardTitle>
              <CardDescription>
                Our AI is analyzing {businessName} and building your personalized ad strategy
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-2 mt-4">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── No brief yet ───────────────────────────────────────────────────────

  if (!brief) {
    return (
      <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-semibold">Your Ad Strategy Brief</h3>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              Get a personalized advertising strategy for {businessName} — 
              the same quality you'd get from a $5,000/month agency.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => generateBrief()}
            disabled={loading}
            className="gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {loading ? "Generating..." : "Generate My Strategy Brief"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Takes about 30 seconds. Analyzes your business, competitors, and market.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Brief exists ───────────────────────────────────────────────────────

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Ad Strategy Brief</CardTitle>
              <CardDescription>
                Generated {new Date(brief.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/brief/${brief.brief_id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1" />
                View Full Report
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateBrief(true)}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Key metrics summary */}
        {plan && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {plan.business_analysis?.recommended_objective && (
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <Target className="w-5 h-5 text-primary mx-auto mb-1" />
                <div className="text-sm font-medium capitalize">
                  {plan.business_analysis.recommended_objective}
                </div>
                <div className="text-xs text-muted-foreground">Objective</div>
              </div>
            )}
            {primaryAudience && (
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <Users className="w-5 h-5 text-primary mx-auto mb-1" />
                <div className="text-sm font-medium">
                  {primaryAudience.age_range?.[0]}-{primaryAudience.age_range?.[1]}
                </div>
                <div className="text-xs text-muted-foreground">Target Age</div>
              </div>
            )}
            {totalDailyBudget > 0 && (
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <DollarSign className="w-5 h-5 text-primary mx-auto mb-1" />
                <div className="text-sm font-medium">
                  ${(totalDailyBudget / 100).toFixed(0)}/day
                </div>
                <div className="text-xs text-muted-foreground">Recommended</div>
              </div>
            )}
            {plan.campaigns?.length > 0 && (
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
                <div className="text-sm font-medium">
                  {plan.campaigns.length} campaigns
                </div>
                <div className="text-xs text-muted-foreground">Recommended</div>
              </div>
            )}
          </div>
        )}

        {/* Campaign angles preview */}
        {plan?.campaigns && plan.campaigns.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
              Recommended Campaign Angles
            </h4>
            <div className="grid gap-3">
              {plan.campaigns.slice(0, 3).map((campaign: any, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
                >
                  <Badge variant="secondary" className="mt-0.5 shrink-0">
                    {i + 1}
                  </Badge>
                  <div>
                    <div className="font-medium text-sm">{campaign.angle || campaign.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {campaign.headlines?.[0] || ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expandable full brief */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="w-full justify-center gap-2"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Hide Full Brief
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                View Full Strategy Brief
              </>
            )}
          </Button>

          {expanded && (
            <div
              className="mt-4 prose prose-sm dark:prose-invert max-w-none p-6 rounded-lg bg-muted/20 border border-border/50"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(brief.markdown) }}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

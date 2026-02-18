import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { CompetitorInsights } from "@/components/CompetitorInsights";
import {
  Zap,
  Download,
  ArrowLeft,
  Target,
  Users,
  DollarSign,
  TrendingUp,
  Calendar,
  AlertCircle,
  Loader2,
  BarChart3,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BriefData {
  id: string;
  brief_markdown: string;
  execution_plan: any;
  created_at: string;
  business_name: string;
  business_trade: string;
  business_location: string;
}

// ─── Markdown → HTML renderer ────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  if (!md) return "";
  
  let html = md
    // Code blocks (before other processing)
    .replace(/```([^`]+)```/gs, '<pre class="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 text-sm overflow-x-auto my-4"><code>$1</code></pre>')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 class="text-base font-semibold mt-5 mb-2 text-slate-800 dark:text-slate-200">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-8 mb-3 text-slate-800 dark:text-slate-200 flex items-center gap-2"><span class="w-1.5 h-6 bg-blue-500 rounded-full inline-block"></span>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold mt-12 mb-4 text-slate-900 dark:text-slate-100 pb-3 border-b-2 border-blue-500/20">$1</h2>')
    .replace(/^# (.+)$/gm, '')  // We handle the title separately
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-800 dark:text-slate-200">$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em class="text-slate-600 dark:text-slate-400">$1</em>')
    // Bullet lists — group consecutive items
    .replace(/^- (.+)$/gm, '<li class="text-slate-600 dark:text-slate-400 leading-relaxed">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="text-slate-600 dark:text-slate-400 leading-relaxed list-decimal">$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul class="space-y-2 my-4 ml-5 list-disc">$1</ul>')
    // Paragraphs — lines that aren't headers, lists, or empty
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<')) return trimmed;
      return `<p class="text-slate-600 dark:text-slate-400 leading-relaxed mb-3">${trimmed}</p>`;
    })
    .join('\n');

  return html;
}

// ─── ROI Calculator ──────────────────────────────────────────────────────────

function ROICalculator({ plan }: { plan: any }) {
  // Extract baseline metrics from the execution plan
  const campaigns = plan.campaigns || [];
  const baselineDailyBudgetCents = campaigns.reduce(
    (sum: number, c: any) => sum + (c.budget_daily_cents || 2000), 0
  );

  // Get average target metrics across campaigns
  const avgCtrPct = campaigns.reduce(
    (sum: number, c: any) => sum + (c.kpis?.target_ctr_pct || 1.5), 0
  ) / Math.max(campaigns.length, 1);
  const avgCpcCents = campaigns.reduce(
    (sum: number, c: any) => sum + (c.kpis?.target_cpc_cents || 80), 0
  ) / Math.max(campaigns.length, 1);
  const avgCplCents = campaigns.reduce(
    (sum: number, c: any) => sum + (c.kpis?.target_cpl_cents || 1500), 0
  ) / Math.max(campaigns.length, 1);

  // Slider state — daily budget in dollars
  const baselineDailyDollars = Math.round(baselineDailyBudgetCents / 100);
  const [dailyBudget, setDailyBudget] = useState(
    Math.max(10, Math.min(baselineDailyDollars, 500))
  );

  // Calculate projections based on slider
  const projections = useMemo(() => {
    const monthlySpend = dailyBudget * 30;
    const cpmEstimate = (avgCpcCents / 100) / (avgCtrPct / 100); // CPM from CPC and CTR
    const monthlyImpressions = Math.round((monthlySpend / (cpmEstimate > 0 ? cpmEstimate : 5)) * 1000);
    const monthlyClicks = Math.round(monthlyImpressions * (avgCtrPct / 100));
    const costPerClick = monthlyClicks > 0 ? monthlySpend / monthlyClicks : 0;
    const conversionRate = avgCplCents > 0 ? (avgCpcCents / avgCplCents) : 0.1; // clicks to leads
    const monthlyLeads = Math.round(monthlyClicks * Math.min(conversionRate, 0.15));
    const costPerLead = monthlyLeads > 0 ? monthlySpend / monthlyLeads : 0;

    // Assume average customer value (conservative)
    const avgCustomerValue = 500; // $500 per customer (conservative for most small businesses)
    const leadToCustomerRate = 0.2; // 20% of leads become customers
    const monthlyCustomers = Math.round(monthlyLeads * leadToCustomerRate);
    const monthlyRevenue = monthlyCustomers * avgCustomerValue;
    const roi = monthlySpend > 0 ? ((monthlyRevenue - monthlySpend) / monthlySpend) * 100 : 0;

    return {
      monthlySpend,
      monthlyImpressions,
      monthlyClicks,
      costPerClick,
      monthlyLeads: Math.max(monthlyLeads, 1),
      costPerLead,
      monthlyCustomers: Math.max(monthlyCustomers, 0),
      monthlyRevenue,
      roi,
    };
  }, [dailyBudget, avgCtrPct, avgCpcCents, avgCplCents]);

  const formatNum = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  return (
    <div className="mb-12 print:mb-8">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 pb-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-blue-500" />
        Interactive ROI Calculator
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        Adjust your daily ad spend to see projected results based on industry benchmarks for your business type.
      </p>

      {/* Budget slider */}
      <div className="p-6 rounded-xl bg-gradient-to-br from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-900 border border-blue-200 dark:border-blue-800 mb-6">
        <div className="flex items-center justify-between mb-4">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Daily Ad Spend
          </label>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            ${dailyBudget}/day
          </div>
        </div>
        <Slider
          value={[dailyBudget]}
          onValueChange={([val]) => setDailyBudget(val)}
          min={10}
          max={500}
          step={5}
          className="mb-3"
        />
        <div className="flex justify-between text-xs text-slate-400">
          <span>$10/day</span>
          <span className="text-blue-500 font-medium">
            ${(dailyBudget * 30).toLocaleString()}/month
          </span>
          <span>$500/day</span>
        </div>
      </div>

      {/* Projected results grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            {formatNum(projections.monthlyImpressions)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Monthly Impressions</div>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            {formatNum(projections.monthlyClicks)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Monthly Clicks</div>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {projections.monthlyLeads}
          </div>
          <div className="text-xs text-slate-500 mt-1">Estimated Leads</div>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            ${projections.costPerLead.toFixed(0)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Cost Per Lead</div>
        </div>
      </div>

      {/* Revenue projection */}
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 uppercase tracking-wide">
          Revenue Projection
        </h3>
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-sm text-slate-500 mb-1">Monthly Spend</div>
            <div className="text-xl font-bold text-red-500">
              -${projections.monthlySpend.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">Est. Revenue</div>
            <div className="text-xl font-bold text-green-600 dark:text-green-400">
              +${projections.monthlyRevenue.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">Projected ROI</div>
            <div className={`text-xl font-bold ${projections.roi > 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
              {projections.roi > 0 ? "+" : ""}{projections.roi.toFixed(0)}%
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-4 text-center">
          Based on {avgCtrPct.toFixed(1)}% CTR, ${(avgCpcCents/100).toFixed(2)} CPC, and 20% lead-to-customer conversion.
          Assumes $500 average customer value. Actual results may vary.
        </p>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BriefView() {
  const { briefId } = useParams<{ briefId: string }>();
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBrief();
  }, [briefId]);

  const fetchBrief = async () => {
    try {
      if (!briefId) {
        setError("No brief ID provided");
        return;
      }

      // Fetch brief
      const { data, error: fetchError } = await supabase
        .from("strategy_briefs" as any)
        .select("id, brief_markdown, execution_plan, created_at, business_id")
        .eq("id", briefId)
        .maybeSingle();

      if (fetchError || !data) {
        setError("Strategy brief not found");
        return;
      }

      // Fetch business details separately
      let businessName = "Business";
      let businessTrade = "";
      let businessLocation = "";

      if (data.business_id) {
        const { data: biz } = await supabase
          .from("businesses" as any)
          .select("name, trade, suburb, state")
          .eq("id", data.business_id)
          .maybeSingle();

        if (biz) {
          businessName = (biz as any).name || "Business";
          businessTrade = (biz as any).trade || "";
          businessLocation = (biz as any).suburb
            ? `${(biz as any).suburb}, ${(biz as any).state}`
            : "";
        }
      }

      setBrief({
        id: data.id as string,
        brief_markdown: data.brief_markdown as string,
        execution_plan: data.execution_plan,
        created_at: data.created_at as string,
        business_name: businessName,
        business_trade: businessTrade,
        business_location: businessLocation,
      });
    } catch (err: any) {
      setError(err.message || "Failed to load brief");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const plan = brief?.execution_plan;
  const primaryAudience = plan?.target_audiences?.[0];
  const firstCampaign = plan?.campaigns?.[0];
  const totalDailyBudget = plan?.campaigns?.reduce(
    (sum: number, c: any) => sum + (c.budget_daily_cents || 0), 0
  ) || 0;

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
          <p className="text-slate-500">Loading strategy brief...</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────

  if (error || !brief) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
            {error || "Brief not found"}
          </h1>
          <p className="text-slate-500">
            This strategy brief may have been removed or the link is invalid.
          </p>
          <Link to="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to ZuckerBot
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Print-hidden nav */}
      <nav className="print:hidden sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-800 dark:text-slate-200">ZuckerBot</span>
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Download className="w-4 h-4 mr-2" />
              Save as PDF
            </Button>
            <Link to="/dashboard">
              <Button size="sm">Go to Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Brief content */}
      <main className="max-w-4xl mx-auto px-6 py-12 print:py-0 print:px-0">
        {/* Cover / Header */}
        <div className="mb-12 print:mb-8">
          <div className="flex items-center gap-2 mb-6 print:hidden">
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              AI-Generated Strategy
            </Badge>
            <Badge variant="outline" className="text-slate-500">
              {new Date(brief.created_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </Badge>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white leading-tight mb-4">
            Ad Strategy Brief
          </h1>
          <div className="flex items-center gap-3 text-lg text-slate-500">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {brief.business_name}
            </span>
            {brief.business_trade && (
              <>
                <span>·</span>
                <span className="capitalize">{brief.business_trade}</span>
              </>
            )}
            {brief.business_location && (
              <>
                <span>·</span>
                <span>{brief.business_location}</span>
              </>
            )}
          </div>

          <div className="mt-2 text-sm text-slate-400">
            Prepared by ZuckerBot AI Agency
          </div>
        </div>

        {/* Key metrics */}
        {plan && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12 print:mb-8">
            {plan.business_analysis?.recommended_objective && (
              <div className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <Target className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 capitalize">
                  {plan.business_analysis.recommended_objective}
                </div>
                <div className="text-xs text-slate-500 mt-1">Recommended Objective</div>
              </div>
            )}
            {primaryAudience && (
              <div className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <Users className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Age {primaryAudience.age_range?.[0]}–{primaryAudience.age_range?.[1]}
                </div>
                <div className="text-xs text-slate-500 mt-1">Target Demographic</div>
              </div>
            )}
            {totalDailyBudget > 0 && (
              <div className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <DollarSign className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  ${(totalDailyBudget / 100).toFixed(0)}/day
                </div>
                <div className="text-xs text-slate-500 mt-1">Recommended Budget</div>
              </div>
            )}
            {plan.campaigns?.length > 0 && (
              <div className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <TrendingUp className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {plan.campaigns.length} Campaigns
                </div>
                <div className="text-xs text-slate-500 mt-1">Recommended</div>
              </div>
            )}
          </div>
        )}

        {/* Campaign angles */}
        {plan?.campaigns && plan.campaigns.length > 0 && (
          <div className="mb-12 print:mb-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-200 dark:border-slate-800">
              Recommended Campaign Angles
            </h2>
            <div className="grid gap-4">
              {plan.campaigns.map((campaign: any, i: number) => (
                <div
                  key={i}
                  className="p-5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-sm shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                        {campaign.angle || campaign.name}
                      </h3>
                      {campaign.headlines?.[0] && (
                        <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-2">
                          "{campaign.headlines[0]}"
                        </p>
                      )}
                      {campaign.copy_variants?.[0] && (
                        <p className="text-sm text-slate-500 leading-relaxed">
                          {campaign.copy_variants[0]}
                        </p>
                      )}
                      <div className="flex gap-3 mt-3 text-xs text-slate-400">
                        {campaign.budget_daily_cents && (
                          <span>${(campaign.budget_daily_cents / 100).toFixed(0)}/day</span>
                        )}
                        {campaign.duration_days && (
                          <span>{campaign.duration_days} days</span>
                        )}
                        {campaign.cta && (
                          <Badge variant="outline" className="text-xs">{campaign.cta}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interactive ROI Calculator */}
        {plan?.campaigns && plan.campaigns.length > 0 && (
          <ROICalculator plan={plan} />
        )}

        {/* Competitor Intelligence — powered by TinyFish */}
        <div className="my-8">
          <CompetitorInsights
            industry={brief.business_trade}
            location={brief.business_location}
            country="US"
            businessName={brief.business_name}
          />
        </div>

        {/* Full brief markdown */}
        <div
          className="prose-custom"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(brief.brief_markdown) }}
        />

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-slate-200 dark:border-slate-800 text-center print:mt-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-slate-600 dark:text-slate-400">ZuckerBot</span>
          </div>
          <p className="text-sm text-slate-400">
            This strategy was generated by ZuckerBot's AI engine.
            Ready to execute? <Link to="/dashboard" className="text-blue-500 hover:underline">Launch your first campaign →</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

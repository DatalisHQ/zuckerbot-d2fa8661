import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Search, TrendingUp, Eye, Calendar, Zap } from "lucide-react";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL || "https://bqqmkiocynvlaianwisd.supabase.co"}/functions/v1/analyze-competitors`;

interface CompetitorAd {
  page_name: string;
  ad_body_text: string;
  started_running_date: string;
  platforms: string;
}

interface CompetitorData {
  competitor_ads: CompetitorAd[];
  insights: Record<string, string>;
  ad_count: number;
}

interface CompetitorInsightsProps {
  industry?: string;
  location?: string;
  country?: string;
  businessId?: string;
  businessName?: string;
}

export function CompetitorInsights({ industry, location, country, businessId, businessName }: CompetitorInsightsProps) {
  const [data, setData] = useState<CompetitorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState("");

  const analyzeCompetitors = async () => {
    if (!industry || !location) return;
    
    setLoading(true);
    setError(null);
    setCurrentStep("Navigating to Facebook Ad Library...");

    try {
      // Simulate progress updates since we can't stream SSE from the client easily
      const progressSteps = [
        { text: "Navigating to Facebook Ad Library...", delay: 3000 },
        { text: "Searching for competitor ads...", delay: 5000 },
        { text: "Extracting ad creatives and copy...", delay: 8000 },
        { text: "Analyzing competitor strategies...", delay: 3000 },
      ];

      // Start progress simulation
      let stepIndex = 0;
      const progressInterval = setInterval(() => {
        stepIndex++;
        if (stepIndex < progressSteps.length) {
          setCurrentStep(progressSteps[stepIndex].text);
        }
      }, progressSteps[stepIndex]?.delay || 5000);

      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, industry, location, country: country || "US", businessName }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error("Failed to analyze competitors");
      }

      const result = await response.json();
      setData(result);
      setCurrentStep("");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setCurrentStep("");
    } finally {
      setLoading(false);
    }
  };

  // Don't render if no industry/location available
  if (!industry || !location) return null;

  return (
    <Card className="border-2 border-dashed border-blue-200 bg-blue-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Search className="w-5 h-5 text-blue-600" />
          Competitor Intelligence
          <span className="text-xs font-normal text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">
            Powered by TinyFish
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data && !loading && (
          <div className="text-center py-4">
            <p className="text-muted-foreground mb-4">
              Discover what your competitors are running on Facebook right now.
              Our AI agent navigates the Facebook Ad Library in real-time to find and analyze active ads in your market.
            </p>
            <Button onClick={analyzeCompetitors} className="gap-2">
              <Zap className="w-4 h-4" />
              Analyze Competitors in {industry}
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-blue-700">{currentStep}</p>
            <p className="text-xs text-muted-foreground">
              AI agent is browsing Facebook Ad Library in real-time...
            </p>
          </div>
        )}

        {error && (
          <div className="text-center py-4">
            <p className="text-red-500 mb-2">{error}</p>
            <Button variant="outline" onClick={analyzeCompetitors} size="sm">
              Try Again
            </Button>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Insights Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                  <Eye className="w-4 h-4" />
                  Active Ads Found
                </div>
                <p className="text-2xl font-bold mt-1">{data.ad_count}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                  <TrendingUp className="w-4 h-4" />
                  Market Insight
                </div>
                <p className="text-xs mt-1 text-muted-foreground">
                  {data.insights.opportunity || data.insights.summary}
                </p>
              </div>
            </div>

            {/* Individual Competitor Ads */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Competitor Ads
              </h4>
              {data.competitor_ads.map((ad, index) => (
                <div key={index} className="bg-white rounded-lg p-4 border hover:border-blue-200 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <h5 className="font-semibold text-sm">{ad.page_name}</h5>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {ad.started_running_date}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                    {ad.ad_body_text.length > 200
                      ? ad.ad_body_text.slice(0, 200) + "..."
                      : ad.ad_body_text}
                  </p>
                  <div className="text-xs text-blue-500">
                    📱 {ad.platforms}
                  </div>
                </div>
              ))}
            </div>

            {/* Refresh button */}
            <div className="text-center pt-2">
              <Button variant="outline" size="sm" onClick={analyzeCompetitors} className="gap-2">
                <Search className="w-3 h-3" />
                Refresh Analysis
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

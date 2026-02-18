import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Search, TrendingUp, Eye, Calendar, Zap } from "lucide-react";

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
  const [streamingUrl, setStreamingUrl] = useState<string | null>(null);

  const analyzeCompetitors = async () => {
    if (!industry || !location) return;

    setLoading(true);
    setError(null);
    setData(null);
    setStreamingUrl(null);
    setCurrentStep("Connecting to AI agent...");

    try {
      const response = await fetch("/api/analyze-competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, industry, location, country: country || "US" }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to connect");
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
              setCurrentStep(event.message);
            }

            if (event.type === "STREAMING_URL") {
              setStreamingUrl(event.url);
            }

            if (event.type === "COMPLETE") {
              setData({
                competitor_ads: event.competitor_ads || [],
                insights: event.insights || {},
                ad_count: event.ad_count || 0,
              });
            }

            if (event.type === "ERROR") {
              throw new Error(event.message);
            }
          } catch (e: any) {
            if (e.message && e.message !== "Unexpected end of JSON input") {
              throw e;
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
      setCurrentStep("");
    }
  };

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
              Our AI agent navigates Facebook Ad Library in real-time to find and analyze
              your competitors' active ads.
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
            {streamingUrl && (
              <a
                href={streamingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 underline hover:text-blue-700"
              >
                🔴 Watch agent live →
              </a>
            )}
            <p className="text-xs text-muted-foreground">
              AI agent is browsing Facebook Ad Library...
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
                    {ad.ad_body_text?.length > 200
                      ? ad.ad_body_text.slice(0, 200) + "..."
                      : ad.ad_body_text}
                  </p>
                  <div className="text-xs text-blue-500">
                    📱 {ad.platforms}
                  </div>
                </div>
              ))}
            </div>

            {/* Refresh */}
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

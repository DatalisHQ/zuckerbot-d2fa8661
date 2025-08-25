import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Target, ExternalLink, AlertCircle, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AudienceSegments, type AudienceSegment } from './AudienceSegments';

interface CompetitorAd {
  id: string;
  headline: string;
  primary_text: string;
  cta: string;
  image_url: string;
  impressions: string;
  spend_estimate: string;
  date_created: string;
  creative_type?: 'image' | 'video' | 'carousel';
  engagement?: { likes?: number | null; comments?: number | null; shares?: number | null };
}

interface CompetitorInsight {
  name: string;
  url?: string;
  ads: CompetitorAd[];
  websiteAnalysis?: {
    niche: string;
    audience: string;
    tone: string;
    value_props: string[];
    screenshot_url?: string;
  };
  insights?: {
    hooks?: string[];
    ctas?: string[];
    creative_trends?: string[];
    common_hooks?: string[];
    common_ctas?: string[];
    dominant_tones?: string[];
    avg_text_length?: number;
  } | null;
  total_ads_found?: number;
  no_ads_message?: string;
}

interface AngleSuggestion {
  type: string;
  title: string;
  description: string;
  strategy: string;
  confidence: number;
}

interface CompetitorInsightsProps {
  competitorListId: string;
  brandUrl?: string;
  campaignId?: string;
  existingData?: any;
  onAngleSelected: (angle: AngleSuggestion, insights: any) => void;
  onAudienceSelected?: (segments: AudienceSegment[]) => void;
}

export const CompetitorInsights = ({ 
  competitorListId, 
  brandUrl, 
  campaignId,
  existingData,
  onAngleSelected, 
  onAudienceSelected 
}: CompetitorInsightsProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [competitorInsights, setCompetitorInsights] = useState<CompetitorInsight[]>([]);
  const [overallInsights, setOverallInsights] = useState<any>(null);
  const [suggestedAngles, setSuggestedAngles] = useState<AngleSuggestion[]>([]);
  const [selectedAngle, setSelectedAngle] = useState<AngleSuggestion | null>(null);
  const [showAudienceSegments, setShowAudienceSegments] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchCompetitorInsights();
  }, [competitorListId]);

  const fetchCompetitorInsights = async () => {
    setIsLoading(true);
    setProgress(0);

    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const { data, error } = await supabase.functions.invoke('competitor-insights', {
        body: { 
          competitorListId,
          userId: user.data.user.id 
        }
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) throw error;

      const insights = data.competitorInsights || [];
      
      setCompetitorInsights(insights);
      setOverallInsights(data.overallInsights);
      setSuggestedAngles(data.suggestedAngles);

      toast({
        title: "Analysis complete!",
        description: `Analyzed ${insights.length} competitors' websites and strategies.`,
      });
    } catch (error) {
      console.error('Error fetching competitor insights:', error);
      
      let errorMessage = error.message || "An error occurred during competitor analysis";
      let errorTitle = "Analysis failed";
      
      // Handle specific error cases
      if (errorMessage.includes('Facebook not connected')) {
        errorTitle = "Facebook Connection Required";
        errorMessage = "Please connect your Facebook account to analyze competitors.";
      } else if (errorMessage.includes('token expired')) {
        errorTitle = "Facebook Token Expired";  
        errorMessage = "Your Facebook connection has expired. Please reconnect your account.";
      } else if (errorMessage.includes('Invalid OAuth access token')) {
        errorTitle = "Facebook Authentication Issue";
        errorMessage = "There's an issue with your Facebook connection. Please try reconnecting your account.";
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAngleSelection = (angle: AngleSuggestion) => {
    setSelectedAngle(angle);
    if (brandUrl && onAudienceSelected) {
      setShowAudienceSegments(true);
    } else {
      onAngleSelected(angle, {
        competitorInsights,
        overallInsights,
        suggestedAngles,
        competitorProfiles
      });
    }
  };

  const handleAudienceSelection = (segments: AudienceSegment[]) => {
    if (selectedAngle && onAudienceSelected) {
      onAudienceSelected(segments);
      onAngleSelected(selectedAngle, {
        competitorInsights,
        overallInsights,
        suggestedAngles,
        competitorProfiles,
        audienceSegments: segments
      });
    }
  };

  // Transform competitor insights for audience analysis
  const competitorProfiles = competitorInsights.map(competitor => ({
    name: competitor.name,
    valueProps: competitor.websiteAnalysis?.value_props || competitor.insights?.hooks || [],
    toneProfile: competitor.websiteAnalysis?.tone || 'professional'
  }));

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return "bg-green-500";
    if (confidence >= 75) return "bg-yellow-500";
    return "bg-orange-500";
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <div className="text-center">
                <h3 className="text-lg font-semibold">Analyzing Competitor Strategies</h3>
                <p className="text-sm text-muted-foreground">
                  Gathering website data and identifying patterns...
                </p>
              </div>
              <div className="w-full max-w-md">
                <Progress value={progress} className="w-full" />
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {progress}% complete
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Market Intelligence Summary - Only show if we have actionable data */}
      {overallInsights && (overallInsights.trending_hooks?.length > 0 || overallInsights.key_patterns?.some((p: string) => !p.includes("Not enough data"))) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Market Intelligence Summary
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Based on website analysis of {overallInsights.data_quality?.competitors_with_website_data || competitorInsights.length} competitor(s)
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {overallInsights.trending_hooks?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">
                    Common Value Props ({overallInsights.trending_hooks.length})
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {overallInsights.trending_hooks.map((hook: string, index: number) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {hook}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {overallInsights.trending_ctas?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Popular CTAs ({overallInsights.trending_ctas.length})</h4>
                  <div className="flex flex-wrap gap-1">
                    {overallInsights.trending_ctas.map((cta: string, index: number) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {cta}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {overallInsights.key_patterns?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Key Patterns</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {overallInsights.key_patterns.map((pattern: string, index: number) => (
                      <li key={index} className="flex items-start gap-1">
                        <span className="text-primary">•</span>
                        {pattern}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Fallback message only if truly no data */}
      {overallInsights && overallInsights.key_patterns?.some((p: string) => p.includes("Not enough data")) && (
        <Card className="mb-6 border-dashed">
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">
                Not enough data to generate market intelligence summary for these competitors.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Angle Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Choose Your Angle
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Based on competitor analysis, select the strategy that best fits your brand.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {suggestedAngles.map((angle, index) => (
              <Card 
                key={index} 
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  selectedAngle?.type === angle.type ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => handleAngleSelection(angle)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{angle.title}</CardTitle>
                    <div className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${getConfidenceColor(angle.confidence)}`} />
                      <span className="text-xs text-muted-foreground">{angle.confidence}%</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">{angle.description}</p>
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">Strategy:</span>
                      <p className="text-xs">{angle.strategy}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
        </CardContent>
      </Card>

      {/* Audience Segments */}
      {showAudienceSegments && brandUrl && competitorProfiles.length > 0 && (
        <AudienceSegments
          brandUrl={brandUrl}
          competitorProfiles={competitorProfiles}
          onSegmentsSelected={handleAudienceSelection}
        />
      )}

      {/* Detailed Competitor Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Competitor Analysis Results</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="0" className="w-full">
            <TabsList className="w-full h-auto p-1 flex overflow-x-auto gap-1 bg-muted rounded-md">
              {competitorInsights.map((competitor, index) => (
                <TabsTrigger 
                  key={index} 
                  value={index.toString()} 
                  className="text-xs whitespace-nowrap px-3 py-2 flex-shrink-0 min-w-fit data-[state=active]:bg-background data-[state=active]:text-foreground"
                >
                  {competitor.name}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {competitorInsights.map((competitor, index) => (
              <TabsContent key={index} value={index.toString()} className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{competitor.name}</h3>
                  {competitor.url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={competitor.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Visit Site
                      </a>
                    </Button>
                  )}
                </div>

                {/* Website Analysis Section */}
                {competitor.websiteAnalysis ? (
                  <Card className="bg-muted/30">
                    <CardHeader>
                      <CardTitle className="text-sm">Website Analysis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-4">
                        {/* Screenshot */}
                        {competitor.websiteAnalysis.screenshot_url && (
                          <div className="flex-shrink-0">
                            <img 
                              src={competitor.websiteAnalysis.screenshot_url} 
                              alt={`${competitor.name} homepage`}
                              className="w-48 h-32 object-cover rounded border shadow-sm"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        
                        {/* Analysis Text */}
                        <div className="flex-1 space-y-3">
                          <div>
                            <h5 className="font-medium text-sm mb-1">Niche & Audience</h5>
                            <p className="text-sm text-foreground">
                              <strong>Focus:</strong> {competitor.websiteAnalysis.niche}
                            </p>
                            <p className="text-sm text-foreground mt-1">
                              <strong>Audience:</strong> {competitor.websiteAnalysis.audience}
                            </p>
                          </div>
                          
                          <div>
                            <h5 className="font-medium text-sm mb-1">Value Propositions</h5>
                            <div className="space-y-1">
                              {competitor.websiteAnalysis.value_props?.slice(0, 3).map((prop: string, i: number) => (
                                <div key={i} className="text-xs bg-secondary/20 rounded px-2 py-1 border-l-2 border-primary/30">
                                  {prop}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-muted/30 border-dashed">
                    <CardContent className="pt-6">
                      <div className="text-center text-muted-foreground">
                        <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                        <p className="text-sm">Website analysis unavailable</p>
                        <p className="text-xs">The competitor's website couldn't be properly analyzed or scraped.</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
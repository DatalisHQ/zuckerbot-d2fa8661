import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Loader2, TrendingUp, Target, Lightbulb, ExternalLink } from "lucide-react";
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
  };
  insights: {
    hooks: string[];
    ctas: string[];
    creative_trends: string[];
  };
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
  onAngleSelected: (angle: AngleSuggestion, insights: any) => void;
  onAudienceSelected?: (segments: AudienceSegment[]) => void;
}

export const CompetitorInsights = ({ 
  competitorListId, 
  brandUrl, 
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

      setCompetitorInsights(data.competitorInsights);
      setOverallInsights(data.overallInsights);
      setSuggestedAngles(data.suggestedAngles);

      toast({
        title: "Analysis complete!",
        description: `Analyzed ${data.competitorInsights.length} competitors and their ad strategies.`,
      });
    } catch (error) {
      console.error('Error fetching competitor insights:', error);
      toast({
        title: "Analysis failed",
        description: "Please try again or proceed with manual angle selection.",
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
        suggestedAngles
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
        audienceSegments: segments
      });
    }
  };

  // Transform competitor insights for audience analysis
  const competitorProfiles = competitorInsights.map(competitor => ({
    name: competitor.name,
    valueProps: competitor.websiteAnalysis?.value_props || competitor.insights.hooks || [],
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
              <Loader2 className="h-8 w-8 animate-spin" />
              <div className="text-center">
                <h3 className="text-lg font-semibold">Analyzing Competitor Strategies</h3>
                <p className="text-sm text-muted-foreground">
                  Gathering ad data and identifying winning patterns...
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
      {/* Overall Insights */}
      {overallInsights && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Market Intelligence Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-medium mb-2">Trending Hooks</h4>
                <div className="flex flex-wrap gap-1">
                  {overallInsights.trending_hooks?.map((hook: string, index: number) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {hook}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Popular CTAs</h4>
                <div className="flex flex-wrap gap-1">
                  {overallInsights.trending_ctas?.map((cta: string, index: number) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {cta}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Key Patterns</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {overallInsights.key_patterns?.slice(0, 2).map((pattern: string, index: number) => (
                    <li key={index} className="flex items-start gap-1">
                      <span className="text-primary">•</span>
                      {pattern}
                    </li>
                  ))}
                </ul>
              </div>
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
          
          {selectedAngle && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span className="font-medium">Selected: {selectedAngle.title}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{selectedAngle.strategy}</p>
              <Button onClick={() => handleAngleSelection(selectedAngle)} className="w-full">
                {brandUrl && onAudienceSelected ? 'Continue to Audience Selection' : 'Generate Ads with This Angle'}
              </Button>
            </div>
          )}
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
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {competitorInsights.map((competitor, index) => (
                <TabsTrigger key={index} value={index.toString()} className="text-xs">
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
                {competitor.websiteAnalysis && (
                  <Card className="bg-muted/30">
                    <CardHeader>
                      <CardTitle className="text-sm">Website Analysis</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <h5 className="font-medium text-sm">Niche</h5>
                        <p className="text-xs text-muted-foreground">{competitor.websiteAnalysis.niche}</p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm">Audience</h5>
                        <p className="text-xs text-muted-foreground">{competitor.websiteAnalysis.audience}</p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm">Tone</h5>
                        <p className="text-xs text-muted-foreground">{competitor.websiteAnalysis.tone}</p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm">Value Props</h5>
                        <div className="flex flex-wrap gap-1">
                          {competitor.websiteAnalysis.value_props?.slice(0, 2).map((prop: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{prop}</Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Ad Analysis Section */}
                {competitor.total_ads_found > 0 ? (
                  <div className="space-y-4">
                    <h4 className="font-semibold">Meta Ads Analysis ({competitor.total_ads_found} ads found)</h4>
                    
                    {/* Ad Insights Summary */}
                    <Card className="bg-blue-50 dark:bg-blue-950/20">
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <h5 className="font-medium text-sm mb-2">Top Hooks</h5>
                            <div className="space-y-1">
                              {competitor.insights.hooks?.slice(0, 3).map((hook: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-xs block w-fit">{hook}</Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h5 className="font-medium text-sm mb-2">Common CTAs</h5>
                            <div className="space-y-1">
                              {competitor.insights.ctas?.map((cta: string, i: number) => (
                                <Badge key={i} variant="secondary" className="text-xs block w-fit">{cta}</Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h5 className="font-medium text-sm mb-2">Creative Trends</h5>
                            <div className="space-y-1">
                              {competitor.insights.creative_trends?.slice(0, 2).map((trend: string, i: number) => (
                                <Badge key={i} variant="default" className="text-xs block w-fit">{trend}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Ad Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {competitor.ads.slice(0, 6).map((ad: any) => (
                        <Card key={ad.id} className="p-4">
                          <div className="space-y-3">
                            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                              <img 
                                src={ad.image_url} 
                                alt="Ad creative" 
                                className="w-full h-full object-cover rounded-lg"
                                onError={(e) => {
                                  e.currentTarget.src = 'https://via.placeholder.com/300x200?text=Ad+Creative';
                                }}
                              />
                            </div>
                            <div>
                              <h4 className="font-medium text-sm">{ad.headline}</h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                {ad.primary_text.substring(0, 100)}...
                              </p>
                            </div>
                            <div className="flex justify-between items-center">
                              <Badge variant="outline" className="text-xs">{ad.cta}</Badge>
                              <span className="text-xs text-muted-foreground">{ad.impressions}</span>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Card className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800">
                    <CardContent className="pt-4">
                      <p className="text-sm">
                        {competitor.no_ads_message || "No active ads found for this competitor. Would you like to try another competitor or proceed?"}
                      </p>
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
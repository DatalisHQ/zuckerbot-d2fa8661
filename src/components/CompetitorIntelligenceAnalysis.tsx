import { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Brain, Users, DollarSign, TrendingUp, MessageSquare, CheckCircle, AlertCircle, Bell, Image, Video, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RealTimeMonitoring } from "./RealTimeMonitoring";
import { AnalysisProgress, ANALYSIS_STEPS } from "./analysis/AnalysisProgress";
import { ThinkingIndicator } from "./analysis/ThinkingIndicator";
import { useAnalysisProgress } from "./analysis/useAnalysisProgress";

interface CompetitorIntelligence {
  detailedAnalysis: {
    businessModel: string;
    targetAudience: string;
    keyStrengths: string[];
    weaknesses: string[];
    uniqueSellingPoints: string[];
    marketFocus: string;
    ad_intelligence?: {
      meta_ads: any;
      tiktok_ads: any;
      search_performed: boolean;
      last_updated: string;
      competitor_name: string;
    };
  };
  socialPresence: {
    platforms: string[];
    engagement: {
      linkedinFollowers: number;
      twitterFollowers: number;
      postFrequency: string;
      engagementRate: string;
    };
    contentStrategy: string[];
  };
  featureMatrix: {
    coreFeatures: string[];
    advancedFeatures: string[];
    integrations: string[];
    platforms: string[];
    apiAccess: boolean | string;
    customization: string;
  };
  pricingInfo: {
    pricingModel: string;
    plans: Array<{
      name: string;
      price: string;
      features: string[];
    }>;
    freeTrial: boolean | string;
    moneyBackGuarantee: string | boolean;
    enterprise: boolean | string;
  };
  marketPosition: {
    marketShare: string;
    positioning: string;
    competitiveAdvantages: string[];
    threats: string[];
    opportunities: string[];
  };
  sentimentAnalysis: {
    overallSentiment: string;
    customerSatisfaction: string;
    commonComplaints: string[];
    positiveReviews: string[];
    reviewSources: string[];
  };
}

interface CompetitorIntelligenceAnalysisProps {
  competitorName: string;
  competitorUrl: string;
  discoveryId?: string;
}

export const CompetitorIntelligenceAnalysis = ({ 
  competitorName, 
  competitorUrl, 
  discoveryId 
}: CompetitorIntelligenceAnalysisProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [intelligence, setIntelligence] = useState<CompetitorIntelligence | null>(null);
  
  const progressTracker = useAnalysisProgress({ 
    steps: ANALYSIS_STEPS.COMPETITOR_INTELLIGENCE 
  });

  const handleAnalyzeCompetitor = async () => {
    setIsLoading(true);
    setIntelligence(null);
    progressTracker.reset();
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to analyze competitors",
          variant: "destructive",
        });
        return;
      }

      console.log('Starting competitor intelligence analysis for:', competitorName);
      
      // Step 1: Website Analysis
      progressTracker.startStep('website-analysis', 'Deep diving into competitor website architecture...');
      
      setTimeout(() => {
        progressTracker.completeStep('website-analysis', 5);
        progressTracker.startStep('feature-extraction', 'Analyzing product features and capabilities...');
      }, 4000);
      
      setTimeout(() => {
        progressTracker.completeStep('feature-extraction', 6);
        progressTracker.startStep('pricing-analysis', 'Extracting pricing models and strategies...');
      }, 8000);
      
      setTimeout(() => {
        progressTracker.completeStep('pricing-analysis', 4);
        progressTracker.startStep('social-analysis', 'Evaluating social media presence and engagement...');
      }, 12000);
      
      setTimeout(() => {
        progressTracker.completeStep('social-analysis', 3);
        progressTracker.startStep('sentiment-analysis', 'Analyzing customer sentiment and reviews...');
      }, 15000);

      const { data, error } = await supabase.functions.invoke('analyze-competitor', {
        body: {
          competitorName,
          competitorUrl,
          userId: user.id,
          discoveryId
        }
      });

      if (error) {
        console.error('Error calling analyze-competitor function:', error);
        progressTracker.errorStep(progressTracker.getCurrentStep()?.id || 'sentiment-analysis', 'Analysis failed - please try again');
        throw error;
      }

      if (!data.success) {
        progressTracker.errorStep(progressTracker.getCurrentStep()?.id || 'sentiment-analysis', data.error || 'Analysis failed');
        throw new Error(data.error || 'Competitor analysis failed');
      }

      // Complete final step
      progressTracker.completeStep('sentiment-analysis', 4);
      progressTracker.updateThinkingMessage('Intelligence analysis complete!');

      console.log('Analysis completed:', data.analysis);
      setIntelligence(data.analysis);
      
      toast({
        title: "Analysis Complete",
        description: "Competitor intelligence analysis has been completed!",
      });

    } catch (error) {
      console.error('Error analyzing competitor:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze competitor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment.toLowerCase()) {
      case 'positive': return 'text-green-600';
      case 'negative': return 'text-red-600';
      case 'neutral': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Competitor Intelligence: {competitorName}
          </CardTitle>
          <CardDescription>
            Deep analysis of competitor's strategy, features, pricing, and market position
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleAnalyzeCompetitor} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Analyzing Competitor...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Start Deep Analysis
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Progress Tracking */}
      {isLoading && (
        <div className="space-y-4">
          <AnalysisProgress 
            steps={progressTracker.steps}
            currentStep={progressTracker.currentStepId || undefined}
            progress={progressTracker.progress}
            thinkingMessage={progressTracker.thinkingMessage}
          />
          <ThinkingIndicator 
            isActive={isLoading}
            message={progressTracker.thinkingMessage}
            stage="thinking"
          />
        </div>
      )}

      {intelligence && (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="ads">Ad Intelligence</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="social">Social</TabsTrigger>
            <TabsTrigger value="position">Position</TabsTrigger>
            <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Business Model</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{intelligence.detailedAnalysis?.businessModel || 'Not available'}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Target Audience</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{intelligence.detailedAnalysis?.targetAudience || 'Not available'}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Key Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {intelligence.detailedAnalysis?.keyStrengths?.map((strength, index) => (
                      <Badge key={index} variant="default" className="mr-2 mb-2">
                        {strength}
                      </Badge>
                    )) || <p className="text-muted-foreground">Not available</p>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                    Weaknesses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {intelligence.detailedAnalysis?.weaknesses?.map((weakness, index) => (
                      <Badge key={index} variant="outline" className="mr-2 mb-2">
                        {weakness}
                      </Badge>
                    )) || <p className="text-muted-foreground">Not available</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="ads" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  Ad Intelligence
                </CardTitle>
                <CardDescription>
                  Current advertising campaigns on Meta and TikTok platforms
                </CardDescription>
              </CardHeader>
              <CardContent>
                {intelligence.detailedAnalysis?.ad_intelligence ? (
                  <div className="space-y-6">
                    {/* Meta Ads Section */}
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <div className="w-4 h-4 bg-blue-600 rounded-full"></div>
                        Meta (Facebook/Instagram) Ads
                      </h4>
                      
                      {intelligence.detailedAnalysis.ad_intelligence.meta_ads ? (
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <Badge variant={intelligence.detailedAnalysis.ad_intelligence.meta_ads.ads_found ? "default" : "secondary"}>
                              {intelligence.detailedAnalysis.ad_intelligence.meta_ads.ads_found ? "Ads Found" : "No Ads Found"}
                            </Badge>
                            {intelligence.detailedAnalysis.ad_intelligence.meta_ads.search_url && (
                              <Button size="sm" variant="outline" asChild>
                                <a 
                                  href={intelligence.detailedAnalysis.ad_intelligence.meta_ads.search_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  View in Ad Library
                                </a>
                              </Button>
                            )}
                          </div>
                          
                          <p className="text-sm text-muted-foreground">
                            {intelligence.detailedAnalysis.ad_intelligence.meta_ads.summary}
                          </p>
                          
                          {intelligence.detailedAnalysis.ad_intelligence.meta_ads.screenshot_url && (
                            <div className="mt-3">
                              <p className="text-xs font-medium mb-2">Ad Library Screenshot:</p>
                              <img 
                                src={intelligence.detailedAnalysis.ad_intelligence.meta_ads.screenshot_url} 
                                alt="Meta Ad Library Screenshot"
                                className="border rounded max-w-full h-auto"
                              />
                            </div>
                          )}
                          
                          <div className="text-xs text-muted-foreground">
                            Last checked: {new Date(intelligence.detailedAnalysis.ad_intelligence.meta_ads.scraped_at || '').toLocaleString()}
                          </div>
                        </div>
                      ) : (
                        <div className="border rounded-lg p-4 text-center text-muted-foreground">
                          <Image className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>Meta ad data not available</p>
                        </div>
                      )}
                    </div>

                    {/* TikTok Ads Section */}
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <div className="w-4 h-4 bg-black rounded-full"></div>
                        TikTok Ads
                      </h4>
                      
                      {intelligence.detailedAnalysis.ad_intelligence.tiktok_ads ? (
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <Badge variant={intelligence.detailedAnalysis.ad_intelligence.tiktok_ads.ads_found ? "default" : "secondary"}>
                              {intelligence.detailedAnalysis.ad_intelligence.tiktok_ads.ads_found ? "Content Found" : "No Ads Found"}
                            </Badge>
                            {intelligence.detailedAnalysis.ad_intelligence.tiktok_ads.search_url && (
                              <Button size="sm" variant="outline" asChild>
                                <a 
                                  href={intelligence.detailedAnalysis.ad_intelligence.tiktok_ads.search_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  View on TikTok
                                </a>
                              </Button>
                            )}
                          </div>
                          
                          <p className="text-sm text-muted-foreground">
                            {intelligence.detailedAnalysis.ad_intelligence.tiktok_ads.summary}
                          </p>
                          
                          {intelligence.detailedAnalysis.ad_intelligence.tiktok_ads.note && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                              <p className="text-xs text-yellow-800">
                                📝 {intelligence.detailedAnalysis.ad_intelligence.tiktok_ads.note}
                              </p>
                            </div>
                          )}
                          
                          <div className="text-xs text-muted-foreground">
                            Last checked: {new Date(intelligence.detailedAnalysis.ad_intelligence.tiktok_ads.scraped_at || '').toLocaleString()}
                          </div>
                        </div>
                      ) : (
                        <div className="border rounded-lg p-4 text-center text-muted-foreground">
                          <Video className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>TikTok ad data not available</p>
                        </div>
                      )}
                    </div>

                    {/* Search Summary */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h5 className="font-medium mb-2">Ad Intelligence Summary</h5>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Search Performed</p>
                          <Badge variant={intelligence.detailedAnalysis.ad_intelligence.search_performed ? "default" : "destructive"}>
                            {intelligence.detailedAnalysis.ad_intelligence.search_performed ? "Yes" : "No"}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Last Updated</p>
                          <p className="font-medium">
                            {new Date(intelligence.detailedAnalysis.ad_intelligence.last_updated).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No ad intelligence data available</p>
                    <p className="text-sm">Run competitor analysis to gather advertising insights</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Core Features</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {intelligence.featureMatrix?.coreFeatures?.map((feature, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    )) || <p className="text-muted-foreground">Not available</p>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Advanced Features</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {intelligence.featureMatrix?.advancedFeatures?.map((feature, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-blue-600" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    )) || <p className="text-muted-foreground">Not available</p>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Integrations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {intelligence.featureMatrix?.integrations?.map((integration, index) => (
                      <Badge key={index} variant="secondary">
                        {integration}
                      </Badge>
                    )) || <p className="text-muted-foreground">Not available</p>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Platforms</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {intelligence.featureMatrix?.platforms?.map((platform, index) => (
                      <Badge key={index} variant="outline">
                        {platform}
                      </Badge>
                    )) || <p className="text-muted-foreground">Not available</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Pricing Strategy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium">Pricing Model</p>
                    <Badge variant="default">{intelligence.pricingInfo?.pricingModel || 'Not available'}</Badge>
                  </div>
                  
                  {intelligence.pricingInfo?.plans && intelligence.pricingInfo.plans.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Pricing Plans</p>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {intelligence.pricingInfo.plans.map((plan, index) => (
                          <div key={index} className="border rounded-lg p-3">
                            <h4 className="font-medium">{plan.name}</h4>
                            <p className="text-lg font-bold text-primary">{plan.price}</p>
                            <ul className="text-sm text-muted-foreground mt-2">
                              {plan.features?.slice(0, 3).map((feature, fIndex) => (
                                <li key={fIndex}>• {feature}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="social" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Social Engagement
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">LinkedIn Followers</p>
                    <p className="text-lg font-bold">{intelligence.socialPresence?.engagement?.linkedinFollowers?.toLocaleString() || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Twitter Followers</p>
                    <p className="text-lg font-bold">{intelligence.socialPresence?.engagement?.twitterFollowers?.toLocaleString() || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Engagement Rate</p>
                    <Badge variant="outline">{intelligence.socialPresence?.engagement?.engagementRate || 'N/A'}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Content Strategy</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {intelligence.socialPresence?.contentStrategy?.map((strategy, index) => (
                      <Badge key={index} variant="secondary" className="mr-2 mb-2">
                        {strategy}
                      </Badge>
                    )) || <p className="text-muted-foreground">Not available</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="position" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Market Position
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Market Share</p>
                    <p className="text-lg font-bold">{intelligence.marketPosition?.marketShare || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Positioning</p>
                    <Badge variant="default">{intelligence.marketPosition?.positioning || 'N/A'}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Competitive Advantages</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {intelligence.marketPosition?.competitiveAdvantages?.map((advantage, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm">{advantage}</span>
                      </div>
                    )) || <p className="text-muted-foreground">Not available</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sentiment" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Customer Sentiment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Overall Sentiment</p>
                    <Badge 
                      variant="outline" 
                      className={getSentimentColor(intelligence.sentimentAnalysis?.overallSentiment || '')}
                    >
                      {intelligence.sentimentAnalysis?.overallSentiment || 'N/A'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Customer Satisfaction</p>
                    <p className="text-lg font-bold">{intelligence.sentimentAnalysis?.customerSatisfaction || 'N/A'}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Review Sources</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {intelligence.sentimentAnalysis?.reviewSources?.map((source, index) => (
                      <Badge key={index} variant="secondary">
                        {source}
                      </Badge>
                    )) || <p className="text-muted-foreground">Not available</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="monitoring" className="space-y-4">
            <RealTimeMonitoring 
              competitorName={competitorName}
              competitorUrl={competitorUrl}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};
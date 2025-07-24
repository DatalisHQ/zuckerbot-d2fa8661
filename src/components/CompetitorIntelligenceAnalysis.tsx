import { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Loader2, Brain, Users, DollarSign, TrendingUp, MessageSquare, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CompetitorIntelligence {
  detailedAnalysis: {
    businessModel: string;
    targetAudience: string;
    keyStrengths: string[];
    weaknesses: string[];
    uniqueSellingPoints: string[];
    marketFocus: string;
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

  const handleAnalyzeCompetitor = async () => {
    setIsLoading(true);
    setIntelligence(null);
    
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
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Competitor analysis failed');
      }

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

      {intelligence && (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="social">Social</TabsTrigger>
            <TabsTrigger value="position">Position</TabsTrigger>
            <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
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
        </Tabs>
      )}
    </div>
  );
};
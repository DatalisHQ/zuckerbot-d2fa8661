import { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Globe, TrendingUp, ExternalLink, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CompetitorIntelligenceAnalysis } from "./CompetitorIntelligenceAnalysis";

interface Competitor {
  name: string;
  website: string;
  description: string;
  category: string;
  similarity_score: number;
}

interface CompetitorDiscoveryProps {
  brandAnalysisId: string;
  onDiscoveryComplete?: (competitors: Competitor[]) => void;
}

export const CompetitorDiscovery = ({ brandAnalysisId, onDiscoveryComplete }: CompetitorDiscoveryProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);
  const [discoveryId, setDiscoveryId] = useState<string | null>(null);

  const handleDiscoverCompetitors = async () => {
    setIsLoading(true);
    setCompetitors([]);
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to discover competitors",
          variant: "destructive",
        });
        return;
      }

      console.log('Starting competitor discovery for brand analysis:', brandAnalysisId);
      
      const { data, error } = await supabase.functions.invoke('discover-competitors', {
        body: {
          brandAnalysisId,
          userId: user.id
        }
      });

      if (error) {
        console.error('Error calling discover-competitors function:', error);
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Competitor discovery failed');
      }

      console.log('Discovery completed:', data);
      setCompetitors(data.competitors);
      setDiscoveryId(data.discoveryId);
      onDiscoveryComplete?.(data.competitors);
      
      toast({
        title: "Discovery Complete",
        description: `Found ${data.totalFound} potential competitors!`,
      });

    } catch (error) {
      console.error('Error discovering competitors:', error);
      toast({
        title: "Discovery Failed",
        description: error instanceof Error ? error.message : "Failed to discover competitors",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getSimilarityColor = (score: number) => {
    if (score >= 85) return "bg-red-500";
    if (score >= 75) return "bg-orange-500";
    if (score >= 65) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getSimilarityLabel = (score: number) => {
    if (score >= 85) return "High Threat";
    if (score >= 75) return "Medium Threat";
    if (score >= 65) return "Low Threat";
    return "Minimal Overlap";
  };

  return (
    <div className="w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Competitor Discovery
          </CardTitle>
          <CardDescription>
            Discover competitors based on your brand analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleDiscoverCompetitors} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Discovering Competitors...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Discover Competitors
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {competitors.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {competitors.map((competitor, index) => (
            <Card key={index} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      {competitor.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {competitor.description}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge 
                      variant="outline" 
                      className={`${getSimilarityColor(competitor.similarity_score)} text-white border-0`}
                    >
                      {getSimilarityLabel(competitor.similarity_score)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {competitor.similarity_score}% match
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">
                    {competitor.category}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(competitor.website, '_blank')}
                      className="flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Visit Site
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setSelectedCompetitor(competitor)}
                      className="flex items-center gap-1"
                    >
                      <Brain className="h-3 w-3" />
                      Deep Analysis
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedCompetitor && (
        <div className="mt-8">
          <CompetitorIntelligenceAnalysis 
            competitorName={selectedCompetitor.name}
            competitorUrl={selectedCompetitor.website}
            discoveryId={discoveryId}
          />
        </div>
      )}
    </div>
  );
};
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Users, Globe, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CompetitorProfile {
  id: string;
  competitor_name: string;
  competitor_url: string;
  niche: string;
  audience: string;
  tone: string;
  value_props: any;
  created_at: string;
}

interface CompetitorAnalysisOutcomesProps {
  isConnected: boolean;
}

export const CompetitorAnalysisOutcomes = ({ isConnected }: CompetitorAnalysisOutcomesProps) => {
  const [competitors, setCompetitors] = useState<CompetitorProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCompetitors = async () => {
      if (!isConnected) {
        setIsLoading(false);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: competitorData, error } = await supabase
          .from('competitor_profiles')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(6);

        if (error) {
          console.error('Error fetching competitors:', error);
        } else {
          setCompetitors(competitorData || []);
        }
      } catch (error) {
        console.error('Error in fetchCompetitors:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompetitors();
  }, [isConnected]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleViewCompetitor = (competitorUrl: string) => {
    if (competitorUrl && competitorUrl.startsWith('http')) {
      window.open(competitorUrl, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded"></div>
                  <div className="h-3 bg-muted rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-muted-foreground">
            <Users className="h-5 w-5" />
            Competitor Analysis
          </CardTitle>
          <CardDescription>
            Connect your Facebook account to view competitor insights
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button 
            variant="outline" 
            onClick={() => navigate("/onboarding")}
            className="w-full"
          >
            Connect Account to View
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (competitors.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-muted-foreground">
            <Users className="h-5 w-5" />
            No Competitor Data
          </CardTitle>
          <CardDescription>
            Start a campaign flow to discover and analyze competitors
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button 
            variant="outline" 
            onClick={() => navigate("/campaign-flow")}
            className="w-full"
          >
            Start Campaign Flow
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {competitors.map((competitor) => (
        <Card key={competitor.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base truncate">
                  {competitor.competitor_name}
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Analyzed {formatDate(competitor.created_at)}
                </CardDescription>
              </div>
              {competitor.competitor_url && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleViewCompetitor(competitor.competitor_url)}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {competitor.niche && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <Badge variant="secondary" className="text-xs">
                  {competitor.niche}
                </Badge>
              </div>
            )}
            
            {competitor.audience && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground truncate">
                  {competitor.audience}
                </span>
              </div>
            )}

            {competitor.value_props && Array.isArray(competitor.value_props) && competitor.value_props.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Key Value Props
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {competitor.value_props.slice(0, 2).map((prop: any, index: number) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {typeof prop === 'string' ? prop : prop.title || 'Value Prop'}
                    </Badge>
                  ))}
                  {competitor.value_props.length > 2 && (
                    <Badge variant="outline" className="text-xs">
                      +{competitor.value_props.length - 2} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
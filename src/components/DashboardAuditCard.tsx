import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  CheckCircle, 
  ExternalLink, 
  Clock, 
  TrendingUp,
  TrendingDown,
  PauseCircle,
  RefreshCw,
  Copy
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ActionCard {
  id: string;
  type: 'increase_budget' | 'decrease_budget' | 'reallocate_budget' | 'pause' | 'swap_creative' | 'change_placements';
  entity: {
    type: 'campaign' | 'adset' | 'ad';
    id: string;
  };
  title: string;
  why: string;
  impact_score: number;
  payload: Record<string, any>;
  creative_suggestions?: {
    headlines: string[];
    primary_texts: string[];
  };
}

interface AuditResult {
  health: 'healthy' | 'watch' | 'critical';
  actions: ActionCard[];
}

interface DashboardAuditCardProps {
  adAccountId: string;
}

export function DashboardAuditCard({ adAccountId }: DashboardAuditCardProps) {
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isQueuing, setIsQueuing] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchAudit = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('dashboard-audit', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch audit');
      }

      setAuditResult(data);
    } catch (error) {
      console.error('Audit error:', error);
      toast({
        title: "Audit Failed",
        description: error.message || "Failed to generate audit recommendations",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const queueAction = async (action: ActionCard) => {
    setIsQueuing(action.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('queued_actions')
        .insert({
          user_id: user.id,
          action_type: action.type,
          entity_type: action.entity.type,
          entity_id: action.entity.id,
          title: action.title,
          why: action.why,
          impact_score: action.impact_score,
          payload: action.payload,
          creative_suggestions: action.creative_suggestions || null
        });

      if (error) throw error;

      toast({
        title: "Action Queued",
        description: `"${action.title}" has been saved for later automation.`,
      });
    } catch (error) {
      console.error('Queue error:', error);
      toast({
        title: "Queue Failed",
        description: "Failed to queue action. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsQueuing(null);
    }
  };

  const openInAdsManager = (action: ActionCard) => {
    // Construct deep link to Facebook Ads Manager
    const baseUrl = 'https://www.facebook.com/adsmanager/manage';
    const entityParam = action.entity.type === 'campaign' ? 'campaigns' : 
                       action.entity.type === 'adset' ? 'adsets' : 'ads';
    const url = `${baseUrl}/${entityParam}?act=${adAccountId}&selected_${action.entity.type}_ids=${action.entity.id}`;
    
    window.open(url, '_blank');
    
    toast({
      title: "Opening Ads Manager",
      description: "Redirecting to Facebook Ads Manager...",
    });
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${type} copied to clipboard`,
    });
  };

  const getHealthBadge = (health: string) => {
    switch (health) {
      case 'healthy':
        return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />Healthy</Badge>;
      case 'watch':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><AlertTriangle className="w-3 h-3 mr-1" />Watch</Badge>;
      case 'critical':
        return <Badge className="bg-red-100 text-red-800 border-red-200"><AlertTriangle className="w-3 h-3 mr-1" />Critical</Badge>;
      default:
        return null;
    }
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'increase_budget':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'decrease_budget':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'pause':
        return <PauseCircle className="w-4 h-4 text-orange-600" />;
      case 'swap_creative':
        return <RefreshCw className="w-4 h-4 text-blue-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Dashboard Copilot Audit
              {auditResult && getHealthBadge(auditResult.health)}
            </CardTitle>
            <CardDescription>
              AI-powered recommendations for optimizing your ad performance
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            onClick={fetchAudit}
            disabled={isLoading}
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            {isLoading ? 'Analyzing...' : 'Run Audit'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {!auditResult && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Click "Run Audit" to get AI-powered optimization recommendations</p>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-8">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Analyzing your ad performance...</p>
          </div>
        )}

        {auditResult && auditResult.actions.length === 0 && (
          <div className="text-center py-8 text-green-600">
            <CheckCircle className="w-12 h-12 mx-auto mb-4" />
            <p className="font-medium">All good! Your campaigns are performing optimally.</p>
          </div>
        )}

        {auditResult && auditResult.actions.length > 0 && (
          <div className="space-y-4">
            {auditResult.actions.map((action) => (
              <Card key={action.id} className="border-l-4 border-l-primary">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getActionIcon(action.type)}
                        <h4 className="font-medium">{action.title}</h4>
                        <Badge variant="outline" className="text-xs">
                          Impact: {action.impact_score}/10
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{action.why}</p>
                      
                      {action.creative_suggestions && (
                        <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                          <h5 className="font-medium text-sm mb-2">Creative Suggestions:</h5>
                          {action.creative_suggestions.headlines && (
                            <div className="mb-2">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Headlines:</p>
                              {action.creative_suggestions.headlines.map((headline, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs bg-background p-2 rounded mb-1">
                                  <span>{headline}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(headline, 'Headline')}
                                    className="h-6 w-6 p-0"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                          {action.creative_suggestions.primary_texts && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Primary Text:</p>
                              {action.creative_suggestions.primary_texts.map((text, idx) => (
                                <div key={idx} className="flex items-start justify-between text-xs bg-background p-2 rounded mb-1">
                                  <span className="flex-1">{text}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(text, 'Primary Text')}
                                    className="h-6 w-6 p-0 ml-2 flex-shrink-0"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openInAdsManager(action)}
                        className="whitespace-nowrap"
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Ads Manager
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => queueAction(action)}
                        disabled={isQueuing === action.id}
                        className="whitespace-nowrap"
                      >
                        {isQueuing === action.id ? (
                          <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Clock className="w-3 h-3 mr-1" />
                        )}
                        Queue Fix
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import { useState } from 'react';
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  AlertTriangle, 
  CheckCircle, 
  ExternalLink, 
  Clock, 
  TrendingUp,
  TrendingDown,
  PauseCircle,
  RefreshCw,
  Copy,
  Zap
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useGetFacebookAdAccounts } from "@/hooks/useGetFacebookAdAccounts";
import { FacebookConnector } from "@/components/FacebookConnector";

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

export default function Copilot() {
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isQueuing, setIsQueuing] = useState<string | null>(null);
  const { toast } = useToast();
  
  const { data: adAccounts, isLoading: isLoadingAccounts, error: accountsError } = useGetFacebookAdAccounts();
  const selectedAdAccount = adAccounts?.[0]; // Use first account for now

  const fetchAudit = async () => {
    setIsLoading(true);
    try {
      // Prepare the ad account ID parameter
      const actParam = selectedAdAccount?.id ? 
        (selectedAdAccount.id.startsWith('act_') ? selectedAdAccount.id : `act_${selectedAdAccount.id}`) : 
        null;

      // Use fetch with proper URL construction for edge functions
      const supabaseUrl = 'https://wrjqevcpxkfvfudbmdhp.supabase.co';
      const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyanFldmNweGtmdmZ1ZGJtZGhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMjY2NjEsImV4cCI6MjA2ODkwMjY2MX0.uzcHoe0b0vjjZ5EzFEf343SlKlyQY11arQzRvbM03tw';
      
      const url = `${supabaseUrl}/functions/v1/dashboard-audit${actParam ? `?act=${encodeURIComponent(actParam)}` : ''}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch audit');
      }

      const auditData = await response.json();
      setAuditResult(auditData);
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
    if (!selectedAdAccount) return;
    
    const baseUrl = 'https://www.facebook.com/adsmanager/manage';
    const entityParam = action.entity.type === 'campaign' ? 'campaigns' : 
                       action.entity.type === 'adset' ? 'adsets' : 'ads';
    const url = `${baseUrl}/${entityParam}?act=${selectedAdAccount.id}&selected_${action.entity.type}_ids=${action.entity.id}`;
    
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

  const renderLoadingSkeleton = () => (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <div className="ml-4 space-y-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  // Not connected state
  if (accountsError || (!isLoadingAccounts && !adAccounts?.length)) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold tracking-tight mb-2">Copilot Audit</h1>
              <p className="text-xl text-muted-foreground">
                Your AI-powered ad strategist. See what's working, what's wasting spend, and take action in one click.
              </p>
            </div>

            <Card className="max-w-2xl mx-auto">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  Connect to Unlock Copilot
                </CardTitle>
                <CardDescription>
                  Connect your Facebook Business account to access AI-powered optimization recommendations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-6">
                  <FacebookConnector 
                    variant="card"
                    title="Connect Facebook Business"
                    description="Get instant access to performance insights and optimization recommendations"
                    buttonText="Connect Account"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Copilot Audit</h1>
            <p className="text-xl text-muted-foreground">
              Your AI-powered ad strategist. See what's working, what's wasting spend, and take action in one click.
            </p>
          </div>

          {/* Main Audit Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" />
                    Performance Audit
                    {auditResult && getHealthBadge(auditResult.health)}
                    {selectedAdAccount && (
                      <Badge variant="outline" className="text-xs">
                        {selectedAdAccount.name}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    AI-powered recommendations based on your last 7 days of campaign data
                  </CardDescription>
                </div>
                <Button 
                  onClick={fetchAudit}
                  disabled={isLoading || isLoadingAccounts}
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Run Audit
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            
            <CardContent>
              {isLoadingAccounts && (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
                  <p className="text-muted-foreground">Loading your ad accounts...</p>
                </div>
              )}

              {!auditResult && !isLoading && !isLoadingAccounts && (
                <div className="text-center py-12">
                  <Zap className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-medium mb-2">Ready to Optimize Your Ads?</h3>
                  <p className="text-muted-foreground mb-4">
                    Click "Run Audit" to get AI-powered optimization recommendations for your campaigns
                  </p>
                </div>
              )}

              {isLoading && renderLoadingSkeleton()}

              {auditResult && auditResult.actions.length === 0 && (
                <div className="text-center py-12 text-green-600">
                  <CheckCircle className="w-16 h-16 mx-auto mb-4" />
                  <h3 className="font-medium mb-2">All Systems Green!</h3>
                  <p>Your campaigns are performing optimally. No immediate actions needed.</p>
                </div>
              )}

              {auditResult && auditResult.actions.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Recommended Actions</h3>
                    <p className="text-sm text-muted-foreground">
                      {auditResult.actions.length} optimization{auditResult.actions.length > 1 ? 's' : ''} found
                    </p>
                  </div>
                  
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
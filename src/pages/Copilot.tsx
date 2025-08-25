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
  Zap,
  RocketIcon,
  BarChart3
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useGetFacebookAdAccounts } from "@/hooks/useGetFacebookAdAccounts";
import { FacebookConnector } from "@/components/FacebookConnector";
import { AuditResponse, AuditStatus, ActionCard } from "@/types/audit";

type AuditResult = AuditResponse;

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

      // For GET requests, pass parameters in the URL, not the body
      const url = actParam ? `?act=${encodeURIComponent(actParam)}` : '';
      let lastError: any = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke('dashboard-audit' + url, {
            method: 'GET',
          });

          if (error) {
            lastError = error;
            const msg = (error as any)?.message || '';
            const isNetwork = /Failed to send a request|TypeError|network/i.test(msg);
            if (isNetwork && attempt < 2) {
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
              continue;
            }

            console.warn('Audit call error (no retry):', error);
            setAuditResult({
              status: "no_historical_data",
              health: "critical",
              actions: [],
              meta: {
                connected: false,
                hasCampaigns: false,
                activeCampaigns: 0,
                lastSyncAt: null
              }
            });
            console.log('copilot_network_error', { reason: isNetwork ? 'network_error' : 'service_error' });
            return;
          }

          setAuditResult(data as AuditResult);
          console.log('copilot_success', { status: (data as AuditResult)?.status, actions: (data as AuditResult)?.actions?.length ?? 0 });
          return;
        } catch (e: any) {
          lastError = e;
          const isNetwork = /TypeError|NetworkError|Failed to fetch|network/i.test(e?.message || '');
          if (attempt < 2 && isNetwork) {
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          setAuditResult({
            status: "no_historical_data",
            health: "critical",
            actions: [],
            meta: {
              connected: false,
              hasCampaigns: false,
              activeCampaigns: 0,
              lastSyncAt: null
            }
          });
          console.log('copilot_network_error', { reason: 'network_error' });
          return;
        }
      }

      setAuditResult({
        status: "no_historical_data",
        health: "critical",
        actions: [],
        meta: {
          connected: false,
          hasCampaigns: false,
          activeCampaigns: 0,
          lastSyncAt: null
        }
      });
      console.log('copilot_network_error', { reason: 'network_error' });
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
      case 'degraded':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><AlertTriangle className="w-3 h-3 mr-1" />Degraded</Badge>;
      case 'critical':
        return <Badge className="bg-red-100 text-red-800 border-red-200"><AlertTriangle className="w-3 h-3 mr-1" />Critical</Badge>;
      case 'unknown':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200"><Clock className="w-3 h-3 mr-1" />Unknown</Badge>;
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

  const renderStatusContent = (status: AuditStatus, result: AuditResult) => {
    switch (status) {
      case "no_active_campaigns":
        return (
          <div className="text-center py-12">
            <RocketIcon className="w-16 h-16 mx-auto mb-4 text-blue-500" />
            <h3 className="font-medium mb-2">You have no active campaigns</h3>
            <p className="text-muted-foreground mb-4">Start driving results by launching your first campaign</p>
            <Button asChild>
              <a href="/campaign-flow">Launch a Campaign</a>
            </Button>
          </div>
        );

      case "no_historical_data":
        return (
          <div className="text-center py-12">
            <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="font-medium mb-2">We couldn't find past campaigns to audit</h3>
            <p className="text-muted-foreground mb-4">Launch your first campaign to start getting optimization insights</p>
            <Button asChild>
              <a href="/campaign-flow">Launch Your First Campaign</a>
            </Button>
          </div>
        );

      case "learning_phase":
        return (
          <div className="text-center py-12">
            <Clock className="w-16 h-16 mx-auto mb-4 text-orange-500" />
            <h3 className="font-medium mb-2">Your campaigns are still in the learning phase</h3>
            <p className="text-muted-foreground mb-4">
              Active campaigns: {result.meta.activeCampaigns} • Give them more time to collect performance data
            </p>
            <div className="bg-muted/50 rounded-lg p-4 mt-4 max-w-md mx-auto">
              <p className="text-sm text-muted-foreground">
                We'll have optimization recommendations once your campaigns exit the learning phase (typically 48-72 hours or 50+ conversions).
              </p>
            </div>
            <Button variant="outline" className="mt-4" asChild>
              <a href="/ad-performance">Check Performance</a>
            </Button>
          </div>
        );

      case "healthy":
        return (
          <div className="text-center py-12 text-green-600">
            <CheckCircle className="w-16 h-16 mx-auto mb-4" />
            <h3 className="font-medium mb-2">All Systems Green!</h3>
            <p className="mb-4">Your campaigns are performing above benchmarks. No immediate actions needed.</p>
            <div className="bg-green-50 rounded-lg p-4 mt-4 max-w-md mx-auto">
              <p className="text-sm text-green-700">
                Active campaigns: {result.meta.activeCampaigns} • Performance is solid across key metrics
              </p>
            </div>
            <Button variant="outline" className="mt-4" asChild>
              <a href="/campaign-flow">Test New Creatives or Audiences</a>
            </Button>
          </div>
        );

      case "needs_action":
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Recommended Actions</h3>
              <p className="text-sm text-muted-foreground">
                {result.actions.length} optimization{result.actions.length > 1 ? 's' : ''} found
              </p>
            </div>
            
            <div className="space-y-4">
              {result.actions.map((action) => (
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
                                      onClick={() => copyToClipboard(text, 'Primary text')}
                                      className="h-6 w-6 p-0"
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
                      
                      <div className="ml-4 flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openInAdsManager(action)}
                          className="flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open in Ads Manager
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => queueAction(action)}
                          disabled={isQueuing === action.id}
                          className="flex items-center gap-1"
                        >
                          {isQueuing === action.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Clock className="w-3 h-3" />
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
        );

      default:
        return null;
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

              {auditResult && renderStatusContent(auditResult.status, auditResult)}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
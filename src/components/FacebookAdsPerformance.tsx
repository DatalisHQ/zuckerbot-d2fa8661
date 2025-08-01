import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Eye, 
  MousePointer,
  Calendar,
  BarChart3,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { TimeFrameFilter } from "./TimeFrameFilter";
import { useGetFacebookAdAccounts, AdAccount } from "@/hooks/useGetFacebookAdAccounts";

interface AdMetrics {
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  spend: number;
  reach: number;
  conversions: number;
  period: string;
}

interface AdInsight {
  metric: string;
  value: string;
  change: number;
  trend: 'up' | 'down' | 'stable';
  description: string;
}

interface FacebookCampaign {
  id: string;
  campaign_id: string;
  campaign_name: string;
  objective: string;
  status: string;
  daily_budget: number;
  lifetime_budget: number;
  start_time: string;
  end_time: string;
  created_time: string;
  updated_time: string;
}

interface FacebookAdsPerformanceProps {
  selectedCampaign?: FacebookCampaign | null;
}

export const FacebookAdsPerformance = ({ selectedCampaign }: FacebookAdsPerformanceProps) => {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<AdMetrics | null>(null);
  const [insights, setInsights] = useState<AdInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedTimeFrame, setSelectedTimeFrame] = useState('month');
  const [customDateRange, setCustomDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const [selectedAdAccount, setSelectedAdAccount] = useState<string>('all');
  
  const { data: adAccounts, isLoading: accountsLoading } = useGetFacebookAdAccounts();

  useEffect(() => {
    checkFacebookConnection();
  }, []);

  useEffect(() => {
    if (isConnected) {
      loadAdMetrics();
    }
  }, [selectedTimeFrame, customDateRange, isConnected, selectedCampaign, selectedAdAccount]);

  const handleTimeFrameChange = (timeFrame: string, customRange?: { from: Date | null; to: Date | null }) => {
    setSelectedTimeFrame(timeFrame);
    if (customRange) {
      setCustomDateRange(customRange);
    }
  };

  const checkFacebookConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check profile for Facebook connection status
      const { data: profile } = await supabase
        .from('profiles')
        .select('facebook_connected, facebook_access_token, facebook_business_id')
        .eq('user_id', user.id)
        .single();
      
      const facebookConnected = profile?.facebook_connected || false;
      const hasValidToken = !!(profile?.facebook_access_token && profile?.facebook_business_id);
      setIsConnected(facebookConnected && hasValidToken);
      
      if (facebookConnected && hasValidToken) {
        await loadAdMetrics();
      } else if (facebookConnected && !hasValidToken) {
        // User is connected but tokens are missing - this shouldn't happen with new auth flow
        console.warn('Facebook connected but tokens missing - may need to reconnect');
      }
    } catch (error) {
      console.error('Error checking Facebook connection:', error);
    }
  };

  const getDateRange = () => {
    if (selectedTimeFrame === 'custom' && customDateRange.from && customDateRange.to) {
      return {
        start: customDateRange.from.toISOString().split('T')[0],
        end: customDateRange.to.toISOString().split('T')[0]
      };
    }
    
    if (selectedTimeFrame === 'all') {
      // For "All Time", get the earliest campaign date
      const earliestDate = new Date();
      earliestDate.setFullYear(earliestDate.getFullYear() - 2); // Default to 2 years ago
      return {
        start: earliestDate.toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      };
    }
    
    const timeFrames: Record<string, number> = {
      'today': 1,
      'week': 7,
      'month': 30,
      'quarter': 90
    };
    
    const days = timeFrames[selectedTimeFrame] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return {
      start: startDate.toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    };
  };

  const loadAdMetrics = async () => {
    setIsLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user has proper Facebook credentials before syncing
      const { data: profile } = await supabase
        .from('profiles')
        .select('facebook_access_token, facebook_business_id')
        .eq('user_id', user.id)
        .single();

      if (profile?.facebook_access_token && profile?.facebook_business_id) {
        // First sync the latest Facebook Ads data
        const { error: syncError } = await supabase.functions.invoke('sync-facebook-ads');
        if (syncError) {
          console.error('Sync error:', syncError);
          // Continue to try loading existing data even if sync fails
        }
      }
      
      // Then fetch the synced data from our database
      let campaignsQuery = supabase
        .from('facebook_campaigns')
        .select('*')
        .eq('user_id', user.id);

      // Filter by selected campaign if one is selected
      if (selectedCampaign) {
        campaignsQuery = campaignsQuery.eq('campaign_id', selectedCampaign.campaign_id);
      }

      const { data: campaigns } = await campaignsQuery;

      const dateRange = getDateRange();
      let metricsQuery = supabase
        .from('facebook_ad_metrics')
        .select('*')
        .eq('user_id', user.id)
        .gte('date_start', dateRange.start)
        .lte('date_start', dateRange.end);

      // Filter by selected campaign if one is selected
      if (selectedCampaign) {
        metricsQuery = metricsQuery.eq('campaign_id', selectedCampaign.campaign_id);
      }

      const { data: recentMetrics } = await metricsQuery.order('date_start', { ascending: false });

      if (recentMetrics && recentMetrics.length > 0) {
        const totalSpend = recentMetrics.reduce((sum, m) => sum + (parseFloat(m.spend?.toString() || '0') || 0), 0);
        const totalImpressions = recentMetrics.reduce((sum, m) => sum + (parseInt(m.impressions?.toString() || '0') || 0), 0);
        const totalClicks = recentMetrics.reduce((sum, m) => sum + (parseInt(m.clicks?.toString() || '0') || 0), 0);
        const totalConversions = recentMetrics.reduce((sum, m) => sum + (parseInt(m.conversions?.toString() || '0') || 0), 0);
        const totalReach = recentMetrics.reduce((sum, m) => sum + (parseInt(m.reach?.toString() || '0') || 0), 0);
        
        const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
        const avgCPM = totalImpressions > 0 ? (totalSpend / totalImpressions * 1000) : 0;

        const periodLabel = selectedTimeFrame === 'custom' ? 
          `${customDateRange.from?.toLocaleDateString()} - ${customDateRange.to?.toLocaleDateString()}` :
          selectedTimeFrame === 'all' ? 'All Time' :
          (['today', 'week', 'month', 'quarter'].find(tf => tf === selectedTimeFrame) ? 
            ({ 'today': 'Today', 'week': 'Last 7 days', 'month': 'Last 30 days', 'quarter': 'Last 90 days' }[selectedTimeFrame]) : 
            "Last 30 days");

        const metrics: AdMetrics = {
          impressions: totalImpressions,
          clicks: totalClicks,
          ctr: parseFloat(avgCTR.toFixed(2)),
          cpm: parseFloat(avgCPM.toFixed(2)),
          spend: totalSpend,
          reach: totalReach,
          conversions: totalConversions,
          period: selectedCampaign ? `${selectedCampaign.campaign_name} - ${periodLabel}` : periodLabel
        };

        setMetrics(metrics);

        // Calculate insights from real data
        const recentWeekMetrics = recentMetrics.filter(m => 
          new Date(m.date_start) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );
        const previousWeekMetrics = recentMetrics.filter(m => {
          const date = new Date(m.date_start);
          return date >= new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) && 
                 date < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        });

        const currentWeekCTR = recentWeekMetrics.length > 0 ? 
          recentWeekMetrics.reduce((sum, m) => sum + (parseFloat(m.ctr?.toString() || '0') || 0), 0) / recentWeekMetrics.length : 0;
        const previousWeekCTR = previousWeekMetrics.length > 0 ? 
          previousWeekMetrics.reduce((sum, m) => sum + (parseFloat(m.ctr?.toString() || '0') || 0), 0) / previousWeekMetrics.length : 0;
        
        const ctrChange = previousWeekCTR > 0 ? ((currentWeekCTR - previousWeekCTR) / previousWeekCTR * 100) : 0;

        const insights: AdInsight[] = [
          {
            metric: "CTR Performance",
            value: `${currentWeekCTR.toFixed(2)}%`,
            change: parseFloat(ctrChange.toFixed(1)),
            trend: ctrChange >= 0 ? "up" : "down",
            description: `Click-through rate ${ctrChange >= 0 ? 'improved' : 'decreased'} vs last period`
          },
          {
            metric: "Total Campaigns", 
            value: campaigns?.length.toString() || "0",
            change: 0,
            trend: "up",
            description: "Facebook ad campaigns"
          },
          {
            metric: "Avg Daily Spend",
            value: `$${(totalSpend / (selectedTimeFrame === 'today' ? 1 : ({ 'today': 1, 'week': 7, 'month': 30, 'quarter': 90 }[selectedTimeFrame] || 30))).toFixed(2)}`,
            change: 0,
            trend: "up", 
            description: `Average daily spend for selected period`
          }
        ];

        setInsights(insights);
      } else {
        // Fallback to demo data if no real data available
        const demoMetrics: AdMetrics = {
          impressions: 0,
          clicks: 0,
          ctr: 0,
          cpm: 0,
          spend: 0,
          reach: 0,
          conversions: 0,
          period: "No data available"
        };

        const demoInsights: AdInsight[] = [
          {
            metric: "Status",
            value: "No Data",
            change: 0,
            trend: "up",
            description: "Sync your Facebook Ads to see real performance data"
          }
        ];

        setMetrics(demoMetrics);
        setInsights(demoInsights);
      }
    } catch (error) {
      console.error('Error loading Facebook Ads data:', error);
      toast({
        title: "Error Loading Metrics",
        description: "Failed to load Facebook ads performance data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const connectFacebook = async () => {
    try {
      // Store current page for redirect back after OAuth
      const currentPage = window.location.pathname + window.location.search;
      localStorage.setItem('facebook_oauth_redirect', currentPage);
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          scopes: 'ads_management,ads_read,business_management,pages_read_engagement',
          redirectTo: `${window.location.origin}/onboarding?facebook=connected&return_to=${encodeURIComponent(currentPage)}`
        }
      });

      if (error) {
        console.error('Facebook OAuth error:', error);
        toast({
          title: "Connection Failed",
          description: error.message || "Could not connect to Facebook. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Facebook connection error:', error);
      toast({
        title: "Connection Error",
        description: "There was an error connecting to Facebook. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!isConnected) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Facebook Ads Performance</CardTitle>
          <CardDescription>
            Connect your Facebook Ads account to view performance metrics and insights
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
            <BarChart3 className="w-8 h-8 text-blue-600" />
          </div>
          <p className="text-muted-foreground">
            Analyze your ad performance, compare with competitors, and discover optimization opportunities
          </p>
          <Button onClick={connectFacebook} className="btn-primary">
            Connect Facebook Ads
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Facebook Ads Performance</h2>
          <p className="text-muted-foreground">
            {metrics?.period || "Loading..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!accountsLoading && adAccounts && adAccounts.length > 1 && (
            <Select value={selectedAdAccount} onValueChange={setSelectedAdAccount}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select Ad Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ad Accounts</SelectItem>
                {adAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button 
            onClick={loadAdMetrics} 
            variant="outline" 
            disabled={isLoading}
            size="sm"
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Time Frame Filter */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <TimeFrameFilter
          selectedTimeFrame={selectedTimeFrame}
          customDateRange={customDateRange}
          onTimeFrameChange={handleTimeFrameChange}
        />
      </div>

      {/* Key Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${metrics?.spend.toFixed(2) || '0.00'}</div>
            <p className="text-xs text-muted-foreground">
              Across all campaigns
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Impressions</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.impressions.toLocaleString() || '0'}</div>
            <p className="text-xs text-muted-foreground">
              Total ad views
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.ctr.toFixed(1) || '0.0'}%</div>
            <p className="text-xs text-muted-foreground">
              Average CTR
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.conversions || '0'}</div>
            <p className="text-xs text-muted-foreground">
              Total conversions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Insights</CardTitle>
          <CardDescription>
            Key metrics and trends from your Facebook ads
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {insights.map((insight, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${
                    insight.trend === 'up' ? 'bg-green-100 text-green-600' : 
                    insight.trend === 'down' ? 'bg-red-100 text-red-600' : 
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {insight.trend === 'up' ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : insight.trend === 'down' ? (
                      <TrendingDown className="h-4 w-4" />
                    ) : (
                      <BarChart3 className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium">{insight.metric}</h4>
                    <p className="text-sm text-muted-foreground">{insight.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{insight.value}</div>
                  <Badge variant={insight.trend === 'up' ? 'default' : 'secondary'}>
                    {insight.change > 0 ? '+' : ''}{insight.change}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Competitor Ad Intelligence */}
      <Card>
        <CardHeader>
          <CardTitle>Competitor Ad Intelligence</CardTitle>
          <CardDescription>
            See what your competitors are doing with their Facebook ads
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">
              Analyze competitor Facebook ads to discover new opportunities
            </p>
            <Button variant="outline">
              <Eye className="w-4 h-4 mr-2" />
              View Competitor Ads
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
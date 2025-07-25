import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export const FacebookAdsPerformance = () => {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<AdMetrics | null>(null);
  const [insights, setInsights] = useState<AdInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    checkFacebookConnection();
  }, []);

  const checkFacebookConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // For now, check if user has completed OAuth (this would be stored in auth metadata)
      // In a real implementation, you'd check user metadata or a separate table
      const facebookConnected = user.user_metadata?.facebook_access_token || false;
      
      setIsConnected(facebookConnected);
      
      if (facebookConnected) {
        await loadAdMetrics();
      }
    } catch (error) {
      console.error('Error checking Facebook connection:', error);
    }
  };

  const loadAdMetrics = async () => {
    setIsLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // First sync the latest Facebook Ads data
      await supabase.functions.invoke('sync-facebook-ads');
      
      // Then fetch the synced data from our database
      const { data: campaigns } = await supabase
        .from('facebook_campaigns')
        .select('*')
        .eq('status', 'ACTIVE');

      const { data: recentMetrics } = await supabase
        .from('facebook_ad_metrics')
        .select('*')
        .gte('date_start', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('date_start', { ascending: false });

      if (recentMetrics && recentMetrics.length > 0) {
        const totalSpend = recentMetrics.reduce((sum, m) => sum + (parseFloat(m.spend?.toString() || '0') || 0), 0);
        const totalImpressions = recentMetrics.reduce((sum, m) => sum + (parseInt(m.impressions?.toString() || '0') || 0), 0);
        const totalClicks = recentMetrics.reduce((sum, m) => sum + (parseInt(m.clicks?.toString() || '0') || 0), 0);
        const totalConversions = recentMetrics.reduce((sum, m) => sum + (parseInt(m.conversions?.toString() || '0') || 0), 0);
        const totalReach = recentMetrics.reduce((sum, m) => sum + (parseInt(m.reach?.toString() || '0') || 0), 0);
        
        const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
        const avgCPM = totalImpressions > 0 ? (totalSpend / totalImpressions * 1000) : 0;

        const metrics: AdMetrics = {
          impressions: totalImpressions,
          clicks: totalClicks,
          ctr: parseFloat(avgCTR.toFixed(2)),
          cpm: parseFloat(avgCPM.toFixed(2)),
          spend: totalSpend,
          reach: totalReach,
          conversions: totalConversions,
          period: "Last 30 days"
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
            description: `Click-through rate ${ctrChange >= 0 ? 'improved' : 'decreased'} vs last week`
          },
          {
            metric: "Active Campaigns", 
            value: campaigns?.length.toString() || "0",
            change: 0,
            trend: "up",
            description: "Currently running campaigns"
          },
          {
            metric: "Avg Daily Spend",
            value: `$${(totalSpend / 30).toFixed(2)}`,
            change: 0,
            trend: "up", 
            description: "Average daily spend over the last 30 days"
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
      // Facebook OAuth URL - in production this would be your actual Facebook app
      const facebookAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${encodeURIComponent('YOUR_FACEBOOK_APP_ID')}&redirect_uri=${encodeURIComponent(window.location.origin + '/auth/facebook/callback')}&scope=${encodeURIComponent('ads_read,ads_management')}&response_type=code&state=${encodeURIComponent('facebook_oauth')}`;
      
      // Open Facebook OAuth in new tab
      const popup = window.open(
        facebookAuthUrl,
        'facebook-oauth',
        'width=600,height=600,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        toast({
          title: "Popup Blocked",
          description: "Please allow popups and try again to connect to Facebook",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Redirecting to Facebook",
        description: "Please authorize access to your Facebook Ads data",
      });

      // Listen for popup to close (in real app you'd handle the OAuth callback)
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          // For demo purposes, simulate successful connection after popup closes
          setTimeout(() => {
            setIsConnected(true);
            loadAdMetrics();
            toast({
              title: "Facebook Connected",
              description: "Successfully connected to Facebook Ads",
            });
          }, 1000);
        }
      }, 1000);
    } catch (error) {
      console.error('Error connecting Facebook:', error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Facebook Ads. Please try again.",
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
        <Button 
          onClick={loadAdMetrics} 
          variant="outline" 
          disabled={isLoading}
        >
          {isLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
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
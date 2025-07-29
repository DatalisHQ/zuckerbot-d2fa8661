import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Calendar, Building2, Zap, Users, ArrowUpRight } from "lucide-react";

interface SubscriptionInfo {
  subscribed: boolean;
  subscription_tier: string | null;
  subscription_end: string | null;
}

interface UsageStats {
  businesses_used: number;
  businesses_limit: number;
  campaigns_used: number;
  campaigns_limit: number;
}

export default function Billing() {
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchSubscriptionInfo();
    fetchUsageStats();
  }, []);

  const fetchSubscriptionInfo = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) throw error;
      setSubscriptionInfo(data);
    } catch (error) {
      console.error('Error fetching subscription info:', error);
      toast({
        title: "Error",
        description: "Failed to fetch subscription information.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsageStats = async () => {
    try {
      // Mock data for now - would fetch from actual usage tables
      setUsageStats({
        businesses_used: 1,
        businesses_limit: getTierLimits().businesses,
        campaigns_used: 5,
        campaigns_limit: getTierLimits().campaigns,
      });
    } catch (error) {
      console.error('Error fetching usage stats:', error);
    }
  };

  const getTierLimits = () => {
    const tier = subscriptionInfo?.subscription_tier || 'free';
    switch (tier.toLowerCase()) {
      case 'pro':
        return { businesses: 3, campaigns: 100 };
      case 'agency':
        return { businesses: 999, campaigns: 999 }; // "Unlimited"
      default:
        return { businesses: 1, campaigns: 3 };
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier.toLowerCase()) {
      case 'pro':
        return <Zap className="h-5 w-5 text-primary" />;
      case 'agency':
        return <Building2 className="h-5 w-5 text-primary" />;
      default:
        return <Users className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const handleManageSubscription = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      
      window.open(data.url, '_blank');
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to open customer portal. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading && !subscriptionInfo) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    );
  }

  const currentTier = subscriptionInfo?.subscription_tier || 'free';
  const isSubscribed = subscriptionInfo?.subscribed || false;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Billing & Subscription</h1>
            <p className="text-muted-foreground">
              Manage your subscription and view usage statistics
            </p>
          </div>

          <div className="grid gap-6 mb-8">
            {/* Current Plan */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getTierIcon(currentTier)}
                    <CardTitle className="capitalize">{currentTier} Plan</CardTitle>
                    {isSubscribed && (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </div>
                  {isSubscribed && (
                    <Button onClick={handleManageSubscription} disabled={loading}>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Manage Subscription
                    </Button>
                  )}
                </div>
                <CardDescription>
                  {isSubscribed && subscriptionInfo?.subscription_end && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4" />
                      Renews on {new Date(subscriptionInfo.subscription_end).toLocaleDateString()}
                    </div>
                  )}
                </CardDescription>
              </CardHeader>
              {!isSubscribed && (
                <CardContent>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Upgrade to unlock more features and higher limits
                    </p>
                    <Button asChild>
                      <a href="/pricing">
                        Upgrade Plan
                        <ArrowUpRight className="h-4 w-4 ml-2" />
                      </a>
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Usage Statistics */}
            {usageStats && (
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Business Accounts</CardTitle>
                    <CardDescription>
                      {usageStats.businesses_used} of {usageStats.businesses_limit === 999 ? 'unlimited' : usageStats.businesses_limit} used
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Progress 
                      value={usageStats.businesses_limit === 999 ? 10 : (usageStats.businesses_used / usageStats.businesses_limit) * 100}
                      className="w-full"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Ad Campaigns</CardTitle>
                    <CardDescription>
                      {usageStats.campaigns_used} of {usageStats.campaigns_limit === 999 ? 'unlimited' : usageStats.campaigns_limit} used
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Progress 
                      value={usageStats.campaigns_limit === 999 ? 10 : (usageStats.campaigns_used / usageStats.campaigns_limit) * 100}
                      className="w-full"
                    />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Features by Tier */}
            <Card>
              <CardHeader>
                <CardTitle>Your Plan Features</CardTitle>
                <CardDescription>
                  What's included in your {currentTier} plan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {currentTier.toLowerCase() === 'free' && (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm">1 business account</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm">Up to 3 ad campaigns</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm">Access to beta tools</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm">Ad Creative Generation</span>
                      </div>
                    </>
                  )}
                  {currentTier.toLowerCase() === 'pro' && (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm">3 business accounts</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm">Up to 100 ad campaigns</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm">Advanced AI insights</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm">Priority support</span>
                      </div>
                    </>
                  )}
                  {currentTier.toLowerCase() === 'agency' && (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm">Multiple business accounts</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm">Unlimited ad campaigns</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm">Access to beta tools</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm">White-label options</span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
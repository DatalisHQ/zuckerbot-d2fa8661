import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Calendar, Zap, Wrench, ArrowUpRight } from "lucide-react";

interface SubscriptionInfo {
  subscribed: boolean;
  subscription_tier: string | null;
  subscription_end: string | null;
}

export default function Billing() {
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [campaignCount, setCampaignCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchSubscriptionInfo();
    fetchCampaignCount();
  }, []);

  const fetchSubscriptionInfo = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      setSubscriptionInfo(data);
    } catch (error) {
      console.error("Error fetching subscription:", error);
      toast({
        title: "Error",
        description: "Failed to fetch subscription information.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaignCount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's business
      const { data: businesses } = await supabase
        .from("businesses")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!businesses || businesses.length === 0) {
        setCampaignCount(0);
        return;
      }

      const { count, error } = await supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businesses[0].id);

      if (error) throw error;
      setCampaignCount(count || 0);
    } catch (error) {
      console.error("Error fetching campaign count:", error);
    }
  };

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      window.open(data.url, "_blank");
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "Failed to open customer portal. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary" />
          </div>
        </div>
      </div>
    );
  }

  const currentTier = subscriptionInfo?.subscription_tier || "free";
  const isSubscribed = subscriptionInfo?.subscribed || false;

  const campaignLimit = currentTier === "pro" ? 3 : currentTier === "starter" ? 1 : 0;

  const tierLabel = currentTier === "free" ? "No active plan" : `${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} Plan`;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Billing</h1>
            <p className="text-muted-foreground">
              Manage your subscription and billing details
            </p>
          </div>

          {/* Current Plan */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {currentTier === "pro" ? (
                    <Zap className="h-5 w-5 text-primary" />
                  ) : currentTier === "starter" ? (
                    <Wrench className="h-5 w-5 text-primary" />
                  ) : null}
                  <div>
                    <CardTitle>{tierLabel}</CardTitle>
                    {isSubscribed && subscriptionInfo?.subscription_end && (
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Renews {new Date(subscriptionInfo.subscription_end).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </CardDescription>
                    )}
                  </div>
                  {isSubscribed && <Badge variant="secondary">Active</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isSubscribed ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Active campaigns</span>
                    <span className="font-medium">
                      {campaignCount} / {campaignLimit}
                    </span>
                  </div>
                  <Button
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                    className="w-full"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    {portalLoading ? "Opening..." : "Manage Subscription"}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4 space-y-4">
                  <p className="text-muted-foreground">
                    You're not on a paid plan yet. Choose a plan to start getting leads.
                  </p>
                  <Button onClick={() => navigate("/pricing")}>
                    Choose a Plan
                    <ArrowUpRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

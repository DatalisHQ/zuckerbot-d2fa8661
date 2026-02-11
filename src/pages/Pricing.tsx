import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Wrench } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { trackFunnelEvent, trackPageView } from "@/utils/analytics";

const starterFeatures = [
  "1 active campaign",
  "AI-generated ad copy",
  "Lead inbox",
  "Facebook ad management",
  "Email support",
];

const proFeatures = [
  "Everything in Starter",
  "3 active campaigns",
  "Auto-SMS to leads",
  "CAPI feedback loop",
  "Creative refresh reminders",
  "Priority support",
];

export default function Pricing() {
  const [loading, setLoading] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Track page view
    trackPageView('/pricing', 'ZuckerBot — Choose Your Plan');
  }, []);

  const handleSubscribe = async (priceId: string) => {
    try {
      setLoading(priceId);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Determine plan and value from priceId
      const planInfo = priceId.includes('starter') 
        ? { plan: 'starter', value: 49 }
        : { plan: 'pro', value: 99 };

      // Track begin_checkout event
      trackFunnelEvent.beginCheckout(planInfo.plan, planInfo.value);

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId },
      });

      if (error) throw error;

      window.location.href = data.url;
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "Failed to create checkout session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">
            Simple pricing for busy tradies
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Stop wasting time on ads. Let ZuckerBot fill your pipeline with quality leads — so you can get back on the tools.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Starter */}
          <Card className="relative flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Starter</CardTitle>
              </div>
              <CardDescription>Perfect for solo tradies getting started with Facebook ads</CardDescription>
              <div className="pt-2">
                <span className="text-4xl font-bold">$49</span>
                <span className="text-muted-foreground">/mo AUD</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-3">
                {starterFeatures.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => handleSubscribe("starter_monthly")}
                disabled={loading === "starter_monthly"}
              >
                {loading === "starter_monthly" ? "Loading..." : "Start 7-day free trial"}
              </Button>
            </CardFooter>
          </Card>

          {/* Pro */}
          <Card className="relative flex flex-col border-primary">
            <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              Most Popular
            </Badge>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <CardTitle>Pro</CardTitle>
              </div>
              <CardDescription>For tradies ready to scale — more campaigns, more leads, more jobs</CardDescription>
              <div className="pt-2">
                <span className="text-4xl font-bold">$99</span>
                <span className="text-muted-foreground">/mo AUD</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-3">
                {proFeatures.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                onClick={() => handleSubscribe("pro_monthly")}
                disabled={loading === "pro_monthly"}
              >
                {loading === "pro_monthly" ? "Loading..." : "Start 7-day free trial"}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="text-center mt-10 space-y-2">
          <p className="text-muted-foreground">
            All plans include a <strong>7-day free trial</strong>. Cancel anytime — no lock-in contracts.
          </p>
          <p className="text-sm text-muted-foreground">
            Prices in Australian dollars. GST included.
          </p>
        </div>
      </div>
    </div>
  );
}

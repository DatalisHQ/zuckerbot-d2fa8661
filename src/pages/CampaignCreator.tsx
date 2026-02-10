import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/Navbar";
import { Loader2, Sparkles, Image as ImageIcon, ThumbsUp, Save, Rocket } from "lucide-react";

// ─── Local Interfaces ──────────────────────────────────────────────────────

interface Business {
  id: string;
  user_id: string;
  name: string;
  trade: string;
  suburb: string;
  postcode: string;
  state: string;
  phone: string;
}

interface AdVariant {
  id: number;
  headline: string;
  body: string;
  cta: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fallbackAdVariants(business: Business): AdVariant[] {
  const { name, trade, suburb } = business;
  const tradeLower = trade.toLowerCase();

  return [
    {
      id: 1,
      headline: `Your Local ${trade} in ${suburb}`,
      body: `Need a reliable ${tradeLower} in ${suburb}? ${name} is here to help. Fast, affordable, and 100% local. Get a free quote today — no call-out fees!`,
      cta: "Get Free Quote",
    },
    {
      id: 2,
      headline: `${suburb}'s Trusted ${trade}`,
      body: `Looking for a ${tradeLower} you can actually trust? ${name} has been keeping ${suburb} sorted for years. Licensed, insured, and always on time. Book now!`,
      cta: "Book Now",
    },
    {
      id: 3,
      headline: `Fast ${trade} — ${suburb} & Surrounds`,
      body: `Same-day service from a local ${tradeLower} who gets it done right the first time. ${name} — quality work, honest prices, real reviews. Call us today!`,
      cta: "Learn More",
    },
  ];
}

async function fetchAIVariants(
  businessId: string
): Promise<{ variants: AdVariant[]; targeting: { daily_budget_cents: number; radius_km: number } } | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const response = await supabase.functions.invoke("generate-campaign", {
      body: { business_id: businessId },
    });

    if (response.error || !response.data?.variants) return null;

    const variants: AdVariant[] = response.data.variants.map(
      (v: { headline: string; body: string; cta: string }, i: number) => ({
        id: i + 1,
        headline: v.headline,
        body: v.body,
        cta: v.cta,
      })
    );

    return { variants, targeting: response.data.targeting };
  } catch {
    return null;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

const CampaignCreator = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [business, setBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [variants, setVariants] = useState<AdVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<number>(1);
  const [dailyBudget, setDailyBudget] = useState(15);
  const [radiusKm, setRadiusKm] = useState(25);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch business on mount
  useEffect(() => {
    const fetchBusiness = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("businesses" as any)
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error || !data) {
        toast({
          title: "Business not found",
          description: "Complete onboarding first to set up your business.",
          variant: "destructive",
        });
        navigate("/onboarding");
        return;
      }

      const biz = data as unknown as Business;
      setBusiness(biz);
      setIsLoading(false);

      // Call AI edge function, fall back to local generation
      setIsGenerating(true);
      const aiResult = await fetchAIVariants(biz.id);
      if (aiResult) {
        setVariants(aiResult.variants);
        setDailyBudget(Math.round(aiResult.targeting.daily_budget_cents / 100));
        setRadiusKm(aiResult.targeting.radius_km);
      } else {
        setVariants(fallbackAdVariants(biz));
      }
      setIsGenerating(false);
      setShowPreview(true);
    };

    fetchBusiness();
  }, [navigate, toast]);

  const selectedAd = variants.find((v) => v.id === selectedVariant) || variants[0];

  const saveCampaign = async (launch: boolean) => {
    if (!business || !selectedAd) return;
    setIsSaving(true);

    try {
      const { error } = await supabase.from("campaigns" as any).insert({
        business_id: business.id,
        name: `${business.trade} Campaign — ${business.suburb}`,
        status: "draft",
        daily_budget_cents: dailyBudget * 100,
        radius_km: radiusKm,
        ad_copy: selectedAd.body,
        ad_headline: selectedAd.headline,
      } as any);

      if (error) throw error;

      toast({
        title: launch ? "Campaign saved!" : "Draft saved!",
        description: launch
          ? "Connect Facebook to go live."
          : "You can finish setting up later.",
      });

      navigate("/dashboard");
    } catch (err: any) {
      toast({
        title: "Error saving campaign",
        description: err.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Loading State ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // ─── Generating State ───────────────────────────────────────────────────

  if (isGenerating) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-12 max-w-2xl">
          <Card className="text-center py-16">
            <CardContent className="space-y-6">
              <div className="flex justify-center">
                <div className="relative">
                  <Sparkles className="h-12 w-12 text-primary animate-pulse" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2">Generating your ad...</h2>
                <p className="text-muted-foreground">
                  Our AI is crafting the perfect campaign for{" "}
                  <span className="font-medium text-foreground">{business?.name}</span>
                </p>
              </div>
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // ─── Main Campaign Creator ──────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold">Create Your Campaign</h1>
            <p className="text-muted-foreground mt-1">
              Pick your ad, set your budget, and you're good to go.
            </p>
          </div>

          {/* Ad Variant Selection */}
          {showPreview && (
            <>
              <section className="space-y-4">
                <h2 className="text-xl font-semibold">Choose Your Ad</h2>
                <div className="grid gap-4 md:grid-cols-3">
                  {variants.map((variant) => (
                    <Card
                      key={variant.id}
                      className={`cursor-pointer transition-all duration-200 ${
                        selectedVariant === variant.id
                          ? "ring-2 ring-primary shadow-lg"
                          : "hover:shadow-md"
                      }`}
                      onClick={() => setSelectedVariant(variant.id)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              selectedVariant === variant.id
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/30"
                            }`}
                          >
                            {selectedVariant === variant.id && (
                              <div className="w-2 h-2 rounded-full bg-white" />
                            )}
                          </div>
                          <CardTitle className="text-sm font-medium">
                            Option {variant.id}
                          </CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="font-semibold text-sm mb-2">{variant.headline}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {variant.body}
                        </p>
                        <Badge variant="secondary" className="mt-3 text-xs">
                          {variant.cta}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>

              {/* Budget & Radius Controls */}
              <section className="space-y-6">
                <h2 className="text-xl font-semibold">Campaign Settings</h2>
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Budget Slider */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Daily Budget</CardTitle>
                      <CardDescription>How much to spend per day</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-3xl font-bold text-primary">
                        ${dailyBudget}<span className="text-base font-normal text-muted-foreground">/day</span>
                      </div>
                      <Slider
                        value={[dailyBudget]}
                        onValueChange={([val]) => setDailyBudget(val)}
                        min={5}
                        max={100}
                        step={1}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>$5/day</span>
                        <span>$100/day</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Radius Slider */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Target Radius</CardTitle>
                      <CardDescription>How far from your suburb to advertise</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-3xl font-bold text-primary">
                        {radiusKm}<span className="text-base font-normal text-muted-foreground">km</span>
                      </div>
                      <Slider
                        value={[radiusKm]}
                        onValueChange={([val]) => setRadiusKm(val)}
                        min={5}
                        max={50}
                        step={1}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>5km</span>
                        <span>50km</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Facebook Ad Preview */}
              {selectedAd && (
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">Ad Preview</h2>
                  <Card className="max-w-md mx-auto overflow-hidden">
                    {/* Fake FB header */}
                    <div className="px-4 pt-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">
                          {business?.name?.charAt(0) || "B"}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{business?.name}</p>
                        <p className="text-xs text-muted-foreground">Sponsored · 📍 {business?.suburb}</p>
                      </div>
                    </div>
                    {/* Ad body */}
                    <div className="px-4 py-3">
                      <p className="text-sm leading-relaxed">{selectedAd.body}</p>
                    </div>
                    {/* Image placeholder */}
                    <div className="bg-muted aspect-video flex items-center justify-center border-y">
                      <div className="text-center space-y-2 text-muted-foreground">
                        <ImageIcon className="h-10 w-10 mx-auto" />
                        <p className="text-xs">Your business photo will go here</p>
                      </div>
                    </div>
                    {/* CTA section */}
                    <div className="px-4 py-3 border-t flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          {business?.suburb}, {business?.state}
                        </p>
                        <p className="text-sm font-semibold">{selectedAd.headline}</p>
                      </div>
                      <Button size="sm" variant="outline">
                        {selectedAd.cta}
                      </Button>
                    </div>
                  </Card>
                </section>
              )}

              {/* Action Buttons */}
              <section className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button
                  className="flex-1"
                  size="lg"
                  onClick={() => saveCampaign(true)}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4 mr-2" />
                  )}
                  Launch Campaign
                </Button>
                <Button
                  className="flex-1"
                  size="lg"
                  variant="outline"
                  onClick={() => saveCampaign(false)}
                  disabled={isSaving}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save as Draft
                </Button>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default CampaignCreator;

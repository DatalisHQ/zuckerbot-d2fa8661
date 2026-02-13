import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/Navbar";
import ImageSelector from "@/components/ImageSelector";
import { Loader2, Sparkles, Image as ImageIcon, ThumbsUp, Save, Rocket } from "lucide-react";
import { trackFunnelEvent, trackPageView } from "@/utils/analytics";
import { mpFunnel } from "@/lib/mixpanel";

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
  facebook_page_id: string | null;
  facebook_ad_account_id: string | null;
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

  return [
    {
      id: 1,
      headline: `${suburb} Locals Love ${name}`,
      body: `Trusted by ${suburb} locals. Book online or call — new customers get a special intro offer.`,
      cta: "Learn More",
    },
    {
      id: 2,
      headline: `Looking for ${name}?`,
      body: `${name} is now taking bookings in ${suburb} & surrounds. Don't wait — spots fill fast.`,
      cta: "Book Now",
    },
    {
      id: 3,
      headline: `${name} — ${suburb}'s Best Kept Secret`,
      body: `Quality service at honest prices. See why customers in ${suburb} keep coming back to ${name}.`,
      cta: "Learn More",
    },
  ];
}

async function fetchAIVariants(
  businessId: string,
  usp?: string,
  currentOffer?: string
): Promise<{ variants: AdVariant[]; targeting: { daily_budget_cents: number; radius_km: number } } | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const response = await supabase.functions.invoke("generate-campaign", {
      body: { business_id: businessId, usp: usp || "", current_offer: currentOffer || "" },
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
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  const [usp, setUsp] = useState("");
  const [currentOffer, setCurrentOffer] = useState("");

  const [variants, setVariants] = useState<AdVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<number>(1);
  const [dailyBudget, setDailyBudget] = useState(15);
  const [radiusKm, setRadiusKm] = useState(25);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch business on mount
  useEffect(() => {
    // Track page view
    trackFunnelEvent.viewCampaignCreator();
    trackPageView('/campaign/new', 'ZuckerBot — Create Campaign');
    mpFunnel.viewCampaignCreator();

    const fetchBusiness = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/auth");
        return;
      }

      setCurrentUser(session.user);

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

      // Auto-select first few images as a convenience
      try {
        const { data: photos } = await supabase.storage
          .from("business-photos")
          .list(session.user.id, { limit: 3, sortBy: { column: "created_at", order: "desc" } });

        if (photos && photos.length > 0) {
          const imageUrls = photos.map(photo => {
            const { data: urlData } = supabase.storage
              .from("business-photos")
              .getPublicUrl(`${session.user.id}/${photo.name}`);
            return urlData.publicUrl;
          }).filter(Boolean);
          
          setSelectedImages(imageUrls);
        }
      } catch (err) {
        console.log('No images found, continuing without pre-selection');
      }

      setIsLoading(false);
    };

    fetchBusiness();
  }, [navigate, toast]);

  const handleGenerate = async () => {
    if (!business) return;
    
    // Track ad copy generation
    trackFunnelEvent.generateAdCopy(business.trade);
    mpFunnel.generateAdCopy({ business_type: business.trade });
    
    setIsGenerating(true);
    const aiResult = await fetchAIVariants(business.id, usp, currentOffer);
    if (aiResult) {
      setVariants(aiResult.variants);
      setDailyBudget(Math.round(aiResult.targeting.daily_budget_cents / 100));
      setRadiusKm(aiResult.targeting.radius_km);
    } else {
      setVariants(fallbackAdVariants(business));
    }
    setIsGenerating(false);
    setHasGenerated(true);
    setShowPreview(true);
  };

  const selectedAd = variants.find((v) => v.id === selectedVariant) || variants[0];

  const facebookConnected = !!(business?.facebook_page_id && business?.facebook_ad_account_id);

  const saveCampaign = async (launch: boolean) => {
    if (!business || !selectedAd) return;

    // Check if images are selected for launch
    if (launch && selectedImages.length === 0) {
      toast({
        title: "Select images for your campaign",
        description: "Please choose at least one image before launching your campaign.",
        variant: "destructive",
      });
      return;
    }

    // If launching, check Facebook connection first
    if (launch && !facebookConnected) {
      toast({
        title: "Connect Facebook first",
        description: "You need to link your Facebook ad account before launching. Head to Settings to connect.",
      });
      navigate("/profile");
      return;
    }

    setIsSaving(true);

    try {
      if (launch) {
        // Track campaign creation before launch
        trackFunnelEvent.createCampaign(dailyBudget * 100, radiusKm);
        
        // Launch flow — edge function creates the campaign on Meta AND in the DB
        // Note: Edge function currently supports single image, will be enhanced for multi-image support
        const { data: launchData, error: launchError } = await supabase.functions.invoke("launch-campaign", {
          body: {
            business_id: business.id,
            headline: selectedAd.headline,
            body: selectedAd.body,
            cta: selectedAd.cta,
            daily_budget_cents: dailyBudget * 100,
            radius_km: radiusKm,
            image_url: selectedImages.length > 0 ? selectedImages[0] : undefined,
            selected_images: selectedImages, // For future multi-image support
          },
        });

        if (launchError) {
          toast({
            title: "Launch failed",
            description: launchError.message || "Something went wrong. Your campaign was not created.",
            variant: "destructive",
          });
          setIsSaving(false);
          return;
        }

        // Track successful campaign launch
        const campaignId = launchData?.campaign_id || 'unknown';
        trackFunnelEvent.launchCampaign(campaignId, dailyBudget);
        mpFunnel.launchCampaign({ campaign_id: campaignId, budget: dailyBudget });
        
        // Check if this might be their first campaign
        const { data: existingCampaigns } = await supabase
          .from("campaigns" as any)
          .select("id")
          .eq("business_id", business.id);
        
        if (!existingCampaigns || existingCampaigns.length <= 1) {
          trackFunnelEvent.launchFirstCampaign(campaignId, dailyBudget);
        }

        toast({
          title: "Campaign launched! 🚀",
          description: "Your ad is now live on Facebook. Check the dashboard for performance.",
        });
      } else {
        // Draft flow — just save locally
        trackFunnelEvent.createCampaign(dailyBudget * 100, radiusKm);
        
        const { error } = await supabase.from("campaigns" as any).insert({
          business_id: business.id,
          name: `${business.name} Campaign — ${business.suburb || 'Online'}`,
          status: "draft",
          daily_budget_cents: dailyBudget * 100,
          radius_km: radiusKm,
          ad_copy: selectedAd.body,
          ad_headline: selectedAd.headline,
        } as any);

        if (error) throw error;

        toast({
          title: "Draft saved!",
          description: "You can finish setting up and launch later.",
        });
      }

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

          {/* Tell us more (optional) — pre-generation step */}
          {!hasGenerated && !isGenerating && (
            <section className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Tell us about your business</CardTitle>
                  <CardDescription>Optional — helps our AI write better ads for you</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="usp">What makes you different?</Label>
                    <Input
                      id="usp"
                      value={usp}
                      onChange={(e) => setUsp(e.target.value)}
                      placeholder="e.g. 20 years experience, award-winning service, locally owned"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="offer">Any current offer?</Label>
                    <Input
                      id="offer"
                      value={currentOffer}
                      onChange={(e) => setCurrentOffer(e.target.value)}
                      placeholder="e.g. 10% off first job, free quote this month, no call-out fee"
                    />
                  </div>
                </CardContent>
              </Card>
              <Button size="lg" className="w-full" onClick={handleGenerate}>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate My Ad
              </Button>
            </section>
          )}

          {/* Image Selection */}
          {hasGenerated && showPreview && (
            <>
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Select Campaign Images</h2>
                  {selectedImages.length > 1 && (
                    <Badge variant="secondary" className="text-xs">
                      Multi-image testing enabled
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">
                  Choose up to 5 images for your campaign. Facebook will automatically test different images to find the best performing ones and show your best image more often.
                </p>
                {currentUser && (
                  <ImageSelector
                    userId={currentUser.id}
                    selectedImages={selectedImages}
                    onSelectionChange={setSelectedImages}
                    maxSelection={5}
                  />
                )}
              </section>

              {/* Ad Variant Selection */}
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
                    {/* Ad image */}
                    <div className="bg-muted aspect-video flex items-center justify-center border-y overflow-hidden">
                      {selectedImages.length > 0 ? (
                        <div className="relative w-full h-full">
                          <img
                            src={selectedImages[0]}
                            alt={`${business?.name} ad creative`}
                            className="w-full h-full object-cover"
                          />
                          {selectedImages.length > 1 && (
                            <div className="absolute top-2 right-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
                              +{selectedImages.length - 1} more image{selectedImages.length > 2 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center space-y-2 text-muted-foreground">
                          <ImageIcon className="h-10 w-10 mx-auto" />
                          <p className="text-xs">Select images above to preview your ad</p>
                        </div>
                      )}
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

              {/* Facebook Connection Notice */}
              {!facebookConnected && (
                <section>
                  <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                    <CardContent className="flex items-center gap-4 py-4">
                      <div className="text-2xl">⚠️</div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Facebook account not connected</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          You can save your campaign as a draft now and connect Facebook later in Settings.
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => navigate("/profile")}>
                        Connect
                      </Button>
                    </CardContent>
                  </Card>
                </section>
              )}

              {/* Action Buttons */}
              <section className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button
                  className="flex-1"
                  size="lg"
                  onClick={() => saveCampaign(true)}
                  disabled={isSaving || !facebookConnected}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4 mr-2" />
                  )}
                  {facebookConnected ? "Launch Campaign" : "Connect Facebook to Launch"}
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

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2, Bot, Sparkles, Facebook, Globe, Building, Target, LogOut } from "lucide-react";
import { useEnhancedAuth, validateSession } from "@/utils/auth";

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessUrl, setBusinessUrl] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [products, setProducts] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { logout } = useEnhancedAuth();

  useEffect(() => {
    const checkUser = async () => {
      // Use enhanced session validation
      const { session, user, isValid } = await validateSession();
      
      if (!isValid || !user) {
        navigate("/auth");
        return;
      }

      // Check if already completed onboarding
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('user_id', user.id)
          .single();

        if (profile?.onboarding_completed) {
          navigate("/zuckerbot");
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        // If profile check fails, user might need to re-authenticate
        navigate("/auth");
      }
    };
    checkUser();
  }, [navigate]);

  const handleBusinessSetup = async () => {
    if (!businessName || !businessUrl) {
      toast({
        title: "Missing Information",
        description: "Please fill in your business name and website URL.",
        variant: "destructive",
      });
      return;
    }

    // Check if we're on step 2 but still need to complete step 1 (Facebook connection validation)
    const { data: profile } = await supabase
      .from('profiles')
      .select('facebook_connected, facebook_access_token')
      .eq('user_id', (await supabase.auth.getSession()).data.session?.user.id)
      .single();

    if (profile?.facebook_connected && !profile?.facebook_access_token) {
      toast({
        title: "Facebook Connection Incomplete",
        description: "Please reconnect your Facebook account to complete setup.",
        variant: "destructive",
      });
      setCurrentStep(1);
      return;
    }

    setIsLoading(true);
    setIsAnalyzing(true);

    try {
      // Use enhanced session validation
      const { session, user, isValid } = await validateSession();
      if (!isValid || !user) throw new Error("No valid user session");

      console.log("Starting business setup for user:", user.id);

      // First, verify the user exists in profiles table
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      console.log("Existing profile before update:", existingProfile);

      if (checkError) {
        console.error("Error checking existing profile:", checkError);
        throw new Error("Profile not found. Please sign out and sign back in.");
      }

      // Update profile with business info
      const { data: updatedProfile, error: profileError } = await supabase
        .from('profiles')
        .update({
          business_name: businessName,
        })
        .eq('user_id', session.user.id)
        .select()
        .single();

      if (profileError) {
        console.error("Profile update error:", profileError);
        throw new Error(`Failed to update profile: ${profileError.message}`);
      }

      console.log("Profile updated successfully:", updatedProfile);

      // Run mandatory brand analysis
      console.log("Starting mandatory brand analysis...");
      const { data: brandAnalysisData, error: brandError } = await supabase.functions.invoke('analyze-brand', {
        body: {
          brandUrl: businessUrl,
          userId: session.user.id
        }
      });

      if (brandError) {
        console.error("Brand analysis error:", brandError);
        throw new Error("Failed to analyze your brand. Please try again.");
      }

      if (!brandAnalysisData.success) {
        throw new Error(brandAnalysisData.error || "Brand analysis failed");
      }

      console.log("Brand analysis completed:", brandAnalysisData.analysis);

      // If Facebook is connected, sync ads data immediately
      if (existingProfile?.facebook_connected && existingProfile?.facebook_access_token) {
        console.log("Syncing Facebook Ads data...");
        try {
          await supabase.functions.invoke('sync-facebook-ads');
          console.log("Facebook Ads data synced successfully");
        } catch (syncError) {
          console.error("Facebook sync failed (non-critical):", syncError);
          // Don't fail onboarding if Facebook sync fails
        }
      }

      // Mark onboarding as completed only after successful brand analysis
      const { error: completionError } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('user_id', session.user.id);

      if (completionError) {
        throw new Error("Failed to complete onboarding");
      }

      toast({
        title: "Setup Complete!",
        description: `Your ZuckerBot assistant has analyzed ${businessName} and is ready to help.`,
      });

      console.log("Onboarding completed successfully - navigating to ZuckerBot");
      navigate("/zuckerbot");
      
    } catch (error: any) {
      console.error("Onboarding error:", error);
      toast({
        title: "Setup Error",
        description: error.message || "There was an error setting up your business profile. Please try again.",
        variant: "destructive",
      });
      setIsAnalyzing(false);
      setIsLoading(false);
    }
  };

  const connectFacebook = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          scopes: 'ads_management,ads_read,business_management,pages_read_engagement',
          redirectTo: `${window.location.origin}/onboarding?step=2&facebook=connected`
        }
      });

      if (error) {
        console.error('Facebook OAuth error:', error);
        toast({
          title: "Facebook Connection Failed",
          description: error.message || "Could not connect to Facebook. Please try again or skip for now.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Facebook connection error:', error);
      toast({
        title: "Facebook Connection Error",
        description: "There was an error connecting to Facebook. You can skip this step for now.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const skipFacebook = () => {
    setCurrentStep(2);
  };

  const handleSignOut = () => {
    logout(navigate, false); // Don't show toast on onboarding page
  };

  // Check for Facebook connection status on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const step = urlParams.get('step');
    const facebookConnected = urlParams.get('facebook');
    
    if (step === '2' && facebookConnected === 'connected') {
      // Store Facebook tokens after successful OAuth but don't auto-advance to step 2
      const storeFacebookTokens = async () => {
        try {
          setIsLoading(true);
          const { data, error } = await supabase.functions.invoke('facebook-oauth-callback');
          
          if (error) {
            console.error('Error storing Facebook tokens:', error);
            toast({
              title: "Couldn't Store Access Tokens",
              description: "Connected to Facebook but couldn't store access tokens. This will prevent Facebook features from working properly.",
              variant: "destructive",
            });
            // Stay on step 1 for retry
            setCurrentStep(1);
            return false;
          } else {
            console.log('Facebook tokens stored successfully:', data);
            
            // Immediately sync Facebook Ads data after storing tokens
            try {
              await supabase.functions.invoke('sync-facebook-ads');
              toast({
                title: "Facebook Connected & Synced",
                description: "Your Facebook account is connected and ad data has been imported. Please continue to Step 2.",
              });
            } catch (syncError) {
              console.error("Facebook sync failed:", syncError);
              // Don't fail for sync issues, just log them
              toast({
                title: "Facebook Connected",
                description: "Your Facebook account is connected. Please continue to Step 2.",
              });
            }
            
            // Only advance to step 2 after successful token storage
            setCurrentStep(2);
            return true;
          }
        } catch (error) {
          console.error('Error in Facebook callback:', error);
          toast({
            title: "Couldn't Store Access Tokens", 
            description: "Connected to Facebook but couldn't store access tokens. This will prevent Facebook features from working properly.",
            variant: "destructive",
          });
          // Stay on step 1 for retry
          setCurrentStep(1);
          return false;
        } finally {
          setIsLoading(false);
        }
      };
      
      // Process Facebook tokens
      storeFacebookTokens().then((success) => {
        if (!success) {
          // Stay on step 1 and show retry option
          toast({
            title: "Facebook Connection Incomplete",
            description: "Please try connecting to Facebook again or continue to Step 2.",
            variant: "destructive",
          });
        }
      });
    }
  }, [toast]);

  if (isAnalyzing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center">
        <Card className="w-full max-w-md text-center shadow-lg border-0 bg-card/50 backdrop-blur">
          <CardContent className="p-8">
            <div className="mb-6">
              <div className="bg-primary/10 p-4 rounded-full mx-auto w-16 h-16 flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-primary animate-bounce" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Learning about {businessName}</h2>
              <p className="text-muted-foreground">
                ZuckerBot is analyzing your business and creating your personalized assistant...
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Analyzing website</span>
                <span className="text-primary">✓</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Understanding your products</span>
                <span className="text-primary">✓</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Building marketing context</span>
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Preparing your assistant</span>
                <span>•••</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
      {/* Sign Out Button */}
      <div className="absolute top-4 right-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
      
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-primary/10 p-3 rounded-full mr-3">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Set Up Your ZuckerBot
            </h1>
            <Sparkles className="h-6 w-6 text-primary ml-2" />
          </div>
          <p className="text-lg text-muted-foreground">
            Let's personalize your AI assistant with your business information
          </p>
        </div>

        <Card className="shadow-lg border-0 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center justify-center space-x-2">
              <span>Step {currentStep} of 2</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="text-center">
                  <Facebook className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Connect Your Facebook Business Account</h3>
                  <p className="text-muted-foreground mb-6">
                    Connect your Facebook Business Manager to pull insights, past campaigns, and audience data
                  </p>
                  <Button onClick={connectFacebook} className="w-full" size="lg" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Facebook className="mr-2 h-4 w-4" />
                    Connect Facebook Business Account
                  </Button>
                  <Button variant="outline" onClick={() => setCurrentStep(2)} className="w-full mt-3">
                    Skip for now
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <Building className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Tell Us About Your Business</h3>
                  <p className="text-muted-foreground">
                    This helps ZuckerBot understand your brand and create better campaigns
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business Name *</Label>
                    <Input
                      id="businessName"
                      placeholder="Your Business Name"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessUrl">Website URL *</Label>
                    <Input
                      id="businessUrl"
                      placeholder="https://yourbusiness.com"
                      value={businessUrl}
                      onChange={(e) => setBusinessUrl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="businessDescription">Business Description</Label>
                  <Textarea
                    id="businessDescription"
                    placeholder="Describe what your business does, your industry, and what makes you unique..."
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetAudience">Target Audience</Label>
                  <Input
                    id="targetAudience"
                    placeholder="e.g., Small business owners, Young professionals, Parents..."
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="products">Main Products/Services</Label>
                  <Input
                    id="products"
                    placeholder="e.g., Software subscriptions, Handmade jewelry, Consulting services..."
                    value={products}
                    onChange={(e) => setProducts(e.target.value)}
                  />
                </div>

                <Button 
                  onClick={handleBusinessSetup} 
                  className="w-full" 
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create My ZuckerBot Assistant
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Onboarding;
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
  const [isLoading, setIsLoading] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessUrl, setBusinessUrl] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [products, setProducts] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [facebookConnected, setFacebookConnected] = useState(false);
  const [isUpdateMode, setIsUpdateMode] = useState(false);
  const [existingAnalysisId, setExistingAnalysisId] = useState<string | null>(null);
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

      // Check URL parameters for update mode
      const urlParams = new URLSearchParams(window.location.search);
      const mode = urlParams.get('mode');
      const isUpdate = mode === 'update';
      setIsUpdateMode(isUpdate);

      // Check if already completed onboarding (but allow updates)
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed, business_name')
          .eq('user_id', user.id)
          .single();

        if (profile?.onboarding_completed && !isUpdate) {
          navigate("/zuckerbot");
          return;
        }

        // If in update mode, load existing brand analysis data
        if (isUpdate) {
          const { data: brandAnalysis } = await supabase
            .from('brand_analysis')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          if (brandAnalysis) {
            setExistingAnalysisId(brandAnalysis.id);
            setBusinessName(brandAnalysis.brand_name || profile?.business_name || '');
            setBusinessUrl(brandAnalysis.brand_url || '');
            // Note: Other fields aren't stored in brand_analysis currently
          } else if (profile?.business_name) {
            setBusinessName(profile.business_name);
          }
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

      // Handle brand analysis - update existing or create new
      if (isUpdateMode && existingAnalysisId) {
        console.log("Updating existing brand analysis...");
        const { error: updateError } = await supabase
          .from('brand_analysis')
          .update({
            brand_url: businessUrl,
            brand_name: businessName,
            analysis_status: 'completed'
          })
          .eq('id', existingAnalysisId)
          .eq('user_id', session.user.id);

        if (updateError) {
          console.error("Brand analysis update error:", updateError);
          throw new Error("Failed to update your brand information. Please try again.");
        }
        
        console.log("Brand analysis updated successfully");
      } else {
        // Run mandatory brand analysis for new setups
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
      }

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

      // Mark onboarding as completed or show update success
      if (!isUpdateMode) {
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
      } else {
        toast({
          title: "Brand Info Updated!",
          description: `Your brand information for ${businessName} has been updated successfully.`,
        });
      }

      console.log(isUpdateMode ? "Brand info updated successfully" : "Onboarding completed successfully - navigating to ZuckerBot");
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
          redirectTo: `${window.location.origin}/onboarding?facebook=connected`
        }
      });

      if (error) {
        console.error('Facebook OAuth error:', error);
        toast({
          title: "Facebook Connection Failed",
          description: error.message || "Could not connect to Facebook. Please try again later.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Facebook connection error:', error);
      toast({
        title: "Facebook Connection Error",
        description: "There was an error connecting to Facebook. You can continue without it.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = () => {
    logout(navigate, false); // Don't show toast on onboarding page
  };

  // Check for Facebook connection status on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const facebookParam = urlParams.get('facebook');
    
    if (facebookParam === 'connected') {
      // Store Facebook tokens after successful OAuth
      const storeFacebookTokens = async () => {
        try {
          setIsLoading(true);
          const { data, error } = await supabase.functions.invoke('facebook-oauth-callback');
          
          if (error) {
            console.error('Error storing Facebook tokens:', error);
            toast({
              title: "Facebook Connection Issue",
              description: "There was an issue with the Facebook connection. You can retry later.",
              variant: "destructive",
            });
          } else {
            console.log('Facebook tokens stored successfully:', data);
            
            // Check if connection was incomplete
            if (data.incomplete) {
              toast({
                title: "Facebook Connected (Incomplete)",
                description: "Facebook identity linked but access token needs to be refreshed.",
                variant: "destructive",
              });
              setFacebookConnected(false);
            } else {
              // Immediately sync Facebook Ads data after storing tokens
              try {
                await supabase.functions.invoke('sync-facebook-ads');
                toast({
                  title: "Facebook Connected & Synced",
                  description: "Your Facebook account is connected and ad data has been imported.",
                });
                setFacebookConnected(true);
              } catch (syncError) {
                console.error("Facebook sync failed:", syncError);
                // Don't fail for sync issues, just log them
                toast({
                  title: "Facebook Connected",
                  description: "Your Facebook account is connected.",
                });
                setFacebookConnected(true);
              }
            }
          }
        } catch (error) {
          console.error('Error in Facebook callback:', error);
          toast({
            title: "Facebook Connection Error", 
            description: "There was an error processing the Facebook connection.",
            variant: "destructive",
          });
        } finally {
          setIsLoading(false);
          // Clear URL parameters after processing
          window.history.replaceState({}, '', '/onboarding');
        }
      };
      
      storeFacebookTokens();
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
              <span>Complete Your Setup</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Facebook Connection Section */}
            <div className="space-y-6">
              <div className="text-center">
                <Facebook className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Connect Your Facebook Business Account</h3>
                <p className="text-muted-foreground mb-6">
                  Connect your Facebook Business Manager to pull insights, past campaigns, and audience data
                </p>
                
                {facebookConnected ? (
                  <div className="flex items-center justify-center space-x-2 text-green-600 mb-4">
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                      <span className="text-xs">✓</span>
                    </div>
                    <span className="font-medium">Facebook Connected</span>
                  </div>
                ) : (
                  <Button onClick={connectFacebook} className="w-full" size="lg" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Facebook className="mr-2 h-4 w-4" />
                    Connect Facebook Business Account
                  </Button>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Business Information</span>
              </div>
            </div>

            {/* Business Information Section */}
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
                {isUpdateMode ? 'Update Brand Information' : 'Create My ZuckerBot Assistant'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Onboarding;
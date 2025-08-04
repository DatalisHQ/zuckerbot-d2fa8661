import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2, Bot, Sparkles, Facebook, Globe, Building, Target, LogOut, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  const [isSyncingAds, setIsSyncingAds] = useState(false);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [selectedAdAccountId, setSelectedAdAccountId] = useState<string>('');
  const [showAdAccountSelection, setShowAdAccountSelection] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { logout } = useEnhancedAuth();

  // Helper function to create missing user profiles
  const createUserProfile = async (user: any) => {
    try {
      console.log(`[Onboarding] Creating profile for user: ${user.id}`);
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          onboarding_completed: false,
          facebook_connected: false
        })
        .select()
        .single();

      if (createError) {
        console.error('[Onboarding] Error creating profile:', createError);
        throw new Error(`Failed to create user profile: ${createError.message}`);
      }

      console.log('[Onboarding] Profile created successfully:', newProfile);
      return newProfile;
    } catch (error) {
      console.error('[Onboarding] Profile creation failed:', error);
      throw error;
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      // Use enhanced session validation
      const { session, user, isValid } = await validateSession();
      
      if (!isValid || !user) {
        navigate("/auth");
        return;
      }

      // Check URL parameters for recovery mode and other flags
      const urlParams = new URLSearchParams(window.location.search);
      const mode = urlParams.get('mode');
      const recovery = urlParams.get('recovery');
      const facebookParam = urlParams.get('facebook');
      const isUpdate = mode === 'update';
      const isRecovery = !!recovery;
      setIsUpdateMode(isUpdate);

      // CRITICAL: If user just completed Facebook OAuth, stay on onboarding
      // Don't redirect away even if onboarding was previously completed
      if (facebookParam === 'connected') {
        console.log('[Onboarding] Facebook OAuth return detected - staying on onboarding page');
        // Clean up URL without navigating away
        const cleanUrl = window.location.pathname + (isUpdate ? '?mode=update' : '');
        window.history.replaceState({}, '', cleanUrl);
        return; // Don't proceed with normal onboarding completion check
      }

      // Check profile and prerequisites
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed, business_name, facebook_connected, facebook_access_token, selected_ad_account_id')
          .eq('user_id', user.id)
          .maybeSingle();

        // If no profile exists, create one automatically
        if (!profile) {
          console.log('[Onboarding] No profile found, creating one...');
          await createUserProfile(user);
        } else {
          // Check if recovery is needed
          const hasCompletedOnboarding = profile?.onboarding_completed;
          const hasFacebookConnected = profile?.facebook_connected && profile?.facebook_access_token;
          const hasSelectedAdAccount = profile?.selected_ad_account_id;

          if (isRecovery) {
            console.log('[Onboarding] Recovery mode detected:', recovery);
            // Handle recovery scenarios
            if (recovery === 'facebook' && !hasFacebookConnected) {
              setFacebookConnected(false);
              // Show Facebook connection form
            } else if (recovery === 'ad_account' && hasFacebookConnected && !hasSelectedAdAccount) {
              setFacebookConnected(true);
              // Try to fetch ad accounts and show selection
              try {
                const { data } = await supabase.functions.invoke('get-facebook-ad-accounts');
                if (data?.adAccounts && Array.isArray(data.adAccounts)) {
                  setAdAccounts(data.adAccounts);
                  setShowAdAccountSelection(true);
                }
              } catch (error) {
                console.error('[Onboarding] Error fetching ad accounts in recovery:', error);
              }
            }
            // Load existing business data
            if (profile?.business_name) {
              setBusinessName(profile.business_name);
            }
          } else if (hasCompletedOnboarding && hasFacebookConnected && hasSelectedAdAccount && !isUpdate) {
            console.log('[Onboarding] User has completed all prerequisites, redirecting to ZuckerBot');
            navigate("/zuckerbot");
            return;
          } else if (hasFacebookConnected) {
            setFacebookConnected(true);
          }
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
        .maybeSingle();

      console.log("Existing profile before update:", existingProfile);

      // If no profile exists, create one automatically
      let profileToUse = existingProfile;
      if (!existingProfile) {
        console.log("No profile found during business setup, creating one...");
        profileToUse = await createUserProfile(session.user);
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

      // Wait for Facebook to be connected before proceeding
      if (!facebookConnected) {
        toast({
          title: "Facebook Connection Required",
          description: "Please connect your Facebook Business account to continue.",
          variant: "destructive",
        });
        setIsAnalyzing(false);
        setIsLoading(false);
        return;
      }

      // Check if ad account is selected (for non-update mode)
      if (!isUpdateMode && !selectedAdAccountId) {
        // Trigger ad account selection flow
        setIsAnalyzing(false);
        setIsLoading(false);
        setShowAdAccountSelection(true);
        return;
      }

      // Mark onboarding as completed or show update success
      if (!isUpdateMode) {
        const { error: completionError } = await supabase
          .from('profiles')
          .update({ 
            onboarding_completed: true,
            selected_ad_account_id: selectedAdAccountId
          })
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
      } else {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            selected_ad_account_id: selectedAdAccountId || undefined 
          })
          .eq('user_id', session.user.id);

        if (updateError) {
          console.error("Error updating selected ad account:", updateError);
        }

        toast({
          title: "Brand Info Updated!",
          description: `Your brand information for ${businessName} has been updated successfully.`,
        });

        console.log("Brand info updated successfully - navigating to ZuckerBot");
        navigate("/zuckerbot");
      }
      
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

  // Listen for global Facebook connection events
  useEffect(() => {
    const handleFacebookConnected = async (event: CustomEvent) => {
      console.log('[Onboarding] Facebook connection event received:', event.detail);
      if (event.detail.success) {
        setFacebookConnected(true);
        setIsSyncingAds(true);
        
        try {
          // Wait for ad sync to complete, then fetch ad accounts
          console.log('[Onboarding] Fetching ad accounts after sync...');
          const { data, error } = await supabase.functions.invoke('get-facebook-ad-accounts');
          
          if (error) {
            throw new Error(error.message || 'Failed to fetch ad accounts');
          }
          
          if (data?.adAccounts && Array.isArray(data.adAccounts)) {
            setAdAccounts(data.adAccounts);
            console.log('[Onboarding] Ad accounts fetched:', data.adAccounts.length);
          }
          
          toast({
            title: "Facebook Connected & Synced",
            description: "Your Facebook account is connected and ad data has been imported.",
          });
        } catch (error: any) {
          console.error('[Onboarding] Error fetching ad accounts:', error);
          toast({
            title: "Facebook Connected",
            description: "Facebook connected successfully, but there was an issue fetching ad accounts. You can retry later.",
            variant: "destructive",
          });
        } finally {
          setIsSyncingAds(false);
        }
        
        // Clean up URL without navigating away
        const cleanUrl = window.location.pathname + (isUpdateMode ? '?mode=update' : '');
        window.history.replaceState({}, '', cleanUrl);
      }
    };

    // Clean up URL parameters if Facebook OAuth redirect
    const urlParams = new URLSearchParams(window.location.search);
    const facebookParam = urlParams.get('facebook');
    
    if (facebookParam === 'connected') {
      // Clean up URL parameters
      const cleanUrl = window.location.pathname + (isUpdateMode ? '?mode=update' : '');
      window.history.replaceState({}, '', cleanUrl);
    }

    window.addEventListener('facebook-connected', handleFacebookConnected as EventListener);

    return () => {
      window.removeEventListener('facebook-connected', handleFacebookConnected as EventListener);
    };
  }, [toast, isUpdateMode]);

  const handleAdAccountSelection = async () => {
    if (!selectedAdAccountId) {
      toast({
        title: "Ad Account Required",
        description: "Please select an ad account to continue.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      
      // Use enhanced session validation
      const { session, user, isValid } = await validateSession();
      if (!isValid || !user) throw new Error("No valid user session");

      // Update profile with selected ad account
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          onboarding_completed: true,
          selected_ad_account_id: selectedAdAccountId
        })
        .eq('user_id', user.id);

      if (updateError) {
        throw new Error("Failed to save ad account selection");
      }

      toast({
        title: "Setup Complete!",
        description: `Your ZuckerBot assistant is ready to help with your selected ad account.`,
      });

      console.log("Onboarding completed with ad account selection - navigating to ZuckerBot");
      navigate("/zuckerbot");
      
    } catch (error: any) {
      console.error("Ad account selection error:", error);
      toast({
        title: "Selection Error",
        description: error.message || "Failed to save ad account selection. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSyncingAds) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center">
        <Card className="w-full max-w-md text-center shadow-lg border-0 bg-card/50 backdrop-blur">
          <CardContent className="p-8">
            <div className="mb-6">
              <div className="bg-primary/10 p-4 rounded-full mx-auto w-16 h-16 flex items-center justify-center mb-4">
                <Facebook className="h-8 w-8 text-blue-600 animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Syncing Facebook Data</h2>
              <p className="text-muted-foreground">
                Importing your ad accounts and campaign data from Facebook...
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Connected to Facebook</span>
                <span className="text-primary">✓</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Fetching ad accounts</span>
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Importing campaign data</span>
                <span>•••</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  if (showAdAccountSelection) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl shadow-lg border-0 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center justify-center space-x-2">
              <Target className="h-6 w-6 text-primary" />
              <span>Select Your Ad Account</span>
            </CardTitle>
            <p className="text-center text-muted-foreground">
              Choose the Facebook ad account you want to use for campaigns and performance tracking
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {adAccounts.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Ad Accounts Found</h3>
                <p className="text-muted-foreground mb-4">
                  We couldn't find any ad accounts associated with your Facebook Business account.
                </p>
                <Button onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {adAccounts.map((account) => (
                    <label
                      key={account.id}
                      className={`flex items-center space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedAdAccountId === account.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="adAccount"
                        value={account.id}
                        checked={selectedAdAccountId === account.id}
                        onChange={(e) => setSelectedAdAccountId(e.target.value)}
                        className="w-4 h-4 text-primary"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{account.name}</div>
                        <div className="text-sm text-muted-foreground">Account ID: {account.id}</div>
                        <div className="text-sm">
                          <Badge variant={account.account_status === 1 ? "default" : "secondary"}>
                            {account.account_status === 1 ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex justify-between pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowAdAccountSelection(false)}
                  >
                    Back
                  </Button>
                  <Button 
                    onClick={handleAdAccountSelection}
                    disabled={!selectedAdAccountId || isLoading}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Complete Setup
                  </Button>
                </div>
              </>
            )}
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
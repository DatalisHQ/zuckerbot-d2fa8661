import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2, Bot, Sparkles, Globe, Building, Target, LogOut } from "lucide-react";
import { useEnhancedAuth, validateSession } from "@/utils/auth";

const Onboarding = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessUrl, setBusinessUrl] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [products, setProducts] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUpdateMode, setIsUpdateMode] = useState(false);
  const [existingAnalysisId, setExistingAnalysisId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { logout } = useEnhancedAuth();

  // MAJOR CHANGE: Remove Facebook-related state and logic from onboarding
  
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
          facebook_connected: false // Default to false, can be connected later
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

      // Check URL parameters for update mode only
      const urlParams = new URLSearchParams(window.location.search);
      const mode = urlParams.get('mode');
      const isUpdate = mode === 'update';
      setIsUpdateMode(isUpdate);

      // MAJOR CHANGE: Removed Facebook OAuth callback handling from onboarding

      // Check profile and prerequisites
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed, business_name')
          .eq('user_id', user.id)
          .maybeSingle();

        // If no profile exists, create one automatically
        if (!profile) {
          console.log('[Onboarding] No profile found, creating one...');
          await createUserProfile(user);
        } else {
          // MAJOR CHANGE: Only check onboarding completion, not Facebook connection
          const hasCompletedOnboarding = profile?.onboarding_completed;

          if (hasCompletedOnboarding && !isUpdate) {
            console.log('[Onboarding] User has completed onboarding, redirecting to dashboard');
            navigate("/dashboard");
            return;
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
        // TODO: v2 will use create-business-profile edge function
        console.log("Brand analysis skipped - v2 rebuild pending");
      }

      // MAJOR CHANGE: Mark onboarding as completed without requiring Facebook connection
      if (!isUpdateMode) {
        const { error: completionError } = await supabase
          .from('profiles')
          .update({ 
            onboarding_completed: true
          })
          .eq('user_id', session.user.id);

        if (completionError) {
          throw new Error("Failed to complete onboarding");
        }

        toast({
          title: "Setup Complete!",
          description: `Your ZuckerBot assistant has analyzed ${businessName} and is ready to help. You can connect Facebook later for ad management.`,
        });

        console.log("Onboarding completed successfully - navigating to Dashboard");
        navigate("/dashboard");
      } else {
        toast({
          title: "Brand Info Updated!",
          description: `Your brand information for ${businessName} has been updated successfully.`,
        });

        console.log("Brand info updated successfully - navigating to Dashboard");
        navigate("/dashboard");
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

  const handleSignOut = () => {
    logout(navigate, false); // Don't show toast on onboarding page
  };

  // MAJOR CHANGE: Removed all Facebook-related useEffect and event listeners

  if (isAnalyzing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-primary/20 rounded-full mx-auto"></div>
            <div className="w-24 h-24 border-4 border-primary border-t-transparent rounded-full mx-auto absolute top-0 animate-spin"></div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">Analyzing Your Brand</h3>
            <p className="text-muted-foreground">
              ZuckerBot is learning about your business...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-semibold">
                {isUpdateMode ? "Update Brand Information" : "Welcome to ZuckerBot"}
              </h1>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Welcome Section */}
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-2xl mx-auto flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-primary-foreground" />
            </div>
            <h2 className="text-3xl font-bold">
              {isUpdateMode ? "Update Your Brand" : "Let's Set Up Your Business"}
            </h2>
            <p className="text-muted-foreground text-lg">
              {isUpdateMode 
                ? "Update your brand information to improve ZuckerBot's recommendations."
                : "Tell ZuckerBot about your business so it can create amazing ad campaigns for you."
              }
            </p>
          </div>

          {/* Business Setup Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Business Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input
                    id="businessName"
                    placeholder="e.g., Acme Corp"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessUrl">Website URL *</Label>
                  <Input
                    id="businessUrl"
                    placeholder="https://your-website.com"
                    value={businessUrl}
                    onChange={(e) => setBusinessUrl(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessDescription">Business Description (Optional)</Label>
                <Textarea
                  id="businessDescription"
                  placeholder="Briefly describe what your business does..."
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  disabled={isLoading}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetAudience">Target Audience (Optional)</Label>
                <Input
                  id="targetAudience"
                  placeholder="e.g., Young professionals, Parents, Small business owners"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="products">Main Products/Services (Optional)</Label>
                <Input
                  id="products"
                  placeholder="e.g., Software, Consulting, E-commerce"
                  value={products}
                  onChange={(e) => setProducts(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </CardContent>
          </Card>

          {/* MAJOR CHANGE: Remove Facebook connection requirement from onboarding */}
          
          {/* Action Buttons */}
          <div className="flex flex-col gap-4">
            <Button
              size="lg"
              onClick={handleBusinessSetup}
              disabled={isLoading || !businessName || !businessUrl}
              className="w-full"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isUpdateMode ? "Update Brand Information" : "Complete Setup"}
            </Button>
            
            <p className="text-sm text-muted-foreground text-center">
              {isUpdateMode 
                ? "Your brand information will be updated and ZuckerBot will use this for better recommendations."
                : "After setup, you can connect Facebook to manage ad campaigns and view performance data."
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
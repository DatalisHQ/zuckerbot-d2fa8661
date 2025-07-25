import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2, Bot, Sparkles, Facebook, Globe, Building, Target } from "lucide-react";

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

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/auth");
        return;
      }

      // Check if already completed onboarding
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('user_id', session.user.id)
        .single();

      if (profile?.onboarding_completed) {
        navigate("/zuckerbot");
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("No user session");

      console.log("Starting business setup for user:", session.user.id);

      // First, verify the user exists in profiles table
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (checkError) {
        console.error("Error checking existing profile:", checkError);
        throw new Error("Profile not found. Please sign out and sign back in.");
      }

      console.log("Existing profile before update:", existingProfile);

      // Update profile with business info and mark onboarding as completed
      const { data: updatedProfile, error: profileError } = await supabase
        .from('profiles')
        .update({
          business_name: businessName,
          onboarding_completed: true
        })
        .eq('user_id', session.user.id)
        .select()
        .single();

      if (profileError) {
        console.error("Profile update error:", profileError);
        throw new Error(`Failed to update profile: ${profileError.message}`);
      }

      console.log("Profile updated successfully:", updatedProfile);

      // Verify the update immediately
      if (!updatedProfile || !updatedProfile.onboarding_completed) {
        throw new Error("Onboarding completion flag was not set properly");
      }

      // Create brand analysis
      const { data: brandData, error: brandError } = await supabase
        .from('brand_analysis')
        .insert({
          user_id: session.user.id,
          brand_name: businessName,
          brand_url: businessUrl,
          business_category: targetAudience,
          niche: businessDescription,
          main_products: products ? [products] : null,
          analysis_status: 'pending'
        })
        .select()
        .single();

      if (brandError) {
        console.error("Brand analysis creation error:", brandError);
        throw new Error(`Failed to create brand analysis: ${brandError.message}`);
      }

      console.log("Brand analysis created successfully:", brandData);

      // Simulate analysis time
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Final verification before redirect
      const { data: finalVerify, error: verifyError } = await supabase
        .from('profiles')
        .select('onboarding_completed, business_name')
        .eq('user_id', session.user.id)
        .single();

      if (verifyError || !finalVerify?.onboarding_completed) {
        console.error("Final verification failed:", verifyError, finalVerify);
        throw new Error("Profile update verification failed. Please try again.");
      }

      console.log("Final verification successful - navigating to ZuckerBot:", finalVerify);

      toast({
        title: "Welcome aboard!",
        description: `Your ZuckerBot assistant has learned about ${businessName} and is ready to help.`,
      });

      // Don't call setIsAnalyzing(false) or setIsLoading(false) here to prevent state reset
      // Navigate immediately after successful verification
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

  const connectFacebook = () => {
    // For now, skip Facebook and go directly to business setup
    toast({
      title: "Skipping Facebook",
      description: "You can connect Facebook later. Let's set up your business first.",
    });
    setCurrentStep(2);
  };

  const skipFacebook = () => {
    setCurrentStep(2);
  };

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
                  <Button onClick={connectFacebook} className="w-full" size="lg">
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
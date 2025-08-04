import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { CompetitorFlow } from '@/pages/CompetitorFlow';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/Navbar";
import { useFacebookHealthCheck } from "@/hooks/useFacebookHealthCheck";

const CampaignFlow = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { requireHealthyConnection } = useFacebookHealthCheck();
  const [brandAnalysisId, setBrandAnalysisId] = useState<string>('');
  const [brandUrl, setBrandUrl] = useState<string>('');
  const [resumeDraftId, setResumeDraftId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadBrandContext = async () => {
      try {
        // Check for draft resume parameter
        const draftId = searchParams.get('resumeDraft');
        if (draftId) {
          setResumeDraftId(draftId);
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          navigate("/auth");
          return;
        }

        // Check ALL onboarding prerequisites
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed, facebook_connected, facebook_access_token, selected_ad_account_id')
          .eq('user_id', session.user.id)
          .single();

        if (!profile) {
          toast({
            title: "Profile Not Found",
            description: "Please complete your profile setup first.",
            variant: "destructive",
          });
          navigate("/onboarding");
          return;
        }

        // Block access if any onboarding prerequisites are missing
        const hasCompletedOnboarding = profile.onboarding_completed;
        const hasFacebookConnected = profile.facebook_connected && profile.facebook_access_token;
        const hasSelectedAdAccount = profile.selected_ad_account_id;

        if (!hasCompletedOnboarding || !hasFacebookConnected || !hasSelectedAdAccount) {
          console.log("CampaignFlow: Missing prerequisites, redirecting to onboarding", {
            onboarding_completed: hasCompletedOnboarding,
            facebook_connected: hasFacebookConnected,
            ad_account_selected: hasSelectedAdAccount
          });
          
          // Build recovery parameters to indicate what's missing
          const recoveryParams = new URLSearchParams();
          if (!hasFacebookConnected) recoveryParams.set('recovery', 'facebook');
          else if (!hasSelectedAdAccount) recoveryParams.set('recovery', 'ad_account');
          else recoveryParams.set('recovery', 'general');
          
          toast({
            title: "Setup Required",
            description: "Please complete your Facebook connection and ad account selection to create campaigns.",
            variant: "destructive",
          });
          
          navigate(`/onboarding?${recoveryParams.toString()}`);
          return;
        }

        // Validate Facebook token is still valid
        try {
          const tokenValidation = await fetch(
            `https://graph.facebook.com/v18.0/me?access_token=${profile.facebook_access_token}`
          );
          
          if (!tokenValidation.ok) {
            toast({
              title: "Facebook Connection Expired",
              description: "Your Facebook access has expired. Please reconnect to continue.",
              variant: "destructive",
            });
            navigate("/onboarding?recovery=facebook");
            return;
          }
        } catch (error) {
          console.error('Facebook token validation failed:', error);
          toast({
            title: "Facebook Connection Issue",
            description: "Unable to verify Facebook connection. Please reconnect.",
            variant: "destructive",
          });
          navigate("/onboarding?recovery=facebook");
          return;
        }

        // Load brand analysis data - check for completed analysis
        const { data: brandAnalysis, error } = await supabase
          .from('brand_analysis')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('analysis_status', 'completed')
          .eq('is_active', true)
          .maybeSingle();

        if (!brandAnalysis) {
          // No completed brand analysis found, redirect to onboarding or home
          toast({
            title: "Brand Analysis Required",
            description: "Please complete your brand analysis first to start creating campaigns.",
            variant: "destructive",
          });
          navigate("/onboarding");
          return;
        }

        // Final Facebook health check before proceeding
        const isFacebookHealthy = await requireHealthyConnection();
        if (!isFacebookHealthy) {
          return; // requireHealthyConnection handles the redirect
        }

        setBrandAnalysisId(brandAnalysis.id);
        setBrandUrl(brandAnalysis.brand_url || '');
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading brand context:', error);
        setIsLoading(false);
      }
    };

    loadBrandContext();
  }, [navigate, searchParams]);

  const handleFlowComplete = (competitorInsights?: any, selectedAngle?: any) => {
    // Handle different completion types
    if (selectedAngle?.type === 'save_and_exit') {
      navigate('/dashboard');
      return;
    }

    toast({
      title: "🎉 Campaign Complete!",
      description: "Your campaign has been successfully created and launched.",
    });
    
    // Navigate back to ZuckerBot after completion
    navigate('/zuckerbot');
  };

  const handleBackToZuckerBot = () => {
    navigate('/zuckerbot');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading campaign flow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Header with back button */}
      <div className="border-b border-border/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToZuckerBot}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to ZuckerBot
            </Button>
            <div className="h-6 w-px bg-border/50" />
            <h1 className="text-xl font-semibold">Campaign Creation Flow</h1>
          </div>
        </div>
      </div>

      {/* Campaign Flow */}
      <CompetitorFlow
        brandAnalysisId={brandAnalysisId}
        brandUrl={brandUrl}
        resumeDraftId={resumeDraftId}
        onFlowComplete={handleFlowComplete}
      />
    </div>
  );
};

export default CampaignFlow;
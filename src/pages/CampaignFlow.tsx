import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { WorkflowOrchestrator } from '@/components/WorkflowOrchestrator';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/Navbar";
import { FacebookConnector } from "@/components/FacebookConnector";

const CampaignFlow = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [brandAnalysisId, setBrandAnalysisId] = useState<string>('');
  const [brandUrl, setBrandUrl] = useState<string>('');
  const [resumeDraftId, setResumeDraftId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsFacebookConnection, setNeedsFacebookConnection] = useState(false);

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

        // MAJOR CHANGE: Only check if onboarding is completed
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

        // Check if onboarding is completed
        const hasCompletedOnboarding = profile.onboarding_completed;

        if (!hasCompletedOnboarding) {
          console.log("CampaignFlow: Onboarding not completed, redirecting to onboarding");
          navigate("/onboarding");
          return;
        }

        // MAJOR CHANGE: Check Facebook connection but don't block access
        const hasFacebookConnected = profile.facebook_connected && profile.facebook_access_token;
        
        if (!hasFacebookConnected) {
          console.log("CampaignFlow: Facebook not connected, showing connection prompt");
          setNeedsFacebookConnection(true);
          setIsLoading(false);
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

        // MAJOR CHANGE: Removed Facebook health check requirement

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

  // MAJOR CHANGE: Show Facebook connection prompt instead of blocking access
  if (needsFacebookConnection) {
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

        {/* Facebook Connection Required */}
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold">Facebook Connection Required</h2>
              <p className="text-muted-foreground text-lg">
                To create and manage Facebook ad campaigns, please connect your Facebook Business account.
              </p>
            </div>
            
            <FacebookConnector 
              onConnectionComplete={() => window.location.reload()} 
              title="Connect Facebook Business Account"
              description="This allows ZuckerBot to create and manage your Facebook ad campaigns."
              buttonText="Connect Facebook Business"
            />
            
            <div className="text-center">
              <Button variant="outline" onClick={handleBackToZuckerBot}>
                Go Back to ZuckerBot
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <WorkflowOrchestrator
      brandAnalysisId={brandAnalysisId}
      brandUrl={brandUrl}
      onFlowComplete={handleFlowComplete}
    />
  );
};

export default CampaignFlow;
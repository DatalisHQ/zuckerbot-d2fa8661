import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { CompetitorFlow } from '@/pages/CompetitorFlow';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CampaignFlow = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [brandAnalysisId, setBrandAnalysisId] = useState<string>('');
  const [brandUrl, setBrandUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadBrandContext = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          navigate("/auth");
          return;
        }

        // Load brand analysis data
        const { data: brandAnalysis, error } = await supabase
          .from('brand_analysis')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (brandAnalysis) {
          setBrandAnalysisId(brandAnalysis.id);
          setBrandUrl(brandAnalysis.brand_url || '');
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error loading brand context:', error);
        setIsLoading(false);
      }
    };

    loadBrandContext();
  }, [navigate]);

  const handleFlowComplete = () => {
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
        onFlowComplete={handleFlowComplete}
      />
    </div>
  );
};

export default CampaignFlow;
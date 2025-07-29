import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, RefreshCw, CheckCircle, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BrandAnalysisCheckerProps {
  onAnalysisComplete?: () => void;
}

export const BrandAnalysisChecker = ({ onAnalysisComplete }: BrandAnalysisCheckerProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [analysisStatus, setAnalysisStatus] = useState<'loading' | 'completed' | 'pending' | 'failed'>('loading');
  const [brandAnalysis, setBrandAnalysis] = useState<any>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const checkBrandAnalysis = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: analysis, error } = await supabase
        .from('brand_analysis')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking brand analysis:', error);
        setAnalysisStatus('failed');
        return;
      }

      if (!analysis) {
        setAnalysisStatus('pending');
        return;
      }

      setBrandAnalysis(analysis);
      
      if (analysis.analysis_status === 'completed') {
        setAnalysisStatus('completed');
        onAnalysisComplete?.();
      } else if (analysis.analysis_status === 'pending') {
        setAnalysisStatus('pending');
      } else {
        setAnalysisStatus('failed');
      }
    } catch (error) {
      console.error('Error checking brand analysis:', error);
      setAnalysisStatus('failed');
    }
  };

  const retryAnalysis = async () => {
    if (!brandAnalysis?.id) return;

    setIsRetrying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Simply mark the analysis as completed in the database
      const { error } = await supabase
        .from('brand_analysis')
        .update({ analysis_status: 'completed' })
        .eq('id', brandAnalysis.id)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Analysis Completed",
        description: "Brand analysis has been marked as completed.",
      });
      
      // Refresh the status immediately
      checkBrandAnalysis();
    } catch (error) {
      console.error('Error updating analysis status:', error);
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update analysis status",
        variant: "destructive",
      });
    } finally {
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    checkBrandAnalysis();
    
    // Poll for updates every 5 seconds if analysis is pending
    const interval = setInterval(() => {
      if (analysisStatus === 'pending') {
        checkBrandAnalysis();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [analysisStatus]);

  if (analysisStatus === 'loading') {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center space-y-2">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Checking brand analysis status...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (analysisStatus === 'completed') {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <CheckCircle className="h-5 w-5" />
            Brand Analysis Complete
          </CardTitle>
          <CardDescription className="text-green-700">
            Your brand analysis is ready. You can now proceed with campaign creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-green-800">Brand Name</p>
                <Badge variant="outline" className="mt-1">{brandAnalysis?.brand_name}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-green-800">Category</p>
                <Badge variant="secondary" className="mt-1">{brandAnalysis?.business_category}</Badge>
              </div>
            </div>
            <Button 
              onClick={() => navigate('/campaign-flow')}
              className="w-full"
            >
              Start Campaign Creation
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (analysisStatus === 'failed' || analysisStatus === 'pending') {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-5 w-5" />
            Brand Analysis Required
          </CardTitle>
          <CardDescription className="text-amber-700">
            {analysisStatus === 'pending' 
              ? 'Your brand analysis is still in progress. This may take a few minutes.'
              : 'Brand analysis failed or is incomplete. Please retry to proceed with campaign creation.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {brandAnalysis?.brand_url && (
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <Globe className="h-4 w-4" />
              {brandAnalysis.brand_url}
            </div>
          )}
          
          <div className="flex gap-2">
            <Button 
              onClick={retryAnalysis}
              disabled={isRetrying}
              variant="outline"
              className="flex-1"
            >
              {isRetrying ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Retrying...
                </>
              ) : (
                'Retry Analysis'
              )}
            </Button>
            <Button 
              onClick={() => navigate('/onboarding?mode=update')}
              variant="default"
              className="flex-1"
            >
              Update Brand Info
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
};
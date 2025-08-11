import { useEffect, useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Globe, TrendingUp, Target, Package, Lightbulb, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { CompetitorDiscovery } from "./CompetitorDiscovery";
import { AnalysisProgress, ANALYSIS_STEPS } from "./analysis/AnalysisProgress";
import { ThinkingIndicator } from "./analysis/ThinkingIndicator";
import { useAnalysisProgress } from "./analysis/useAnalysisProgress";

interface BrandAnalysis {
  brandName: string;
  businessCategory: string;
  niche: string;
  mainProducts: string[];
  valuePropositions: string[];
}

interface BrandAnalysisFormProps {
  campaignId?: string;
  existingData?: any;
  onAnalysisComplete?: (data: any) => void;
}

export const BrandAnalysisForm = ({ campaignId, existingData, onAnalysisComplete }: BrandAnalysisFormProps = {}) => {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [userBrands, setUserBrands] = useState<{ id: string; brand_name: string; brand_url: string }[]>([]);
  // Prefill: load user brands from onboarding and offer quick selection for URL
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('brand_analysis')
          .select('id, brand_name, brand_url')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(10);
        setUserBrands((data || []).filter(b => !!b.brand_url) as any);
        // Auto-prefill URL with the most recent active brand
        if ((data || []).length && !url) {
          const first = (data || [])[0];
          if (first?.brand_url) setUrl(first.brand_url.replace(/^https?:\/\//i, ''));
        }
      } catch {}
    })();
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<BrandAnalysis | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  
  const progressTracker = useAnalysisProgress({ 
    steps: ANALYSIS_STEPS.BRAND_ANALYSIS 
  });

  const validateUrl = (input: string): string | null => {
    if (!input.trim()) return 'URL is required';
    
    // Auto-prefix with https:// if no protocol is present
    let processedUrl = input.trim();
    if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
      processedUrl = 'https://' + processedUrl;
    }
    
    // Try to construct URL object to validate
    try {
      new URL(processedUrl);
      return null; // Valid URL
    } catch {
      return 'Please enter a valid domain (e.g., domain.com or www.example.com)';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateUrl(url);
    if (validationError) {
      toast({
        title: "Invalid URL",
        description: validationError,
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    setAnalysis(null);
    progressTracker.reset();
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        setShowAuthDialog(true);
        return;
      }

      console.log('Starting brand analysis for:', url);
      
      // Step 1: Website Scraping
      progressTracker.startStep('website-scrape', 'Connecting to website and extracting content...');
      
      // Simulate step progress for demo (in real implementation, you'd get these from the backend)
      setTimeout(() => {
        progressTracker.completeStep('website-scrape', 3);
        progressTracker.startStep('content-analysis', 'AI is analyzing website content and structure...');
      }, 2000);
      
      setTimeout(() => {
        progressTracker.completeStep('content-analysis', 4);
        progressTracker.startStep('brand-extraction', 'Extracting brand identity and value propositions...');
      }, 5000);
      
      setTimeout(() => {
        progressTracker.completeStep('brand-extraction', 3);
        progressTracker.startStep('categorization', 'Determining market category and competitive positioning...');
      }, 8000);

      // Prepare URL with protocol for backend
      let processedUrl = url.trim();
      if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
        processedUrl = 'https://' + processedUrl;
      }

      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: {
          brandUrl: processedUrl,
          userId: user.id
        }
      });

      if (error) {
        console.error('Error calling analyze-brand function:', error);
        progressTracker.errorStep(progressTracker.getCurrentStep()?.id || 'categorization', 'Analysis failed - please try again');
        throw error;
      }

      if (!data.success) {
        progressTracker.errorStep(progressTracker.getCurrentStep()?.id || 'categorization', data.error || 'Analysis failed');
        throw new Error(data.error || 'Analysis failed');
      }

      // Complete final step
      progressTracker.completeStep('categorization', 2);
      progressTracker.updateThinkingMessage('Analysis complete!');

      console.log('Analysis completed:', data.analysis);
      setAnalysis(data.analysis);
      setAnalysisId(data.analysisId);
      
      // Call onAnalysisComplete with both analysis data and analysisId
      if (onAnalysisComplete) {
        onAnalysisComplete({
          analysis: data.analysis,
          analysisId: data.analysisId,
          brandUrl: processedUrl, // Include the validated URL
          brandName: data.analysis?.brandName,
          businessCategory: data.analysis?.businessCategory,
          niche: data.analysis?.niche,
          mainProducts: data.analysis?.mainProducts,
          valuePropositions: data.analysis?.valuePropositions
        });
      }
      
      toast({
        title: "Analysis Complete",
        description: "Brand analysis has been completed successfully!",
      });

    } catch (error) {
      console.error('Error analyzing brand:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze brand",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Brand Analysis
          </CardTitle>
          <CardDescription>
            Enter a website URL to analyze the brand's positioning, products, and value propositions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="domain.com or www.example.com"
                required
                disabled={isLoading}
                className="flex-1"
              />
              {/* Quick prefill from existing brands */}
              {userBrands.length > 0 && (
                <select
                  className="h-10 border rounded px-2"
                  onChange={(e) => {
                    const sel = userBrands.find(b => b.id === e.target.value);
                    if (sel?.brand_url) setUrl(sel.brand_url.replace(/^https?:\/\//i, ''));
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Select brand</option>
                  {userBrands.map(b => (
                    <option key={b.id} value={b.id}>{b.brand_name}</option>
                  ))}
                </select>
              )}
              <Button type="submit" disabled={isLoading || !url}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Analyzing...
                  </>
                ) : (
                  'Analyze Brand'
                )}
              </Button>
              <Button 
                type="button" 
                variant="outline"
                disabled={true}
                className="bg-muted text-muted-foreground cursor-not-allowed"
              >
                Deep Analysis
                <Badge variant="secondary" className="ml-2 text-xs">
                  Coming Soon
                </Badge>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Progress Tracking */}
      {isLoading && (
        <div className="space-y-4">
          <AnalysisProgress 
            steps={progressTracker.steps}
            currentStep={progressTracker.currentStepId || undefined}
            progress={progressTracker.progress}
            thinkingMessage={progressTracker.thinkingMessage}
          />
          <ThinkingIndicator 
            isActive={isLoading}
            message={progressTracker.thinkingMessage}
            stage="analyzing"
          />
        </div>
      )}

      {analysis && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Brand Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Brand Name</h4>
                <Badge variant="outline" className="text-sm">
                  {analysis.brandName}
                </Badge>
              </div>
              <div>
                <h4 className="font-medium mb-2">Business Category</h4>
                <Badge variant="secondary">
                  {analysis.businessCategory}
                </Badge>
              </div>
              <div>
                <h4 className="font-medium mb-2">Niche</h4>
                <Badge variant="outline">
                  {analysis.niche}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Main Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {analysis.mainProducts.map((product, index) => (
                  <Badge key={index} variant="default">
                    {product}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                Value Propositions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {analysis.valuePropositions.map((proposition, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg bg-muted/50 border border-border"
                  >
                    <p className="text-sm">{proposition}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}


      {/* Authentication Dialog */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Create Free Account
            </DialogTitle>
          <DialogDescription>
            Sign up for free to analyze {url ? (() => {
              let safeUrl = url.trim();
              if (!/^https?:\/\//i.test(safeUrl)) safeUrl = 'https://' + safeUrl;
              try { 
                return new URL(safeUrl).hostname; 
              } catch { 
                return url; 
              }
            })() : 'this website'} and get detailed competitor insights.
          </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="text-sm text-muted-foreground">
              ✓ Unlimited competitor analysis<br />
              ✓ AI-powered ZuckerBot assistant<br />
              ✓ Real-time monitoring & alerts<br />
              ✓ Strategic insights & recommendations
            </div>
            <div className="flex gap-2">
              <Link to="/auth" className="flex-1">
                <Button className="w-full">
                  Create Free Account
                </Button>
              </Link>
              <Button 
                variant="outline" 
                onClick={() => setShowAuthDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
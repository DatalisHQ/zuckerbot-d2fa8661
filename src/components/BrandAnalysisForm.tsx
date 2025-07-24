import { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Globe, TrendingUp, Target, Package, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BrandAnalysis {
  brandName: string;
  businessCategory: string;
  niche: string;
  mainProducts: string[];
  valuePropositions: string[];
}

export const BrandAnalysisForm = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<BrandAnalysis | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAnalysis(null);
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to analyze brands",
          variant: "destructive",
        });
        return;
      }

      console.log('Starting brand analysis for:', url);
      
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: {
          brandUrl: url,
          userId: user.id
        }
      });

      if (error) {
        console.error('Error calling analyze-brand function:', error);
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Analysis failed');
      }

      console.log('Analysis completed:', data.analysis);
      setAnalysis(data.analysis);
      
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
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                required
                disabled={isLoading}
                className="flex-1"
              />
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
            </div>
          </form>
        </CardContent>
      </Card>

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
    </div>
  );
};
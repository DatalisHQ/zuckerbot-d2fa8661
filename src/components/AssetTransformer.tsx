import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wand2, CheckCircle, AlertCircle } from 'lucide-react';
import { useTransformAssets, type TransformedAsset } from '@/hooks/useTransformAssets';
import { useToast } from '@/hooks/use-toast';

interface AssetTransformerProps {
  brandUrl: string;
  rawAssets: string[];
  competitorProfiles: { 
    name?: string;
    valueProps?: string[];
    toneProfile?: string;
  }[];
  onTransformComplete: (transformedAssets: TransformedAsset[]) => void;
}

export const AssetTransformer = ({ 
  brandUrl, 
  rawAssets, 
  competitorProfiles, 
  onTransformComplete 
}: AssetTransformerProps) => {
  const [transformedAssets, setTransformedAssets] = useState<TransformedAsset[]>([]);
  const transformMutation = useTransformAssets();
  const { toast } = useToast();

  // Auto-trigger transformation when component mounts with valid data
  useEffect(() => {
    if (rawAssets.length > 0 && brandUrl && !transformMutation.isSuccess && !transformMutation.isPending) {
      handleTransform();
    }
  }, [rawAssets, brandUrl]);

  // Handle successful transformation
  useEffect(() => {
    if (transformMutation.isSuccess && transformMutation.data) {
      const assets = transformMutation.data.transformedAssets;
      setTransformedAssets(assets);
      onTransformComplete(assets);
      
      const { summary } = transformMutation.data;
      toast({
        title: "Assets transformed!",
        description: `Created ${summary.successfulTransforms} transformed variants from ${summary.totalAssets} assets`,
      });
    }
  }, [transformMutation.isSuccess, transformMutation.data, onTransformComplete, toast]);

  // Handle transformation errors
  useEffect(() => {
    if (transformMutation.isError) {
      toast({
        title: "Transformation failed",
        description: "Using original assets as fallback",
        variant: "destructive",
      });
      
      // Fallback to original assets
      const fallbackAssets = rawAssets.map((url, i) => ({
        assetId: `fallback_${i}`,
        variantUrls: [url],
        headline: 'Original Asset',
        originalUrl: url
      }));
      
      setTransformedAssets(fallbackAssets);
      onTransformComplete(fallbackAssets);
    }
  }, [transformMutation.isError, transformMutation.error, rawAssets, onTransformComplete, toast]);

  const handleTransform = () => {
    if (rawAssets.length === 0) {
      toast({
        title: "No assets to transform",
        description: "Please add some assets first",
        variant: "destructive",
      });
      return;
    }

    transformMutation.mutate({
      brandUrl,
      rawAssets,
      competitorProfiles
    });
  };

  const handleRetry = () => {
    setTransformedAssets([]);
    transformMutation.reset();
    handleTransform();
  };

  const getStatusIcon = () => {
    if (transformMutation.isPending) return <Loader2 className="h-5 w-5 animate-spin" />;
    if (transformMutation.isSuccess) return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (transformMutation.isError) return <AlertCircle className="h-5 w-5 text-red-500" />;
    return <Wand2 className="h-5 w-5" />;
  };

  const getStatusText = () => {
    if (transformMutation.isPending) return "Transforming assets with AI...";
    if (transformMutation.isSuccess) return "Assets transformed successfully!";
    if (transformMutation.isError) return "Transformation failed - using originals";
    return "Ready to transform assets";
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon()}
          AI Asset Transformer
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {getStatusText()}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Status and Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Badge variant={transformMutation.isSuccess ? "default" : "secondary"}>
              {rawAssets.length} Raw Assets
            </Badge>
            {transformedAssets.length > 0 && (
              <Badge variant="default">
                {transformedAssets.reduce((total, asset) => total + asset.variantUrls.length, 0)} Variants Created
              </Badge>
            )}
          </div>
          
          {!transformMutation.isPending && (
            <Button 
              onClick={transformMutation.isSuccess ? handleRetry : handleTransform}
              disabled={rawAssets.length === 0}
              variant={transformMutation.isError ? "destructive" : "default"}
            >
              {transformMutation.isError ? "Retry Transform" : 
               transformMutation.isSuccess ? "Transform Again" : "Transform Assets"}
            </Button>
          )}
        </div>

        {/* Loading State */}
        {transformMutation.isPending && (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              AI is cropping, formatting, and adding headlines to your assets...
              <br />
              This may take 1-2 minutes for {rawAssets.length} assets.
            </p>
          </div>
        )}

        {/* Transformed Assets Preview */}
        {transformedAssets.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-semibold">Transformed Assets Preview</h4>
            <div className="grid gap-6">
              {transformedAssets.map((asset) => (
                <Card key={asset.assetId} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-medium">Asset {asset.assetId}</h5>
                      <Badge variant="outline">{asset.headline}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {asset.variantUrls.map((url, i) => (
                        <div key={i} className="space-y-2">
                          <img 
                            src={url} 
                            alt={`${asset.headline} - Variant ${i + 1}`}
                            className="w-full h-32 object-cover rounded border"
                          />
                          <p className="text-xs text-center text-muted-foreground">
                            {i === 0 ? '1:1 Square' : i === 1 ? '4:5 Portrait' : '16:9 Landscape'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {transformMutation.isError && (
          <div className="text-center py-4 text-red-600">
            <AlertCircle className="h-6 w-6 mx-auto mb-2" />
            <p className="text-sm">
              Transformation failed: {transformMutation.error?.message}
              <br />
              Using original assets as fallback.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
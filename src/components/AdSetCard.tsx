import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Save, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface AdSet {
  id?: string;
  set_name: string;
  framework_used: string;
  primary_text: string;
  headline: string;
  call_to_action: string;
  creative_concept: string;
  campaign_id?: string;
  is_saved?: boolean;
}

interface AdSetCardProps {
  adSet: AdSet;
  onRegenerate?: (adSet: AdSet) => void;
  onSave?: (adSet: AdSet) => void;
}

export const AdSetCard = ({ adSet, onRegenerate, onSave }: AdSetCardProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(adSet.is_saved || false);
  const { toast } = useToast();

  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${type} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!adSet.campaign_id) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('ad_sets')
        .update({ is_saved: true })
        .eq('id', adSet.id);

      if (error) throw error;

      setIsSaved(true);
      toast({
        title: "Saved!",
        description: "Ad set saved to your library",
      });
      
      onSave?.(adSet);
    } catch (error) {
      console.error('Error saving ad set:', error);
      toast({
        title: "Error",
        description: "Failed to save ad set",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate(adSet);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{adSet.set_name}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {adSet.framework_used}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Headline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">Headline</label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(adSet.headline, "Headline")}
              className="h-6 w-6 p-0"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-sm font-semibold border rounded-md p-2 bg-muted/50">
            {adSet.headline}
          </p>
        </div>

        {/* Primary Text */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">Primary Text</label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(adSet.primary_text, "Primary text")}
              className="h-6 w-6 p-0"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-sm border rounded-md p-2 bg-muted/50 leading-relaxed">
            {adSet.primary_text}
          </p>
        </div>

        {/* Call to Action */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Call to Action</label>
          <Badge variant="outline" className="text-xs">
            {adSet.call_to_action}
          </Badge>
        </div>

        {/* Creative Concept */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Creative Concept</label>
          <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/30 italic">
            {adSet.creative_concept}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={isLoading}
            className="flex-1"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Regenerate
          </Button>
          
          {adSet.campaign_id && (
            <Button
              variant={isSaved ? "secondary" : "default"}
              size="sm"
              onClick={handleSave}
              disabled={isLoading || isSaved}
              className="flex-1"
            >
              <Save className="h-3 w-3 mr-1" />
              {isSaved ? "Saved" : "Save"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Search, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Competitor {
  name: string;
  url?: string;
}

interface CompetitorInputProps {
  onCompetitorListCreated: (competitorListId: string) => void;
  brandAnalysisId?: string;
}

export const CompetitorInput = ({ onCompetitorListCreated, brandAnalysisId }: CompetitorInputProps) => {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [newCompetitorName, setNewCompetitorName] = useState('');
  const [newCompetitorUrl, setNewCompetitorUrl] = useState('');
  const [isAutoFinding, setIsAutoFinding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const addCompetitor = () => {
    if (!newCompetitorName.trim()) return;
    
    if (competitors.length >= 5) {
      toast({
        title: "Maximum competitors reached",
        description: "You can add up to 5 competitors.",
        variant: "destructive",
      });
      return;
    }

    const newCompetitor: Competitor = {
      name: newCompetitorName.trim(),
      url: newCompetitorUrl.trim() || undefined
    };

    setCompetitors([...competitors, newCompetitor]);
    setNewCompetitorName('');
    setNewCompetitorUrl('');
  };

  const removeCompetitor = (index: number) => {
    setCompetitors(competitors.filter((_, i) => i !== index));
  };

  const autoFindCompetitors = async () => {
    if (!brandAnalysisId) {
      toast({
        title: "Error",
        description: "Brand analysis required for auto-discovery",
        variant: "destructive",
      });
      return;
    }

    setIsAutoFinding(true);
    try {
      const { data, error } = await supabase.functions.invoke('discover-competitors', {
        body: { brandAnalysisId, userId: (await supabase.auth.getUser()).data.user?.id }
      });

      if (error) throw error;

      if (data.discovered_competitors) {
        const autoCompetitors = data.discovered_competitors.slice(0, 5).map((comp: any) => ({
          name: comp.name,
          url: comp.website
        }));
        setCompetitors(autoCompetitors);
        toast({
          title: "Competitors found!",
          description: `Found ${autoCompetitors.length} potential competitors.`,
        });
      }
    } catch (error) {
      console.error('Error auto-finding competitors:', error);
      toast({
        title: "Auto-discovery failed",
        description: "Please add competitors manually.",
        variant: "destructive",
      });
    } finally {
      setIsAutoFinding(false);
    }
  };

  const saveCompetitorList = async () => {
    if (competitors.length === 0) {
      toast({
        title: "No competitors added",
        description: "Please add at least one competitor.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('competitor_lists')
        .insert({
          user_id: user.data.user.id,
          brand_analysis_id: brandAnalysisId,
          competitors: competitors as any,
          auto_generated: false
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Competitors saved!",
        description: "Moving to competitor analysis...",
      });

      onCompetitorListCreated(data.id);
    } catch (error) {
      console.error('Error saving competitor list:', error);
      toast({
        title: "Error saving competitors",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Would you like to analyze competitors?</CardTitle>
          <p className="text-sm text-muted-foreground">
            Competitor analysis helps us create more effective ads by understanding what works in your market. You can add up to 5 competitors or skip this step.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Auto-find section */}
          <div className="flex gap-2">
            <Button 
              onClick={autoFindCompetitors} 
              disabled={isAutoFinding || competitors.length > 0}
              variant="outline"
              className="flex items-center gap-2"
            >
              {isAutoFinding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {isAutoFinding ? 'Finding competitors...' : 'Auto-find competitors'}
            </Button>
            <span className="text-sm text-muted-foreground self-center">or add manually below</span>
          </div>

          {/* Manual input section */}
          <div className="space-y-3">
            <Input
              placeholder="Competitor name (required)"
              value={newCompetitorName}
              onChange={(e) => setNewCompetitorName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCompetitor()}
            />
            <Input
              placeholder="Website URL (optional)"
              value={newCompetitorUrl}
              onChange={(e) => setNewCompetitorUrl(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCompetitor()}
            />
            <Button 
              onClick={addCompetitor} 
              disabled={!newCompetitorName.trim() || competitors.length >= 5}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Competitor ({competitors.length}/5)
            </Button>
          </div>

          {/* Competitors list */}
          {competitors.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Added Competitors:</h4>
              <div className="space-y-2">
                {competitors.map((competitor, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{competitor.name}</div>
                      {competitor.url && (
                        <div className="text-sm text-muted-foreground">{competitor.url}</div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCompetitor(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4">
            <Button 
              onClick={saveCompetitorList}
              disabled={competitors.length === 0 || isSaving}
              className="w-full"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Analyze Competitors ({competitors.length})
            </Button>
            
            <Button 
              onClick={() => onCompetitorListCreated('skip')}
              variant="outline"
              className="w-full"
            >
              Skip & Create Ads Now
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground text-center">
            Tip: Competitor analysis usually leads to 2-3x better performing ads
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
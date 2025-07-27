import { useState } from 'react';
import { CompetitorInput } from '@/components/CompetitorInput';
import { CompetitorInsights } from '@/components/CompetitorInsights';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CompetitorFlowProps {
  brandAnalysisId?: string;
  onFlowComplete: (competitorInsights: any, selectedAngle: any) => void;
}

export const CompetitorFlow = ({ brandAnalysisId, onFlowComplete }: CompetitorFlowProps) => {
  const [currentStep, setCurrentStep] = useState<'input' | 'insights'>('input');
  const [competitorListId, setCompetitorListId] = useState<string>('');
  const { toast } = useToast();

  const handleCompetitorListCreated = (listId: string) => {
    if (listId === 'skip') {
      // User chose to skip competitor research
      onFlowComplete(null, { type: 'skip', description: 'User chose to skip competitor research' });
      return;
    }
    
    setCompetitorListId(listId);
    setCurrentStep('insights');
  };

  const handleAngleSelected = async (selectedAngle: any, insights: any) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      // Save selected angle to database
      const { error } = await supabase
        .from('selected_angles')
        .insert({
          user_id: user.data.user.id,
          brand_analysis_id: brandAnalysisId,
          competitor_list_id: competitorListId,
          angle_type: selectedAngle.type,
          angle_description: selectedAngle.description,
          competitor_insights: insights
        });

      if (error) throw error;

      toast({
        title: "Angle selected!",
        description: "Proceeding to generate your ads with this strategy.",
      });

      // Pass data back to parent component
      onFlowComplete(insights, selectedAngle);
    } catch (error) {
      console.error('Error saving selected angle:', error);
      toast({
        title: "Error saving angle",
        description: "Proceeding anyway...",
        variant: "destructive",
      });
      
      // Still proceed even if saving fails
      onFlowComplete(insights, selectedAngle);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {currentStep === 'input' && (
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Competitor Research</h1>
            <p className="text-muted-foreground">
              Let's analyze your competition to find winning ad angles
            </p>
          </div>
          <CompetitorInput 
            onCompetitorListCreated={handleCompetitorListCreated}
            brandAnalysisId={brandAnalysisId}
          />
        </div>
      )}

      {currentStep === 'insights' && competitorListId && (
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Competitor Insights</h1>
            <p className="text-muted-foreground">
              Review the analysis and choose your marketing angle
            </p>
          </div>
          <CompetitorInsights 
            competitorListId={competitorListId}
            onAngleSelected={handleAngleSelected}
          />
        </div>
      )}
    </div>
  );
};
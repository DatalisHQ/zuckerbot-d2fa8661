import { useState } from 'react';
import { CompetitorInput } from '@/components/CompetitorInput';
import { CompetitorInsights } from '@/components/CompetitorInsights';
import { RawAssetCollector } from '@/components/RawAssetCollector';
import { CampaignSettings, CampaignSettings as CampaignSettingsType } from '@/components/CampaignSettings';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { type AudienceSegment } from '@/components/AudienceSegments';

interface CompetitorFlowProps {
  brandAnalysisId?: string;
  brandUrl?: string;
  onFlowComplete: (competitorInsights: any, selectedAngle: any, audienceSegments?: AudienceSegment[], campaignSettings?: CampaignSettingsType, rawAssets?: string[]) => void;
}

export const CompetitorFlow = ({ brandAnalysisId, brandUrl, onFlowComplete }: CompetitorFlowProps) => {
  const [currentStep, setCurrentStep] = useState<'input' | 'insights' | 'assets' | 'campaign-settings'>('input');
  const [competitorListId, setCompetitorListId] = useState<string>('');
  const [selectedAudienceSegments, setSelectedAudienceSegments] = useState<AudienceSegment[]>([]);
  const [competitorInsights, setCompetitorInsights] = useState<any>(null);
  const [selectedAngle, setSelectedAngle] = useState<any>(null);
  const [competitorProfiles, setCompetitorProfiles] = useState<any[]>([]);
  const [rawAssets, setRawAssets] = useState<string[]>([]);
  const { toast } = useToast();

  const handleCompetitorListCreated = (listId: string) => {
    if (listId === 'skip') {
      // User chose to skip competitor research
      onFlowComplete(null, { type: 'skip', description: 'User chose to skip competitor research' }, []);
      return;
    }
    
    setCompetitorListId(listId);
    setCurrentStep('insights');
  };

  const handleAudienceSelected = (segments: AudienceSegment[]) => {
    setSelectedAudienceSegments(segments);
  };

  const handleAngleSelected = async (selectedAngle: any, insights: any, profiles: any[] = []) => {
    // Store data and move to asset collection
    setCompetitorInsights(insights);
    setSelectedAngle(selectedAngle);
    setCompetitorProfiles(profiles);
    
    toast({
      title: "Strategy selected!",
      description: "Now let's collect your raw assets.",
    });
    
    setCurrentStep('assets');
  };

  const handleAssetsSelected = (assets: string[]) => {
    setRawAssets(assets);
  };

  const handleAssetsComplete = () => {
    toast({
      title: "Assets collected!",
      description: "Now let's configure your campaign settings.",
    });
    
    setCurrentStep('campaign-settings');
  };

  const handleCampaignSettingsComplete = async (campaignSettings: CampaignSettingsType) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      // Save selected angle and campaign settings to database
      const { error } = await supabase
        .from('selected_angles')
        .insert({
          user_id: user.data.user.id,
          brand_analysis_id: brandAnalysisId,
          competitor_list_id: competitorListId,
          angle_type: selectedAngle.type,
          angle_description: selectedAngle.description,
          competitor_insights: competitorInsights,
          audience_segments: selectedAudienceSegments,
          campaign_settings: campaignSettings
        });

      if (error) throw error;

      toast({
        title: "Campaign configured!",
        description: "Proceeding to generate your ads.",
      });

      // Pass all data back to parent component
      onFlowComplete(competitorInsights, selectedAngle, selectedAudienceSegments, campaignSettings, rawAssets);
    } catch (error) {
      console.error('Error saving campaign settings:', error);
      toast({
        title: "Error saving settings",
        description: "Proceeding anyway...",
        variant: "destructive",
      });
      
      // Still proceed even if saving fails
      onFlowComplete(competitorInsights, selectedAngle, selectedAudienceSegments, campaignSettings, rawAssets);
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
            brandUrl={brandUrl}
            onAngleSelected={handleAngleSelected}
            onAudienceSelected={handleAudienceSelected}
          />
        </div>
      )}

      {currentStep === 'assets' && (
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Asset Collection</h1>
            <p className="text-muted-foreground">
              Upload images, add URLs, or fetch from Facebook Creative Library
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <RawAssetCollector onAssetsChange={handleAssetsSelected} />
            <div className="flex justify-center mt-6">
              <button 
                onClick={handleAssetsComplete}
                className="bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors"
              >
                Continue to Campaign Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {currentStep === 'campaign-settings' && (
        <div className="container mx-auto px-4 py-8">
          <CampaignSettings
            brandUrl={brandUrl || ''}
            competitorProfiles={competitorProfiles}
            selectedSegments={selectedAudienceSegments}
            onSettingsComplete={handleCampaignSettingsComplete}
          />
        </div>
      )}
    </div>
  );
};
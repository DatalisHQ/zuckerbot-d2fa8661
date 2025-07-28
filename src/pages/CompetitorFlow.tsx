import { useState } from 'react';
import { CompetitorInput } from '@/components/CompetitorInput';
import { CompetitorInsights } from '@/components/CompetitorInsights';
import { RawAssetCollector } from '@/components/RawAssetCollector';
import { AssetTransformer } from '@/components/AssetTransformer';
import { CampaignSettings, CampaignSettings as CampaignSettingsType } from '@/components/CampaignSettings';
import { CampaignLauncher } from '@/components/CampaignLauncher';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBuildCampaign } from '@/hooks/useBuildCampaign';
import { type AudienceSegment } from '@/components/AudienceSegments';
import { type TransformedAsset } from '@/hooks/useTransformAssets';

interface CompetitorFlowProps {
  brandAnalysisId?: string;
  brandUrl?: string;
  onFlowComplete: (competitorInsights: any, selectedAngle: any, audienceSegments?: AudienceSegment[], campaignSettings?: CampaignSettingsType, rawAssets?: string[], transformedAssets?: TransformedAsset[], campaignConfig?: any) => void;
}

export const CompetitorFlow = ({ brandAnalysisId, brandUrl, onFlowComplete }: CompetitorFlowProps) => {
  const [currentStep, setCurrentStep] = useState<'input' | 'insights' | 'assets' | 'transform' | 'campaign-settings' | 'launch'>('input');
  const [competitorListId, setCompetitorListId] = useState<string>('');
  const [selectedAudienceSegments, setSelectedAudienceSegments] = useState<AudienceSegment[]>([]);
  const [competitorInsights, setCompetitorInsights] = useState<any>(null);
  const [selectedAngle, setSelectedAngle] = useState<any>(null);
  const [competitorProfiles, setCompetitorProfiles] = useState<any[]>([]);
  const [rawAssets, setRawAssets] = useState<string[]>([]);
  const [transformedAssets, setTransformedAssets] = useState<TransformedAsset[]>([]);
  const [campaignSettings, setCampaignSettings] = useState<CampaignSettingsType | null>(null);
  const [campaignConfig, setCampaignConfig] = useState<any>(null);
  const buildCampaignMutation = useBuildCampaign();
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
      description: "Now let's transform them with AI.",
    });
    
    setCurrentStep('transform');
  };

  const handleTransformComplete = (assets: TransformedAsset[]) => {
    setTransformedAssets(assets);
  };

  const handleTransformFinished = () => {
    toast({
      title: "Assets transformed!",
      description: "Now let's configure your campaign settings.",
    });
    
    setCurrentStep('campaign-settings');
  };

  const handleCampaignSettingsComplete = async (settings: CampaignSettingsType) => {
    try {
      setCampaignSettings(settings);
      
      // Build the campaign configuration
      const config = await buildCampaignMutation.mutateAsync({
        brandUrl: brandUrl || '',
        competitorProfiles,
        selectedSegments: selectedAudienceSegments,
        campaignGoal: settings.campaignGoal,
        budget: settings.budget,
        audienceType: settings.audienceType,
        geos: settings.geos,
        lookbackDays: settings.lookbackDays,
        placements: settings.placements
      });

      setCampaignConfig(config);

      toast({
        title: "Campaign built!",
        description: "Ready to launch on Facebook.",
      });

      setCurrentStep('launch');
    } catch (error) {
      console.error('Error building campaign:', error);
      toast({
        title: "Error building campaign",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLaunchComplete = (result: any) => {
    // Log the successful launch
    console.log('Campaign launched successfully:', result);

    toast({
      title: "🎉 Campaign Launched!",
      description: `Your campaign is now live in Facebook Ads Manager`,
    });

    // Complete the flow
    onFlowComplete(
      competitorInsights, 
      selectedAngle, 
      selectedAudienceSegments, 
      campaignSettings, 
      rawAssets, 
      transformedAssets,
      campaignConfig
    );
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
                Continue to Transform Assets
              </button>
            </div>
          </div>
        </div>
      )}

      {currentStep === 'transform' && (
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">AI Asset Transformation</h1>
            <p className="text-muted-foreground">
              Creating ad-ready variants with cropping, formatting, and headline overlays
            </p>
          </div>
          <div className="max-w-6xl mx-auto">
            <AssetTransformer
              brandUrl={brandUrl || ''}
              rawAssets={rawAssets}
              competitorProfiles={competitorProfiles}
              onTransformComplete={handleTransformComplete}
            />
            <div className="flex justify-center mt-6">
              <button 
                onClick={handleTransformFinished}
                disabled={transformedAssets.length === 0}
                className="bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

      {currentStep === 'launch' && campaignConfig && (
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Launch Campaign</h1>
            <p className="text-muted-foreground">
              Deploy your campaign to Facebook Ads Manager
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <CampaignLauncher
              campaignConfig={campaignConfig}
              onLaunchComplete={handleLaunchComplete}
            />
          </div>
        </div>
      )}
    </div>
  );
};
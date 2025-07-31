import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { CompetitorInput } from '@/components/CompetitorInput';
import { CompetitorInsights } from '@/components/CompetitorInsights';
import { RawAssetCollector } from '@/components/RawAssetCollector';
import { AssetTransformer } from '@/components/AssetTransformer';
import { CampaignSettings, CampaignSettings as CampaignSettingsType } from '@/components/CampaignSettings';
import { CampaignLauncher } from '@/components/CampaignLauncher';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBuildCampaign } from '@/hooks/useBuildCampaign';
import { useCampaignDrafts } from '@/hooks/useCampaignDrafts';
import { type AudienceSegment } from '@/components/AudienceSegments';
import { type TransformedAsset } from '@/hooks/useTransformAssets';

interface CompetitorFlowProps {
  brandAnalysisId?: string;
  brandUrl?: string;
  resumeDraftId?: string;
  onFlowComplete: (competitorInsights: any, selectedAngle: any, audienceSegments?: AudienceSegment[], campaignSettings?: CampaignSettingsType, rawAssets?: string[], transformedAssets?: TransformedAsset[], campaignConfig?: any) => void;
}

export const CompetitorFlow = ({ brandAnalysisId, brandUrl, resumeDraftId, onFlowComplete }: CompetitorFlowProps) => {
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
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(resumeDraftId || null);
  const [campaignName, setCampaignName] = useState<string>('');
  const buildCampaignMutation = useBuildCampaign();
  const { saveDraft } = useCampaignDrafts();
  const { toast } = useToast();

  // Load draft data on mount if resuming
  useEffect(() => {
    if (resumeDraftId) {
      loadDraftData(resumeDraftId);
    }
  }, [resumeDraftId]);

  const loadDraftData = async (draftId: string) => {
    try {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('id', draftId)
        .single();

      if (error) throw error;

      // Restore state from draft
      setCampaignName(data.campaign_name);
      setCurrentStep(getStepFromNumber(data.current_step));
      
      if (data.draft_data && typeof data.draft_data === 'object') {
        const draftData = data.draft_data as any;
        setCompetitorListId(draftData.competitorListId || '');
        setSelectedAudienceSegments(draftData.selectedAudienceSegments || []);
        setCompetitorInsights(draftData.competitorInsights);
        setSelectedAngle(draftData.selectedAngle);
        setCompetitorProfiles(draftData.competitorProfiles || []);
        setRawAssets(draftData.rawAssets || []);
        setTransformedAssets(draftData.transformedAssets || []);
        setCampaignSettings(draftData.campaignSettings);
        setCampaignConfig(draftData.campaignConfig);
      }

      toast({
        title: "Draft loaded",
        description: `Resuming "${data.campaign_name}" from ${getStepName(data.current_step)}.`,
      });
    } catch (error) {
      console.error('Error loading draft:', error);
      toast({
        title: "Error loading draft",
        description: "Failed to load draft data. Starting fresh.",
        variant: "destructive",
      });
    }
  };

  const getStepFromNumber = (stepNumber: number): 'input' | 'insights' | 'assets' | 'transform' | 'campaign-settings' | 'launch' => {
    const stepMap: Record<number, 'input' | 'insights' | 'assets' | 'transform' | 'campaign-settings' | 'launch'> = {
      1: 'input',
      2: 'insights', 
      3: 'assets',
      4: 'transform',
      5: 'campaign-settings',
      6: 'launch'
    };
    return stepMap[stepNumber] || 'input';
  };

  const getStepNumber = (step: string): number => {
    const stepMap = {
      'input': 1,
      'insights': 2,
      'assets': 3,
      'transform': 4,
      'campaign-settings': 5,
      'launch': 6
    };
    return stepMap[step as keyof typeof stepMap] || 1;
  };

  const getStepName = (stepNumber: number): string => {
    const stepNames = {
      1: "Competitor Research",
      2: "Insights Analysis",
      3: "Asset Collection", 
      4: "Asset Transform",
      5: "Campaign Settings",
      6: "Ready to Launch"
    };
    return stepNames[stepNumber as keyof typeof stepNames] || `Step ${stepNumber}`;
  };

  const autoSaveDraft = async (stepOverride?: string) => {
    const step = stepOverride || currentStep;
    const stepNumber = getStepNumber(step);
    const name = campaignName || `Campaign ${new Date().toLocaleDateString()}`;
    
    const draftData = {
      competitorListId,
      selectedAudienceSegments,
      competitorInsights,
      selectedAngle,
      competitorProfiles,
      rawAssets,
      transformedAssets,
      campaignSettings,
      campaignConfig,
    };

    const stepData = { currentStep: step };

    const savedDraftId = await saveDraft(name, stepNumber, draftData, stepData, currentDraftId);
    if (savedDraftId && !currentDraftId) {
      setCurrentDraftId(savedDraftId);
    }
  };

  const handleContinueLater = async () => {
    await autoSaveDraft();
    toast({
      title: "Progress saved!",
      description: "You can continue building this campaign anytime from your dashboard.",
    });
    onFlowComplete(null, { type: 'save_and_exit' });
  };

  const handleCompetitorListCreated = async (listId: string) => {
    if (listId === 'skip') {
      // User chose to skip competitor research
      onFlowComplete(null, { type: 'skip', description: 'User chose to skip competitor research' }, []);
      return;
    }
    
    setCompetitorListId(listId);
    setCurrentStep('insights');
    await autoSaveDraft('insights');
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
    await autoSaveDraft('assets');
  };

  const handleAssetsSelected = (assets: string[]) => {
    setRawAssets(assets);
  };

  const handleAssetsComplete = async () => {
    toast({
      title: "Assets collected!",
      description: "Now let's transform them with AI.",
    });
    
    setCurrentStep('transform');
    await autoSaveDraft('transform');
  };

  const handleTransformComplete = (assets: TransformedAsset[]) => {
    setTransformedAssets(assets);
  };

  const handleTransformFinished = async () => {
    toast({
      title: "Assets transformed!",
      description: "Now let's configure your campaign settings.",
    });
    
    setCurrentStep('campaign-settings');
    await autoSaveDraft('campaign-settings');
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
      await autoSaveDraft('launch');
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
            <div className="flex justify-center gap-4 mt-6">
              <Button 
                onClick={handleAssetsComplete}
                className="px-6 py-2"
              >
                Continue to Transform Assets
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setRawAssets([]);
                  handleAssetsComplete();
                }}
                className="px-6 py-2"
              >
                Skip This Step
              </Button>
              <Button
                variant="ghost"
                onClick={handleContinueLater}
                className="px-6 py-2"
              >
                Continue Later
              </Button>
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
            <div className="flex justify-center gap-4 mt-6">
              <Button 
                onClick={handleTransformFinished}
                disabled={transformedAssets.length === 0}
                className="px-6 py-2"
              >
                Continue to Campaign Settings
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTransformedAssets([]);
                  handleTransformFinished();
                }}
                className="px-6 py-2"
              >
                Skip This Step
              </Button>
              <Button
                variant="ghost"
                onClick={handleContinueLater}
                className="px-6 py-2"
              >
                Continue Later
              </Button>
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
import { useState, useEffect } from 'react';
import { CampaignNameAndObjective } from '@/components/campaign-builder/CampaignNameAndObjective';
import { CampaignBudget } from '@/components/campaign-builder/CampaignBudget';
import { AudienceSplitting } from '@/components/campaign-builder/AudienceSplitting';
import { AdSetConfiguration } from '@/components/campaign-builder/AdSetConfiguration';
import { AdVariants } from '@/components/campaign-builder/AdVariants';
import { ReviewAndLaunch } from '@/components/campaign-builder/ReviewAndLaunch';
import { CampaignFlowNavigation } from '@/components/CampaignFlowNavigation';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCampaignDrafts } from '@/hooks/useCampaignDrafts';
import { type AudienceSegment as FacebookAudienceSegment } from '@/hooks/useCreateFacebookAudiences';

interface AudienceSegment {
  id: string;
  name: string;
  type: 'broad' | 'lookalike' | 'interests' | 'custom';
  description: string;
  targeting?: {
    interests?: string[];
    demographics?: string;
    behaviors?: string[];
  };
}

interface AdSet {
  id: string;
  name: string;
  audienceSegmentId: string;
  placements: string[];
  schedule: {
    startTime: string;
    endTime: string;
    timezone: string;
  };
  budgetAllocation: number;
}

interface AdVariant {
  id: string;
  headline: string;
  primaryText: string;
  callToAction: string;
  description?: string;
}

interface CampaignBuilderProps {
  brandAnalysisId?: string;
  brandUrl?: string;
  resumeDraftId?: string;
  savedAudienceSegments?: FacebookAudienceSegment[];
  campaignId?: string;
  campaignData?: any;
  onFlowComplete: (result: any) => void;
}

type Step = 'campaign-name' | 'budget' | 'audiences' | 'ad-sets' | 'ad-variants' | 'review';

export const CampaignBuilder = ({ brandAnalysisId, brandUrl, resumeDraftId, savedAudienceSegments, campaignId, campaignData, onFlowComplete }: CampaignBuilderProps) => {
  const [currentStep, setCurrentStep] = useState<Step>('campaign-name');
  const [campaignName, setCampaignName] = useState<string>('');
  const [objective, setObjective] = useState<string>('');
  const [budget, setBudget] = useState<number>(0);
  const [segments, setSegments] = useState<AudienceSegment[]>([]);
  const [adSets, setAdSets] = useState<AdSet[]>([]);
  const [adVariants, setAdVariants] = useState<Record<string, AdVariant[]>>({});
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(resumeDraftId || null);
  
  const { toast } = useToast();
  const { saveDraft } = useCampaignDrafts();

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
        setObjective(draftData.objective || '');
        setBudget(draftData.budget || 0);
        setSegments(draftData.segments || []);
        setAdSets(draftData.adSets || []);
        setAdVariants(draftData.adVariants || {});
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

  const getStepFromNumber = (stepNumber: number): Step => {
    const stepMap: Record<number, Step> = {
      1: 'campaign-name',
      2: 'budget',
      3: 'audiences',
      4: 'ad-sets',
      5: 'ad-variants',
      6: 'review'
    };
    return stepMap[stepNumber] || 'campaign-name';
  };

  const getStepNumber = (step: Step): number => {
    const stepMap = {
      'campaign-name': 1,
      'budget': 2,
      'audiences': 3,
      'ad-sets': 4,
      'ad-variants': 5,
      'review': 6
    };
    return stepMap[step] || 1;
  };

  const getStepName = (stepNumber: number): string => {
    const stepNames = {
      1: "Campaign Setup",
      2: "Budget Planning",
      3: "Audience Targeting",
      4: "Ad Set Configuration",
      5: "Ad Creation",
      6: "Review & Launch"
    };
    return stepNames[stepNumber as keyof typeof stepNames] || `Step ${stepNumber}`;
  };

  const autoSaveDraft = async (stepOverride?: Step) => {
    const step = stepOverride || currentStep;
    const stepNumber = getStepNumber(step);
    const name = campaignName || `Campaign ${new Date().toLocaleDateString()}`;
    
    const draftData = {
      objective,
      budget,
      segments,
      adSets,
      adVariants,
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
    onFlowComplete({ type: 'save_and_exit' });
  };

  const navigateToStep = (targetStep: Step) => {
    setCurrentStep(targetStep);
    autoSaveDraft(targetStep);
  };

  const handleBack = () => {
    const stepOrder: Step[] = ['campaign-name', 'budget', 'audiences', 'ad-sets', 'ad-variants', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      navigateToStep(stepOrder[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    const stepOrder: Step[] = ['campaign-name', 'budget', 'audiences', 'ad-sets', 'ad-variants', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      navigateToStep(stepOrder[currentIndex + 1]);
    }
  };

  const canGoBack = () => {
    return currentStep !== 'campaign-name';
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 'campaign-name':
        return !!(campaignName.trim() && objective);
      case 'budget':
        return budget > 0;
      case 'audiences':
        return segments.length >= 2;
      case 'ad-sets':
        return adSets.length > 0;
      case 'ad-variants':
        return Object.keys(adVariants).length > 0 && 
               Object.values(adVariants).every(variants => variants.length >= 2);
      case 'review':
        return false; // No next step after review
      default:
        return false;
    }
  };

  const getNextButtonText = () => {
    if (currentStep === 'review') return 'Launch Campaign';
    return 'Next Step';
  };

  const handleLaunchComplete = (result: any) => {
    onFlowComplete(result);
  };

  const handleEdit = (step: string) => {
    const stepMap: Record<string, Step> = {
      'campaign-name': 'campaign-name',
      'budget': 'budget',
      'audiences': 'audiences',
      'ad-sets': 'ad-sets',
      'ad-variants': 'ad-variants'
    };
    
    const targetStep = stepMap[step];
    if (targetStep) {
      navigateToStep(targetStep);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {currentStep === 'campaign-name' && (
          <CampaignNameAndObjective
            campaignName={campaignName}
            objective={objective}
            onCampaignNameChange={setCampaignName}
            onObjectiveChange={setObjective}
          />
        )}

        {currentStep === 'budget' && (
          <CampaignBudget
            budget={budget}
            objective={objective}
            onBudgetChange={setBudget}
          />
        )}

        {currentStep === 'audiences' && (
          <AudienceSplitting
            segments={segments}
            onSegmentsChange={setSegments}
            savedAudienceSegments={savedAudienceSegments}
          />
        )}

        {currentStep === 'ad-sets' && (
          <AdSetConfiguration
            segments={segments}
            budget={budget}
            adSets={adSets}
            onAdSetsChange={setAdSets}
          />
        )}

        {currentStep === 'ad-variants' && (
          <AdVariants
            adSets={adSets}
            adVariants={adVariants}
            onAdVariantsChange={setAdVariants}
            brandUrl={brandUrl}
          />
        )}

        {currentStep === 'review' && (
          <ReviewAndLaunch
            campaignName={campaignName}
            objective={objective}
            budget={budget}
            segments={segments}
            adSets={adSets}
            adVariants={adVariants}
            savedAudienceSegments={savedAudienceSegments}
            onEdit={handleEdit}
            onLaunchComplete={handleLaunchComplete}
          />
        )}
      </div>

      <CampaignFlowNavigation
        currentStep={currentStep}
        onBack={handleBack}
        onNext={handleNext}
        onSave={handleContinueLater}
        canGoBack={canGoBack()}
        canGoNext={canGoNext()}
        nextButtonText={getNextButtonText()}
        nextButtonDisabled={!canGoNext()}
        showSave={currentStep !== 'review'}
      />
    </div>
  );
};
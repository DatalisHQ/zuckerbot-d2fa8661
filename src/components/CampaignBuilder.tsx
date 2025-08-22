import { useState, useEffect } from 'react';
import { CampaignNameAndObjective } from '@/components/campaign-builder/CampaignNameAndObjective';
import { CampaignBudget } from '@/components/campaign-builder/CampaignBudget';
import { AdSetConfiguration } from '@/components/campaign-builder/AdSetConfiguration';
import { AdVariants } from '@/components/campaign-builder/AdVariants';
import { ReviewAndLaunch } from '@/components/campaign-builder/ReviewAndLaunch';
import { CampaignFlowNavigation } from '@/components/CampaignFlowNavigation';
import { AudienceSplitting } from '@/components/campaign-builder/AudienceSplitting';
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
    age_min?: number;
    age_max?: number;
    genders?: string[];
    countries?: string[];
    location_types?: string[];
  };
}

interface AdSet {
  id: string;
  name: string;
  audienceSegmentId: string;
  placements: string[];
  budgetAllocation: number;
  targeting?: {
    interests?: string[];
    demographics?: string;
    behaviors?: string[];
    age_min?: number;
    age_max?: number;
    genders?: string[];
    countries?: string[];
    location_types?: string[];
  };
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
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(resumeDraftId || null);
  
  const { toast } = useToast();
  const { saveDraft } = useCampaignDrafts();

  // Load draft data on mount if resuming
  useEffect(() => {
    if (resumeDraftId) {
      loadDraftData(resumeDraftId);
    }
  }, [resumeDraftId]);

  // Initialize/reconcile ad sets when segments or budget change
  useEffect(() => {
    if (segments.length === 0) {
      setAdSets([]);
      return;
    }
    const budgetPerSegment = Math.floor((budget || 0) / segments.length);
    setAdSets(prev => {
      // Build a map of existing by segment id
      const existingBySegment: Record<string, typeof prev[number]> = {};
      prev.forEach(as => { existingBySegment[as.audienceSegmentId] = as; });
      const next = segments.map(segment => {
        const existing = existingBySegment[segment.id];
        if (existing) {
          return {
            ...existing,
            id: existing.id || `adset_${segment.id}`,
            name: `${segment.name} - Ad Set`,
            audienceSegmentId: segment.id,
            // keep existing placements/targeting, just update budget proportionally
            budgetAllocation: budgetPerSegment,
            targeting: existing.targeting ?? segment.targeting ?? {},
            placements: Array.isArray(existing.placements) && existing.placements.length > 0
              ? existing.placements
              : ['facebook_feeds', 'instagram_feed']
          };
        }
        return {
          id: `adset_${segment.id}`,
          name: `${segment.name} - Ad Set`,
          audienceSegmentId: segment.id,
          placements: ['facebook_feeds', 'instagram_feed'],
          budgetAllocation: budgetPerSegment,
          targeting: segment.targeting || {},
        };
      });
      return next;
    });
  }, [segments, budget]);

  useEffect(() => {
    console.log('[CampaignBuilder] savedAudienceSegments:', savedAudienceSegments);
    console.log('[CampaignBuilder] segments before init:', segments);
    if (segments.length === 0 && savedAudienceSegments && savedAudienceSegments.length > 0) {
      // Convert savedAudienceSegments to internal format if needed
      const convertedSegments = savedAudienceSegments.map((segment, index) => ({
        id: `saved-${index}`,
        name: segment.segment,
        type: 'custom' as const,
        description: segment.criteria,
        targeting: {
          demographics: segment.criteria
        }
      }));
      setSegments(convertedSegments);
      console.log('[CampaignBuilder] segments initialized from savedAudienceSegments:', convertedSegments);
    }
  }, [segments.length, savedAudienceSegments]);

  useEffect(() => {
    // Prefer campaignData.audience_data.segments if present
    const audienceSegments = campaignData?.audience_data?.segments;
    console.log('[CampaignBuilder] campaignData.audience_data.segments:', audienceSegments);
    if (segments.length === 0 && audienceSegments && audienceSegments.length > 0) {
      const convertedSegments = audienceSegments.map((segment: any, index: number) => ({
        id: segment.id || `saved-${index}`,
        name: segment.segment,
        type: 'custom' as const,
        description: segment.criteria,
        targeting: segment.targeting_data || { demographics: segment.criteria }
      }));
      setSegments(convertedSegments);
      console.log('[CampaignBuilder] segments initialized from campaignData.audience_data.segments:', convertedSegments);
    }
  }, [segments.length, campaignData]);

  // Persist audience segments to campaign record for continuity
  useEffect(() => {
    const persistAudience = async () => {
      try {
        if (!campaignId) return;
        // Only persist when segments are available
        if (segments && segments.length > 0) {
          const audiencePayload = {
            segments: segments.map(s => ({
              id: s.id,
              segment: s.name,
              criteria: s.description,
              targeting_data: {
                age_min: s.targeting?.age_min ?? 18,
                age_max: s.targeting?.age_max ?? 65,
                genders: s.targeting?.genders ?? ['male','female'],
                interests: s.targeting?.interests ?? [],
                behaviors: s.targeting?.behaviors ?? [],
                countries: s.targeting?.countries ?? ['US'],
                location_types: s.targeting?.location_types ?? ['home'],
              }
            }))
          };
          await supabase
            .from('ad_campaigns')
            .update({ audience_data: audiencePayload })
            .eq('id', campaignId);
        }
      } catch (e) {
        console.error('Failed to persist audience_data:', e);
      }
    };
    persistAudience();
  }, [segments, campaignId]);

  const handleSegmentTargetingChange = (segmentId: string, targeting: NonNullable<AdSet['targeting']>) => {
    // Update adSets entry
    setAdSets(prev => prev.map(as => as.audienceSegmentId === segmentId ? { ...as, targeting } : as));
    // Update segments entry (so it persists to DB)
    setSegments(prev => prev.map(s => s.id === segmentId ? { ...s, targeting } : s));
  };

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
        setStartDate(draftData.startDate || null);
        setEndDate(draftData.endDate || null);
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
      startDate,
      endDate,
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
      case 'campaign-name': {
        if (!(campaignName.trim() && objective)) return false;
        if (!startDate || !endDate) return false;
        const s = new Date(startDate).getTime();
        const e = new Date(endDate).getTime();
        if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return false;
        return true;
      }
      case 'budget':
        return budget > 0;
      case 'audiences':
        return segments.length > 0;
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
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={(iso) => {
              setStartDate(iso);
              // Store in component state only, database doesn't have these columns
            }}
            onEndDateChange={(iso) => {
              setEndDate(iso);
              // Store in component state only, database doesn't have these columns
            }}
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
            onContinue={() => navigateToStep('ad-sets')}
          />
        )}

        {currentStep === 'ad-sets' && (
          segments.length === 0 ? (
            <div className="text-center text-red-500 font-bold py-8">
              Error: No audience segments found. Please go back and select your audiences before proceeding.
            </div>
          ) : (
            <AdSetConfiguration
              segments={segments}
              budget={budget}
              adSets={adSets}
              onAdSetsChange={setAdSets}
              startDate={startDate}
              endDate={endDate}
              onSegmentTargetingChange={handleSegmentTargetingChange}
            />
          )
        )}

        {currentStep === 'ad-variants' && (
          <AdVariants
            adSets={adSets}
            adVariants={adVariants}
            onAdVariantsChange={setAdVariants}
            brandUrl={brandUrl}
            campaignId={campaignId}
            campaignObjective={objective}
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
            startDate={startDate}
            endDate={endDate}
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
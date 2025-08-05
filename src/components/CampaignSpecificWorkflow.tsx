import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, ArrowLeft, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Import campaign step components
import { CompetitorInput } from '@/components/CompetitorInput';
import { CompetitorInsights } from '@/components/CompetitorInsights';
import { AudienceSegments } from '@/components/AudienceSegments';
import { BrandAnalysisForm } from '@/components/BrandAnalysisForm';
import { CampaignImageUpload } from '@/components/CampaignImageUpload';
import { CampaignBuilder } from '@/components/CampaignBuilder';

interface CampaignSpecificWorkflowProps {
  campaignId: string;
  onFlowComplete: (result: any) => void;
}

type WorkflowStep = 'brand-info' | 'competitor-analysis' | 'audience-selection' | 'image-upload' | 'campaign-creation';

interface CampaignData {
  competitor_data: any;
  audience_data: any;
  brand_data: any;
  image_data: any;
  angles_data: any;
}

export const CampaignSpecificWorkflow = ({ campaignId, onFlowComplete }: CampaignSpecificWorkflowProps) => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('brand-info');
  const [campaignData, setCampaignData] = useState<CampaignData>({
    competitor_data: {},
    audience_data: {},
    brand_data: {},
    image_data: {},
    angles_data: {}
  });
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set());
  const { toast } = useToast();
  const navigate = useNavigate();

  const steps: { id: WorkflowStep; title: string; description: string }[] = [
    {
      id: 'brand-info',
      title: 'Brand Information',
      description: 'Complete your brand analysis and positioning'
    },
    {
      id: 'competitor-analysis',
      title: 'Competitor Analysis',
      description: 'Find and analyze your competitors to extract winning strategies'
    },
    {
      id: 'audience-selection',
      title: 'Audience Selection',
      description: 'Review and refine your target audience segments'
    },
    {
      id: 'image-upload',
      title: 'Creative Assets',
      description: 'Upload or select images for your ads'
    },
    {
      id: 'campaign-creation',
      title: 'Campaign Creation',
      description: 'Build your campaign with all the gathered insights'
    }
  ];

  // Load campaign data on mount
  useEffect(() => {
    loadCampaignData();
  }, [campaignId]);

  const loadCampaignData = async () => {
    try {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (error) throw error;

      if (data) {
        setCampaignData({
          competitor_data: data.competitor_data || {},
          audience_data: data.audience_data || {},
          brand_data: data.brand_data || {},
          image_data: data.image_data || {},
          angles_data: data.angles_data || {}
        });

        // Determine completed steps based on data
        const completed = new Set<WorkflowStep>();
        if (Object.keys(data.brand_data || {}).length > 0) completed.add('brand-info');
        if (Object.keys(data.competitor_data || {}).length > 0) completed.add('competitor-analysis');
        if (Object.keys(data.audience_data || {}).length > 0) completed.add('audience-selection');
        if (Object.keys(data.image_data || {}).length > 0) completed.add('image-upload');
        
        setCompletedSteps(completed);

        // Auto-advance to next incomplete step
        if (!completed.has('brand-info')) {
          setCurrentStep('brand-info');
        } else if (!completed.has('competitor-analysis')) {
          setCurrentStep('competitor-analysis');
        } else if (!completed.has('audience-selection')) {
          setCurrentStep('audience-selection');
        } else if (!completed.has('image-upload')) {
          setCurrentStep('image-upload');
        } else {
          setCurrentStep('campaign-creation');
        }
      }
    } catch (error) {
      console.error('Error loading campaign data:', error);
      toast({
        title: "Error loading campaign",
        description: "Failed to load campaign data.",
        variant: "destructive",
      });
    }
  };

  const saveCampaignData = async (step: WorkflowStep, data: any) => {
    try {
      const updateData: any = {};
      
      switch (step) {
        case 'brand-info':
          updateData.brand_data = data;
          break;
        case 'competitor-analysis':
          updateData.competitor_data = data;
          updateData.angles_data = data.selectedAngle || {};
          break;
        case 'audience-selection':
          updateData.audience_data = data;
          break;
        case 'image-upload':
          updateData.image_data = data;
          break;
      }

      const { error } = await supabase
        .from('ad_campaigns')
        .update(updateData)
        .eq('id', campaignId);

      if (error) throw error;

      // Update local state
      setCampaignData(prev => ({
        ...prev,
        ...updateData
      }));

      setCompletedSteps(prev => new Set([...prev, step]));
      
      toast({
        title: "Progress saved",
        description: `${steps.find(s => s.id === step)?.title} completed successfully.`,
      });

    } catch (error) {
      console.error('Error saving campaign data:', error);
      toast({
        title: "Error saving progress",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleStepComplete = async (step: WorkflowStep, data: any) => {
    await saveCampaignData(step, data);
    
    // Auto-advance to next step
    const stepIndex = steps.findIndex(s => s.id === step);
    if (stepIndex < steps.length - 1) {
      setCurrentStep(steps[stepIndex + 1].id);
    }
  };

  const getStepProgress = () => {
    const completedCount = completedSteps.size;
    const currentStepIndex = steps.findIndex(s => s.id === currentStep);
    const totalProgress = (completedCount / steps.length) * 100;
    const currentStepProgress = currentStepIndex >= 0 ? ((currentStepIndex + 1) / steps.length) * 100 : 0;
    
    return Math.max(totalProgress, currentStepProgress);
  };

  const handleBack = () => {
    const currentIndex = steps.findIndex(s => s.id === currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1].id);
    }
  };

  const handleNext = () => {
    const currentIndex = steps.findIndex(s => s.id === currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1].id);
    }
  };

  const canNavigateToStep = (step: WorkflowStep): boolean => {
    // Allow navigation to any step - no hard requirements
    return true;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Progress Header */}
      <div className="border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
            <h1 className="text-xl font-semibold">Campaign Workflow</h1>
          </div>
          
          <div className="space-y-4">
            <Progress value={getStepProgress()} className="w-full" />
            
            <div className="flex items-center justify-between">
              {steps.map((step, index) => {
                const isCompleted = completedSteps.has(step.id);
                const isCurrent = currentStep === step.id;
                const canNavigate = canNavigateToStep(step.id);
                
                return (
                  <div key={step.id} className="flex items-center">
                    <button
                      onClick={() => canNavigate && setCurrentStep(step.id)}
                      disabled={!canNavigate}
                      className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                        isCurrent
                          ? 'bg-primary text-primary-foreground'
                          : isCompleted
                          ? 'bg-primary/20 text-primary hover:bg-primary/30'
                          : 'bg-muted text-muted-foreground'
                      } ${canNavigate ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                      <span className="text-sm font-medium hidden sm:inline">
                        {step.title}
                      </span>
                    </button>
                    {index < steps.length - 1 && (
                      <div className="w-8 h-0.5 mx-2 bg-muted" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="container mx-auto px-4 py-8">
        {currentStep === 'brand-info' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">Brand Information</h2>
              <p className="text-muted-foreground">
                Complete your brand analysis for this campaign
              </p>
            </div>
            
            <BrandAnalysisForm 
              campaignId={campaignId}
              existingData={campaignData.brand_data}
              onAnalysisComplete={(data) => 
                handleStepComplete('brand-info', data)
              }
            />
          </div>
        )}

        {currentStep === 'competitor-analysis' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">Competitor Analysis</h2>
              <p className="text-muted-foreground">
                Analyze your competition to find winning ad strategies for this campaign
              </p>
              {Object.keys(campaignData.brand_data || {}).length === 0 && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    💡 No brand data yet. Auto-discovery will be limited, but you can still add competitors manually.
                  </p>
                </div>
              )}
            </div>
            
            {!campaignData.competitor_data?.competitorListId ? (
              <CompetitorInput 
                onCompetitorListCreated={(competitorListId) => {
                  handleStepComplete('competitor-analysis', { competitorListId });
                }}
                campaignId={campaignId}
                brandAnalysisId={campaignData.brand_data?.analysisId}
              />
            ) : (
              <CompetitorInsights
                competitorListId={campaignData.competitor_data.competitorListId}
                campaignId={campaignId}
                existingData={campaignData.competitor_data}
                onAngleSelected={(angle, insights) => {
                  handleStepComplete('competitor-analysis', {
                    ...campaignData.competitor_data,
                    selectedAngle: angle,
                    insights
                  });
                }}
              />
            )}
          </div>
        )}

        {currentStep === 'audience-selection' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">Audience Selection</h2>
              <p className="text-muted-foreground">
                Review and refine your target audience segments for this campaign
              </p>
            </div>
            
            <AudienceSegments
              campaignId={campaignId}
              existingData={campaignData.audience_data}
              competitorData={campaignData.competitor_data}
              onSegmentsSelected={(segments) => 
                handleStepComplete('audience-selection', { segments })
              }
            />
          </div>
        )}

        {currentStep === 'image-upload' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">Creative Assets</h2>
              <p className="text-muted-foreground">
                Upload or select images for your ads
              </p>
            </div>
            
            <CampaignImageUpload
              campaignId={campaignId}
              existingData={campaignData.image_data}
              onImagesSelected={(images) => 
                handleStepComplete('image-upload', { images })
              }
            />
          </div>
        )}

        {currentStep === 'campaign-creation' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">Campaign Creation</h2>
              <p className="text-muted-foreground">
                Create your campaign using all the insights gathered
              </p>
            </div>
            
            <CampaignBuilder
              campaignId={campaignId}
              campaignData={campaignData}
              onFlowComplete={onFlowComplete}
            />
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="border-t border-border/50 bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 'brand-info'}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </Button>
            
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Step {steps.findIndex(s => s.id === currentStep) + 1} of {steps.length}
              </p>
              <p className="text-sm font-medium">
                {steps.find(s => s.id === currentStep)?.description}
              </p>
            </div>
            
            <Button
              onClick={handleNext}
              disabled={currentStep === 'campaign-creation'}
              className="flex items-center gap-2"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
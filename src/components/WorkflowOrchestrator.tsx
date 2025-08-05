import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, ArrowLeft, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Import existing modules
import { CompetitorInput } from '@/components/CompetitorInput';
import { CompetitorInsights } from '@/components/CompetitorInsights';
import { AudienceSegments, type AudienceSegment } from '@/components/AudienceSegments';
import { BrandAnalysisForm } from '@/components/BrandAnalysisForm';
import { CampaignBuilder } from '@/components/CampaignBuilder';

interface WorkflowOrchestratorProps {
  brandAnalysisId?: string;
  brandUrl?: string;
  onFlowComplete: (result: any) => void;
}

type WorkflowStep = 'competitor-analysis' | 'audience-selection' | 'brand-info' | 'campaign-creation';

interface WorkflowState {
  competitorListId?: string;
  competitorInsights?: any;
  selectedAngle?: any;
  audienceSegments?: AudienceSegment[];
  brandAnalysisId?: string;
  brandUrl?: string;
  competitorProfiles?: any[];
}

export const WorkflowOrchestrator = ({ brandAnalysisId, brandUrl, onFlowComplete }: WorkflowOrchestratorProps) => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('competitor-analysis');
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
    brandAnalysisId,
    brandUrl
  });
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set());
  const { toast } = useToast();
  const navigate = useNavigate();

  const steps: { id: WorkflowStep; title: string; description: string }[] = [
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
      id: 'brand-info',
      title: 'Brand Information',
      description: 'Complete your brand analysis and positioning'
    },
    {
      id: 'campaign-creation',
      title: 'Campaign Creation',
      description: 'Build your campaign with all the gathered insights'
    }
  ];

  // Load existing data on mount
  useEffect(() => {
    loadExistingData();
  }, []);

  const loadExistingData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      // Check for existing competitor analysis
      const { data: competitorLists } = await supabase
        .from('competitor_lists')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('brand_analysis_id', brandAnalysisId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (competitorLists?.length > 0) {
        setWorkflowState(prev => ({ ...prev, competitorListId: competitorLists[0].id }));
        setCompletedSteps(prev => new Set([...prev, 'competitor-analysis']));
      }

      // Check for existing audience segments
      const { data: audienceData } = await supabase
        .from('selected_angles')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('brand_analysis_id', brandAnalysisId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (audienceData?.length > 0) {
        setCompletedSteps(prev => new Set([...prev, 'audience-selection']));
      }

      // Check for existing brand analysis
      const { data: brandData } = await supabase
        .from('brand_analysis')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('id', brandAnalysisId)
        .eq('analysis_status', 'completed')
        .single();

      if (brandData) {
        setWorkflowState(prev => ({ ...prev, brandUrl: brandData.brand_url }));
        setCompletedSteps(prev => new Set([...prev, 'brand-info']));
      }

      // Auto-advance to next incomplete step
      if (competitorLists?.length > 0 && !audienceData?.length) {
        setCurrentStep('audience-selection');
      } else if (audienceData?.length > 0 && !brandData) {
        setCurrentStep('brand-info');
      } else if (brandData && competitorLists?.length > 0 && audienceData?.length > 0) {
        setCurrentStep('campaign-creation');
      }

    } catch (error) {
      console.error('Error loading existing data:', error);
    }
  };

  const saveWorkflowState = async (step: WorkflowStep, data: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      // Save step-specific data
      switch (step) {
        case 'competitor-analysis':
          // Data is already saved by CompetitorInput
          setWorkflowState(prev => ({ 
            ...prev, 
            competitorListId: data.competitorListId,
            competitorInsights: data.competitorInsights,
            selectedAngle: data.selectedAngle,
            competitorProfiles: data.competitorProfiles
          }));
          break;

        case 'audience-selection':
          // Save selected audience segments
          const { error: angleError } = await supabase
            .from('selected_angles')
            .upsert({
              user_id: session.user.id,
              brand_analysis_id: brandAnalysisId,
              angle_type: 'audience_selection',
              angle_description: 'Selected audience segments',
              competitor_insights: data.audienceSegments
            });

          if (angleError) throw angleError;

          setWorkflowState(prev => ({ ...prev, audienceSegments: data.audienceSegments }));
          break;

        case 'brand-info':
          // Data is already saved by BrandAnalysisForm
          setWorkflowState(prev => ({ 
            ...prev, 
            brandAnalysisId: data.brandAnalysisId,
            brandUrl: data.brandUrl 
          }));
          break;
      }

      setCompletedSteps(prev => new Set([...prev, step]));
      
      toast({
        title: "Progress saved",
        description: `${steps.find(s => s.id === step)?.title} completed successfully.`,
      });

    } catch (error) {
      console.error('Error saving workflow state:', error);
      toast({
        title: "Error saving progress",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const canNavigateToStep = (step: WorkflowStep): boolean => {
    const stepIndex = steps.findIndex(s => s.id === step);
    const currentStepIndex = steps.findIndex(s => s.id === currentStep);
    
    // Can navigate to completed steps or next step
    return completedSteps.has(step) || stepIndex <= currentStepIndex + 1;
  };

  const handleStepComplete = async (step: WorkflowStep, data: any) => {
    await saveWorkflowState(step, data);
    
    // Auto-advance to next step
    const stepIndex = steps.findIndex(s => s.id === step);
    if (stepIndex < steps.length - 1) {
      setCurrentStep(steps[stepIndex + 1].id);
    }
  };

  const handleCompetitorAnalysisComplete = (competitorListId: string) => {
    if (competitorListId === 'skip') {
      // Skip to campaign creation if they skip competitor analysis
      setCurrentStep('campaign-creation');
      return;
    }
    
    // Continue to insights analysis
    setWorkflowState(prev => ({ ...prev, competitorListId }));
    setCompletedSteps(prev => new Set([...prev, 'competitor-analysis']));
    setCurrentStep('audience-selection');
  };

  const handleCompetitorInsightsComplete = (angle: any, insights: any, audienceSegments?: AudienceSegment[]) => {
    const data = {
      competitorInsights: insights,
      selectedAngle: angle,
      competitorProfiles: insights.competitorInsights?.map((c: any) => ({
        name: c.name,
        valueProps: c.websiteAnalysis?.value_props || [],
        toneProfile: c.websiteAnalysis?.tone || 'professional'
      })) || [],
      audienceSegments
    };
    
    handleStepComplete('audience-selection', data);
  };

  const handleBrandAnalysisComplete = (brandAnalysisId: string, brandUrl: string) => {
    handleStepComplete('brand-info', { brandAnalysisId, brandUrl });
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
    if (currentIndex < steps.length - 1 && completedSteps.has(currentStep)) {
      setCurrentStep(steps[currentIndex + 1].id);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Progress Header */}
      <div className="border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/zuckerbot')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to ZuckerBot
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
        {currentStep === 'competitor-analysis' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">Competitor Analysis</h2>
              <p className="text-muted-foreground">
                Let's analyze your competition to find winning ad strategies
              </p>
            </div>
            
            {!workflowState.competitorListId ? (
              <CompetitorInput 
                onCompetitorListCreated={handleCompetitorAnalysisComplete}
                brandAnalysisId={brandAnalysisId}
              />
            ) : (
              <CompetitorInsights
                competitorListId={workflowState.competitorListId}
                brandUrl={workflowState.brandUrl}
                onAngleSelected={handleCompetitorInsightsComplete}
                onAudienceSelected={(segments) => 
                  handleStepComplete('audience-selection', { audienceSegments: segments })
                }
              />
            )}
          </div>
        )}

        {currentStep === 'audience-selection' && workflowState.competitorProfiles && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">Audience Selection</h2>
              <p className="text-muted-foreground">
                Review and refine your target audience segments
              </p>
            </div>
            
            <AudienceSegments
              brandUrl={workflowState.brandUrl || ''}
              competitorProfiles={workflowState.competitorProfiles}
              onSegmentsSelected={(segments) => 
                handleStepComplete('audience-selection', { audienceSegments: segments })
              }
            />
          </div>
        )}

        {currentStep === 'brand-info' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">Brand Information</h2>
              <p className="text-muted-foreground">
                Complete your brand analysis to enhance campaign targeting
              </p>
            </div>
            
            <BrandAnalysisForm />
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
              brandAnalysisId={workflowState.brandAnalysisId}
              brandUrl={workflowState.brandUrl}
              savedAudienceSegments={workflowState.audienceSegments}
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
              disabled={currentStep === 'competitor-analysis'}
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
              disabled={!completedSteps.has(currentStep) || currentStep === 'campaign-creation'}
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
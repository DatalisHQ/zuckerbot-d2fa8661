import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Save } from "lucide-react";

interface CampaignFlowNavigationProps {
  currentStep: string;
  onBack: () => void;
  onNext: () => void;
  onSave: () => void;
  canGoBack: boolean;
  canGoNext: boolean;
  nextButtonText?: string;
  nextButtonDisabled?: boolean;
  showSave?: boolean;
}

const STEP_ORDER = ['input', 'insights', 'assets', 'campaign-settings', 'launch'];

const getStepInfo = (step: string) => {
  const stepIndex = STEP_ORDER.indexOf(step);
  const stepNames = {
    'input': "Competitor Research",
    'insights': "Insights Analysis",
    'assets': "Asset Collection",
    'campaign-settings': "Campaign Settings",
    'launch': "Ready to Launch"
  };
  
  return {
    index: stepIndex + 1,
    total: STEP_ORDER.length,
    name: stepNames[step as keyof typeof stepNames] || step
  };
};

export const CampaignFlowNavigation = ({
  currentStep,
  onBack,
  onNext,
  onSave,
  canGoBack,
  canGoNext,
  nextButtonText = "Next Step",
  nextButtonDisabled = false,
  showSave = true
}: CampaignFlowNavigationProps) => {
  const stepInfo = getStepInfo(currentStep);
  
  return (
    <div className="border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-6">
        {/* Progress indicator */}
        <div className="flex items-center justify-center mb-6">
          <div className="flex items-center space-x-2">
            {STEP_ORDER.map((step, index) => {
              const isActive = step === currentStep;
              const isCompleted = STEP_ORDER.indexOf(currentStep) > index;
              
              return (
                <div key={step} className="flex items-center">
                  <div 
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      isActive 
                        ? 'bg-primary text-primary-foreground' 
                        : isCompleted 
                        ? 'bg-primary/20 text-primary' 
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {index + 1}
                  </div>
                  {index < STEP_ORDER.length - 1 && (
                    <div 
                      className={`w-12 h-0.5 mx-2 ${
                        isCompleted ? 'bg-primary' : 'bg-muted'
                      }`} 
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step info */}
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground">
            Step {stepInfo.index} of {stepInfo.total}
          </p>
          <h3 className="text-lg font-semibold">{stepInfo.name}</h3>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            {canGoBack && (
              <Button
                variant="outline"
                onClick={onBack}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
          </div>

          <div className="flex gap-3">
            {showSave && (
              <Button
                variant="ghost"
                onClick={onSave}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save Progress
              </Button>
            )}
            
            {canGoNext && (
              <Button
                onClick={onNext}
                disabled={nextButtonDisabled}
                className="flex items-center gap-2"
              >
                {nextButtonText}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
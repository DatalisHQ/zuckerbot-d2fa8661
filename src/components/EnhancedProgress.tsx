import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Circle, Loader2, Sparkles, Image, PenTool, Brain, Zap } from "lucide-react";

interface ProgressStep {
  id: string;
  label: string;
  description: string;
  icon: any;
  estimatedSeconds: number;
}

const PROGRESS_STEPS: ProgressStep[] = [
  {
    id: "brand-analysis",
    label: "Analyzing Your Business",
    description: "Understanding your products, target audience, and brand",
    icon: Brain,
    estimatedSeconds: 15,
  },
  {
    id: "asset-extraction",
    label: "Finding Your Assets",
    description: "Discovering product photos, portfolio work, and brand elements",
    icon: Sparkles,
    estimatedSeconds: 10,
  },
  {
    id: "creative-strategy",
    label: "Planning Ad Strategy", 
    description: "Determining the best ad approach for your business type",
    icon: Zap,
    estimatedSeconds: 8,
  },
  {
    id: "image-generation",
    label: "Creating Custom Visuals",
    description: "Generating professional ad images tailored to your brand",
    icon: Image,
    estimatedSeconds: 30,
  },
  {
    id: "copy-generation",
    label: "Writing Ad Copy",
    description: "Crafting compelling headlines and text for your audience", 
    icon: PenTool,
    estimatedSeconds: 12,
  },
];

interface EnhancedProgressProps {
  isVisible: boolean;
  businessName?: string;
}

export function EnhancedProgress({ isVisible, businessName }: EnhancedProgressProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setCurrentStep(0);
      setProgress(0);
      setElapsedTime(0);
      return;
    }
    
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
      
      // Calculate which step we should be on based on elapsed time
      let totalTime = 0;
      let newStepIndex = 0;
      
      for (let i = 0; i < PROGRESS_STEPS.length; i++) {
        totalTime += PROGRESS_STEPS[i].estimatedSeconds;
        if (elapsedTime < totalTime) {
          newStepIndex = i;
          break;
        }
      }
      
      // Update current step if it changed
      if (newStepIndex !== currentStep && newStepIndex < PROGRESS_STEPS.length) {
        setCurrentStep(newStepIndex);
      }
      
      // Calculate progress within current step
      const stepElapsed = elapsedTime - PROGRESS_STEPS.slice(0, currentStep).reduce((sum, step) => sum + step.estimatedSeconds, 0);
      const stepProgress = Math.min((stepElapsed / PROGRESS_STEPS[currentStep]?.estimatedSeconds) * 100, 100);
      
      // Calculate overall progress
      const overallProgress = Math.min(
        ((currentStep * 100) + stepProgress) / PROGRESS_STEPS.length,
        100
      );
      
      setProgress(overallProgress);
    }, 1000);

    return () => clearInterval(interval);
  }, [isVisible, elapsedTime, currentStep]);

  if (!isVisible) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4">
        <CardContent className="pt-8 pb-6">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
              <h2 className="text-2xl font-bold">Creating Your Personalized Ads</h2>
            </div>
            {businessName && (
              <p className="text-muted-foreground">
                Analyzing {businessName} and building custom campaigns...
              </p>
            )}
          </div>

          {/* Overall Progress */}
          <div className="mb-8">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">Overall Progress</span>
              <span className="text-muted-foreground">{formatTime(elapsedTime)} elapsed</span>
            </div>
            <Progress value={progress} className="h-3" />
            <div className="text-center text-xs text-muted-foreground mt-1">
              {Math.round(progress)}% complete
            </div>
          </div>

          {/* Step Progress */}
          <div className="space-y-4">
            {PROGRESS_STEPS.map((step, index) => {
              const isComplete = index < currentStep;
              const isCurrent = index === currentStep;
              
              const IconComponent = step.icon;
              
              return (
                <div 
                  key={step.id} 
                  className={`flex items-center gap-4 p-4 rounded-lg transition-all ${
                    isCurrent ? 'bg-primary/10 border-2 border-primary/20' :
                    isComplete ? 'bg-green-50 border border-green-200' :
                    'bg-muted/30'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {isComplete ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : isCurrent ? (
                      <div className="relative">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      </div>
                    ) : (
                      <Circle className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <IconComponent className={`w-4 h-4 ${
                        isCurrent ? 'text-primary' :
                        isComplete ? 'text-green-600' :
                        'text-muted-foreground'
                      }`} />
                      <h3 className={`font-medium ${
                        isCurrent ? 'text-primary' :
                        isComplete ? 'text-green-700' :
                        'text-muted-foreground'
                      }`}>
                        {step.label}
                      </h3>
                      {isCurrent && (
                        <div className="flex items-center gap-1 text-xs text-primary ml-2">
                          <div className="w-1 h-1 bg-primary rounded-full animate-pulse" />
                          <div className="w-1 h-1 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                          <div className="w-1 h-1 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                        </div>
                      )}
                    </div>
                    <p className={`text-sm mt-1 ${
                      isCurrent ? 'text-foreground' :
                      isComplete ? 'text-green-600' :
                      'text-muted-foreground'
                    }`}>
                      {step.description}
                    </p>
                  </div>
                  
                  <div className="flex-shrink-0 text-xs text-muted-foreground">
                    ~{step.estimatedSeconds}s
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-6 text-center text-xs text-muted-foreground">
            ✨ We're creating ads specifically for your business using AI analysis
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

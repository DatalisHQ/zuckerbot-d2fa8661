import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, AlertCircle, Brain, Search, Globe, Target, TrendingUp, Zap } from "lucide-react";

interface AnalysisStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  duration?: number;
  icon: React.ReactNode;
}

interface AnalysisProgressProps {
  steps: AnalysisStep[];
  currentStep?: string;
  progress?: number;
  thinkingMessage?: string;
}

export const AnalysisProgress = ({ 
  steps, 
  currentStep, 
  progress = 0, 
  thinkingMessage 
}: AnalysisProgressProps) => {
  const getStepIcon = (step: AnalysisStep) => {
    if (step.status === 'completed') {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    if (step.status === 'error') {
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
    if (step.status === 'active') {
      return (
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      );
    }
    return <Clock className="w-5 h-5 text-muted-foreground" />;
  };

  const getStepStatus = (step: AnalysisStep) => {
    switch (step.status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Completed</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-blue-500 animate-pulse">Processing</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="space-y-6">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Analysis Progress</h3>
              <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>

          {/* Current Thinking Message */}
          {thinkingMessage && (
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-4 rounded-lg border border-primary/20">
              <div className="flex items-center gap-3">
                <Brain className="w-5 h-5 text-primary animate-pulse" />
                <div>
                  <p className="font-medium text-primary">AI Thinking...</p>
                  <p className="text-sm text-muted-foreground">{thinkingMessage}</p>
                </div>
              </div>
            </div>
          )}

          {/* Step-by-step Progress */}
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-start gap-4">
                {/* Step Number & Icon */}
                <div className="flex flex-col items-center">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    ${step.status === 'completed' ? 'bg-green-500/20 text-green-500' : 
                      step.status === 'active' ? 'bg-primary/20 text-primary' :
                      step.status === 'error' ? 'bg-red-500/20 text-red-500' :
                      'bg-muted text-muted-foreground'}
                  `}>
                    {getStepIcon(step)}
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`
                      w-0.5 h-8 mt-2
                      ${step.status === 'completed' ? 'bg-green-500/30' : 'bg-border'}
                    `} />
                  )}
                </div>

                {/* Step Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className={`
                      font-medium
                      ${step.status === 'active' ? 'text-primary' : 
                        step.status === 'completed' ? 'text-foreground' : 
                        'text-muted-foreground'}
                    `}>
                      {step.title}
                    </h4>
                    {getStepStatus(step)}
                  </div>
                  <p className={`
                    text-sm
                    ${step.status === 'active' ? 'text-foreground' : 'text-muted-foreground'}
                  `}>
                    {step.description}
                  </p>
                  {step.duration && step.status === 'completed' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Completed in {step.duration}s
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Predefined step templates for different analysis types
export const ANALYSIS_STEPS = {
  BRAND_ANALYSIS: [
    {
      id: 'website-scrape',
      title: 'Website Scraping',
      description: 'Extracting content and structure from the target website',
      status: 'pending' as const,
      icon: <Globe className="w-4 h-4" />
    },
    {
      id: 'content-analysis',
      title: 'Content Analysis',
      description: 'Analyzing website content to identify brand characteristics',
      status: 'pending' as const,
      icon: <Brain className="w-4 h-4" />
    },
    {
      id: 'brand-extraction',
      title: 'Brand Intelligence',
      description: 'Extracting brand name, products, and value propositions',
      status: 'pending' as const,
      icon: <Target className="w-4 h-4" />
    },
    {
      id: 'categorization',
      title: 'Market Categorization',
      description: 'Determining business category and market niche',
      status: 'pending' as const,
      icon: <TrendingUp className="w-4 h-4" />
    }
  ],
  
  COMPETITOR_DISCOVERY: [
    {
      id: 'market-research',
      title: 'Market Research',
      description: 'Searching for companies in similar market segments',
      status: 'pending' as const,
      icon: <Search className="w-4 h-4" />
    },
    {
      id: 'competitor-identification',
      title: 'Competitor Identification',
      description: 'Identifying potential competitors based on brand analysis',
      status: 'pending' as const,
      icon: <Target className="w-4 h-4" />
    },
    {
      id: 'similarity-scoring',
      title: 'Similarity Analysis',
      description: 'Calculating competitor similarity and threat levels',
      status: 'pending' as const,
      icon: <Brain className="w-4 h-4" />
    },
    {
      id: 'competitor-ranking',
      title: 'Competitive Ranking',
      description: 'Ranking competitors by relevance and market overlap',
      status: 'pending' as const,
      icon: <TrendingUp className="w-4 h-4" />
    }
  ],

  COMPETITOR_INTELLIGENCE: [
    {
      id: 'website-analysis',
      title: 'Website Deep Dive',
      description: 'Comprehensive analysis of competitor website and content',
      status: 'pending' as const,
      icon: <Globe className="w-4 h-4" />
    },
    {
      id: 'feature-extraction',
      title: 'Feature Analysis',
      description: 'Identifying core features, integrations, and capabilities',
      status: 'pending' as const,
      icon: <Zap className="w-4 h-4" />
    },
    {
      id: 'pricing-analysis',
      title: 'Pricing Intelligence',
      description: 'Analyzing pricing models, plans, and strategies',
      status: 'pending' as const,
      icon: <Target className="w-4 h-4" />
    },
    {
      id: 'social-analysis',
      title: 'Social Presence',
      description: 'Evaluating social media presence and engagement',
      status: 'pending' as const,
      icon: <TrendingUp className="w-4 h-4" />
    },
    {
      id: 'sentiment-analysis',
      title: 'Sentiment Analysis',
      description: 'Analyzing customer reviews and market sentiment',
      status: 'pending' as const,
      icon: <Brain className="w-4 h-4" />
    }
  ]
};
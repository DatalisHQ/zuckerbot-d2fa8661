import { useState, useCallback } from 'react';

interface AnalysisStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  duration?: number;
  icon: React.ReactNode;
}

interface UseAnalysisProgressProps {
  steps: AnalysisStep[];
}

export const useAnalysisProgress = ({ steps: initialSteps }: UseAnalysisProgressProps) => {
  const [steps, setSteps] = useState<AnalysisStep[]>(initialSteps);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [thinkingMessage, setThinkingMessage] = useState<string>('');

  const startStep = useCallback((stepId: string, message?: string) => {
    setSteps(prev => prev.map(step => ({
      ...step,
      status: step.id === stepId ? 'active' : 
              prev.find(s => s.id === step.id)?.status === 'completed' ? 'completed' : 
              'pending'
    })));
    setCurrentStepId(stepId);
    if (message) setThinkingMessage(message);
    
    // Update progress based on step position
    const stepIndex = initialSteps.findIndex(s => s.id === stepId);
    const progressValue = ((stepIndex) / initialSteps.length) * 100;
    setProgress(progressValue);
  }, [initialSteps]);

  const completeStep = useCallback((stepId: string, duration?: number) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, status: 'completed', duration }
        : step
    ));
    
    // Update progress
    const stepIndex = initialSteps.findIndex(s => s.id === stepId);
    const progressValue = ((stepIndex + 1) / initialSteps.length) * 100;
    setProgress(progressValue);
    
    // Clear thinking message when step completes
    if (currentStepId === stepId) {
      setThinkingMessage('');
    }
  }, [initialSteps, currentStepId]);

  const errorStep = useCallback((stepId: string, errorMessage?: string) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, status: 'error' }
        : step
    ));
    if (errorMessage) setThinkingMessage(errorMessage);
  }, []);

  const reset = useCallback(() => {
    setSteps(initialSteps.map(step => ({ ...step, status: 'pending' })));
    setCurrentStepId(null);
    setProgress(0);
    setThinkingMessage('');
  }, [initialSteps]);

  const updateThinkingMessage = useCallback((message: string) => {
    setThinkingMessage(message);
  }, []);

  const getCurrentStep = useCallback(() => {
    return steps.find(step => step.status === 'active');
  }, [steps]);

  const isCompleted = progress === 100;
  const hasError = steps.some(step => step.status === 'error');

  return {
    steps,
    currentStepId,
    progress,
    thinkingMessage,
    isCompleted,
    hasError,
    startStep,
    completeStep,
    errorStep,
    reset,
    updateThinkingMessage,
    getCurrentStep
  };
};
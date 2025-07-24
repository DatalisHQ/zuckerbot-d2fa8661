import { useState, useEffect } from 'react';
import { Brain, Zap, Search, Globe, TrendingUp, Target } from 'lucide-react';

interface ThinkingIndicatorProps {
  isActive?: boolean;
  message?: string;
  stage?: 'scraping' | 'analyzing' | 'processing' | 'thinking' | 'finalizing';
}

const THINKING_MESSAGES = {
  scraping: [
    "Crawling through website content...",
    "Extracting text and structure...",
    "Parsing HTML elements...",
    "Gathering page information..."
  ],
  analyzing: [
    "Processing content with AI...",
    "Identifying key patterns...",
    "Extracting insights...",
    "Analyzing business model..."
  ],
  processing: [
    "Connecting data points...",
    "Building competitive profile...",
    "Cross-referencing information...",
    "Generating intelligence report..."
  ],
  thinking: [
    "AI is deep thinking...",
    "Connecting market dots...",
    "Evaluating competitive landscape...",
    "Synthesizing strategic insights..."
  ],
  finalizing: [
    "Preparing final analysis...",
    "Organizing insights...",
    "Formatting results...",
    "Almost ready..."
  ]
};

const STAGE_ICONS = {
  scraping: Globe,
  analyzing: Brain,
  processing: Zap,
  thinking: Target,
  finalizing: TrendingUp
};

export const ThinkingIndicator = ({ 
  isActive = false, 
  message, 
  stage = 'thinking' 
}: ThinkingIndicatorProps) => {
  const [currentMessage, setCurrentMessage] = useState(message || THINKING_MESSAGES[stage][0]);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    const messages = THINKING_MESSAGES[stage];
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [isActive, stage]);

  useEffect(() => {
    if (message) {
      setCurrentMessage(message);
    } else if (isActive) {
      setCurrentMessage(THINKING_MESSAGES[stage][messageIndex]);
    }
  }, [message, messageIndex, stage, isActive]);

  if (!isActive) return null;

  const Icon = STAGE_ICONS[stage];

  return (
    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20 animate-pulse">
      <div className="relative">
        <Icon className="w-6 h-6 text-primary animate-pulse" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-ping" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
          <span className="text-xs font-medium text-primary uppercase tracking-wider">
            AI Processing
          </span>
        </div>
        <p className="text-sm text-foreground font-medium">{currentMessage}</p>
      </div>
    </div>
  );
};
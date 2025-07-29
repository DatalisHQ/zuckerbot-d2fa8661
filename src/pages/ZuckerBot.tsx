import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Bot, User, Sparkles, Plus, Edit, TrendingUp, Target, Zap, Upload, Image } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { TypingText } from "@/components/TypingText";
import { Navbar } from "@/components/Navbar";
import { AdSetCard } from "@/components/AdSetCard";
import { CompetitorFlow } from "@/pages/CompetitorFlow";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isTyping?: boolean;
  prompts?: string[];
  adSets?: any[];
  campaignId?: string;
  pipelineResults?: any;
}

const PREDEFINED_PROMPTS = [
  {
    icon: Plus,
    title: "Run A Campaign",
    prompt: "Help me create and launch a new Meta advertising campaign",
    color: "from-green-500 to-emerald-600",
    action: "create_campaign"
  },
  {
    icon: TrendingUp,
    title: "Monitor Performance",
    prompt: "Take me to the dashboard to optimize my Meta ads performance",
    color: "from-purple-500 to-violet-600",
    action: "monitor_performance"
  },
  {
    icon: Target,
    title: "Spy on Competition",
    prompt: "Analyze my competitors' advertising strategies",
    color: "from-yellow-500 to-amber-600",
    disabled: true,
    comingSoon: true
  },
  {
    icon: Edit,
    title: "Generate Ads",
    prompt: "Generate ad creatives and copy automatically",
    color: "from-blue-500 to-cyan-600", 
    disabled: true,
    comingSoon: true
  },
];

const ZuckerBot = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [businessContext, setBusinessContext] = useState<any>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [showCompetitorFlow, setShowCompetitorFlow] = useState(false);
  const [competitorInsights, setCompetitorInsights] = useState<any>(null);
  const [selectedAngle, setSelectedAngle] = useState<any>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const loadUserAndBusiness = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          navigate("/auth");
          return;
        }

        setUser(session.user);

        // Load user profile and check onboarding status
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        console.log('ZuckerBot - User ID:', session.user.id); // Debug log
        console.log('ZuckerBot - User profile:', profile); // Debug log
        console.log('ZuckerBot - Profile error:', profileError); // Debug log

        // If user hasn't completed onboarding, redirect
        if (!profile?.onboarding_completed) {
          console.log('ZuckerBot - Onboarding not completed, redirecting to onboarding');
          navigate("/onboarding");
          return;
        }

        console.log('ZuckerBot - Onboarding completed, loading business context');

        const { data: brandAnalysis } = await supabase
          .from('brand_analysis')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        setBusinessContext({ profile, brandAnalysis });

        // Set welcome message
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: "What do you want to do?",
            timestamp: new Date(),
          },
        ]);
      } catch (error) {
        console.error("Error loading user context:", error);
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: "What do you want to do?",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoadingContext(false);
      }
    };

    loadUserAndBusiness();
  }, []);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (messageText?: string) => {
    const messageToSend = messageText || input;
    if (!messageToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageToSend,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Add typing message immediately
    const typingMessage: Message = {
      id: "typing-" + Date.now(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isTyping: true,
    };
    setMessages(prev => [...prev, typingMessage]);

    try {
      // Check if this is a "Create Campaign" request to trigger competitor research first
      if (messageToSend.toLowerCase().includes('create') && messageToSend.toLowerCase().includes('campaign')) {
        console.log('🚀 Create campaign detected, showing competitor flow');
        console.log('📋 Business context:', businessContext);
        console.log('🏢 Brand analysis ID:', businessContext?.brandAnalysis?.id);
        
        // Remove typing message and show competitor flow
        setMessages(prev => {
          const filtered = prev.filter(msg => !msg.isTyping);
          return [...filtered, {
            id: Date.now().toString(),
            role: "assistant",
            content: "🎯 **Let's create your campaign!**\n\nTo generate the most effective ads, I recommend analyzing your competitors first. This helps us understand what's working in your market and find unique angles.\n\n✨ **What happens next:**\n• Competitor research (optional but recommended)\n• AI analyzes your brand + competition\n• Generate 3 high-converting ad sets\n\nReady to start?",
            timestamp: new Date(),
          }];
        });
        setShowCompetitorFlow(true);
        setIsLoading(false);
        return;
      } else {
        // Regular chat message
        const { data, error } = await supabase.functions.invoke("zuckerbot-assistant", {
          body: {
            message: messageToSend,
            conversation_history: messages.slice(-10),
            business_context: businessContext,
          },
        });

        if (error) throw error;

        // Remove typing message and add real response
        setMessages(prev => {
          const filtered = prev.filter(msg => !msg.isTyping);
          
          // Parse response for prompts
          let responseContent = data.response;
          let prompts: string[] = [];
          
          // Look for PROMPTS section in response
          if (responseContent.includes("PROMPTS:")) {
            const parts = responseContent.split("PROMPTS:");
            responseContent = parts[0].trim();
            if (parts[1]) {
              prompts = parts[1]
                .split("\n")
                .map(p => p.replace(/^[-•*]\s*/, "").trim())
                .filter(p => p.length > 0);
            }
          } else {
            // Also look for square bracket format like [More Leads]
            const bracketRegex = /\[([^\]]+)\]/g;
            const matches = responseContent.match(bracketRegex);
            if (matches) {
              prompts = matches.map(match => match.replace(/[\[\]]/g, ""));
              // Remove the bracket prompts from the main response
              responseContent = responseContent.replace(bracketRegex, "").trim();
            }
          }
          
          return [...filtered, {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: responseContent,
            timestamp: new Date(),
            prompts,
          }];
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages(prev => prev.filter(msg => !msg.isTyping));
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompetitorFlowComplete = async (competitorInsights: any, selectedAngle: any, audienceSegments?: any[]) => {
    setCompetitorInsights(competitorInsights);
    setSelectedAngle(selectedAngle);
    setShowCompetitorFlow(false);
    
    // Add message about starting pipeline
    const pipelineMessage: Message = {
      id: Date.now().toString(),
      role: "assistant",
      content: "🚀 Launching AI Campaign Creation Pipeline...\n\n⏳ **Step 1:** Analyzing your brand and previous ads...\n⏳ **Step 2:** Selecting optimal ad frameworks...\n⏳ **Step 3:** Generating personalized ad sets...\n\nThis may take 30-60 seconds.",
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, pipelineMessage]);
    setIsLoading(true);

    try {
      // Get user's latest brand analysis
      const { data: brandAnalysis } = await supabase
        .from('brand_analysis')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      // Call the 3-agent pipeline with competitor insights
      const { data: pipelineData, error: pipelineError } = await supabase.functions.invoke('ad-creation-pipeline', {
        body: {
          userId: user.id,
          businessContext: businessContext,
          brandAnalysisId: brandAnalysis?.[0]?.id,
          competitorInsights,
          selectedAngle
        }
      });

      if (pipelineError) throw pipelineError;

      const { brand_analysis, framework_selection, generated_ads, campaign_id } = pipelineData;

      // Update message with results
      setMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== pipelineMessage.id);
        return [...filtered, {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "✅ **Campaign Created Successfully!**\n\nI've analyzed your competitors and created 3 personalized ad sets using proven frameworks:",
          timestamp: new Date(),
          adSets: generated_ads?.ads || [],
          campaignId: campaign_id,
          pipelineResults: {
            brand_analysis,
            framework_selection, 
            generated_ads,
            competitorInsights,
            selectedAngle
          }
        }];
      });
    } catch (error) {
      console.error("Error in pipeline:", error);
      toast({
        title: "Pipeline Error",
        description: "Failed to generate ads. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePredefinedPrompt = (prompt: any) => {
    if (typeof prompt === 'string') {
      sendMessage(prompt);
    } else {
      // Handle action-based prompts
      if (prompt.action === 'create_campaign') {
        sendMessage(prompt.prompt);
      } else if (prompt.action === 'monitor_performance') {
        navigate('/dashboard');
      } else {
        sendMessage(prompt.prompt);
      }
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newImages = Array.from(files);
      setUploadedImages(prev => [...prev, ...newImages]);
      
      const imageNames = newImages.map(file => file.name).join(", ");
      sendMessage(`I've uploaded these images for my ad creative: ${imageNames}. Now help me create ad copy that works with these visuals.`);
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Show competitor flow if requested
  if (showCompetitorFlow) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <CompetitorFlow 
          brandAnalysisId={businessContext?.brandAnalysis?.id}
          brandUrl={businessContext?.brandAnalysis?.brand_url}
          onFlowComplete={handleCompetitorFlowComplete}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-primary/10 p-3 rounded-full mr-3">
              <span className="text-xl font-bold text-primary zuckerbot-brand">Z</span>
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent zuckerbot-brand">
              ZuckerBot.ai
            </h1>
            <Sparkles className="h-6 w-6 text-primary ml-2" />
          </div>
          <p className="text-lg text-muted-foreground">
            Your AI-powered Meta advertising assistant
          </p>
        </div>

        
        {/* Chat Header */}
        <div className="border-b bg-card/80 backdrop-blur p-4 rounded-t-lg mb-6">
          <h2 className="text-center text-lg font-medium">
            Chat with ZuckerBot
          </h2>
        </div>

        {/* Predefined Prompts */}
        {messages.length === 1 && (
          <div className="mb-6">
            <div className="flex flex-wrap justify-center gap-2">
              {PREDEFINED_PROMPTS.map((prompt, index) => {
                const IconComponent = prompt.icon;
                return (
                  <div key={index} className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-auto px-3 py-2 flex items-center space-x-2 transition-all duration-200 border-border/50 ${
                        prompt.disabled 
                          ? 'opacity-50 cursor-not-allowed' 
                          : 'hover:shadow-md hover:border-primary/30'
                      }`}
                      onClick={() => handlePredefinedPrompt(prompt)}
                      disabled={isLoading || prompt.disabled}
                    >
                      <div className={`w-5 h-5 rounded bg-gradient-to-r ${prompt.color} flex items-center justify-center`}>
                        <IconComponent className="h-3 w-3 text-white" />
                      </div>
                      <span className="font-medium text-sm">{prompt.title}</span>
                    </Button>
                    {prompt.comingSoon && (
                      <div className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs px-1 py-0.5 rounded-full">
                        Soon
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Card className="h-[70vh] flex flex-col shadow-lg border-0 bg-card/50 backdrop-blur">
          
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-full p-6" ref={scrollAreaRef}>
              <div className="space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex items-start space-x-3 max-w-[80%] ${
                        message.role === "user" ? "flex-row-reverse space-x-reverse" : ""
                      }`}
                    >
                      <Avatar className="h-8 w-8 border-2 border-background shadow-sm">
                        <AvatarFallback className={
                          message.role === "user" 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-gradient-to-br from-blue-500 to-purple-600 text-white"
                        }>
                          {message.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div
                        className={`rounded-2xl px-4 py-3 shadow-sm ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/50 text-foreground border"
                        }`}
                      >
                         <p className="text-sm leading-relaxed whitespace-pre-wrap">
                           {message.role === "assistant" && !message.isTyping ? (
                             <TypingText text={message.content} speed={30} />
                           ) : (
                             message.content
                           )}
                         </p>
                         
                         {/* Display Ad Sets if present */}
                         {message.role === "assistant" && message.adSets && message.adSets.length > 0 && (
                           <div className="mt-4 space-y-4">
                             <h4 className="font-semibold text-sm">Generated Ad Sets:</h4>
                             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                               {message.adSets.map((adSet: any, index: number) => (
                                 <AdSetCard
                                   key={index}
                                   adSet={{
                                     ...adSet,
                                     campaign_id: message.campaignId
                                   }}
                                   onRegenerate={(adSet) => {
                                     // TODO: Implement regenerate functionality
                                     console.log('Regenerate:', adSet);
                                   }}
                                   onSave={(adSet) => {
                                     console.log('Saved:', adSet);
                                   }}
                                 />
                               ))}
                             </div>
                           </div>
                         )}
                         
                         {/* Interactive Prompts */}
                         {message.role === "assistant" && message.prompts && message.prompts.length > 0 && (
                           <div className="mt-4 space-y-2">
                             <p className="text-xs font-medium text-muted-foreground mb-2">Quick replies:</p>
                             <div className="flex flex-wrap gap-2">
                               {message.prompts.map((prompt, index) => (
                                 <Button
                                   key={index}
                                   variant="outline"
                                   size="sm"
                                   className="h-auto px-3 py-2 text-xs hover:bg-primary hover:text-primary-foreground transition-colors"
                                   onClick={() => handlePredefinedPrompt(prompt)}
                                   disabled={isLoading}
                                 >
                                   {prompt}
                                 </Button>
                               ))}
                             </div>
                           </div>
                         )}
                         
                         <span className="text-xs opacity-70 mt-2 block">
                           {message.timestamp.toLocaleTimeString([], {
                             hour: "2-digit",
                             minute: "2-digit",
                           })}
                         </span>
                      </div>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-start space-x-3 max-w-[80%]">
                      <Avatar className="h-8 w-8 border-2 border-background shadow-sm">
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                          <Bot className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="rounded-2xl px-4 py-3 bg-muted/50 border">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>

          <div className="border-t bg-card/80 backdrop-blur p-4">
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0"
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Input
                placeholder="Ask ZuckerBot about ad copy, campaigns, or strategy..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="flex-1 border-0 bg-muted/50 focus-visible:ring-1"
              />
              <Button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ZuckerBot;
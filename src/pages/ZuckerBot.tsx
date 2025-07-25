import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Bot, User, Sparkles, Plus, Edit, TrendingUp, Target, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { TypingText } from "@/components/TypingText";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isTyping?: boolean;
}

const PREDEFINED_PROMPTS = [
  {
    icon: Plus,
    title: "Create Campaign",
    prompt: "Help me create a new Meta advertising campaign. I'll provide details about my product/service and target audience.",
    color: "from-green-500 to-emerald-600"
  },
  {
    icon: Edit,
    title: "Update Campaign", 
    prompt: "I need help optimizing an existing Meta ads campaign. Let me share the current performance data and areas I want to improve.",
    color: "from-blue-500 to-cyan-600"
  },
  {
    icon: TrendingUp,
    title: "Analyze Performance",
    prompt: "Analyze my Meta ads performance data and provide recommendations for improvement and optimization.",
    color: "from-purple-500 to-violet-600"
  },
  {
    icon: Zap,
    title: "Write Ad Copy",
    prompt: "Create compelling ad copy for my Meta advertising campaign. I'll provide product details and target audience information.",
    color: "from-yellow-500 to-amber-600"
  },
];

const ZuckerBot = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [businessContext, setBusinessContext] = useState<any>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
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
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        console.log('ZuckerBot - User profile:', profile); // Debug log

        // If user hasn't completed onboarding, redirect
        if (!profile?.onboarding_completed) {
          navigate("/onboarding");
          return;
        }

        const { data: brandAnalysis } = await supabase
          .from('brand_analysis')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        setBusinessContext({ profile, brandAnalysis });

        // Set personalized welcome message
        const businessName = profile?.business_name || brandAnalysis?.brand_name || "your business";
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: `👋 Hey there! I'm ZuckerBot, your personalized Meta ads assistant for ${businessName}. I've analyzed your business and I'm ready to help you create winning campaigns, write compelling ad copy, and optimize your advertising strategy. What would you like to work on today?`,
            timestamp: new Date(),
          },
        ]);
      } catch (error) {
        console.error("Error loading user context:", error);
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: "👋 Hey there! I'm ZuckerBot, your Meta ads AI assistant. I can help you create winning ad copy, analyze your competition, and build campaigns that convert. What would you like to work on today?",
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
        return [...filtered, {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response,
          timestamp: new Date(),
        }];
      });
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

  const handlePredefinedPrompt = (prompt: string) => {
    sendMessage(prompt);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-primary/10 p-3 rounded-full mr-3">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              ZuckerBot
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
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="h-auto px-3 py-2 flex items-center space-x-2 hover:shadow-md transition-all duration-200 border-border/50 hover:border-primary/30"
                    onClick={() => handlePredefinedPrompt(prompt.prompt)}
                    disabled={isLoading}
                  >
                    <div className={`w-5 h-5 rounded bg-gradient-to-r ${prompt.color} flex items-center justify-center`}>
                      <IconComponent className="h-3 w-3 text-white" />
                    </div>
                    <span className="font-medium text-sm">{prompt.title}</span>
                  </Button>
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
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ZuckerBot;
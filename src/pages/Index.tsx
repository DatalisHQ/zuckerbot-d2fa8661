import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from '@supabase/supabase-js';
import { LogOut, User as UserIcon, Bot, MessageCircle, Sparkles, Zap, Target, Code, Facebook, Send } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const Index = () => {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [demoInput, setDemoInput] = useState("");
  const [demoMessage, setDemoMessage] = useState("");

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleDemoSubmit = () => {
    if (!demoInput.trim()) return;
    
    // Show the user's message
    setDemoMessage(demoInput);
    setDemoInput("");
    
    // After a short delay, scroll to sign up button
    setTimeout(() => {
      const signUpButton = document.querySelector('[href="/auth"]');
      if (signUpButton) {
        signUpButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 1500);
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast({
        title: "Signed out successfully",
        description: "You have been logged out of your account.",
      });
    } catch (error: any) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-background/50" />
      
      {/* Floating orbs */}
      <div className="absolute top-20 left-1/4 w-64 h-64 bg-gradient-primary rounded-full opacity-10 blur-3xl animate-float" />
      <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-gradient-primary rounded-full opacity-5 blur-3xl animate-float" style={{ animationDelay: '3s' }} />

      <div className="relative z-10">
        {/* Navigation */}
        <nav className="glass border-b border-border/50 sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center glow-sm">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold gradient-text">ZuckerBot</span>
              </div>
              
              <div className="flex items-center space-x-4">
                {user ? (
                  <>
                     <Link to="/zuckerbot">
                       <Button variant="ghost" className="text-foreground hover:text-primary">
                         <MessageCircle className="w-4 h-4 mr-2" />
                         Open Chat
                       </Button>
                     </Link>
                     <Link to="/pricing">
                       <Button variant="ghost" className="text-foreground hover:text-primary">
                         <Sparkles className="w-4 h-4 mr-2" />
                         Upgrade
                       </Button>
                     </Link>
                    <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-muted/50">
                      <UserIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground">{user.email}</span>
                    </div>
                    <Button 
                      onClick={handleSignOut}
                      variant="ghost" 
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <LogOut className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center space-x-3">
                    <Link to="/auth">
                      <Button variant="ghost" className="text-foreground hover:text-primary">
                        Sign In
                      </Button>
                    </Link>
                    <Link to="/auth">
                      <Button className="btn-primary">
                        Get Started
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="container mx-auto px-4 py-20">
          <div className="text-center space-y-8 mb-16 animate-fade-in-up">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-muted/50 border border-border/50">
              <Facebook className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">AI-powered Facebook advertising assistant</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              <span className="gradient-text">ZuckerBot</span>
              <br />
              <span className="text-foreground">AI Assistant</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Vibe Coding for Facebook Ads. Get instant AI-powered advice for your Facebook advertising campaigns, 
              ad copy optimization, and targeting strategies. Chat with our AI to level up your Meta advertising game.
            </p>
          </div>
            
          {/* Interactive ZuckerBot Demo - Main CTA */}
          <div className="animate-fade-in-up mb-16" style={{ animationDelay: '0.3s' }}>
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-4">Try ZuckerBot Now</h2>
                <p className="text-muted-foreground text-lg">
                  Ask a question and see how ZuckerBot can help with your Facebook ads
                </p>
              </div>
              
              <div className="modern-card max-w-2xl mx-auto p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center">
                    <Bot className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="font-semibold">ZuckerBot</div>
                    <div className="text-sm text-muted-foreground">Online now</div>
                  </div>
                </div>
                
                <div className="space-y-4 mb-6">
                  <div className="bg-muted/50 rounded-lg p-4 max-w-xs">
                    <p className="text-sm">Hey! I'm ZuckerBot, your Facebook ads AI assistant. What can I help you with today?</p>
                  </div>
                  {demoMessage && (
                    <div className="bg-primary/10 rounded-lg p-4 max-w-xs ml-auto text-right border border-primary/20">
                      <p className="text-sm">{demoMessage}</p>
                    </div>
                  )}
                  {demoMessage && (
                    <div className="bg-muted/50 rounded-lg p-4 max-w-md">
                      <p className="text-sm">I'd love to help you with that! To get personalized assistance and access my full capabilities, please sign up for free.</p>
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <div className="flex space-x-2">
                    <Input
                      placeholder="Ask ZuckerBot anything about Facebook ads..."
                      value={demoInput}
                      onChange={(e) => setDemoInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleDemoSubmit();
                        }
                      }}
                      className="flex-1"
                    />
                    <Button 
                      onClick={handleDemoSubmit}
                      disabled={!demoInput.trim()}
                      size="icon"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="text-center">
                    {user ? (
                      <Link to="/zuckerbot">
                        <Button className="btn-primary">
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Continue This Conversation
                        </Button>
                      </Link>
                    ) : (
                      <Link to="/auth">
                        <Button className="btn-primary">
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Sign Up to Start Chatting
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Features Section */}
        <div className="container mx-auto px-4 pb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Everything you need to optimize your Facebook ads</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From strategy to execution, ZuckerBot provides comprehensive Facebook advertising assistance
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 mb-16 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            <div className="modern-card text-center group">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-4 glow-sm group-hover:glow-primary transition-all duration-300">
                <MessageCircle className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Chat Assistant</h3>
              <p className="text-muted-foreground">
                Chat with ZuckerBot to get instant advice on your Facebook ad campaigns and strategy.
              </p>
            </div>
            
            <div className="modern-card text-center group">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-4 glow-sm group-hover:glow-primary transition-all duration-300">
                <Code className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Ad Copy Generation</h3>
              <p className="text-muted-foreground">
                Generate high-converting ad copy and creative ideas tailored to your brand and audience.
              </p>
            </div>
            
            <div className="modern-card text-center group">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-4 glow-sm group-hover:glow-primary transition-all duration-300">
                <Target className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Targeting Optimization</h3>
              <p className="text-muted-foreground">
                Get expert advice on audience targeting, campaign structure, and performance optimization.
              </p>
            </div>
          </div>
          
          {/* CTA Section - Moved from hero */}
          <div className="text-center py-16">
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              {!user ? (
                <>
                  <Link to="/auth">
                    <Button size="lg" className="btn-primary h-14 px-8 text-lg">
                      <MessageCircle className="w-5 h-5 mr-2" />
                      Start Chatting - Sign Up Free
                    </Button>
                  </Link>
                  <Link to="/pricing">
                    <Button variant="outline" size="lg" className="h-14 px-8 text-lg border-border/50">
                      <Sparkles className="w-5 h-5 mr-2" />
                      View Pricing Plans
                    </Button>
                  </Link>
                </>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link to="/zuckerbot">
                    <Button size="lg" className="btn-primary h-14 px-8 text-lg">
                      <MessageCircle className="w-5 h-5 mr-2" />
                      Open ZuckerBot Chat
                    </Button>
                  </Link>
                  <Link to="/pricing">
                    <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-border/50">
                      <Sparkles className="w-5 h-5 mr-2" />
                      Upgrade to Pro
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
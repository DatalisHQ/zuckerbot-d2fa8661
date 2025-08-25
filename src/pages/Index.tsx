import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from '@supabase/supabase-js';
import { LogOut, User as UserIcon, Bot, MessageCircle, Sparkles, Zap, Target, Code, Facebook, Send } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useEnhancedAuth, validateSession } from "@/utils/auth";

const Index = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { logout } = useEnhancedAuth();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [demoInput, setDemoInput] = useState("");
  const [demoMessage, setDemoMessage] = useState("");

  useEffect(() => {
    console.log('[Index] Setting up auth state listener');
    
    // Auth state listener - simplified for Index page
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Index] Auth state change:', { event, hasSession: !!session, userId: session?.user?.id });
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    // Simple initial session check
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[Index] Error getting session:', error);
      } else {
        console.log('[Index] Initial session check:', { hasSession: !!session, userId: session?.user?.id });
      }
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Clean up URL parameters if Facebook OAuth redirect
    const urlParams = new URLSearchParams(window.location.search);
    const facebookConnected = urlParams.get('facebook');
    
    if (facebookConnected === 'connected') {
      // Clean up URL parameters
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }

    return () => subscription.unsubscribe();
  }, [toast]);

  const checkProfile = async () => {
    if (!user) return null;
    
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('onboarding_completed, business_name')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error("Profile check error:", error);
        return null;
      }

      return profile;
    } catch (error) {
      console.error("Unexpected profile check error:", error);
      return null;
    }
  };

  const handleGetStarted = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }

    const profile = await checkProfile();
    
    if (!profile) {
      navigate("/auth");
      return;
    }

    if (!profile.onboarding_completed) {
      navigate("/onboarding");
    } else {
      navigate("/dashboard");
    }
  };

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

  const handleSignOut = () => {
    logout(navigate, true);
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
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
      
      {/* Gentle floating elements */}
      <div className="absolute top-32 left-1/4 w-48 h-48 bg-gradient-primary rounded-full opacity-[0.03] blur-3xl animate-float" />
      <div className="absolute bottom-32 right-1/4 w-64 h-64 bg-gradient-primary rounded-full opacity-[0.02] blur-3xl animate-float" style={{ animationDelay: '4s' }} />

      <div className="relative z-10">
        {/* Navigation */}
        <nav className="glass border-b border-border/30 sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold gradient-text zuckerbot-brand">ZuckerBot</span>
                <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">AI</span>
              </div>
              
              <div className="flex items-center space-x-4">
                {user ? (
                  <>
                     <Link to="/dashboard">
                       <Button variant="ghost" className="text-foreground hover:text-primary hover:bg-muted/50">
                         <MessageCircle className="w-4 h-4 mr-2" />
                         Dashboard
                       </Button>
                     </Link>
                     <Link to="/pricing">
                       <Button variant="ghost" className="text-foreground hover:text-primary hover:bg-muted/50">
                         <Sparkles className="w-4 h-4 mr-2" />
                         Upgrade
                       </Button>
                     </Link>
                    <div className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
                      <UserIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground font-medium">{user.email?.split('@')[0]}</span>
                    </div>
                    <Button 
                      onClick={handleSignOut}
                      variant="ghost" 
                      size="sm"
                      className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    >
                      <LogOut className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center space-x-3">
                    <Link to="/auth">
                      <Button variant="ghost" className="text-foreground hover:text-primary hover:bg-muted/50">
                        Sign In
                      </Button>
                    </Link>
                    <Link to="/auth">
                      <Button className="btn-primary">
                        Get Started Free
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="container mx-auto px-6 py-24">
          <div className="text-center space-y-8 mb-20 animate-fade-in-up">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/10">
              <Facebook className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">AI Copilot for Facebook Ads</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight max-w-4xl mx-auto">
              <span className="gradient-text">Smarter campaigns,</span>
              <br />
              <span className="text-foreground">fewer clicks</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Save 15+ hours per week on ad operations. Get AI-powered insights, optimization recommendations, 
              and one-click campaign execution for your Facebook advertising campaigns.
            </p>
          </div>
            
          {/* Interactive Demo Section */}
          <div className="animate-fade-in-up mb-20" style={{ animationDelay: '0.3s' }}>
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold mb-4 text-foreground">Try ZuckerBot Now</h2>
                <p className="text-muted-foreground text-lg">
                  Ask any Facebook ads question and see how our AI copilot can help
                </p>
              </div>
              
              <div className="modern-card max-w-2xl mx-auto p-8 bg-card/60 backdrop-blur-sm">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center">
                    <span className="text-lg font-bold text-primary-foreground zuckerbot-brand">Z</span>
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">ZuckerBot</div>
                    <div className="text-sm text-success flex items-center">
                      <div className="w-2 h-2 bg-success rounded-full mr-2 animate-pulse"></div>
                      Online
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4 mb-6">
                  <div className="bg-muted/40 rounded-2xl p-4 max-w-sm border border-border/20">
                    <p className="text-sm text-foreground">Hey! I'm ZuckerBot, your Facebook ads AI copilot. What campaign challenge can I help you solve today?</p>
                  </div>
                  {demoMessage && (
                    <div className="bg-primary/10 rounded-2xl p-4 max-w-sm ml-auto text-right border border-primary/20">
                      <p className="text-sm text-foreground">{demoMessage}</p>
                    </div>
                  )}
                  {demoMessage && (
                    <div className="bg-muted/40 rounded-2xl p-4 max-w-md border border-border/20">
                      <p className="text-sm text-foreground">Great question! I'd love to provide you with personalized recommendations and access to my full campaign optimization capabilities. Please sign up for free to continue.</p>
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <div className="flex space-x-3">
                    <Input
                      placeholder="Ask about targeting, ad copy, budgets, or optimization..."
                      value={demoInput}
                      onChange={(e) => setDemoInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleDemoSubmit();
                        }
                      }}
                      className="flex-1 border-border/30 bg-background/50"
                    />
                    <Button 
                      onClick={handleDemoSubmit}
                      disabled={!demoInput.trim()}
                      size="icon"
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="text-center">
                    {user ? (
                      <Link to="/dashboard">
                        <Button className="btn-primary w-full sm:w-auto">
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Open Dashboard
                        </Button>
                      </Link>
                    ) : (
                      <Link to="/auth">
                        <Button className="btn-primary w-full sm:w-auto">
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Start Free Consultation
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
        <div className="container mx-auto px-6 pb-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4 text-foreground">Everything you need to optimize Facebook ads</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From strategy to execution, ZuckerBot provides comprehensive Facebook advertising assistance powered by AI
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 mb-20 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            <div className="modern-card text-center group hover:border-primary/20 transition-all duration-300">
              <div className="w-14 h-14 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-300">
                <MessageCircle className="w-7 h-7 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-foreground">AI Chat Assistant</h3>
              <p className="text-muted-foreground leading-relaxed">
                Get instant, expert-level advice on campaign strategy, audience targeting, and performance optimization through natural conversation.
              </p>
            </div>
            
            <div className="modern-card text-center group hover:border-primary/20 transition-all duration-300">
              <div className="w-14 h-14 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-300">
                <Code className="w-7 h-7 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-foreground">Campaign Creation</h3>
              <p className="text-muted-foreground leading-relaxed">
                Generate high-converting ad copy, optimize creative assets, and configure campaign settings with AI-powered recommendations.
              </p>
            </div>
            
            <div className="modern-card text-center group hover:border-primary/20 transition-all duration-300">
              <div className="w-14 h-14 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-300">
                <Target className="w-7 h-7 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-foreground">Performance Analysis</h3>
              <p className="text-muted-foreground leading-relaxed">
                Monitor campaign performance, identify optimization opportunities, and get actionable insights to improve your ROI.
              </p>
            </div>
          </div>
          
          {/* FAQ Section */}
          <div className="py-20 border-t border-border/20">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4 text-foreground">Frequently Asked Questions</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Get answers to common questions about ZuckerBot
              </p>
            </div>
            
            <div className="max-w-3xl mx-auto">
              <div className="space-y-4">
                <div className="modern-card border border-border/30 hover:border-primary/20 transition-colors">
                  <details className="group">
                    <summary className="flex justify-between items-center cursor-pointer p-6 font-semibold text-lg text-foreground hover:text-primary transition-colors">
                      What is ZuckerBot?
                      <span className="transform group-open:rotate-180 transition-transform text-muted-foreground">▼</span>
                    </summary>
                    <div className="px-6 pb-6 text-muted-foreground leading-relaxed">
                      ZuckerBot is an AI copilot specifically designed to help you create, optimize, and manage Facebook and Instagram advertising campaigns. Get expert guidance on ad copy, targeting, budget optimization, and campaign strategy through natural conversation.
                    </div>
                  </details>
                </div>

                <div className="modern-card border border-border/30 hover:border-primary/20 transition-colors">
                  <details className="group">
                    <summary className="flex justify-between items-center cursor-pointer p-6 font-semibold text-lg text-foreground hover:text-primary transition-colors">
                      How does the conversation limit work?
                      <span className="transform group-open:rotate-180 transition-transform text-muted-foreground">▼</span>
                    </summary>
                    <div className="px-6 pb-6 text-muted-foreground leading-relaxed">
                      Each plan includes a monthly conversation allowance. A conversation includes both your message and ZuckerBot's response. Free users get 5 conversations per month, Pro users get 100, and Agency users have unlimited conversations.
                    </div>
                  </details>
                </div>

                <div className="modern-card border border-border/30 hover:border-primary/20 transition-colors">
                  <details className="group">
                    <summary className="flex justify-between items-center cursor-pointer p-6 font-semibold text-lg text-foreground hover:text-primary transition-colors">
                      What types of Facebook ads can ZuckerBot help with?
                      <span className="transform group-open:rotate-180 transition-transform text-muted-foreground">▼</span>
                    </summary>
                    <div className="px-6 pb-6 text-muted-foreground leading-relaxed">
                      ZuckerBot assists with all types of Meta advertising including Facebook and Instagram ads, Stories, Reels, video campaigns, carousel ads, lead generation, e-commerce campaigns, and more.
                    </div>
                  </details>
                </div>

                <div className="modern-card border border-border/30 hover:border-primary/20 transition-colors">
                  <details className="group">
                    <summary className="flex justify-between items-center cursor-pointer p-6 font-semibold text-lg text-foreground hover:text-primary transition-colors">
                      Is my advertising data secure?
                      <span className="transform group-open:rotate-180 transition-transform text-muted-foreground">▼</span>
                    </summary>
                    <div className="px-6 pb-6 text-muted-foreground leading-relaxed">
                      Absolutely. We use enterprise-grade security to protect your data. All communications are encrypted, and we never share your advertising data or strategies with third parties.
                    </div>
                  </details>
                </div>

                <div className="modern-card border border-border/30 hover:border-primary/20 transition-colors">
                  <details className="group">
                    <summary className="flex justify-between items-center cursor-pointer p-6 font-semibold text-lg text-foreground hover:text-primary transition-colors">
                      Can I upgrade or cancel my plan anytime?
                      <span className="transform group-open:rotate-180 transition-transform text-muted-foreground">▼</span>
                    </summary>
                    <div className="px-6 pb-6 text-muted-foreground leading-relaxed">
                      Yes! You can upgrade, downgrade, or cancel your subscription anytime through your account dashboard. Changes are prorated and take effect at your next billing cycle.
                    </div>
                  </details>
                </div>

                <div className="text-center mt-10">
                  <Link to="/faq" className="text-primary hover:text-primary/80 font-medium transition-colors">
                    View All FAQs →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced CTA Section */}
          <div className="py-24 bg-gradient-to-br from-primary/3 via-background to-primary/3 border-t border-border/20">
            <div className="text-center space-y-10">
              <div className="space-y-4">
                <h2 className="text-4xl font-bold text-foreground">Ready to optimize your Facebook campaigns?</h2>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                  Join thousands of marketers saving 15+ hours per week with AI-powered Facebook advertising optimization.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                {!user ? (
                  <>
                    <Link to="/auth">
                      <Button size="xl" className="btn-primary shadow-lg hover:shadow-xl hover:shadow-primary/25 transition-all duration-300">
                        <MessageCircle className="w-6 h-6 mr-3" />
                        Start Free Consultation
                      </Button>
                    </Link>
                    <Link to="/pricing">
                      <Button variant="outline" size="xl" className="border-2 border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all duration-300">
                        <Sparkles className="w-6 h-6 mr-3" />
                        View Pricing
                      </Button>
                    </Link>
                  </>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Link to="/dashboard">
                      <Button size="xl" className="btn-primary shadow-lg hover:shadow-xl">
                        <MessageCircle className="w-6 h-6 mr-3" />
                        Go to Dashboard
                      </Button>
                    </Link>
                    <Link to="/pricing">
                      <Button size="xl" variant="outline" className="border-2 border-primary/20 hover:border-primary/40">
                        <Sparkles className="w-6 h-6 mr-3" />
                        Upgrade Plan
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              <div className="flex justify-center items-center space-x-8 text-sm text-muted-foreground pt-8">
                <div className="flex items-center">
                  <span className="w-2 h-2 bg-success rounded-full mr-2"></span>
                  150+ Active Users
                </div>
                <div className="flex items-center">
                  <span className="w-2 h-2 bg-success rounded-full mr-2"></span>
                  0% Churn Rate
                </div>
                <div className="flex items-center">
                  <span className="w-2 h-2 bg-success rounded-full mr-2"></span>
                  Backed by Antler VC
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="py-12 border-t border-border/20">
            <div className="text-center space-y-4">
              <div className="flex justify-center space-x-8 text-sm text-muted-foreground">
                <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
                <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
                <Link to="/faq" className="hover:text-primary transition-colors">FAQ</Link>
              </div>
              <p className="text-sm text-muted-foreground">
                © 2024 ZuckerBot. All rights reserved.
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default Index;
import { useState, useEffect } from 'react';
import { BrandAnalysisForm } from "@/components/BrandAnalysisForm";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from '@supabase/supabase-js';
import { LogOut, User as UserIcon, Zap, Target, Brain, Shield, BarChart3, Bell } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const Index = () => {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
                  <Zap className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold gradient-text">CompetitorPulse</span>
              </div>
              
              <div className="flex items-center space-x-4">
                {user ? (
                  <>
                    <Link to="/dashboard">
                      <Button variant="ghost" className="text-foreground hover:text-primary">
                        <BarChart3 className="w-4 h-4 mr-2" />
                        Dashboard
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
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Trusted by 10,000+ businesses</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              <span className="gradient-text">AI-Powered</span>
              <br />
              <span className="text-foreground">Competitive Intelligence</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Analyze competitors, discover market opportunities, and gain strategic insights 
              with our cutting-edge AI platform. Stay ahead of the competition with real-time monitoring and intelligent analysis.
            </p>
            
            {!user && (
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
                <Link to="/auth">
                  <Button size="lg" className="btn-primary h-14 px-8 text-lg">
                    <Zap className="w-5 h-5 mr-2" />
                    Start Free Analysis
                  </Button>
                </Link>
                <Link to="/dashboard">
                  <Button variant="outline" size="lg" className="h-14 px-8 text-lg border-border/50">
                    View Demo
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 mb-16 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="modern-card text-center group">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-4 glow-sm group-hover:glow-primary transition-all duration-300">
                <Target className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Brand Analysis</h3>
              <p className="text-muted-foreground">
                Deep AI analysis of competitor websites, positioning, products, and value propositions.
              </p>
            </div>
            
            <div className="modern-card text-center group">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-4 glow-sm group-hover:glow-primary transition-all duration-300">
                <Brain className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Competitor Intelligence</h3>
              <p className="text-muted-foreground">
                Comprehensive competitor discovery and detailed analysis of features, pricing, and market position.
              </p>
            </div>
            
            <div className="modern-card text-center group">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-4 glow-sm group-hover:glow-primary transition-all duration-300">
                <Bell className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Real-time Monitoring</h3>
              <p className="text-muted-foreground">
                Automated monitoring of competitor changes with instant alerts and strategic insights.
              </p>
            </div>
          </div>

          {/* Main Content */}
          {user ? (
            <div className="animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              <BrandAnalysisForm />
            </div>
          ) : (
            <div className="text-center py-16 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              <div className="modern-card max-w-2xl mx-auto">
                <h3 className="text-2xl font-semibold mb-4">Ready to Get Started?</h3>
                <p className="text-muted-foreground mb-6">
                  Sign up now to analyze your first competitor and discover strategic opportunities in your market.
                </p>
                <Link to="/auth">
                  <Button size="lg" className="btn-primary h-12 px-8">
                    Create Free Account
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;

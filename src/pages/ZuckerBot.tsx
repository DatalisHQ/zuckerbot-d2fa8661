import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Edit, TrendingUp, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";


const PREDEFINED_PROMPTS = [
  {
    icon: Plus,
    title: "Run A Campaign",
    description: "Create and launch a new Meta advertising campaign",
    color: "from-green-500 to-emerald-600",
    action: "create_campaign"
  },
  {
    icon: TrendingUp,
    title: "Monitor Performance", 
    description: "Optimize your Meta ads performance and analytics",
    color: "from-purple-500 to-violet-600",
    action: "monitor_performance"
  },
  {
    icon: Target,
    title: "Spy on Competition",
    description: "Analyze competitors' advertising strategies",
    color: "from-yellow-500 to-amber-600",
    disabled: true,
    comingSoon: true
  },
  {
    icon: Edit,
    title: "Generate Ads",
    description: "Generate ad creatives and copy automatically",
    color: "from-blue-500 to-cyan-600", 
    disabled: true,
    comingSoon: true
  },
];

const ZuckerBot = () => {
  const [user, setUser] = useState<any>(null);
  const [businessContext, setBusinessContext] = useState<any>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
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

        // Load user profile and check prerequisites
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        // MAJOR CHANGE: Only check if onboarding is completed
        const hasCompletedOnboarding = profile?.onboarding_completed;

        if (!hasCompletedOnboarding) {
          console.log("ZuckerBot: Onboarding not completed, redirecting to onboarding");
          navigate(`/onboarding`);
          return;
        }

        // Load business context - get the most recent analysis
        const { data: brandAnalysis, error: brandError } = await supabase
          .from('brand_analysis')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (brandAnalysis) {
          setBusinessContext(brandAnalysis);
        }

        setIsLoadingContext(false);
      } catch (error) {
        console.error('Error loading user context:', error);
        setIsLoadingContext(false);
      }
    };

    // MAJOR CHANGE: Removed Facebook connection event listeners
    loadUserAndBusiness();
  }, [navigate, toast]);

  const handlePromptAction = async (prompt: any) => {
    if (prompt.disabled) {
      toast({
        title: "Feature Coming Soon",
        description: `${prompt.title} will be available in a future update.`,
        variant: "default",
      });
      return;
    }

    if (prompt.action === 'create_campaign') {
      // Navigate to campaign creation flow
      navigate("/campaign-flow");
    } else if (prompt.action === 'monitor_performance') {
      // Navigate to dashboard
      navigate("/dashboard");
    }
  };

  if (isLoadingContext) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">Loading your ZuckerBot assistant...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        {/* Welcome Header */}
        <div className="text-center space-y-6 mb-12">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold">
              Welcome to <span className="gradient-text">ZuckerBot</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Your AI-powered Meta advertising assistant. Choose what you'd like to do today.
            </p>
          </div>
          
          {businessContext?.business_name && (
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
              <span className="text-sm text-primary font-medium">
                Managing campaigns for {businessContext.business_name}
              </span>
            </div>
          )}
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            {PREDEFINED_PROMPTS.map((prompt, index) => {
              const IconComponent = prompt.icon;
              return (
                <div key={index} className="relative group">
                  <Card className={`h-full transition-all duration-300 cursor-pointer border-border/50 hover:border-primary/50 ${
                    prompt.disabled 
                      ? 'opacity-60 cursor-not-allowed' 
                      : 'hover:shadow-lg hover:shadow-primary/10'
                  }`}>
                    <CardContent className="p-8">
                      <div className="flex items-start space-x-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${prompt.color} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                          <IconComponent className="h-6 w-6 text-white" />
                        </div>
                        
                        <div className="flex-1 space-y-2">
                          <h3 className="text-xl font-semibold">{prompt.title}</h3>
                          <p className="text-muted-foreground">{prompt.description}</p>
                          
                          <Button 
                            onClick={() => handlePromptAction(prompt)}
                            disabled={prompt.disabled}
                            className={`mt-4 w-full ${
                              prompt.disabled 
                                ? 'opacity-50' 
                                : 'bg-gradient-to-r ' + prompt.color + ' hover:opacity-90'
                            }`}
                          >
                            {prompt.disabled ? 'Coming Soon' : 'Get Started'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {prompt.comingSoon && (
                    <div className="absolute -top-2 -right-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                      Soon
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Stats */}
      </div>
    </div>
  );
};

export default ZuckerBot;
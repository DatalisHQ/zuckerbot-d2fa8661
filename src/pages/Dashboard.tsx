import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, TrendingUp, AlertCircle, PlayCircle, PauseCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/Navbar";
import { FacebookAdsPerformance } from "@/components/FacebookAdsPerformance";

interface Campaign {
  id: string;
  campaign_name: string;
  pipeline_status: string;
  created_at: string;
  updated_at: string;
  current_step: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/auth");
        return;
      }

      setUser(session.user);

      // Get user profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      setProfile(profileData);

      // Get user campaigns
      const { data: campaignData } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });

      setCampaigns(campaignData || []);
      setIsLoading(false);
    };

    checkUser();
  }, [navigate]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'running': return 'default';
      case 'pending': return 'secondary';
      case 'failed': return 'destructive';
      default: return 'secondary';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };


  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Welcome Section */}
          <section>
            <h2 className="text-3xl font-bold mb-2">
              Welcome back, {profile?.full_name || user?.email || "User"}!
            </h2>
            <p className="text-muted-foreground text-lg">
              Your campaign management dashboard
            </p>
          </section>

          {/* Quick Actions */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Quick Actions</h3>
              <Button onClick={() => navigate("/zuckerbot")}>
                <Plus className="h-4 w-4 mr-2" />
                Create New Campaign
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Card 
                className="cursor-pointer hover:shadow-md transition-shadow opacity-50" 
                title="Coming Soon"
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5" />
                    Strategic Insights
                    <Badge variant="secondary" className="ml-auto text-xs">Soon</Badge>
                  </CardTitle>
                  <CardDescription>
                    AI-powered market intelligence and recommendations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" disabled>Coming Soon</Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/zuckerbot")}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <PlayCircle className="h-5 w-5" />
                    Launch Campaign
                  </CardTitle>
                  <CardDescription>
                    Start a new ZuckerBot campaign flow
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Get Started</Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/competitor-analysis")}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertCircle className="h-5 w-5" />
                    Brand Analysis
                  </CardTitle>
                  <CardDescription>
                    Analyze your brand and discover competitors
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Analyze Brand</Button>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Campaigns Section */}
          <section>
            <h3 className="text-xl font-semibold mb-4">Your Campaigns</h3>
            {campaigns.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h4 className="text-lg font-semibold mb-2">No campaigns yet</h4>
                  <p className="text-muted-foreground mb-4">
                    Create your first campaign with ZuckerBot to see it here
                  </p>
                  <Button onClick={() => navigate("/zuckerbot")}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {campaigns.map((campaign) => (
                  <Card key={campaign.id} className="cursor-pointer hover:shadow-lg transition-all duration-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">
                            {campaign.campaign_name}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(campaign.updated_at)}
                          </CardDescription>
                        </div>
                        <Badge variant={getStatusColor(campaign.pipeline_status)}>
                          {campaign.pipeline_status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Step {campaign.current_step}/5</span>
                        <div className="text-xs text-muted-foreground">
                          Updated {formatDate(campaign.updated_at)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Facebook Ads Performance */}
          <section>
            <h3 className="text-xl font-semibold mb-4">Performance Overview</h3>
            <FacebookAdsPerformance />
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
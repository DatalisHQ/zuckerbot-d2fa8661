import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, BarChart3, TrendingUp, Bot, Search, Brain, Eye, FileText } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/Navbar";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
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
      setIsLoading(false);
    };

    checkUser();
  }, [navigate]);


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
              Welcome back, {profile?.display_name || user?.email || "User"}!
            </h2>
            <p className="text-muted-foreground text-lg">
              Your competitive intelligence command center
            </p>
          </section>

          {/* Quick Actions */}
          <section>
            <h3 className="text-xl font-semibold mb-4">Quick Actions</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/competitor-analysis")}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Search className="h-5 w-5" />
                    Competitor Analysis
                  </CardTitle>
                  <CardDescription>
                    Analyze competitor strategies and positioning
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Start Analysis</Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/ad-performance")}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BarChart3 className="h-5 w-5" />
                    Ad Performance
                  </CardTitle>
                  <CardDescription>
                    Monitor your advertising campaigns
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">View Performance</Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/strategic-insights")}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5" />
                    Strategic Insights
                  </CardTitle>
                  <CardDescription>
                    AI-powered market intelligence
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">View Insights</Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/zuckerbot")}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Brain className="h-5 w-5" />
                    ZuckerBot AI
                  </CardTitle>
                  <CardDescription>
                    Chat with your AI assistant
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Start Chat</Button>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
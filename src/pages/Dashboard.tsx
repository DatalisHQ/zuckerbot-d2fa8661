import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, TrendingUp, AlertCircle, PlayCircle, PauseCircle, MoreVertical, Play, Pause, Edit, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/Navbar";
import { FacebookAdsPerformance } from "@/components/FacebookAdsPerformance";
import { OnboardingRecovery } from "@/components/OnboardingRecovery";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCampaignDrafts } from "@/hooks/useCampaignDrafts";
import { DraftCampaignCard } from "@/components/DraftCampaignCard";

interface Campaign {
  id: string;
  campaign_name: string;
  pipeline_status: string;
  created_at: string;
  updated_at: string;
  current_step: number;
}

interface FacebookCampaign {
  id: string;
  campaign_id: string;
  campaign_name: string;
  objective: string;
  status: string;
  daily_budget: number;
  lifetime_budget: number;
  start_time: string;
  end_time: string;
  created_time: string;
  updated_time: string;
}

const Dashboard = () => {
  // --- SUPABASE DEBUG: Auth state and session logging ---
useEffect(() => {
  async function fetchDebug() {
    const user = await supabase.auth.getUser();
    const session = await supabase.auth.getSession();
    console.log("SUPABASE DEBUG - user:", user);
    console.log("SUPABASE DEBUG - session:", session);
  }
  fetchDebug();
}, []);
// --- END SUPABASE DEBUG ---
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [facebookCampaigns, setFacebookCampaigns] = useState<FacebookCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<FacebookCampaign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  const { drafts, isLoading: draftsLoading, deleteDraft, finalizeDraft } = useCampaignDrafts();

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

    // Block access if onboarding is not completed
    if (!profileData?.onboarding_completed) {
      console.log("Dashboard: User hasn't completed onboarding, redirecting");
      navigate("/onboarding");
      return;
    }

      // Get user campaigns
      const { data: campaignData } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });

      setCampaigns(campaignData || []);

      // Get Facebook campaigns
      const { data: facebookCampaignData } = await supabase
        .from('facebook_campaigns')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_time', { ascending: false });

      setFacebookCampaigns(facebookCampaignData || []);
      setIsLoading(false);
    };

    const checkFacebookRecovery = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('facebook_recovery') === 'true') {
        // This should not happen - Facebook recovery should redirect to onboarding
        console.log("Dashboard: Facebook recovery detected, redirecting to onboarding");
        navigate("/onboarding?step=2&facebook=connected");
        return;
      }
    };

    checkUser();
    checkFacebookRecovery();
  }, [navigate, toast]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'running': return 'default';
      case 'pending': return 'secondary';
      case 'failed': return 'destructive';
      default: return 'secondary';
    }
  };

  const getActualStatus = (currentStep: number, pipelineStatus: string) => {
    if (currentStep >= 5 && pipelineStatus === 'completed') {
      return 'completed';
    }
    if (currentStep < 5) {
      return `in progress: Step ${currentStep}/5`;
    }
    return pipelineStatus;
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!user) return;
    
    setDeletingCampaignId(campaignId);
    
    try {
      const { error } = await supabase
        .from('ad_campaigns')
        .delete()
        .eq('id', campaignId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting campaign:', error);
        toast({
          title: "Failed to Delete",
          description: "Could not delete the campaign. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Remove the campaign from local state
      setCampaigns(prev => prev.filter(campaign => campaign.id !== campaignId));
      
      toast({
        title: "Campaign Deleted",
        description: "The campaign has been successfully removed from your pipeline.",
      });
      
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while deleting the campaign.",
        variant: "destructive",
      });
    } finally {
      setDeletingCampaignId(null);
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

  const handleCampaignAction = async (campaignId: string, action: 'pause' | 'play' | 'delete') => {
    try {
      if (action === 'delete') {
        // Delete from local campaigns first
        const { error } = await supabase
          .from('facebook_campaigns')
          .delete()
          .eq('campaign_id', campaignId)
          .eq('user_id', user?.id);

        if (error) throw error;

        setFacebookCampaigns(prev => prev.filter(c => c.campaign_id !== campaignId));
        if (selectedCampaign?.campaign_id === campaignId) {
          setSelectedCampaign(null);
        }

        toast({
          title: "Campaign Deleted",
          description: "Campaign has been removed successfully.",
        });
      } else {
        // For pause/play, we would call Facebook API to update status
        const newStatus = action === 'pause' ? 'PAUSED' : 'ACTIVE';
        
        const { error } = await supabase
          .from('facebook_campaigns')
          .update({ status: newStatus })
          .eq('campaign_id', campaignId)
          .eq('user_id', user?.id);

        if (error) throw error;

        setFacebookCampaigns(prev => 
          prev.map(c => c.campaign_id === campaignId ? { ...c, status: newStatus } : c)
        );

        if (selectedCampaign?.campaign_id === campaignId) {
          setSelectedCampaign(prev => prev ? { ...prev, status: newStatus } : null);
        }

        toast({
          title: `Campaign ${action === 'pause' ? 'Paused' : 'Resumed'}`,
          description: `Campaign status updated to ${newStatus}.`,
        });
      }
    } catch (error) {
      console.error('Error updating campaign:', error);
      toast({
        title: "Action Failed",
        description: "Failed to update campaign. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCampaignClick = (campaign: FacebookCampaign) => {
    setSelectedCampaign(campaign);
  };

  const handleContinueDraft = (draft: any) => {
    navigate(`/campaign-flow?resumeDraft=${draft.id}`);
  };

  const handleEditDraft = (draft: any) => {
    navigate(`/campaign-flow?resumeDraft=${draft.id}`);
  };

  const handleDeleteDraft = async (draftId: string) => {
    await deleteDraft(draftId);
  };

  const handleLaunchDraft = async (draft: any) => {
    await finalizeDraft(draft.id);
    // Navigate to the launch step
    navigate(`/campaign-flow?resumeDraft=${draft.id}`);
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

          {/* Onboarding Recovery */}
          <OnboardingRecovery onComplete={() => window.location.reload()} />

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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Your Campaigns</h3>
              <Badge variant="outline" className="text-xs">
                {facebookCampaigns.length + campaigns.length + drafts.length} Total
              </Badge>
            </div>

            {/* Draft Campaigns */}
            {drafts.length > 0 && (
              <div className="mb-6">
                <h4 className="text-lg font-medium mb-3 text-orange-600">Draft Campaigns</h4>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {drafts.map((draft) => (
                    <DraftCampaignCard
                      key={draft.id}
                      draft={draft}
                      onContinue={handleContinueDraft}
                      onEdit={handleEditDraft}
                      onDelete={handleDeleteDraft}
                      onLaunch={handleLaunchDraft}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Facebook Campaigns */}
            {facebookCampaigns.length > 0 && (
              <div className="mb-6">
                <h4 className="text-lg font-medium mb-3 text-blue-600">Facebook Campaigns</h4>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {facebookCampaigns.map((campaign) => (
                    <Card 
                      key={campaign.campaign_id} 
                      className={`cursor-pointer hover:shadow-lg transition-all duration-200 ${
                        selectedCampaign?.campaign_id === campaign.campaign_id ? 'ring-2 ring-blue-500 bg-blue-50/50' : ''
                      }`}
                      onClick={() => handleCampaignClick(campaign)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base truncate">
                              {campaign.campaign_name}
                            </CardTitle>
                            <CardDescription className="flex items-center gap-2 mt-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(campaign.created_time)}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={campaign.status === 'ACTIVE' ? 'default' : campaign.status === 'PAUSED' ? 'secondary' : 'destructive'}>
                              {campaign.status}
                            </Badge>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  handleCampaignAction(campaign.campaign_id, campaign.status === 'ACTIVE' ? 'pause' : 'play');
                                }}>
                                  {campaign.status === 'ACTIVE' ? (
                                    <>
                                      <Pause className="h-4 w-4 mr-2" />
                                      Pause Campaign
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-4 w-4 mr-2" />
                                      Resume Campaign
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  // Navigate to edit - placeholder for now
                                  toast({ title: "Edit feature coming soon" });
                                }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Campaign
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCampaignAction(campaign.campaign_id, 'delete');
                                  }}
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Campaign
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Objective:</span>
                            <span className="font-medium">{campaign.objective}</span>
                          </div>
                          {campaign.daily_budget && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Daily Budget:</span>
                              <span className="font-medium">${campaign.daily_budget}</span>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            Click to view detailed metrics
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Local Pipeline Campaigns */}
            {campaigns.length === 0 && facebookCampaigns.length === 0 && drafts.length === 0 ? (
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
              <>
                {campaigns.length > 0 && (
                  <div>
                    <h4 className="text-lg font-medium mb-3 text-purple-600">Pipeline Campaigns</h4>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                       {campaigns.map((campaign) => (
                        <Card 
                          key={campaign.id} 
                          className="cursor-pointer hover:shadow-lg transition-all duration-200 group"
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div 
                                className="flex-1 min-w-0 cursor-pointer"
                                onClick={() => navigate(`/campaign-flow?step=${campaign.current_step}&campaign=${campaign.id}`)}
                              >
                                <CardTitle className="text-base truncate group-hover:text-blue-600 transition-colors">
                                  {campaign.campaign_name}
                                </CardTitle>
                                <CardDescription className="flex items-center gap-2 mt-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(campaign.updated_at)}
                                </CardDescription>
                              </div>
                              <div className="flex items-center gap-2 ml-2">
                                <Badge variant={getStatusColor(getActualStatus(campaign.current_step, campaign.pipeline_status))}>
                                  {getActualStatus(campaign.current_step, campaign.pipeline_status)}
                                </Badge>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                                      disabled={deletingCampaignId === campaign.id}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete "{campaign.campaign_name}"? This action cannot be undone and will permanently remove the campaign from your pipeline.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteCampaign(campaign.id)}
                                        className="bg-red-600 hover:bg-red-700"
                                        disabled={deletingCampaignId === campaign.id}
                                      >
                                        {deletingCampaignId === campaign.id ? "Deleting..." : "Delete Campaign"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">Step {campaign.current_step}/5</span>
                              <div className="text-xs text-muted-foreground">
                                Updated {formatDate(campaign.updated_at)}
                              </div>
                            </div>
                            <div 
                              className="text-xs text-blue-600 mt-2 cursor-pointer hover:text-blue-700"
                              onClick={() => navigate(`/campaign-flow?step=${campaign.current_step}&campaign=${campaign.id}`)}
                            >
                              Click to continue from step {campaign.current_step}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Facebook Ads Performance */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Performance Overview</h3>
              {selectedCampaign && (
                <Badge variant="outline" className="text-sm">
                  Viewing: {selectedCampaign.campaign_name}
                </Badge>
              )}
            </div>
            <FacebookAdsPerformance selectedCampaign={selectedCampaign} />
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
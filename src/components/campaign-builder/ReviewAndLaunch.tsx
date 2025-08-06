import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Rocket, Edit, AlertCircle, Users, Target, DollarSign } from 'lucide-react';
import { useGetFacebookAdAccounts, type AdAccount } from '@/hooks/useGetFacebookAdAccounts';
import { useLaunchCampaign } from '@/hooks/useLaunchCampaign';
import { useCreateFacebookAudiences, type AudienceSegment as FacebookAudienceSegment } from '@/hooks/useCreateFacebookAudiences';
import { useToast } from '@/hooks/use-toast';
import { UpgradeModal } from '@/components/UpgradeModal';
import { supabase } from '@/integrations/supabase/client';

interface AudienceSegment {
  id: string;
  name: string;
  type: string;
}

interface AdSet {
  id: string;
  name: string;
  audienceSegmentId: string;
  placements: string[];
  budgetAllocation: number;
}

interface AdVariant {
  id: string;
  headline: string;
  primaryText: string;
  callToAction: string;
  description?: string;
}

interface ReviewAndLaunchProps {
  campaignName: string;
  objective: string;
  budget: number;
  segments: AudienceSegment[];
  adSets: AdSet[];
  adVariants: Record<string, AdVariant[]>;
  savedAudienceSegments?: FacebookAudienceSegment[];
  onEdit: (step: string) => void;
  onLaunchComplete: (result: any) => void;
}

export const ReviewAndLaunch = ({
  campaignName,
  objective,
  budget,
  segments,
  adSets,
  adVariants,
  savedAudienceSegments,
  onEdit,
  onLaunchComplete
}: ReviewAndLaunchProps) => {
  const [selectedAdAccount, setSelectedAdAccount] = useState<string>('');
  const [audiencesCreated, setAudiencesCreated] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<string>('free');
  const { data: adAccounts, isLoading: loadingAdAccounts, error: adAccountsError } = useGetFacebookAdAccounts();
  const launchMutation = useLaunchCampaign();
  const createFacebookAudiences = useCreateFacebookAudiences();
  const { toast } = useToast();

  useEffect(() => {
    // Fetch subscription tier on mount
    (async () => {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (!error && data?.subscription_tier) {
        setSubscriptionTier(data.subscription_tier);
      }
    })();
  }, []);

  const getTotalVariants = () => {
    return Object.values(adVariants).reduce((total, variants) => total + variants.length, 0);
  };

  const getSegmentName = (segmentId: string) => {
    return segments.find(s => s.id === segmentId)?.name || 'Unknown Segment';
  };

  const canLaunch = () => {
    return (
      campaignName.trim() &&
      objective &&
      budget > 0 &&
      adSets.length > 0 &&
      getTotalVariants() >= adSets.length * 2 &&
      selectedAdAccount
    );
  };

  const handleLaunch = async () => {
    if (subscriptionTier === 'free') {
      setShowUpgradeModal(true);
      return;
    }
    if (!canLaunch()) return;

    try {
      // Step 1: Create Facebook audiences if we have saved segments
      let facebookAudienceIds: string[] = [];
      
      if (savedAudienceSegments && savedAudienceSegments.length > 0 && !audiencesCreated) {
        toast({
          title: "Creating audiences...",
          description: "Setting up your target audiences in Facebook.",
        });

        const audienceResult = await createFacebookAudiences.mutateAsync({
          audienceSegments: savedAudienceSegments,
          adAccountId: selectedAdAccount
        });

        if (audienceResult.success) {
          facebookAudienceIds = audienceResult.createdAudiences.map(a => a.audienceId);
          setAudiencesCreated(true);
          
          toast({
            title: "Audiences created",
            description: `Successfully created ${audienceResult.summary.created + audienceResult.summary.existing} audiences.`,
          });
        } else {
          throw new Error('Failed to create some audiences');
        }
      }

      // Step 2: Convert campaign data to launch format
      const launchPayload = {
        adAccountId: selectedAdAccount,
        campaign: {
          name: campaignName,
          objective: objective,
          status: 'PAUSED' as const
        },
        adSets: adSets.map((adSet, index) => ({
          name: adSet.name,
          daily_budget: adSet.budgetAllocation * 100, // Convert to cents
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'LINK_CLICKS',
          targeting: facebookAudienceIds.length > 0 ? {
            custom_audiences: facebookAudienceIds
          } : {
            geo_locations: {
              countries: ['US']
            },
            age_min: 18,
            age_max: 65
          },
          placements: {
            publisher_platforms: adSet.placements.includes('facebook_feeds') ? ['facebook', 'instagram'] : ['facebook']
          },
          status: 'PAUSED' as const
        })),
        ads: adSets.flatMap((adSet, adSetIndex) => {
          const variants = adVariants[adSet.id] || [];
          return variants.map((variant, variantIndex) => ({
            name: `${adSet.name} - ${variant.headline}`,
            adset_index: adSetIndex,
            creative: {
              creative_id: `temp_creative_${variant.id}` // This would be replaced with actual creative IDs
            },
            status: 'PAUSED' as const
          }));
        })
      };

      const result = await launchMutation.mutateAsync(launchPayload);
      onLaunchComplete(result);
    } catch (error) {
      console.error('Launch failed:', error);
      toast({
        title: "Launch failed",
        description: error instanceof Error ? error.message : "Failed to launch campaign",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Review & Launch</h1>
        <p className="text-muted-foreground">
          Review your campaign setup and launch to Facebook Ads Manager
        </p>
      </div>

      {/* Ad Account Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Select Ad Account
          </CardTitle>
          <CardDescription>
            Choose which Facebook Ad Account to create this campaign in
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAdAccounts ? (
            <div className="text-center py-4">Loading ad accounts...</div>
          ) : adAccountsError ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {adAccountsError.message}
              </AlertDescription>
            </Alert>
          ) : (
            <div>
              <Label htmlFor="ad-account">Facebook Ad Account</Label>
              <Select value={selectedAdAccount} onValueChange={setSelectedAdAccount}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select an ad account" />
                </SelectTrigger>
                <SelectContent>
                  {adAccounts?.map((account: AdAccount) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{account.name}</span>
                        <Badge variant="outline" className="ml-2">
                          {account.account_status === 1 ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Overview */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Campaign
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm text-muted-foreground">Name</Label>
              <p className="font-medium">{campaignName}</p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Objective</Label>
              <p className="font-medium">{objective}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit('campaign-name')}
              className="mt-2"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Budget
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm text-muted-foreground">Daily Budget</Label>
              <p className="font-medium">${budget}</p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Monthly Est.</Label>
              <p className="font-medium">${budget * 30}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit('budget')}
              className="mt-2"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Audiences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm text-muted-foreground">Segments</Label>
              <p className="font-medium">{segments.length}</p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Ad Sets</Label>
              <p className="font-medium">{adSets.length}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit('audiences')}
              className="mt-2"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Structure Tree */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Structure</CardTitle>
          <CardDescription>
            Preview of your campaign, ad sets, and ads
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Campaign Level */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span className="font-semibold">{campaignName}</span>
                <Badge variant="outline">{objective}</Badge>
                <Badge variant="secondary">${budget}/day</Badge>
              </div>

              {/* Ad Sets Level */}
              <div className="ml-6 space-y-3">
                {adSets.map((adSet) => {
                  const variants = adVariants[adSet.id] || [];
                  
                  return (
                    <div key={adSet.id} className="border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-secondary" />
                        <span className="font-medium">{adSet.name}</span>
                        <Badge variant="outline">
                          {getSegmentName(adSet.audienceSegmentId)}
                        </Badge>
                        <Badge variant="secondary">
                          ${adSet.budgetAllocation}/day
                        </Badge>
                      </div>

                      {/* Ads Level */}
                      <div className="ml-6 space-y-1">
                        {variants.map((variant) => (
                          <div key={variant.id} className="flex items-center gap-2 text-sm">
                            <div className="w-1 h-1 rounded-full bg-muted-foreground" />
                            <span>{variant.headline || 'Untitled Ad'}</span>
                            <Badge variant="outline" className="text-xs">
                              {variant.callToAction}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Launch Button */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {!canLaunch() && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please complete all required fields and select an ad account before launching.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={handleLaunch}
                disabled={!canLaunch() || launchMutation.isPending}
                className="flex items-center gap-2"
              >
                <Rocket className="h-5 w-5" />
                {launchMutation.isPending ? 'Launching Campaign...' : 'Launch Campaign'}
              </Button>
            </div>
            
            <p className="text-center text-sm text-muted-foreground">
              Your campaign will be created in Facebook Ads Manager with "Paused" status.
              You can review and activate it from there.
            </p>
          </div>
        </CardContent>
      </Card>

      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="Launching campaigns is a Pro/Agency feature. Upgrade to unlock campaign launch."
      />
    </div>
  );
};
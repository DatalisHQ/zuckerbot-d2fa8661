import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Rocket, Facebook, ExternalLink, Check, AlertTriangle } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useGetFacebookAdAccounts } from '@/hooks/useGetFacebookAdAccounts';
import { useCreateFacebookAudiences } from '@/hooks/useCreateFacebookAudiences';
import { useLaunchCampaign } from '@/hooks/useLaunchCampaign';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DetailedAudienceSegment } from './PersistentAudienceSelection';
import { CreativeAsset } from './CreativeAssetManager';

interface GeneratedAd {
  id: string;
  ad_set_name: string;
  audience_segment_id: string;
  creative_asset: CreativeAsset;
  ad_copy: {
    headline: string;
    primary_text: string;
    call_to_action: string;
  };
  approved: boolean;
}

interface CampaignLaunchManagerProps {
  campaignId: string;
  audienceSegments: DetailedAudienceSegment[];
  generatedAds: GeneratedAd[];
  campaignData: any;
  onLaunchComplete: (result: any) => void;
}

export function CampaignLaunchManager({
  campaignId,
  audienceSegments,
  generatedAds,
  campaignData,
  onLaunchComplete
}: CampaignLaunchManagerProps) {
  const [selectedAdAccount, setSelectedAdAccount] = useState<string>('');
  const [campaignName, setCampaignName] = useState('');
  const [campaignObjective, setCampaignObjective] = useState('TRAFFIC');
  const [dailyBudget, setDailyBudget] = useState(20);
  const [launchStatus, setLaunchStatus] = useState<'draft' | 'creating-audiences' | 'launching' | 'success' | 'error'>('draft');
  const [createdAudiences, setCreatedAudiences] = useState<any[]>([]);
  const [launchResult, setLaunchResult] = useState<any>(null);
  
  const { toast } = useToast();
  const adAccountsQuery = useGetFacebookAdAccounts();
  const createAudiencesMutation = useCreateFacebookAudiences();
  const launchCampaignMutation = useLaunchCampaign();

  // Initialize campaign name
  useEffect(() => {
    if (!campaignName && campaignData?.brand_data?.brandName) {
      setCampaignName(`${campaignData.brand_data.brandName} Campaign - ${new Date().toLocaleDateString()}`);
    }
  }, [campaignData, campaignName]);

  // Handle audience creation
  useEffect(() => {
    if (createAudiencesMutation.isSuccess && createAudiencesMutation.data) {
      setCreatedAudiences(createAudiencesMutation.data.createdAudiences);
      setLaunchStatus('launching');
      
      // Auto-proceed to campaign launch
      handleCampaignLaunch(createAudiencesMutation.data.createdAudiences);
    }
  }, [createAudiencesMutation.isSuccess, createAudiencesMutation.data]);

  // Handle campaign launch result
  useEffect(() => {
    if (launchCampaignMutation.isSuccess) {
      setLaunchResult(launchCampaignMutation.data);
      setLaunchStatus('success');
      
      // Save launch result to database
      saveLaunchResult(launchCampaignMutation.data);
      
      toast({
        title: "Campaign launched successfully!",
        description: `Created ${launchCampaignMutation.data.summary.adSetsCreated} ad sets and ${launchCampaignMutation.data.summary.adsCreated} ads`
      });
    }
  }, [launchCampaignMutation.isSuccess, launchCampaignMutation.data]);

  // Handle errors
  useEffect(() => {
    if (createAudiencesMutation.isError) {
      setLaunchStatus('error');
      toast({
        title: "Audience creation failed",
        description: createAudiencesMutation.error.message,
        variant: "destructive"
      });
    }
  }, [createAudiencesMutation.isError, createAudiencesMutation.error]);

  useEffect(() => {
    if (launchCampaignMutation.isError) {
      setLaunchStatus('error');
      toast({
        title: "Campaign launch failed",
        description: launchCampaignMutation.error.message,
        variant: "destructive"
      });
    }
  }, [launchCampaignMutation.isError, launchCampaignMutation.error]);

  const saveLaunchResult = async (result: any) => {
    try {
      const { error } = await supabase
        .from('ad_campaigns')
        .update({
          facebook_campaign_data: result,
          launch_status: 'launched',
          ad_account_id: selectedAdAccount
        })
        .eq('id', campaignId);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving launch result:', error);
    }
  };

  const handleCreateAudiences = async () => {
    if (!selectedAdAccount) {
      toast({
        title: "Ad account required",
        description: "Please select a Facebook ad account",
        variant: "destructive"
      });
      return;
    }

    setLaunchStatus('creating-audiences');
    
    const audienceSegmentsData = audienceSegments.map(segment => ({
      segment: segment.segment,
      criteria: segment.criteria
    }));

    createAudiencesMutation.mutate({
      audienceSegments: audienceSegmentsData,
      adAccountId: selectedAdAccount
    });
  };

  const handleCampaignLaunch = async (audiences?: any[]) => {
    const audiencesToUse = audiences || createdAudiences;
    const approvedAds = generatedAds.filter(ad => ad.approved);

    if (approvedAds.length === 0) {
      toast({
        title: "No approved ads",
        description: "Please approve at least one ad before launching",
        variant: "destructive"
      });
      return;
    }

    // Prepare campaign payload
    const campaignPayload = {
      adAccountId: selectedAdAccount,
      campaign: {
        name: campaignName,
        objective: campaignObjective,
        status: 'ACTIVE' as const
      },
      adSets: audienceSegments.map((segment, index) => ({
        name: `${campaignName} - ${segment.segment}`,
        daily_budget: dailyBudget * 100, // Convert to cents
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'REACH',
        targeting: {
          geo_locations: { countries: segment.targeting_data.countries },
          age_min: segment.targeting_data.age_min,
          age_max: segment.targeting_data.age_max,
          genders: segment.targeting_data.genders.map(g => g === 'male' ? 1 : 2),
          interests: segment.targeting_data.interests.map(interest => ({
            id: interest,
            name: interest
          })),
          custom_audiences: audiencesToUse.find(aud => 
            aud.segmentName === segment.segment
          )?.audienceId ? [audiencesToUse.find(aud => 
            aud.segmentName === segment.segment
          ).audienceId] : undefined
        },
        status: 'ACTIVE' as const
      })),
      ads: approvedAds.map((ad, index) => ({
        name: ad.ad_set_name,
        adset_index: audienceSegments.findIndex(seg => seg.id === ad.audience_segment_id),
        creative: {
          creative_id: ad.creative_asset.facebook_creative_id || ad.creative_asset.url
        },
        status: 'ACTIVE' as const
      }))
    };

    launchCampaignMutation.mutate(campaignPayload);
  };

  const canLaunch = () => {
    return selectedAdAccount && 
           campaignName && 
           generatedAds.filter(ad => ad.approved).length > 0 &&
           launchStatus === 'draft';
  };

  const approvedAdsCount = generatedAds.filter(ad => ad.approved).length;
  const totalAudiences = audienceSegments.length;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Campaign Launch & Facebook Integration
        </CardTitle>
        <p className="text-muted-foreground">
          Review your campaign settings and launch to Facebook Ads Manager
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Campaign Summary */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <h3 className="text-2xl font-bold">{totalAudiences}</h3>
                <p className="text-sm text-muted-foreground">Audience Segments</p>
                <p className="text-xs text-muted-foreground mt-1">Will become Ad Sets</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <h3 className="text-2xl font-bold">{approvedAdsCount}</h3>
                <p className="text-sm text-muted-foreground">Approved Ads</p>
                <p className="text-xs text-muted-foreground mt-1">Ready for launch</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <h3 className="text-2xl font-bold">${dailyBudget * totalAudiences}</h3>
                <p className="text-sm text-muted-foreground">Total Daily Budget</p>
                <p className="text-xs text-muted-foreground mt-1">${dailyBudget} per Ad Set</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Campaign Configuration */}
        <div className="space-y-4">
          <h3 className="font-medium">Campaign Configuration</h3>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Facebook Ad Account</Label>
              <Select onValueChange={setSelectedAdAccount} value={selectedAdAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ad account" />
                </SelectTrigger>
                <SelectContent>
                  {adAccountsQuery.data?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Campaign Name</Label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Enter campaign name"
              />
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Campaign Objective</Label>
              <Select onValueChange={setCampaignObjective} value={campaignObjective}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRAFFIC">Traffic</SelectItem>
                  <SelectItem value="CONVERSIONS">Conversions</SelectItem>
                  <SelectItem value="REACH">Reach</SelectItem>
                  <SelectItem value="BRAND_AWARENESS">Brand Awareness</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Daily Budget per Ad Set</Label>
              <Input
                type="number"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(Number(e.target.value))}
                min="5"
                placeholder="20"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Launch Process */}
        <div className="space-y-4">
          <h3 className="font-medium">Launch Process</h3>
          
          <div className="space-y-3">
            {/* Step 1: Create Audiences */}
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                launchStatus === 'creating-audiences' ? 'bg-blue-500 text-white' :
                createdAudiences.length > 0 ? 'bg-green-500 text-white' : 'bg-muted'
              }`}>
                {launchStatus === 'creating-audiences' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : createdAudiences.length > 0 ? (
                  <Check className="h-4 w-4" />
                ) : (
                  '1'
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium">Create Facebook Custom Audiences</p>
                <p className="text-sm text-muted-foreground">
                  {totalAudiences} audience segments will be created in Facebook
                </p>
              </div>
            </div>

            {/* Step 2: Launch Campaign */}
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                launchStatus === 'launching' ? 'bg-blue-500 text-white' :
                launchStatus === 'success' ? 'bg-green-500 text-white' : 'bg-muted'
              }`}>
                {launchStatus === 'launching' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : launchStatus === 'success' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  '2'
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium">Launch Campaign & Ad Sets</p>
                <p className="text-sm text-muted-foreground">
                  Create {totalAudiences} ad sets and {approvedAdsCount} ads in Facebook
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Launch Status Messages */}
        {launchStatus === 'creating-audiences' && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              Creating custom audiences in Facebook... This may take a few moments.
            </AlertDescription>
          </Alert>
        )}

        {launchStatus === 'launching' && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              Launching campaign to Facebook Ads Manager... Creating {totalAudiences} ad sets and {approvedAdsCount} ads.
            </AlertDescription>
          </Alert>
        )}

        {launchStatus === 'error' && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Launch failed. Please check your Facebook connection and try again.
            </AlertDescription>
          </Alert>
        )}

        {/* Success State */}
        {launchStatus === 'success' && launchResult && (
          <Alert className="border-green-200 bg-green-50">
            <Check className="h-4 w-4 text-green-600" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium text-green-800">Campaign launched successfully!</p>
                <div className="text-sm text-green-700">
                  <p>Campaign ID: {launchResult.campaignId}</p>
                  <p>Ad Sets Created: {launchResult.summary.adSetsCreated}</p>
                  <p>Ads Created: {launchResult.summary.adsCreated}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`https://business.facebook.com/adsmanager/manage/campaigns?act=${selectedAdAccount}`, '_blank')}
                  className="mt-2"
                >
                  <Facebook className="h-4 w-4 mr-2" />
                  View in Facebook Ads Manager
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Launch Button */}
        {launchStatus === 'draft' && (
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              <p>Ready to launch {approvedAdsCount} ads across {totalAudiences} audience segments</p>
              <p>Total daily budget: ${dailyBudget * totalAudiences}</p>
            </div>
            <Button 
              onClick={handleCreateAudiences}
              disabled={!canLaunch()}
              size="lg"
            >
              <Rocket className="h-4 w-4 mr-2" />
              Launch Campaign to Facebook
            </Button>
          </div>
        )}

        {/* Complete Button */}
        {launchStatus === 'success' && (
          <div className="flex justify-center pt-4 border-t">
            <Button 
              onClick={() => onLaunchComplete(launchResult)}
              size="lg"
            >
              Complete Campaign Setup
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Rocket, CheckCircle, ExternalLink, AlertCircle } from 'lucide-react';
import { useLaunchCampaign, type LaunchPayload } from '@/hooks/useLaunchCampaign';
import { useToast } from '@/hooks/use-toast';

interface CampaignLauncherProps {
  campaignConfig: any; // The output from generate-campaign-config
  onLaunchComplete?: (result: any) => void;
}

export const CampaignLauncher = ({ campaignConfig, onLaunchComplete }: CampaignLauncherProps) => {
  const [adAccountId, setAdAccountId] = useState('');
  const [launchResult, setLaunchResult] = useState<any>(null);
  const launchMutation = useLaunchCampaign();
  const { toast } = useToast();

  // Handle successful launch
  useEffect(() => {
    if (launchMutation.isSuccess && launchMutation.data) {
      const result = launchMutation.data;
      setLaunchResult(result);
      
      if (onLaunchComplete) {
        onLaunchComplete(result);
      }

      toast({
        title: "🎉 Campaign Launched!",
        description: `Created ${result.summary.adSetsCreated} ad sets and ${result.summary.adsCreated} ads`,
      });
    }
  }, [launchMutation.isSuccess, launchMutation.data, onLaunchComplete, toast]);

  // Handle launch errors
  useEffect(() => {
    if (launchMutation.isError) {
      toast({
        title: "Launch Failed",
        description: launchMutation.error?.message || "Failed to create Facebook campaign",
        variant: "destructive",
      });
    }
  }, [launchMutation.isError, launchMutation.error, toast]);

  const handleLaunch = () => {
    if (!adAccountId.trim()) {
      toast({
        title: "Ad Account Required",
        description: "Please enter your Facebook Ad Account ID",
        variant: "destructive",
      });
      return;
    }

    if (!campaignConfig) {
      toast({
        title: "No Campaign Config",
        description: "Campaign configuration is missing",
        variant: "destructive", 
      });
      return;
    }

    // Transform the campaign config into the format expected by Facebook API
    const payload: LaunchPayload = {
      adAccountId: adAccountId.replace('act_', ''), // Remove act_ prefix if present
      campaign: {
        name: campaignConfig.campaign?.name || `Campaign ${Date.now()}`,
        objective: campaignConfig.campaign?.objective || 'LINK_CLICKS',
        status: 'PAUSED' // Always create paused initially for safety
      },
      adSets: campaignConfig.adSets?.map((adSet: any, index: number) => ({
        name: adSet.name || `Ad Set ${index + 1}`,
        daily_budget: adSet.daily_budget || 1000, // Default $10 daily budget (in cents)
        billing_event: adSet.billing_event || 'IMPRESSIONS',
        optimization_goal: adSet.optimization_goal || 'LINK_CLICKS',
        targeting: adSet.targeting || {
          geo_locations: { countries: ['US'] },
          age_min: 18,
          age_max: 65
        },
        placements: adSet.placements,
        status: 'PAUSED'
      })) || [],
      ads: campaignConfig.ads?.map((ad: any, index: number) => ({
        name: ad.name || `Ad ${index + 1}`,
        adset_index: ad.adset_index || 0,
        creative: ad.creative || { creative_id: 'placeholder' },
        status: 'PAUSED'
      })) || []
    };

    console.log('Launching campaign with payload:', payload);
    launchMutation.mutate(payload);
  };

  const getFacebookAdsManagerUrl = (campaignId?: string) => {
    if (!campaignId) return 'https://business.facebook.com/adsmanager/';
    return `https://business.facebook.com/adsmanager/manage/campaigns?act=${adAccountId}&selected_campaign_ids=${campaignId}`;
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Facebook Campaign Launcher
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Campaign Summary */}
        {campaignConfig && (
          <div className="space-y-3">
            <h4 className="font-semibold">Campaign Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">1</div>
                <div className="text-sm text-muted-foreground">Campaign</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {campaignConfig.adSets?.length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Ad Sets</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {campaignConfig.ads?.length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Ads</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  ${(campaignConfig.totalBudget || 0)}
                </div>
                <div className="text-sm text-muted-foreground">Daily Budget</div>
              </div>
            </div>
          </div>
        )}

        {/* Ad Account Input */}
        {!launchResult && (
          <div className="space-y-3">
            <Label htmlFor="adAccountId">Facebook Ad Account ID</Label>
            <Input
              id="adAccountId"
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              placeholder="Enter your Ad Account ID (e.g., 123456789012345)"
              disabled={launchMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Find your Ad Account ID in Facebook Ads Manager → Settings → Account Settings
            </p>
          </div>
        )}

        {/* Launch Button */}
        {!launchResult && (
          <div className="flex justify-center">
            <Button 
              onClick={handleLaunch}
              disabled={!adAccountId.trim() || !campaignConfig || launchMutation.isPending}
              size="lg"
              className="px-8"
            >
              {launchMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Launching Campaign...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Launch Facebook Campaign
                </>
              )}
            </Button>
          </div>
        )}

        {/* Loading State */}
        {launchMutation.isPending && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              Creating your campaign in Facebook Ads Manager... This may take a few moments.
            </AlertDescription>
          </Alert>
        )}

        {/* Success State */}
        {launchResult && (
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Campaign launched successfully!</strong><br />
                Your campaign "{launchResult.summary.campaignName}" is now live in Facebook Ads Manager.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <div className="font-semibold">Campaign ID</div>
                  <div className="text-sm text-muted-foreground font-mono">{launchResult.campaignId}</div>
                </div>
                <Badge variant="default">Live</Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <div className="font-semibold">Ad Sets Created</div>
                  <div className="text-sm text-muted-foreground">
                    {launchResult.adSetIds?.length || 0} ad sets ready for targeting
                  </div>
                </div>
                <Badge variant="secondary">{launchResult.adSetIds?.length || 0}</Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <div className="font-semibold">Ads Created</div>
                  <div className="text-sm text-muted-foreground">
                    {launchResult.adIds?.length || 0} ads ready for review
                  </div>
                </div>
                <Badge variant="secondary">{launchResult.adIds?.length || 0}</Badge>
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => window.open(getFacebookAdsManagerUrl(launchResult.campaignId), '_blank')}
                className="flex-1"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View in Ads Manager
              </Button>
              <Button 
                variant="outline"
                onClick={() => window.open('https://business.facebook.com/adsmanager/', '_blank')}
                className="flex-1"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Ads Manager
              </Button>
            </div>
          </div>
        )}

        {/* Error State */}
        {launchMutation.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Launch failed:</strong> {launchMutation.error?.message}
              <br />
              Please check your Ad Account ID and Facebook permissions.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Wand2, Eye, Save, RefreshCw } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DetailedAudienceSegment } from './PersistentAudienceSelection';
import { CreativeAsset } from './CreativeAssetManager';

interface AdCopy {
  headline: string;
  primary_text: string;
  call_to_action: string;
  description?: string;
}

interface GeneratedAd {
  id: string;
  ad_set_name: string;
  audience_segment_id: string;
  creative_asset: CreativeAsset;
  ad_copy: AdCopy;
  preview_url?: string;
  approved: boolean;
}

interface AdCreationWorkflowProps {
  campaignId: string;
  audienceSegments: DetailedAudienceSegment[];
  creativeAssets: CreativeAsset[];
  brandData: any;
  competitorData: any;
  onAdsGenerated: (ads: GeneratedAd[]) => void;
}

export function AdCreationWorkflow({
  campaignId,
  audienceSegments,
  creativeAssets,
  brandData,
  competitorData,
  onAdsGenerated
}: AdCreationWorkflowProps) {
  const [generatedAds, setGeneratedAds] = useState<GeneratedAd[]>([]);
  const [editingAd, setEditingAd] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  // Load existing generated ads
  const { data: existingAds, refetch: refetchAds } = useQuery({
    queryKey: ['campaign-ads', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_ads')
        .select('*')
        .eq('campaign_id', campaignId);

      if (error) throw error;
      
      // Transform database format to component format
      return (data || []).map(ad => ({
        id: ad.id,
        ad_set_name: ad.ad_name,
        audience_segment_id: ad.ad_set_id || '',
        creative_asset: {
          id: ad.creative_asset_url,
          url: ad.creative_asset_url,
          type: 'url' as const,
          selected: true
        },
        ad_copy: (ad.ad_copy_data as unknown) as AdCopy,
        approved: ad.status === 'approved'
      }));
    },
    enabled: !!campaignId
  });

  // Initialize from existing ads
  useEffect(() => {
    if (existingAds && existingAds.length > 0) {
      setGeneratedAds(existingAds);
    }
  }, [existingAds]);

  // Generate ads using AI
  const generateAdCopy = async (audience: DetailedAudienceSegment, asset: CreativeAsset) => {
    const { data, error } = await supabase.functions.invoke('generate-ad-copy', {
      body: {
        businessContext: {
          brandUrl: brandData?.brandUrl,
          brandName: brandData?.brandName,
          valuePropositions: brandData?.valuePropositions,
          businessCategory: brandData?.businessCategory,
          brandStrengths: brandData?.brandStrengths,
        },
        campaignObjective: 'TRAFFIC',
        targetAudience: {
          segment: audience.segment,
          criteria: audience.criteria,
          targeting: audience.targeting_data,
          insights: audience.insights, // Add audience insights if available
        },
        competitorInsights: competitorData?.insights,
        selectedAngle: brandData?.selectedAngle || competitorData?.selectedAngle || audience.selectedAngle,
        creativeAsset: asset
      }
    });

    if (error) throw error;
    return data;
  };

  const handleGenerateAds = async () => {
    if (audienceSegments.length === 0 || creativeAssets.length === 0) {
      toast({
        title: "Missing requirements",
        description: "Please ensure you have selected audience segments and creative assets.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    const newAds: GeneratedAd[] = [];

    try {
      // Generate ads for each audience segment using each creative asset
      for (const audience of audienceSegments) {
        for (const asset of creativeAssets) {
          const adCopyData = await generateAdCopy(audience, asset);
          
          const ad: GeneratedAd = {
            id: `${audience.id || 'temp'}_${asset.id}_${Date.now()}`,
            ad_set_name: `${audience.segment} - ${asset.name || 'Asset'}`,
            audience_segment_id: audience.id || '',
            creative_asset: asset,
            ad_copy: adCopyData.ad_copy, // Do not fallback to generic
            approved: false
          };
          
          newAds.push(ad);
        }
      }

      setGeneratedAds(newAds);
      await saveAdsToDatabase(newAds);
      
      toast({
        title: "Ads generated successfully",
        description: `Created ${newAds.length} ad variations`
      });
      
    } catch (error) {
      console.error('Error generating ads:', error);
      toast({
        title: "Generation failed",
        description: "Failed to generate ads. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const saveAdsToDatabase = async (ads: GeneratedAd[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Save individual ads
      for (const ad of ads) {
        const adData = {
          campaign_id: campaignId,
          user_id: user.id,
          ad_name: ad.ad_set_name,
          creative_asset_url: ad.creative_asset.url,
          ad_copy_data: ad.ad_copy,
          status: ad.approved ? 'approved' : 'draft'
        };

        const { error } = await supabase
          .from('campaign_ads')
          .upsert(adData as any, { onConflict: 'id' });

        if (error) throw error;
      }

      // Also save to campaign level for reference
      const { error: campaignError } = await supabase
        .from('ad_campaigns')
        .update({ 
          generated_ad_copy: ads.map(ad => ({
            id: ad.id,
            ad_copy: ad.ad_copy,
            asset_url: ad.creative_asset.url
          })) as any
        })
        .eq('id', campaignId);

      if (campaignError) throw campaignError;
      
      await refetchAds();
    } catch (error) {
      console.error('Error saving ads:', error);
      throw error;
    }
  };

  const updateAdCopy = (adId: string, field: keyof AdCopy, value: string) => {
    setGeneratedAds(prev => prev.map(ad => 
      ad.id === adId 
        ? { ...ad, ad_copy: { ...ad.ad_copy, [field]: value } }
        : ad
    ));
  };

  const saveAdChanges = async (adId: string) => {
    const ad = generatedAds.find(a => a.id === adId);
    if (!ad) return;

    try {
      await saveAdsToDatabase([ad]);
      setEditingAd(null);
      toast({
        title: "Ad saved",
        description: "Ad copy changes saved successfully"
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Failed to save ad changes",
        variant: "destructive"
      });
    }
  };

  const toggleAdApproval = async (adId: string) => {
    const ad = generatedAds.find(a => a.id === adId);
    if (!ad) return;

    const updatedAd = { ...ad, approved: !ad.approved };
    setGeneratedAds(prev => prev.map(a => a.id === adId ? updatedAd : a));
    
    try {
      await saveAdsToDatabase([updatedAd]);
      toast({
        title: updatedAd.approved ? "Ad approved" : "Ad unapproved",
        description: updatedAd.approved ? "Ad is ready for launch" : "Ad needs review"
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: "Failed to update ad status",
        variant: "destructive"
      });
    }
  };

  const handleContinue = () => {
    const approvedAds = generatedAds.filter(ad => ad.approved);
    if (approvedAds.length === 0) {
      toast({
        title: "No approved ads",
        description: "Please approve at least one ad to continue.",
        variant: "destructive"
      });
      return;
    }
    onAdsGenerated(generatedAds);
  };

  const approvedCount = generatedAds.filter(ad => ad.approved).length;
  const totalPossibleAds = audienceSegments.length * creativeAssets.length;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5" />
          AI Ad Creation & Copy Generation
        </CardTitle>
        <p className="text-muted-foreground">
          Generate and customize ads for each audience segment using your selected creative assets.
        </p>
        <div className="flex gap-2">
          <Badge variant="outline">
            {audienceSegments.length} Audience Segments
          </Badge>
          <Badge variant="outline">
            {creativeAssets.length} Creative Assets
          </Badge>
          <Badge variant="default">
            {totalPossibleAds} Possible Ad Combinations
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Generation Controls */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="font-medium">Ad Generation</h3>
            <p className="text-sm text-muted-foreground">
              Generate AI-powered ad copy for each audience and asset combination
            </p>
          </div>
          
          <Button 
            onClick={handleGenerateAds}
            disabled={isGenerating || audienceSegments.length === 0 || creativeAssets.length === 0}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {generatedAds.length > 0 ? 'Regenerate Ads' : 'Generate Ads'}
              </>
            )}
          </Button>
        </div>

        {/* Loading State */}
        {isGenerating && (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              Generating {totalPossibleAds} ad variations using AI...
              <br />
              This may take a few moments.
            </p>
          </div>
        )}

        {/* Generated Ads */}
        {generatedAds.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Generated Ads ({approvedCount}/{generatedAds.length} approved)</h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allApproved = generatedAds.every(ad => ad.approved);
                    const updated = generatedAds.map(ad => ({ ...ad, approved: !allApproved }));
                    setGeneratedAds(updated);
                    saveAdsToDatabase(updated);
                  }}
                >
                  {generatedAds.every(ad => ad.approved) ? 'Unapprove All' : 'Approve All'}
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              {generatedAds.map((ad) => (
                <Card key={ad.id} className={`${ad.approved ? 'border-green-200 bg-green-50/50' : 'border-border'}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium">{ad.ad_set_name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Asset: {ad.creative_asset.name || ad.creative_asset.url.split('/').pop()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={ad.approved ? "default" : "secondary"}>
                          {ad.approved ? "Approved" : "Draft"}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingAd(editingAd === ad.id ? null : ad.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    
                    {/* Ad Preview */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <img 
                          src={ad.creative_asset.url}
                          alt="Ad creative"
                          className="w-full h-48 object-cover rounded border"
                        />
                      </div>
                      
                      <div className="space-y-3">
                        {editingAd === ad.id ? (
                          <>
                            <div>
                              <Label>Headline</Label>
                              <Input
                                value={ad.ad_copy.headline}
                                onChange={(e) => updateAdCopy(ad.id, 'headline', e.target.value)}
                                placeholder="Compelling headline..."
                              />
                            </div>
                            <div>
                              <Label>Primary Text</Label>
                              <Textarea
                                value={ad.ad_copy.primary_text}
                                onChange={(e) => updateAdCopy(ad.id, 'primary_text', e.target.value)}
                                placeholder="Main ad copy..."
                                rows={3}
                              />
                            </div>
                            <div>
                              <Label>Call to Action</Label>
                              <Input
                                value={ad.ad_copy.call_to_action}
                                onChange={(e) => updateAdCopy(ad.id, 'call_to_action', e.target.value)}
                                placeholder="Learn More"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button onClick={() => saveAdChanges(ad.id)} size="sm">
                                <Save className="h-4 w-4 mr-2" />
                                Save Changes
                              </Button>
                              <Button 
                                variant="outline" 
                                onClick={() => setEditingAd(null)} 
                                size="sm"
                              >
                                Cancel
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <Label className="text-xs text-muted-foreground">HEADLINE</Label>
                              <p className="font-medium">{ad.ad_copy.headline}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">PRIMARY TEXT</Label>
                              <p className="text-sm">{ad.ad_copy.primary_text}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">CALL TO ACTION</Label>
                              <Badge variant="outline">{ad.ad_copy.call_to_action}</Badge>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Approval Controls */}
                    <div className="flex justify-between items-center pt-2 border-t">
                      <Button
                        variant={ad.approved ? "secondary" : "default"}
                        onClick={() => toggleAdApproval(ad.id)}
                        size="sm"
                      >
                        {ad.approved ? "✓ Approved" : "Approve Ad"}
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={() => setEditingAd(ad.id)}
                        size="sm"
                      >
                        Edit Copy
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Continue Button */}
        {generatedAds.length > 0 && (
          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {approvedCount} ads approved and ready for launch
            </p>
            <Button 
              onClick={handleContinue}
              disabled={approvedCount === 0}
            >
              Continue to Launch ({approvedCount} ads)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CampaignAudienceSegment {
  id: string;
  name: string;
  age_min?: number;
  age_max?: number;
  genders?: string[];
  interests?: string[];
  locations?: string[];
  behaviors?: string[];
  description?: string;
  targeting_criteria?: any;
}

export interface FacebookAudienceCreationPayload {
  campaignId: string;
  audiences: CampaignAudienceSegment[];
}

export interface FacebookAudienceCreationResult {
  success: boolean;
  createdAudiences: Array<{
    localId: string;
    facebookAudienceId: string;
    audienceName: string;
  }>;
  errors?: Array<{
    localId: string;
    error: string;
  }>;
}

export function useCampaignAudiences(campaignId: string) {
  // Query to get existing campaign audiences
  const { data: campaignAudiences, refetch } = useQuery({
    queryKey: ['campaign-audiences', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_facebook_audiences')
        .select(`
          *,
          facebook_audiences!inner(*)
        `)
        .eq('campaign_id', campaignId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!campaignId
  });

  // Mutation to create Facebook audiences for this campaign
  const createFacebookAudiencesMutation = useMutation<
    FacebookAudienceCreationResult,
    Error,
    FacebookAudienceCreationPayload
  >({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.functions.invoke('create-facebook-audiences', {
        body: payload,
      });

      if (error) {
        throw new Error(error.message || 'Failed to create Facebook audiences');
      }

      return data;
    },
    onSuccess: () => {
      refetch();
    }
  });

  // Function to save audience data to campaign
  const saveAudienceData = async (audienceData: any) => {
    const { error } = await supabase
      .from('ad_campaigns')
      .update({
        audience_data: audienceData
      })
      .eq('id', campaignId);

    if (error) throw error;
  };

  // Function to create audiences and link them to campaign
  const createAndLinkAudiences = async (audiences: CampaignAudienceSegment[]) => {
    // First save the audience data to the campaign
    await saveAudienceData({ segments: audiences, created_at: new Date().toISOString() });

    // Then create the Facebook audiences
    const result = await createFacebookAudiencesMutation.mutateAsync({
      campaignId,
      audiences
    });

    // Link the created audiences to the campaign
    if (result.success && result.createdAudiences.length > 0) {
      const linkPromises = result.createdAudiences.map(async (audience) => {
        // Find the original audience data
        const originalAudience = audiences.find(a => a.id === audience.localId);
        
        const { error } = await supabase
          .from('campaign_facebook_audiences')
          .insert({
            campaign_id: campaignId,
            facebook_audience_id: audience.facebookAudienceId,
            audience_segment_data: originalAudience || {}
          });

        if (error) throw error;
      });

      await Promise.all(linkPromises);
    }

    return result;
  };

  return {
    campaignAudiences,
    createAndLinkAudiences,
    saveAudienceData,
    isCreating: createFacebookAudiencesMutation.isPending,
    createError: createFacebookAudiencesMutation.error
  };
}
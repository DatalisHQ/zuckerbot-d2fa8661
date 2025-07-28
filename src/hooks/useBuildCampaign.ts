import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CampaignSettings } from '@/components/CampaignSettings';

export interface CampaignConfigJSON {
  campaign: {
    name: string;
    objective: string;
    status: string;
    special_ad_categories?: string[];
  };
  adSets: Array<{
    name: string;
    campaign_id: string;
    optimization_goal: string;
    billing_event: string;
    bid_amount?: number;
    daily_budget?: number;
    lifetime_budget?: number;
    targeting: {
      geo_locations?: {
        countries: string[];
      };
      custom_audiences?: string[];
      interests?: Array<{
        id: string;
        name: string;
      }>;
      age_min?: number;
      age_max?: number;
      genders?: number[];
    };
    publisher_platforms: string[];
    facebook_positions?: string[];
    instagram_positions?: string[];
    status: string;
  }>;
  ads: Array<{
    name: string;
    adset_id: string;
    creative: {
      name: string;
      object_story_spec: {
        page_id: string;
        link_data?: {
          link: string;
          message: string;
          name?: string;
          description?: string;
          call_to_action?: {
            type: string;
          };
        };
      };
    };
    status: string;
  }>;
}

export function useBuildCampaign() {
  return useMutation<CampaignConfigJSON, Error, CampaignSettings>({
    mutationFn: async (settings) => {
      console.log('Building campaign config with settings:', settings);
      
      const { data, error } = await supabase.functions.invoke('generate-campaign-config', {
        body: settings
      });

      if (error) {
        console.error('Error building campaign config:', error);
        throw new Error(error.message || 'Failed to build campaign configuration');
      }

      if (!data) {
        throw new Error('No campaign configuration returned');
      }

      return data;
    },
  });
}
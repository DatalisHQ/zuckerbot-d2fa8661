import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LaunchPayload {
  adAccountId: string;
  campaign: {
    name: string;
    objective: string;
    status: 'PAUSED' | 'ACTIVE';
  };
  adSets: Array<{
    name: string;
    daily_budget: number;
    billing_event: string;
    optimization_goal: string;
    targeting: object;
    placements?: object;
    status?: 'PAUSED' | 'ACTIVE';
  }>;
  ads: Array<{
    name: string;
    adset_index: number;
    creative: { creative_id: string };
    status: 'PAUSED' | 'ACTIVE';
  }>;
}

export interface LaunchResult {
  success: boolean;
  campaignId: string;
  adSetIds: string[];
  adIds: string[];
  summary: {
    campaignName: string;
    adSetsCreated: number;
    adsCreated: number;
  };
}

export function useLaunchCampaign() {
  return useMutation<LaunchResult, Error, LaunchPayload>({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.functions.invoke('create-facebook-campaign', {
        body: payload,
      });

      if (error) {
        throw new Error(error.message || 'Failed to launch Facebook campaign');
      }

      return data;
    },
  });
}
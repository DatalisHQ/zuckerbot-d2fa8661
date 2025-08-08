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
      try {
        const { data, error } = await supabase.functions.invoke('create-facebook-campaign', {
          body: payload,
        });

        if (error) {
          // Supabase edge functions return structured error info; pass it along
          const message = (error as any)?.message || 'Failed to launch Facebook campaign';
          throw new Error(message);
        }
        if (!data?.success) {
          // Surface non-success responses with details when available
          const msg = (data?.error || 'Failed to launch campaign');
          const details = data?.details ? ` Details: ${data.details}` : '';
          throw new Error(`${msg}${details}`);
        }
        return data as LaunchResult;
      } catch (e: any) {
        // Re-throw with actionable text
        const reason = e?.message || String(e);
        throw new Error(`Launch error: ${reason}`);
      }
    },
  });
}
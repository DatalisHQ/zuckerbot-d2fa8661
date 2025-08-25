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
        // Get current Supabase session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session?.access_token) {
          throw new Error('No valid Supabase session found. Please log in again.');
        }

        console.log('🚀 Launching campaign with Supabase session');
        console.log('- Session token length:', session.access_token.length);
        console.log('- Session token prefix:', session.access_token.slice(0, 4));
        console.log('- Session token suffix:', session.access_token.slice(-4));

        const { data, error } = await supabase.functions.invoke('create-facebook-campaign', {
          body: payload,
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (error) {
          // Edge function call failed at transport layer
          const message = (error as any)?.message || 'Failed to launch Facebook campaign';
          const details = (error as any)?.details || '';
          throw new Error(`${message}${details ? ` | ${details}` : ''}`);
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
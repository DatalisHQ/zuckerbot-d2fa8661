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
        // Get user's Facebook access token from profile
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('User not authenticated');
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('facebook_access_token')
          .eq('user_id', user.id)
          .single();

        if (profileError || !profile?.facebook_access_token) {
          throw new Error('Facebook access token not found. Please reconnect your Facebook account.');
        }

        console.log('🚀 Launching campaign with user token');
        console.log('- Token length:', profile.facebook_access_token.length);
        console.log('- Token prefix:', profile.facebook_access_token.slice(0, 5));
        console.log('- Token suffix:', profile.facebook_access_token.slice(-5));

        const { data, error } = await supabase.functions.invoke('create-facebook-campaign', {
          body: payload,
          headers: {
            'Authorization': `Bearer ${profile.facebook_access_token}`
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
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdAccount {
  id: string;
  name: string;
  account_status: number;
}

export function useGetFacebookAdAccounts() {
  return useQuery<AdAccount[], Error>({
    queryKey: ['facebook-ad-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-facebook-ad-accounts');

      if (error) {
        console.error('useGetFacebookAdAccounts error:', error, 'data:', data);
        const messageFromServer = (data as any)?.error || (data as any)?.message;
        const err = new Error(
          messageFromServer || error.message || 'Failed to fetch Facebook ad accounts'
        );
        if ((data as any)?.reconnectRequired) {
          (err as any).reconnectRequired = true;
          (err as any).facebookError = (data as any)?.facebookError;
        }
        if ((data as any)?.httpStatus) {
          (err as any).httpStatus = (data as any).httpStatus;
        }
        throw err;
      }

      if (data?.reconnectRequired) {
        console.error('Facebook reconnection required:', data);
        const reconnectError = new Error(data.error || 'Your Facebook session expired or access was revoked. Please reconnect to continue.');
        (reconnectError as any).reconnectRequired = true;
        (reconnectError as any).facebookError = data.facebookError;
        throw reconnectError;
      }

      return data.adAccounts || [];
    },
  });
}
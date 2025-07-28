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
        throw new Error(error.message || 'Failed to fetch Facebook ad accounts');
      }

      return data.adAccounts || [];
    },
  });
}
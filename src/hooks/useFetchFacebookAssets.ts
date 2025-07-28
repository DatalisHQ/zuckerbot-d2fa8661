import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useFetchFacebookAssets() {
  return useMutation<string[], Error, { adAccountId: string }>({
    mutationFn: async ({ adAccountId }) => {
      const { data, error } = await supabase.functions.invoke('fetch-facebook-assets', {
        body: { adAccountId },
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch Facebook assets');
      }

      return data.assets || [];
    },
  });
}
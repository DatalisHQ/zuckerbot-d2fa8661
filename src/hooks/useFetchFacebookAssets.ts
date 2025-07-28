import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FacebookAsset {
  url: string;
  id: string;
  selected?: boolean;
}

export function useFetchFacebookAssets() {
  return useMutation<FacebookAsset[], Error, { adAccountId: string }>({
    mutationFn: async ({ adAccountId }) => {
      const { data, error } = await supabase.functions.invoke('fetch-facebook-assets', {
        body: { adAccountId },
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch Facebook assets');
      }

      // Transform simple URLs to asset objects with unique IDs
      const assets = (data.assets || []).map((url: string, index: number) => ({
        url,
        id: `${adAccountId}_${index}`,
        selected: false
      }));

      return assets;
    },
  });
}
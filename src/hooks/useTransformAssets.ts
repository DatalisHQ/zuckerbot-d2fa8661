import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TransformedAsset = {
  assetId: string;
  variantUrls: string[];
  headline: string;
  originalUrl: string;
};

export type TransformAssetsResponse = {
  transformedAssets: TransformedAsset[];
  campaignId: string;
  summary: {
    totalAssets: number;
    successfulTransforms: number;
    fallbacks: number;
  };
};

export type TransformAssetsPayload = {
  brandUrl: string;
  rawAssets: string[];
  competitorProfiles: { 
    name?: string;
    valueProps?: string[];
    toneProfile?: string;
  }[];
};

export function useTransformAssets() {
  return useMutation<TransformAssetsResponse, Error, TransformAssetsPayload>({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.functions.invoke('transform-assets', {
        body: payload,
      });

      if (error) {
        throw new Error(error.message || 'Asset transformation failed');
      }

      return data;
    },
  });
}
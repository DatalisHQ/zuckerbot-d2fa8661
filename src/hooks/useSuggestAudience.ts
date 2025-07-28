import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AudienceSegment = { segment: string; criteria: string };

interface SuggestAudiencePayload {
  brandUrl: string;
  competitorProfiles: { 
    name: string; 
    valueProps: string[]; 
    toneProfile: string;
  }[];
}

interface SuggestAudienceResponse {
  segments: AudienceSegment[];
}

export function useSuggestAudience() {
  return useMutation<AudienceSegment[], Error, SuggestAudiencePayload>({
    mutationFn: async (payload) => {
      console.log('Calling suggest-audience function with:', payload);
      
      const { data, error } = await supabase.functions.invoke('suggest-audience', {
        body: payload
      });

      if (error) {
        console.error('Error calling suggest-audience:', error);
        throw new Error(error.message || 'Failed to fetch audience segments');
      }

      if (!data?.segments) {
        throw new Error('No audience segments returned');
      }

      return data.segments;
    },
  });
}
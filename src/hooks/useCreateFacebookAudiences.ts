import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AudienceSegment {
  segment: string;
  criteria: string;
}

export interface CreateAudiencesPayload {
  audienceSegments: AudienceSegment[];
  adAccountId: string;
}

export interface CreatedAudience {
  segmentName: string;
  audienceId: string;
  status: 'created' | 'existing';
}

export interface CreateAudiencesResult {
  success: boolean;
  createdAudiences: CreatedAudience[];
  errors: Array<{
    segmentName: string;
    error: string;
  }>;
  summary: {
    total: number;
    created: number;
    existing: number;
    failed: number;
  };
}

export function useCreateFacebookAudiences() {
  return useMutation<CreateAudiencesResult, Error, CreateAudiencesPayload>({
    mutationFn: async ({ audienceSegments, adAccountId }) => {
      const { data, error } = await supabase.functions.invoke('create-facebook-audiences', {
        body: {
          audienceSegments,
          adAccountId
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to create Facebook audiences');
      }

      return data;
    },
  });
}
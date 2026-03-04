import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface FacebookHealthStatus {
  isHealthy: boolean;
  tokenValid: boolean;
  adAccountValid: boolean;
  businessAccountValid: boolean;
  error: string | null;
  isChecking: boolean;
}

export const useFacebookHealthCheck = () => {
  const [healthStatus, setHealthStatus] = useState<FacebookHealthStatus>({
    isHealthy: false,
    tokenValid: false,
    adAccountValid: false,
    businessAccountValid: false,
    error: null,
    isChecking: false
  });
  const { toast } = useToast();

  const performHealthCheck = useCallback(async (): Promise<FacebookHealthStatus> => {
    setHealthStatus(prev => ({ ...prev, isChecking: true }));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const status: FacebookHealthStatus = {
          isHealthy: false, tokenValid: false, adAccountValid: false,
          businessAccountValid: false, error: 'Not authenticated', isChecking: false
        };
        setHealthStatus(status);
        return status;
      }

      // Use 'businesses' table which has facebook_access_token and facebook_ad_account_id
      const { data: biz, error: bizError } = await (supabase as any)
        .from('businesses')
        .select('facebook_access_token, facebook_ad_account_id, facebook_page_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (bizError || !biz?.facebook_access_token) {
        const status: FacebookHealthStatus = {
          isHealthy: false, tokenValid: false, adAccountValid: false,
          businessAccountValid: false, error: 'Facebook not connected', isChecking: false
        };
        setHealthStatus(status);
        return status;
      }

      // Check token validity
      let tokenValid = false;
      try {
        const tokenResponse = await fetch(
          `https://graph.facebook.com/v18.0/me?access_token=${biz.facebook_access_token}`
        );
        tokenValid = tokenResponse.ok;
      } catch {
        tokenValid = false;
      }

      // Check ad account access
      let adAccountValid = false;
      if (tokenValid && biz.facebook_ad_account_id) {
        try {
          const adAccountResponse = await fetch(
            `https://graph.facebook.com/v18.0/${biz.facebook_ad_account_id}?access_token=${biz.facebook_access_token}`
          );
          adAccountValid = adAccountResponse.ok;
        } catch {
          adAccountValid = false;
        }
      }

      const isHealthy = tokenValid && adAccountValid;

      const status: FacebookHealthStatus = {
        isHealthy,
        tokenValid,
        adAccountValid,
        businessAccountValid: tokenValid, // simplified
        error: isHealthy ? null : 'Some Facebook components need attention',
        isChecking: false
      };

      setHealthStatus(status);

      if (!isHealthy) {
        toast({
          title: "Facebook Connection Issue",
          description: "Some Facebook components need attention. Please check your connection.",
          variant: "destructive",
        });
      }

      return status;
    } catch (error: any) {
      const status: FacebookHealthStatus = {
        isHealthy: false, tokenValid: false, adAccountValid: false,
        businessAccountValid: false, error: error.message, isChecking: false
      };
      setHealthStatus(status);
      return status;
    }
  }, [toast]);

  return { healthStatus, performHealthCheck };
};

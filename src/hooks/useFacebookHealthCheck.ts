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
        throw new Error('User not authenticated');
      }

      // Get profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('facebook_connected, facebook_access_token, facebook_business_id, selected_ad_account_id')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        throw new Error('Failed to fetch profile data');
      }

      if (!profile?.facebook_connected || !profile.facebook_access_token) {
        const status = {
          isHealthy: false,
          tokenValid: false,
          adAccountValid: false,
          businessAccountValid: false,
          error: 'Facebook not connected',
          isChecking: false
        };
        setHealthStatus(status);
        return status;
      }

      // Check token validity
      let tokenValid = false;
      try {
        const tokenResponse = await fetch(
          `https://graph.facebook.com/v18.0/me?access_token=${profile.facebook_access_token}`
        );
        tokenValid = tokenResponse.ok;
      } catch (error) {
        console.error('Token validation failed:', error);
        tokenValid = false;
      }

      // Check business account access
      let businessAccountValid = false;
      if (tokenValid && profile.facebook_business_id) {
        try {
          const businessResponse = await fetch(
            `https://graph.facebook.com/v18.0/${profile.facebook_business_id}?access_token=${profile.facebook_access_token}`
          );
          businessAccountValid = businessResponse.ok;
        } catch (error) {
          console.error('Business account validation failed:', error);
          businessAccountValid = false;
        }
      }

      // Check ad account access
      let adAccountValid = false;
      if (tokenValid && profile.selected_ad_account_id) {
        try {
          const adAccountResponse = await fetch(
            `https://graph.facebook.com/v18.0/act_${profile.selected_ad_account_id}?access_token=${profile.facebook_access_token}`
          );
          adAccountValid = adAccountResponse.ok;
        } catch (error) {
          console.error('Ad account validation failed:', error);
          adAccountValid = false;
        }
      }

      const isHealthy = tokenValid && businessAccountValid && adAccountValid;
      
      const status = {
        isHealthy,
        tokenValid,
        adAccountValid,
        businessAccountValid,
        error: isHealthy ? null : 'Facebook API access issues detected',
        isChecking: false
      };

      setHealthStatus(status);
      return status;

    } catch (error: any) {
      console.error('Facebook health check failed:', error);
      const status = {
        isHealthy: false,
        tokenValid: false,
        adAccountValid: false,
        businessAccountValid: false,
        error: error.message || 'Health check failed',
        isChecking: false
      };
      setHealthStatus(status);
      return status;
    }
  }, []);

  const requireHealthyConnection = useCallback(async (): Promise<boolean> => {
    const status = await performHealthCheck();
    
    if (!status.isHealthy) {
      let errorMessage = 'Facebook connection issue detected.';
      let recoveryParam = 'facebook';

      if (!status.tokenValid) {
        errorMessage = 'Your Facebook access token has expired. Please reconnect.';
      } else if (!status.businessAccountValid) {
        errorMessage = 'Cannot access your Facebook Business account. Please reconnect.';
      } else if (!status.adAccountValid) {
        errorMessage = 'Cannot access your selected ad account. Please reselect.';
        recoveryParam = 'ad_account';
      }

      toast({
        title: "Facebook Connection Required",
        description: errorMessage,
        variant: "destructive",
      });

      // Redirect to recovery
      window.location.href = `/onboarding?recovery=${recoveryParam}`;
      return false;
    }

    return true;
  }, [performHealthCheck, toast]);

  return {
    healthStatus,
    performHealthCheck,
    requireHealthyConnection
  };
};
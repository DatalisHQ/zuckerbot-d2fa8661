import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface FacebookTokenStatus {
  isValid: boolean;
  isExpired: boolean;
  needsRefresh: boolean;
  isLoading: boolean;
  error: string | null;
}

export const useFacebookTokenValidator = () => {
  const [tokenStatus, setTokenStatus] = useState<FacebookTokenStatus>({
    isValid: false,
    isExpired: false,
    needsRefresh: false,
    isLoading: true,
    error: null
  });
  const { toast } = useToast();

  const validateToken = async (): Promise<FacebookTokenStatus> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Query profiles for facebook_connected and facebook_access_token (columns that exist)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('facebook_connected, facebook_access_token')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        throw new Error('Failed to fetch profile data');
      }

      if (!profile?.facebook_connected) {
        return {
          isValid: false,
          isExpired: false,
          needsRefresh: false,
          isLoading: false,
          error: 'Facebook not connected'
        };
      }

      if (!profile.facebook_access_token) {
        return {
          isValid: false,
          isExpired: false,
          needsRefresh: true,
          isLoading: false,
          error: 'Facebook access token missing'
        };
      }

      // Validate token with Facebook API
      try {
        const validationResponse = await fetch(
          `https://graph.facebook.com/v18.0/me?access_token=${profile.facebook_access_token}`
        );

        if (!validationResponse.ok) {
          return {
            isValid: false,
            isExpired: true,
            needsRefresh: true,
            isLoading: false,
            error: 'Facebook token is invalid or expired. Please reconnect your account.'
          };
        }

        return {
          isValid: true,
          isExpired: false,
          needsRefresh: false,
          isLoading: false,
          error: null
        };
      } catch {
        return {
          isValid: false,
          isExpired: false,
          needsRefresh: true,
          isLoading: false,
          error: 'Unable to validate Facebook token'
        };
      }
    } catch (error: any) {
      return {
        isValid: false,
        isExpired: false,
        needsRefresh: false,
        isLoading: false,
        error: error.message
      };
    }
  };

  const checkAndRefreshIfNeeded = async () => {
    const status = await validateToken();
    setTokenStatus(status);
    return status;
  };

  const refreshToken = async () => {
    // Token refresh requires re-OAuth - redirect user
    toast({
      title: "Reconnect Required",
      description: "Please reconnect your Facebook account to refresh the token.",
    });
  };

  useEffect(() => {
    checkAndRefreshIfNeeded();
  }, []);

  return { tokenStatus, checkAndRefreshIfNeeded, refreshToken };
};

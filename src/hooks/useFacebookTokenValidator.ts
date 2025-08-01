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

      // Get current profile data including token expiry
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('facebook_connected, facebook_access_token, facebook_token_expires_at, facebook_business_id')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        throw new Error('Failed to fetch profile data');
      }

      // Check if Facebook is connected at all
      if (!profile?.facebook_connected) {
        return {
          isValid: false,
          isExpired: false,
          needsRefresh: false,
          isLoading: false,
          error: 'Facebook not connected'
        };
      }

      // Check if we have a token
      if (!profile.facebook_access_token) {
        return {
          isValid: false,
          isExpired: false,
          needsRefresh: true,
          isLoading: false,
          error: 'Facebook access token missing'
        };
      }

      // Check if token is expired
      const now = new Date();
      const expiresAt = profile.facebook_token_expires_at ? new Date(profile.facebook_token_expires_at) : null;
      const isExpired = expiresAt ? now >= expiresAt : false;

      if (isExpired) {
        return {
          isValid: false,
          isExpired: true,
          needsRefresh: true,
          isLoading: false,
          error: 'Facebook requires you to reconnect every 60 days for security. Please reconnect your account.'
        };
      }

      // Validate token with Facebook API
      try {
        const validationResponse = await fetch(
          `https://graph.facebook.com/v18.0/me?access_token=${profile.facebook_access_token}`
        );

        if (!validationResponse.ok) {
          // Token is invalid according to Facebook
          return {
            isValid: false,
            isExpired: true,
            needsRefresh: true,
            isLoading: false,
            error: 'Facebook access token is invalid'
          };
        }

        // Token is valid
        return {
          isValid: true,
          isExpired: false,
          needsRefresh: false,
          isLoading: false,
          error: null
        };
      } catch (fetchError) {
        console.error('Error validating token with Facebook:', fetchError);
        // Assume token needs refresh if we can't validate
        return {
          isValid: false,
          isExpired: false,
          needsRefresh: true,
          isLoading: false,
          error: 'Could not validate token with Facebook'
        };
      }
    } catch (error: any) {
      console.error('Error validating Facebook token:', error);
      return {
        isValid: false,
        isExpired: false,
        needsRefresh: false,
        isLoading: false,
        error: error.message || 'Unknown error validating token'
      };
    }
  };

  // Facebook doesn't provide true refresh tokens for long-lived tokens
  // Once a long-lived token expires (after 60 days), user must re-authenticate
  const silentTokenRefresh = async (): Promise<boolean> => {
    console.log('Facebook does not support silent token refresh for long-lived tokens. Manual reconnection required.');
    return false;
  };

  const refreshToken = async (): Promise<boolean> => {
    try {
      setTokenStatus(prev => ({ ...prev, isLoading: true }));

      // Store current page for redirect
      const currentPage = window.location.pathname + window.location.search;
      localStorage.setItem('facebook_oauth_redirect', currentPage);

      // Initiate OAuth refresh
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          scopes: 'ads_management,ads_read,business_management,pages_read_engagement',
          redirectTo: `${window.location.origin}/onboarding?facebook=connected&return_to=${encodeURIComponent(currentPage)}`
        }
      });

      if (error) {
        console.error('Facebook OAuth refresh error:', error);
        toast({
          title: "Facebook Reconnection Failed",
          description: error.message || "Could not reconnect Facebook. Please try again.",
          variant: "destructive",
        });
        return false;
      }

      return true;
    } catch (error: any) {
      console.error('Error refreshing Facebook token:', error);
      toast({
        title: "Facebook Reconnection Error",
        description: "There was an error reconnecting your Facebook account.",
        variant: "destructive",
      });
      return false;
    }
  };

  const checkAndRefreshIfNeeded = async (): Promise<boolean> => {
    const status = await validateToken();
    setTokenStatus(status);

    if (status.needsRefresh) {
      console.log('Facebook token needs refresh - manual reconnection required');
      return false;
    }

    return status.isValid;
  };

  useEffect(() => {
    const performInitialValidation = async () => {
      const status = await validateToken();
      setTokenStatus(status);

      // If token needs refresh, show appropriate message
      if (status.needsRefresh) {
        const isExpired = status.isExpired;
        toast({
          title: isExpired ? "Facebook Access Expired" : "Facebook Connection Issue",
          description: isExpired 
            ? "Facebook requires you to reconnect every 60 days for security. This is a normal part of their API."
            : "Your Facebook connection needs to be refreshed. Please reconnect your account.",
          variant: "destructive",
        });
      }
    };

    performInitialValidation();
  }, []);

  return {
    tokenStatus,
    validateToken,
    refreshToken,
    silentTokenRefresh,
    checkAndRefreshIfNeeded
  };
};
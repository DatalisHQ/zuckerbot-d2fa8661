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
          error: 'Facebook access token expired'
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

  const silentTokenRefresh = async (): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('facebook_access_token')
        .eq('user_id', user.id)
        .single();

      if (profileError || !profile?.facebook_access_token) {
        return false;
      }

      // Try to exchange short-lived token for long-lived token
      const response = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(
          'YOUR_FACEBOOK_APP_ID'
        )}&client_secret=${encodeURIComponent(
          'YOUR_FACEBOOK_APP_SECRET'
        )}&fb_exchange_token=${encodeURIComponent(profile.facebook_access_token)}`
      );

      if (!response.ok) {
        console.log('Silent token refresh failed, manual refresh needed');
        return false;
      }

      const tokenData = await response.json();
      
      if (tokenData.access_token) {
        // Calculate new expiration (long-lived tokens are typically 60 days)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (tokenData.expires_in ? tokenData.expires_in / 86400 : 60));

        // Update token in database
        await supabase
          .from('profiles')
          .update({
            facebook_access_token: tokenData.access_token,
            facebook_token_expires_at: expiresAt.toISOString()
          })
          .eq('user_id', user.id);

        console.log('Token silently refreshed successfully');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Silent token refresh error:', error);
      return false;
    }
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
          title: "Token Refresh Failed",
          description: error.message || "Could not refresh Facebook token. Please try again.",
          variant: "destructive",
        });
        return false;
      }

      return true;
    } catch (error: any) {
      console.error('Error refreshing Facebook token:', error);
      toast({
        title: "Token Refresh Error",
        description: "There was an error refreshing your Facebook token.",
        variant: "destructive",
      });
      return false;
    }
  };

  const checkAndRefreshIfNeeded = async (): Promise<boolean> => {
    const status = await validateToken();
    setTokenStatus(status);

    if (status.needsRefresh) {
      console.log('Facebook token needs refresh, attempting silent refresh...');
      const silentRefreshSuccess = await silentTokenRefresh();
      
      if (silentRefreshSuccess) {
        // Re-validate after silent refresh
        const newStatus = await validateToken();
        setTokenStatus(newStatus);
        return newStatus.isValid;
      }
      
      // Silent refresh failed, manual intervention needed
      console.log('Silent refresh failed, manual reconnection required');
      return false;
    }

    return status.isValid;
  };

  useEffect(() => {
    const performInitialValidation = async () => {
      const status = await validateToken();
      setTokenStatus(status);

      // If token needs refresh, attempt silent refresh first
      if (status.needsRefresh) {
        console.log('Token needs refresh on mount, attempting silent refresh...');
        const silentRefreshSuccess = await silentTokenRefresh();
        
        if (!silentRefreshSuccess) {
          toast({
            title: "Facebook Connection Issue",
            description: "Your Facebook access token needs to be refreshed. Please reconnect your account.",
            variant: "destructive",
          });
        } else {
          // Re-validate after successful silent refresh
          const newStatus = await validateToken();
          setTokenStatus(newStatus);
        }
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
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

export const useFacebookTokenValidator = () => {
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();

  const validateAndRefreshToken = async (): Promise<boolean> => {
    setIsValidating(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: profile } = await supabase
        .from('profiles')
        .select('facebook_access_token, facebook_token_expires_at')
        .eq('user_id', user.id)
        .single();

      if (!profile?.facebook_access_token) {
        return false;
      }

      // Check if token is expired or about to expire (within 7 days)
      const expiresAt = profile.facebook_token_expires_at;
      const isExpiringSoon = !expiresAt || new Date(expiresAt) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      if (isExpiringSoon) {
        // Try to validate token with Facebook API
        try {
          const response = await fetch(
            `https://graph.facebook.com/v18.0/me?access_token=${profile.facebook_access_token}`
          );

          if (!response.ok) {
            // Token is invalid, mark for reconnection
            await supabase
              .from('profiles')
              .update({
                facebook_access_token: null,
                facebook_token_expires_at: null
              })
              .eq('user_id', user.id);

            toast({
              title: "Facebook Token Expired",
              description: "Please reconnect your Facebook account to continue accessing your ads data.",
              variant: "destructive",
            });

            return false;
          }

          // Token is still valid, update expiration
          await supabase
            .from('profiles')
            .update({
              facebook_token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
            })
            .eq('user_id', user.id);

          return true;
        } catch (error) {
          console.error('Error validating Facebook token:', error);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error in token validation:', error);
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleApiError = async (error: any) => {
    if (error.message?.includes('Invalid OAuth access token') || 
        error.message?.includes('OAuthException') ||
        error.message?.includes('The user has not authorized application')) {
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({
            facebook_access_token: null,
            facebook_token_expires_at: null
          })
          .eq('user_id', user.id);

        toast({
          title: "Facebook Authorization Lost",
          description: "Your Facebook connection has expired. Please reconnect to access your ads data.",
          variant: "destructive",
        });
      }
      
      return false;
    }
    
    return true;
  };

  return {
    validateAndRefreshToken,
    handleApiError,
    isValidating
  };
};
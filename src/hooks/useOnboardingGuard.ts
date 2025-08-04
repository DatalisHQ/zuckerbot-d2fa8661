import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export const useOnboardingGuard = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          navigate("/auth");
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed, facebook_connected, facebook_access_token, selected_ad_account_id')
          .eq('user_id', session.user.id)
          .maybeSingle();

        // Check for all required onboarding prerequisites
        const hasCompletedOnboarding = profile?.onboarding_completed;
        const hasFacebookConnected = profile?.facebook_connected && profile?.facebook_access_token;
        const hasSelectedAdAccount = profile?.selected_ad_account_id;

        if (!hasCompletedOnboarding || !hasFacebookConnected || !hasSelectedAdAccount) {
          console.log("Onboarding guard: Missing prerequisites", {
            onboarding_completed: hasCompletedOnboarding,
            facebook_connected: hasFacebookConnected,
            ad_account_selected: hasSelectedAdAccount
          });
          navigate("/onboarding");
          return;
        }
      } catch (error) {
        console.error('Error checking onboarding status:', error);
        navigate("/auth");
      }
    };

    checkOnboardingStatus();
  }, [navigate]);
};
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
          .select('onboarding_completed')
          .eq('user_id', session.user.id)
          .maybeSingle();

        // MAJOR CHANGE: Only check if onboarding is completed, not Facebook connection
        const hasCompletedOnboarding = profile?.onboarding_completed;

        if (!hasCompletedOnboarding) {
          console.log("Onboarding guard: Onboarding not completed, redirecting");
          navigate(`/onboarding`);
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
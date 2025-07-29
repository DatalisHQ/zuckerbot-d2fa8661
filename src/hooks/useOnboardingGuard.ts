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
          .single();

        if (!profile?.onboarding_completed) {
          console.log("Onboarding guard: User hasn't completed onboarding, redirecting");
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
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { trackFunnelEvent } from "@/utils/analytics";

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the current session
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("Auth callback error:", sessionError);
          navigate("/auth");
          return;
        }

        if (!session?.user) {
          navigate("/auth");
          return;
        }

        // Check for returnTo param in URL
        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get("returnTo");

        // Fire pixel event for new signups
        if (typeof window !== "undefined" && (window as any).fbq) {
          (window as any).fbq("track", "CompleteRegistration");
        }
        // Track GA4 signup completion
        trackFunnelEvent.completeSignup('google');

        // Always go to developer dashboard (API product)
        navigate(returnTo || "/developer");
      } catch (error) {
        console.error("Auth callback error:", error);
        navigate("/auth");
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex items-center space-x-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-lg">Signing you in...</span>
      </div>
    </div>
  );
};

export default AuthCallback;
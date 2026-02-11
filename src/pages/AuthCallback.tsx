import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing...');
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Let Supabase handle the standard confirmation flow
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }

        // If we have a session, user is confirmed
        if (data.session) {
          setStatus('success');
          setMessage('Email verified successfully! Redirecting...');

          // Create or update user profile
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("onboarding_completed")
              .eq("user_id", data.session.user.id)
              .maybeSingle();

            if (!profile) {
              await supabase.from("profiles").insert({
                user_id: data.session.user.id,
                email: data.session.user.email,
                full_name: data.session.user.user_metadata?.full_name || null,
                onboarding_completed: false,
              });
            }
          } catch (profileErr) {
            console.warn("Profile creation failed:", profileErr);
          }

          const redirectTo = searchParams.get('redirect_to') || '/onboarding';
          
          toast({
            title: "Email verified!",
            description: "Your account has been confirmed.",
          });

          // Redirect after a brief delay
          setTimeout(() => {
            navigate(redirectTo);
          }, 1500);

        } else {
          // Try to handle the token from URL if present
          const fragment = window.location.hash;
          
          if (fragment) {
            // This handles Supabase's standard auth callback
            const { error: authError } = await supabase.auth.getSession();
            
            if (!authError) {
              window.location.reload(); // Reload to get the session
              return;
            }
          }
          
          throw new Error('No session found - please try signing in again');
        }

      } catch (error: any) {
        console.error('Auth callback error:', error);
        setStatus('error');
        setMessage(error.message || 'Failed to verify email');
        
        toast({
          title: "Verification failed",
          description: "Please try signing in again.",
          variant: "destructive",
        });

        // Redirect to auth page after a delay
        setTimeout(() => {
          navigate('/auth');
        }, 3000);
      } finally {
        setIsLoading(false);
      }
    };

    handleAuthCallback();
  }, [searchParams, navigate, toast]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <h1 className="text-2xl font-semibold">Verifying your email...</h1>
            </div>
          )}
          
          {status === 'success' && (
            <div className="flex flex-col items-center gap-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <h1 className="text-2xl font-semibold text-green-700">Email verified!</h1>
            </div>
          )}
          
          {status === 'error' && (
            <div className="flex flex-col items-center gap-4">
              <XCircle className="h-12 w-12 text-red-500" />
              <h1 className="text-2xl font-semibold text-red-700">Verification failed</h1>
            </div>
          )}
        </div>
        
        <p className="text-muted-foreground">
          {message}
        </p>

        {status === 'error' && (
          <p className="text-sm text-muted-foreground mt-4">
            You'll be redirected to the sign-in page shortly.
          </p>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
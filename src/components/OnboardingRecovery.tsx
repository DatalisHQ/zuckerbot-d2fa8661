import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Facebook, RefreshCw } from "lucide-react";

interface OnboardingRecoveryProps {
  onComplete: () => void;
}

export const OnboardingRecovery = ({ onComplete }: OnboardingRecoveryProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    checkProfile();
  }, []);

  const checkProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .single();

    setProfile(data);
  };

  const connectFacebook = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          scopes: 'ads_management,ads_read,business_management,pages_read_engagement',
          redirectTo: `${window.location.origin}/onboarding?step=2&facebook=connected`
        }
      });

      if (error) {
        toast({
          title: "Facebook Connection Failed",
          description: error.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Facebook Connection Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const completeOnboarding = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("No user session");

      // Mark onboarding as completed
      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('user_id', session.user.id);

      toast({
        title: "Onboarding Complete",
        description: "You can now access all features.",
      });
      
      onComplete();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!profile) return null;

  const needsFacebookConnection = profile.facebook_connected && !profile.facebook_access_token;
  const hasIncompleteOnboarding = !profile.onboarding_completed;

  if (!needsFacebookConnection && !hasIncompleteOnboarding) return null;

  return (
    <Card className="mb-6 border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
      <CardHeader>
        <CardTitle className="flex items-center text-orange-700 dark:text-orange-300">
          <AlertTriangle className="h-5 w-5 mr-2" />
          Complete Your Setup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {needsFacebookConnection && (
          <div>
            <p className="text-sm text-orange-600 dark:text-orange-400 mb-3">
              Your Facebook connection is incomplete. Reconnect to access ad performance data.
            </p>
            <Button 
              onClick={connectFacebook} 
              disabled={isLoading}
              className="w-full"
              variant="outline"
            >
              {isLoading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              <Facebook className="mr-2 h-4 w-4" />
              Reconnect Facebook
            </Button>
          </div>
        )}
        
        {hasIncompleteOnboarding && !needsFacebookConnection && (
          <div>
            <p className="text-sm text-orange-600 dark:text-orange-400 mb-3">
              Your onboarding is incomplete. Complete it to access all features.
            </p>
            <Button 
              onClick={completeOnboarding} 
              disabled={isLoading}
              className="w-full"
            >
              Complete Onboarding
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
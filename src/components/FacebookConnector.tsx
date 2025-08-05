import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Facebook, RefreshCw, CheckCircle } from "lucide-react";

interface FacebookConnectorProps {
  onConnectionComplete?: () => void;
  showTitle?: boolean;
  title?: string;
  description?: string;
  buttonText?: string;
  variant?: "card" | "inline";
}

export const FacebookConnector = ({ 
  onConnectionComplete,
  showTitle = true,
  title = "Connect Facebook Business",
  description = "Connect your Facebook Business account to access ad management features",
  buttonText = "Connect Facebook",
  variant = "card"
}: FacebookConnectorProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Check Facebook connection status on mount
  useEffect(() => {
    const checkConnectionStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setIsLoading(false);
          return;
        }

        console.log("[FacebookConnector] Checking connection status for user:", session.user.id);
        
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('facebook_connected, facebook_access_token')
          .eq('user_id', session.user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error("[FacebookConnector] Error checking connection status:", error);
        } else if (profile) {
          console.log("[FacebookConnector] Profile found:", { 
            facebook_connected: profile.facebook_connected,
            has_token: !!profile.facebook_access_token 
          });
          setIsConnected(profile.facebook_connected && !!profile.facebook_access_token);
        }
      } catch (error) {
        console.error("[FacebookConnector] Error in connection check:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkConnectionStatus();
  }, []);

  // MAJOR CHANGE: Facebook OAuth logic moved from onboarding to reusable component
  const connectFacebook = async () => {
    console.log("[FacebookConnector] Starting Facebook OAuth flow");
    setIsConnecting(true);
    
    try {
      // Store current page for redirect back after OAuth
      const currentPage = window.location.pathname + window.location.search;
      localStorage.setItem('facebook_oauth_redirect', currentPage);
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          scopes: 'ads_management,ads_read,business_management,pages_read_engagement',
          redirectTo: `${window.location.origin}${currentPage}?facebook=connected`
        }
      });

      if (error) {
        console.error("[FacebookConnector] OAuth error:", error);
        toast({
          title: "Facebook Connection Failed",
          description: error.message || "Could not connect to Facebook. Please try again later.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("[FacebookConnector] Connection error:", error);
      toast({
        title: "Facebook Connection Error",
        description: "There was an error connecting to Facebook. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  // MAJOR CHANGE: Sync logic moved from onboarding to this component
  const handleFacebookConnected = async () => {
    console.log("[FacebookConnector] Processing Facebook connection success");
    setIsSyncing(true);
    
    try {
      // Get current session to extract Facebook token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error("[FacebookConnector] Session error:", sessionError);
        throw new Error("Failed to get session");
      }

      if (!session?.user) {
        console.error("[FacebookConnector] No user in session");
        throw new Error("No user found in session");
      }

      const userId = session.user.id;
      const facebookToken = session.provider_token;
      
      console.log("[FacebookConnector] User ID:", userId);
      console.log("[FacebookConnector] Facebook token present:", !!facebookToken);
      
      if (!facebookToken) {
        console.error("[FacebookConnector] No Facebook token in session");
        throw new Error("No Facebook access token found");
      }

      // First, check if profile exists
      console.log("[FacebookConnector] Checking for existing profile...");
      const { data: existingProfile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileCheckError && profileCheckError.code !== 'PGRST116') {
        console.error("[FacebookConnector] Error checking profile:", profileCheckError);
        throw new Error("Failed to check existing profile");
      }

      console.log("[FacebookConnector] Existing profile:", existingProfile);

      // Update or insert profile with Facebook data
      if (existingProfile) {
        console.log("[FacebookConnector] Updating existing profile with Facebook data...");
        const { data: updateData, error: updateError } = await supabase
          .from('profiles')
          .update({
            facebook_access_token: facebookToken,
            facebook_connected: true,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .select();

        if (updateError) {
          console.error("[FacebookConnector] Profile update error:", updateError);
          throw new Error(`Failed to update profile: ${updateError.message}`);
        }
        
        console.log("[FacebookConnector] Profile updated successfully:", updateData);
      } else {
        console.log("[FacebookConnector] Creating new profile with Facebook data...");
        const { data: insertData, error: insertError } = await supabase
          .from('profiles')
          .insert({
            user_id: userId,
            facebook_access_token: facebookToken,
            facebook_connected: true,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name
          })
          .select();

        if (insertError) {
          console.error("[FacebookConnector] Profile insert error:", insertError);
          throw new Error(`Failed to create profile: ${insertError.message}`);
        }
        
        console.log("[FacebookConnector] Profile created successfully:", insertData);
      }

      // Now sync Facebook ads data
      console.log("[FacebookConnector] Syncing Facebook ads data...");
      const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-facebook-ads');
      
      if (syncError) {
        console.error("[FacebookConnector] Sync error:", syncError);
        // Continue even if sync fails - user can still proceed
        console.log("[FacebookConnector] Continuing despite sync error");
      } else {
        console.log("[FacebookConnector] Facebook ads synced successfully:", syncData);
      }
      
      toast({
        title: "Facebook Connected Successfully",
        description: "Your Facebook Business account is now connected and data has been synced.",
      });

      // Update connection status
      setIsConnected(true);

      // Clean up URL without navigating away
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      
      if (onConnectionComplete) {
        onConnectionComplete();
      }
      
    } catch (error: any) {
      console.error("[FacebookConnector] Error handling connection success:", error);
      
      toast({
        title: "Facebook Connection Failed",
        description: error.message || "Failed to update your profile with Facebook connection. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Check for Facebook OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const facebookParam = urlParams.get('facebook');
    
    if (facebookParam === 'connected') {
      handleFacebookConnected();
    }
  }, []);

  // Show loading state while checking connection
  if (isLoading) {
    const loadingContent = (
      <Button disabled className="w-full" size={variant === "inline" ? "default" : "lg"}>
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Checking connection...
      </Button>
    );

    if (variant === "inline") {
      return loadingContent;
    }

    return (
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardHeader>
          {showTitle && (
            <CardTitle className="flex items-center text-blue-700 dark:text-blue-300">
              <Facebook className="h-5 w-5 mr-2" />
              {title}
            </CardTitle>
          )}
        </CardHeader>
        <CardContent>
          {loadingContent}
        </CardContent>
      </Card>
    );
  }

  // Show connected state
  if (isConnected) {
    const connectedContent = (
      <Button disabled className="w-full" size={variant === "inline" ? "default" : "lg"}>
        <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
        Facebook Connected
      </Button>
    );

    if (variant === "inline") {
      return connectedContent;
    }

    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
        <CardHeader>
          {showTitle && (
            <CardTitle className="flex items-center text-green-700 dark:text-green-300">
              <CheckCircle className="h-5 w-5 mr-2" />
              Facebook Connected
            </CardTitle>
          )}
          <CardDescription className="text-green-600 dark:text-green-400">
            Your Facebook Business account is connected and ready to use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connectedContent}
        </CardContent>
      </Card>
    );
  }

  // Show connection button for non-connected state
  const buttonContent = (
    <Button 
      onClick={connectFacebook} 
      disabled={isConnecting || isSyncing}
      className="w-full"
      size={variant === "inline" ? "default" : "lg"}
    >
      {(isConnecting || isSyncing) && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
      {!isConnecting && !isSyncing && <Facebook className="mr-2 h-4 w-4" />}
      {isSyncing ? "Syncing Facebook Data..." : 
       isConnecting ? "Connecting..." : buttonText}
    </Button>
  );

  if (variant === "inline") {
    return buttonContent;
  }

  return (
    <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
      <CardHeader>
        {showTitle && (
          <CardTitle className="flex items-center text-blue-700 dark:text-blue-300">
            <Facebook className="h-5 w-5 mr-2" />
            {title}
          </CardTitle>
        )}
        {description && (
          <CardDescription className="text-blue-600 dark:text-blue-400">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {buttonContent}
      </CardContent>
    </Card>
  );
};
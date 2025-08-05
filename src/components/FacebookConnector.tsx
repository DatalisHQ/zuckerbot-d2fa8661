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
  const { toast } = useToast();

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
      // First sync Facebook ads data
      console.log("[FacebookConnector] Syncing Facebook ads data...");
      const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-facebook-ads');
      
      if (syncError) {
        console.error("[FacebookConnector] Sync error:", syncError);
        // Continue even if sync fails - user can still proceed
      } else {
        console.log("[FacebookConnector] Facebook ads synced successfully:", syncData);
      }
      
      toast({
        title: "Facebook Connected Successfully",
        description: "Your Facebook Business account is now connected and data has been synced.",
      });

      // Clean up URL without navigating away
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      
      if (onConnectionComplete) {
        onConnectionComplete();
      }
      
    } catch (error: any) {
      console.error("[FacebookConnector] Error handling connection success:", error);
      
      if (error.message?.includes('reconnect') || error.reconnectRequired) {
        toast({
          title: "Facebook Reconnection Required",
          description: error.message || "Please reconnect your Facebook account.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Facebook Connected with Issues",
          description: "Facebook connected successfully, but there was an issue syncing data. You can retry later.",
          variant: "destructive",
        });
      }
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
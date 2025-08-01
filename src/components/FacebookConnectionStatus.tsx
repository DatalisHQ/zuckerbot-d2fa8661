import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Facebook, AlertTriangle, RefreshCw, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useFacebookTokenValidator } from "@/hooks/useFacebookTokenValidator";

interface FacebookConnectionStatusProps {
  onConnectionChange?: (isConnected: boolean) => void;
}

export const FacebookConnectionStatus = ({ onConnectionChange }: FacebookConnectionStatusProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const { tokenStatus, checkAndRefreshIfNeeded, refreshToken } = useFacebookTokenValidator();

  useEffect(() => {
    onConnectionChange?.(tokenStatus.isValid);
  }, [tokenStatus.isValid, onConnectionChange]);

  const handleRefreshConnection = async () => {
    setIsRefreshing(true);
    try {
      const success = await refreshToken();
      if (success) {
        toast({
          title: "Refreshing Connection",
          description: "Redirecting to Facebook to refresh your connection...",
        });
      }
    } catch (error) {
      console.error('Error refreshing connection:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRevalidateToken = async () => {
    setIsRefreshing(true);
    try {
      const isValid = await checkAndRefreshIfNeeded();
      if (isValid) {
        toast({
          title: "Connection Verified",
          description: "Your Facebook connection is working properly.",
        });
      } else {
        toast({
          title: "Connection Issue",
          description: "Your Facebook connection still needs attention.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error revalidating token:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Loading state
  if (tokenStatus.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Checking Facebook connection...</span>
        </CardContent>
      </Card>
    );
  }

  // Valid connection
  if (tokenStatus.isValid) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center text-green-800">
            <CheckCircle className="h-5 w-5 mr-2" />
            Facebook Connected
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-green-700 text-sm">
            Your Facebook account is connected and working properly.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Connection issues
  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-orange-800">
          <AlertTriangle className="h-5 w-5 mr-2" />
          Facebook Connection Issue
        </CardTitle>
        <CardDescription className="text-orange-700">
          {tokenStatus.error || "Your Facebook connection needs attention"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-orange-300 bg-orange-100">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-orange-800">
            {tokenStatus.isExpired && "Your Facebook access token has expired."}
            {tokenStatus.needsRefresh && !tokenStatus.isExpired && "Your Facebook access token needs to be refreshed."}
            {!tokenStatus.needsRefresh && !tokenStatus.isExpired && "There's an issue with your Facebook connection."}
          </AlertDescription>
        </Alert>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button 
            onClick={handleRefreshConnection}
            disabled={isRefreshing}
            className="flex items-center"
          >
            {isRefreshing ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Facebook className="h-4 w-4 mr-2" />
            )}
            Reconnect Facebook
          </Button>
          
          <Button 
            variant="outline"
            onClick={handleRevalidateToken}
            disabled={isRefreshing}
            className="flex items-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Check Connection
          </Button>
        </div>

        <div className="text-sm text-orange-700 space-y-1">
          <p><strong>Why does this happen?</strong></p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Facebook access tokens expire periodically for security</li>
            <li>Reconnecting will get you a fresh, long-lasting token</li>
            <li>Your data is safe - this is a normal part of OAuth security</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
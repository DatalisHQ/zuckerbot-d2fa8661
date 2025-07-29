import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

// Centralized auth event logging for monitoring
export const logAuthEvent = (event: string, details?: any) => {
  console.info(`[AUTH EVENT] ${event}`, details);
  
  // In production, this could send to monitoring service
  // Example: analytics.track('auth_event', { event, details, timestamp: Date.now() });
};

// Enhanced logout with graceful session handling
export const performLogout = async (
  navigate?: (path: string) => void,
  showToast?: boolean,
  toast?: ReturnType<typeof useToast>['toast']
) => {
  try {
    logAuthEvent('logout_initiated');
    
    // Check if session exists before attempting logout
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      logAuthEvent('logout_session_check_failed', { error: sessionError.message });
      // Don't show error to user, just handle gracefully
    }
    
    if (!session) {
      logAuthEvent('logout_no_session_found', { 
        message: 'User attempted logout but no session exists' 
      });
      
      // Clear any remaining local state and redirect
      await clearUserState();
      if (navigate) navigate("/auth");
      return;
    }
    
    // Attempt to sign out
    const { error: signOutError } = await supabase.auth.signOut();
    
    if (signOutError) {
      logAuthEvent('logout_failed', { error: signOutError.message });
      
      // Even if logout fails, clear local state and redirect
      await clearUserState();
      if (navigate) navigate("/auth");
      
      // Only show error if specifically requested
      if (showToast && toast) {
        toast({
          title: "Sign Out Issue",
          description: "You've been signed out, but there was a minor issue. Please sign in again if needed.",
          variant: "default", // Not destructive - keep it friendly
        });
      }
      return;
    }
    
    logAuthEvent('logout_successful');
    
    // Clear any additional local state
    await clearUserState();
    
    if (navigate) navigate("/auth");
    
    if (showToast && toast) {
      toast({
        title: "Signed out successfully",
        description: "You have been logged out of your account.",
      });
    }
    
  } catch (error: any) {
    logAuthEvent('logout_unexpected_error', { error: error.message });
    
    // Always clear state and redirect even on unexpected errors
    await clearUserState();
    if (navigate) navigate("/auth");
    
    // Log error but don't show to user
    console.error("Logout error handled gracefully:", error);
  }
};

// Clear any lingering user state
const clearUserState = async () => {
  try {
    // Clear localStorage items that might persist
    const keysToRemove = Object.keys(localStorage).filter(key => 
      key.includes('supabase') || 
      key.includes('auth') || 
      key.includes('user') ||
      key.includes('session')
    );
    
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        // Silently handle localStorage errors
      }
    });
    
    logAuthEvent('user_state_cleared');
  } catch (error) {
    logAuthEvent('clear_state_error', { error });
  }
};

// Enhanced session validation with automatic cleanup
export const validateSession = async (): Promise<{
  session: any | null;
  user: any | null;
  isValid: boolean;
}> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      logAuthEvent('session_validation_error', { error: error.message });
      await clearUserState();
      return { session: null, user: null, isValid: false };
    }
    
    if (!session) {
      logAuthEvent('session_not_found');
      await clearUserState();
      return { session: null, user: null, isValid: false };
    }
    
    // Check if session is expired
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at;
    
    if (expiresAt && now >= expiresAt) {
      logAuthEvent('session_expired', { expiresAt, now });
      await clearUserState();
      return { session: null, user: null, isValid: false };
    }
    
    return { session, user: session.user, isValid: true };
    
  } catch (error: any) {
    logAuthEvent('session_validation_unexpected_error', { error: error.message });
    await clearUserState();
    return { session: null, user: null, isValid: false };
  }
};

// Hook for components to use enhanced auth state
export const useEnhancedAuth = () => {
  const toast = useToast();
  
  const logout = (navigate?: (path: string) => void, showToast: boolean = true) => {
    return performLogout(navigate, showToast, toast.toast);
  };
  
  return {
    logout,
    validateSession,
    logAuthEvent
  };
};
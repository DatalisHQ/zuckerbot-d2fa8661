import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  business_name: string | null;
  onboarding_completed: boolean;
  facebook_connected: boolean;
  facebook_access_token: string | null;
  facebook_business_id: string | null;
  selected_ad_account_id: string | null;
  facebook_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isInitialized: boolean;
}

interface AuthContextType extends AuthState {
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  connectFacebook: () => Promise<void>;
  checkOnboardingStatus: () => {
    hasCompletedOnboarding: boolean;
    hasFacebookConnected: boolean;
    hasSelectedAdAccount: boolean;
    needsRecovery: string | null;
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    isLoading: true,
    isInitialized: false,
  });
  
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Console logging helper
  const log = useCallback((message: string, data?: any) => {
    console.log(`[AuthProvider] ${message}`, data || '');
  }, []);

  // Create user profile if it doesn't exist
  const createUserProfile = useCallback(async (user: User): Promise<UserProfile | null> => {
    try {
      log(`Creating profile for user: ${user.id}`);
      
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        })
        .select()
        .single();

      if (createError) {
        log('Error creating profile:', createError);
        return null;
      }

      log('Profile created successfully:', newProfile);
      return newProfile;
    } catch (error) {
      log('Exception creating profile:', error);
      return null;
    }
  }, [log]);

  // Fetch user profile
  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    try {
      log(`Fetching profile for user: ${userId}`);
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        log('Error fetching profile:', error);
        return null;
      }

      if (!profile) {
        log('No profile found, will create one');
        return null;
      }

      log('Profile fetched successfully:', profile);
      return profile;
    } catch (error) {
      log('Exception fetching profile:', error);
      return null;
    }
  }, [log]);

  // Refresh profile data
  const refreshProfile = useCallback(async () => {
    if (!authState.user) {
      log('Cannot refresh profile - no user');
      return;
    }

    log('Refreshing profile data');
    const profile = await fetchProfile(authState.user.id);
    
    setAuthState(prev => ({
      ...prev,
      profile,
    }));
  }, [authState.user, fetchProfile, log]);

  // Handle Facebook OAuth callback
  const handleFacebookCallback = useCallback(async (session: Session) => {
    try {
      log('Processing Facebook OAuth callback');
      
      // Check if this is a Facebook OAuth callback
      const urlParams = new URLSearchParams(window.location.search);
      const facebookParam = urlParams.get('facebook');
      const returnTo = urlParams.get('return_to');

      if (facebookParam === 'connected') {
        log('Facebook OAuth callback detected');
        
        // Get the current access token from the session
        const facebookToken = session.provider_token;
        
        if (facebookToken) {
          log('Facebook token found, updating profile');
          
          // Update profile with Facebook connection
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              facebook_connected: true,
              facebook_access_token: facebookToken,
              facebook_token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days
            })
            .eq('user_id', session.user.id);

          if (updateError) {
            log('Error updating profile with Facebook token:', updateError);
            toast({
              title: "Facebook Connection Error",
              description: "Failed to save Facebook connection. Please try again.",
              variant: "destructive",
            });
          } else {
            log('Facebook connection saved successfully');
            
            // Dispatch custom event for other components
            window.dispatchEvent(new CustomEvent('facebook-connected', {
              detail: { success: true }
            }));
            
            toast({
              title: "Facebook Connected",
              description: "Your Facebook account has been connected successfully.",
            });

            // Clean up URL parameters
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
            
            // Refresh profile to get updated data
            await refreshProfile();
          }
        } else {
          log('No Facebook token found in session');
        }
      }
    } catch (error) {
      log('Error handling Facebook callback:', error);
    }
  }, [log, toast, refreshProfile]);

  // Check onboarding and redirect logic
  const checkAndRedirect = useCallback(async (user: User, profile: UserProfile | null) => {
    const currentPath = location.pathname;
    
    log(`Checking redirect logic for path: ${currentPath}`, {
      hasProfile: !!profile,
      onboarding: profile?.onboarding_completed,
      facebook: profile?.facebook_connected,
      adAccount: profile?.selected_ad_account_id
    });

    // Always allow access to auth page
    if (currentPath === '/auth') {
      log('On auth page, no redirect needed');
      return;
    }

    // If no profile, create one
    if (!profile) {
      log('No profile found, creating one');
      const newProfile = await createUserProfile(user);
      if (newProfile) {
        setAuthState(prev => ({ ...prev, profile: newProfile }));
        profile = newProfile;
      }
    }

    // Check prerequisites
    const hasCompletedOnboarding = profile?.onboarding_completed || false;
    const hasFacebookConnected = profile?.facebook_connected && profile?.facebook_access_token;
    const hasSelectedAdAccount = profile?.selected_ad_account_id;

    // Protected routes that require full onboarding
    const protectedRoutes = ['/dashboard', '/campaign-flow', '/zuckerbot'];
    const isProtectedRoute = protectedRoutes.some(route => currentPath.startsWith(route));

    if (isProtectedRoute && (!hasCompletedOnboarding || !hasFacebookConnected || !hasSelectedAdAccount)) {
      log('Protected route accessed without prerequisites, redirecting to onboarding', {
        route: currentPath,
        onboarding: hasCompletedOnboarding,
        facebook: hasFacebookConnected,
        adAccount: hasSelectedAdAccount
      });

      // Build recovery parameters
      const recoveryParams = new URLSearchParams();
      if (!hasFacebookConnected) recoveryParams.set('recovery', 'facebook');
      else if (!hasSelectedAdAccount) recoveryParams.set('recovery', 'ad_account');
      else recoveryParams.set('recovery', 'general');

      const targetUrl = `/onboarding?${recoveryParams.toString()}`;
      if (currentPath !== '/onboarding') {
        navigate(targetUrl);
      }
      return;
    }

    // If user is on onboarding but has completed everything, redirect to zuckerbot
    if (currentPath === '/onboarding' && hasCompletedOnboarding && hasFacebookConnected && hasSelectedAdAccount) {
      log('Onboarding complete, redirecting to zuckerbot');
      navigate('/zuckerbot');
      return;
    }

    log('No redirect needed');
  }, [location, log, createUserProfile, navigate]);

  // Handle auth state changes
  const handleAuthStateChange = useCallback(async (event: string, session: Session | null) => {
    log(`Auth state change: ${event}`, { hasSession: !!session });

    setAuthState(prev => ({
      ...prev,
      session,
      user: session?.user || null,
      isLoading: false,
    }));

    if (session?.user) {
      log(`User authenticated: ${session.user.id}`);
      
      // Handle Facebook OAuth callback if present
      await handleFacebookCallback(session);
      
      // Fetch or create profile
      let profile = await fetchProfile(session.user.id);
      
      if (!profile) {
        profile = await createUserProfile(session.user);
      }

      setAuthState(prev => ({
        ...prev,
        profile,
        isInitialized: true,
      }));

      // Check redirects after profile is loaded
      if (profile) {
        await checkAndRedirect(session.user, profile);
      }
    } else {
      log('User not authenticated, redirecting to auth');
      setAuthState(prev => ({
        ...prev,
        profile: null,
        isInitialized: true,
      }));

      // Redirect to auth page if not already there
      if (location.pathname !== '/auth') {
        navigate('/auth');
      }
    }
  }, [log, handleFacebookCallback, fetchProfile, createUserProfile, checkAndRedirect, location.pathname, navigate]);

  // Sign out function
  const signOut = useCallback(async () => {
    try {
      log('Signing out user');
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        log('Sign out error:', error);
        toast({
          title: "Sign Out Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        log('Sign out successful');
        navigate('/auth');
      }
    } catch (error) {
      log('Sign out exception:', error);
    }
  }, [log, toast, navigate]);

  // Connect Facebook function
  const connectFacebook = useCallback(async () => {
    try {
      log('Initiating Facebook connection');
      
      const currentPage = `${location.pathname}${location.search}`;
      const redirectUrl = `${window.location.origin}/onboarding?facebook=connected&return_to=${encodeURIComponent(currentPage)}`;
      
      log('Facebook redirect URL:', redirectUrl);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          scopes: 'ads_management,ads_read,business_management,pages_read_engagement',
          redirectTo: redirectUrl
        }
      });

      if (error) {
        log('Facebook OAuth error:', error);
        toast({
          title: "Facebook Connection Failed",
          description: error.message || "Could not connect to Facebook. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      log('Facebook connection exception:', error);
      toast({
        title: "Facebook Connection Error",
        description: "There was an error connecting to Facebook.",
        variant: "destructive",
      });
    }
  }, [location, log, toast]);

  // Check onboarding status function
  const checkOnboardingStatus = useCallback(() => {
    const hasCompletedOnboarding = authState.profile?.onboarding_completed || false;
    const hasFacebookConnected = !!(authState.profile?.facebook_connected && authState.profile?.facebook_access_token);
    const hasSelectedAdAccount = !!authState.profile?.selected_ad_account_id;

    let needsRecovery: string | null = null;
    if (!hasFacebookConnected) needsRecovery = 'facebook';
    else if (!hasSelectedAdAccount) needsRecovery = 'ad_account';
    else if (!hasCompletedOnboarding) needsRecovery = 'general';

    return {
      hasCompletedOnboarding,
      hasFacebookConnected,
      hasSelectedAdAccount,
      needsRecovery,
    };
  }, [authState.profile]);

  // Initialize auth listener
  useEffect(() => {
    log('Setting up auth state listener');

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      log('Initial session check', { hasSession: !!session });
      if (session) {
        handleAuthStateChange('INITIAL_SESSION', session);
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          isInitialized: true,
        }));
      }
    });

    return () => {
      log('Cleaning up auth state listener');
      subscription.unsubscribe();
    };
  }, [handleAuthStateChange, log]);

  const contextValue: AuthContextType = {
    ...authState,
    signOut,
    refreshProfile,
    connectFacebook,
    checkOnboardingStatus,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { metaTracking } from "@/lib/meta-tracking";
import { identifyUser, resetMixpanel, mpSignIn } from "@/lib/mixpanel";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import CampaignCreator from "./pages/CampaignCreator";
import LeadInbox from "./pages/LeadInbox";
import Profile from "./pages/Profile";
import Pricing from "./pages/Pricing";
import Billing from "./pages/Billing";
import BriefView from "./pages/BriefView";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import AdAudit from "./pages/AdAudit";
import AgentConsole from "./pages/AgentConsole";
import CampaignWorkspace from "./pages/CampaignWorkspace";
import AgencyDashboard from "./pages/AgencyDashboard";
import Docs from "./pages/Docs";
import Developer from "./pages/Developer";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('[App] Initializing auth state');
    
    // Initialize Meta Pixel tracking (no consent granted initially)
    metaTracking.init(false);
    console.log('🎯 Meta tracking initialized');
    
    // Set up auth state listener with Facebook token handling
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[App] Auth state change:', { 
          event, 
          hasSession: !!session, 
          userId: session?.user?.id,
          hasProviderToken: !!session?.provider_token,
          provider: session?.user?.app_metadata?.provider
        });
        
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        // Track auth events with Meta Pixel + Mixpanel
        if (event === 'SIGNED_IN' && session?.user) {
          // Grant consent for authenticated users and track registration
          metaTracking.grantConsent();
          metaTracking.trackCompleteRegistration(session.user.email);
          console.log('🎯 Tracked: CompleteRegistration');

          // Identify user in Mixpanel
          identifyUser(session.user.id, {
            email: session.user.email || undefined,
            name: session.user.user_metadata?.full_name || undefined,
            signup_method: session.user.app_metadata?.provider || 'email',
            created_at: session.user.created_at,
          });

          // Track sign-in event
          mpSignIn({
            user_id: session.user.id,
            login_method: session.user.app_metadata?.provider || 'email',
            success: true,
          });
        }

        // Reset Mixpanel on sign out
        if (event === 'SIGNED_OUT') {
          resetMixpanel();
        }

        // Handle Facebook OAuth token capture globally
        if (
          event === 'SIGNED_IN' && 
          session?.provider_token && 
          session?.user && 
          session.user.app_metadata?.provider === "facebook"
        ) {
          console.log('[App] Facebook OAuth detected - capturing token globally');
          
          // Update user profile with Facebook token immediately (no setTimeout)
          const handleFacebookTokenCapture = async () => {
            try {
              // Update user profile with Facebook token
              const { error: updateError } = await supabase
                .from('profiles')
                .update({
                  facebook_access_token: session.provider_token,
                  facebook_connected: true
                })
                .eq('user_id', session.user.id);

              if (updateError) {
                console.error('[App] Error storing Facebook token:', updateError);
                return;
              }

              console.log('[App] Facebook token stored successfully');

              // Always dispatch success event for any listening components
              window.dispatchEvent(new CustomEvent('facebook-connected', {
                detail: { success: true }
              }));
              
            } catch (error) {
              console.error('[App] Error in Facebook token handling:', error);
            }
          };

          // Execute immediately
          handleFacebookTokenCapture();
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[App] Error getting session:', error);
      } else {
        console.log('[App] Initial session check:', { hasSession: !!session, userId: session?.user?.id });
      }
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={!user ? <Auth /> : <Navigate to="/agency" />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/onboarding" element={user ? <Onboarding /> : <Navigate to="/auth" />} />
              <Route path="/dashboard" element={user ? <AgencyDashboard /> : <Navigate to="/auth" />} />
              <Route path="/campaign/new" element={user ? <CampaignCreator /> : <Navigate to="/auth" />} />
              <Route path="/leads" element={user ? <LeadInbox /> : <Navigate to="/auth" />} />
              <Route path="/profile" element={user ? <Profile /> : <Navigate to="/auth" />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/billing" element={user ? <Billing /> : <Navigate to="/auth" />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/workspace" element={user ? <CampaignWorkspace /> : <Navigate to="/auth?returnTo=/workspace" />} />
              <Route path="/agent-console" element={<Navigate to="/workspace" />} />
              <Route path="/brief/:briefId" element={<BriefView />} />
              <Route path="/admin/audit" element={user ? <AdAudit /> : <Navigate to="/auth" />} />
              <Route path="/agency" element={user ? <AgencyDashboard /> : <Navigate to="/auth" />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/developer" element={user ? <Developer /> : <Navigate to="/auth?returnTo=/developer" />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

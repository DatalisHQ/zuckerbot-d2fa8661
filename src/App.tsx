import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import ZuckerBot from "./pages/ZuckerBot";
import CampaignFlow from "./pages/CampaignFlow";
import Conversations from "./pages/Conversations";
import Files from "./pages/Files";
import Profile from "./pages/Profile";
import ConversationLayout from "./pages/ConversationLayout";
import AdPerformance from "./pages/AdPerformance";
// import { CompetitorFlow } from "./pages/CompetitorFlow";
import CompetitorAnalysis from "./pages/CompetitorAnalysis";
import StrategicInsights from "./pages/StrategicInsights";
import Pricing from "./pages/Pricing";
import Billing from "./pages/Billing";
import FAQ from "./pages/FAQ";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/AdminDashboard";

const queryClient = new QueryClient();

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('[App] Initializing auth state');
    
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

              // Always sync ads data after storing token (unless on onboarding)
              const currentPath = window.location.pathname;
              const isOnboarding = currentPath === '/onboarding';
              
              if (!isOnboarding) {
                console.log('[App] Syncing Facebook ads data');
                try {
                  await supabase.functions.invoke('sync-facebook-ads');
                  console.log('[App] Facebook ads data synced successfully');
                } catch (syncError) {
                  console.error('[App] Error syncing Facebook ads:', syncError);
                }
              }

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
            <Route path="/auth" element={!user ? <Auth /> : <Navigate to="/dashboard" />} />
            <Route path="/onboarding" element={user ? <Onboarding /> : <Navigate to="/auth" />} />
              <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/auth" />} />
              {/* Archive chat: route /zuckerbot to dashboard */}
              <Route path="/zuckerbot" element={<Navigate to="/dashboard" replace />} />
              <Route path="/admin" element={user ? <AdminDashboard /> : <Navigate to="/auth" />} />
              <Route path="/campaign-flow" element={user ? <CampaignFlow /> : <Navigate to="/auth" />} />
              <Route path="/conversations" element={user ? <ConversationLayout><Conversations /></ConversationLayout> : <Navigate to="/auth" />} />
              <Route path="/files" element={user ? <ConversationLayout><Files /></ConversationLayout> : <Navigate to="/auth" />} />
              <Route path="/profile" element={user ? <ConversationLayout><Profile /></ConversationLayout> : <Navigate to="/auth" />} />
            <Route path="/ad-performance" element={user ? <AdPerformance /> : <Navigate to="/auth" />} />
            <Route path="/competitor-analysis" element={user ? <CompetitorAnalysis /> : <Navigate to="/auth" />} />
            {/* Legacy redirect */}
            <Route path="/competitor-flow" element={<Navigate to="/competitor-analysis" replace />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/billing" element={user ? <Billing /> : <Navigate to="/auth" />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/strategic-insights" element={user ? <StrategicInsights /> : <Navigate to="/auth" />} />
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

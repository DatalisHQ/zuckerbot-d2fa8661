import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
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
import Pricing from "./pages/Pricing";
import FAQ from "./pages/FAQ";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={!user ? <Auth /> : <Navigate to="/zuckerbot" />} />
            <Route path="/onboarding" element={user ? <Onboarding /> : <Navigate to="/auth" />} />
              <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/auth" />} />
              <Route path="/zuckerbot" element={user ? <ZuckerBot /> : <Navigate to="/auth" />} />
              <Route path="/campaign-flow" element={user ? <CampaignFlow /> : <Navigate to="/auth" />} />
              <Route path="/conversations" element={user ? <ConversationLayout><Conversations /></ConversationLayout> : <Navigate to="/auth" />} />
              <Route path="/files" element={user ? <ConversationLayout><Files /></ConversationLayout> : <Navigate to="/auth" />} />
              <Route path="/profile" element={user ? <ConversationLayout><Profile /></ConversationLayout> : <Navigate to="/auth" />} />
            <Route path="/ad-performance" element={user ? <AdPerformance /> : <Navigate to="/auth" />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/faq" element={<FAQ />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

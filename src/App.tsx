import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import CompetitorAnalysis from "./pages/CompetitorAnalysis";
import StrategicInsights from "./pages/StrategicInsights";
import AdPerformance from "./pages/AdPerformance";
import Files from "./pages/Files";
import Billing from "./pages/Billing";
import Profile from "./pages/Profile";
import FAQ from "./pages/FAQ";
import Pricing from "./pages/Pricing";
import Conversations from "./pages/Conversations";
import ConversationLayout from "./pages/ConversationLayout";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import ZuckerBot from "./pages/ZuckerBot";
import CampaignFlow from "./pages/CampaignFlow";
import { CompetitorFlow } from "./pages/CompetitorFlow";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/competitor-analysis" element={<CompetitorAnalysis />} />
              <Route path="/strategic-insights" element={<StrategicInsights />} />
              <Route path="/ad-performance" element={<AdPerformance />} />
              <Route path="/files" element={<Files />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/conversations" element={<Conversations />} />
               <Route path="/conversations/:id" element={<ConversationLayout><div>Conversation Details</div></ConversationLayout>} />
               <Route path="/onboarding" element={<Onboarding />} />
               <Route path="/zuckerbot" element={<ZuckerBot />} />
               <Route path="/campaign-flow" element={<CampaignFlow />} />
               <Route path="/competitor-flow" element={<CompetitorFlow brandAnalysisId="" brandUrl="" onFlowComplete={() => {}} />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

import { Navbar } from "@/components/Navbar";
import { CompetitorAnalysisDashboard } from "@/components/CompetitorAnalysisDashboard";

export default function CompetitorAnalysis() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <CompetitorAnalysisDashboard />
      </main>
    </div>
  );
}
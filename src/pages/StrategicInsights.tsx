import { Navbar } from "@/components/Navbar";
import { StrategicDashboard } from "@/components/StrategicDashboard";

export default function StrategicInsights() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Strategic Insights</h1>
            <p className="text-muted-foreground">
              AI-powered strategic intelligence and market analysis
            </p>
          </div>
          <StrategicDashboard />
        </div>
      </main>
    </div>
  );
}
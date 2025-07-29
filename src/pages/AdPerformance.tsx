import { Navbar } from "@/components/Navbar";
import { FacebookAdsPerformance } from "@/components/FacebookAdsPerformance";
import { useOnboardingGuard } from "@/hooks/useOnboardingGuard";

export default function AdPerformance() {
  useOnboardingGuard();
  
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Ad Performance</h1>
            <p className="text-muted-foreground">
              Monitor and analyze your advertising campaigns across platforms
            </p>
          </div>
          <FacebookAdsPerformance />
        </div>
      </main>
    </div>
  );
}
import { CompetitorAnalysisDashboard } from "@/components/CompetitorAnalysisDashboard";
import { FacebookAdsPerformance } from "@/components/FacebookAdsPerformance";
import { StrategicDashboard } from "@/components/StrategicDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, BarChart3, TrendingUp } from "lucide-react";

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="competitor-analysis" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="competitor-analysis" className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              Competitor Analysis
            </TabsTrigger>
            <TabsTrigger value="ad-performance" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Ad Performance
            </TabsTrigger>
            <TabsTrigger value="strategic-insights" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Strategic Insights
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="competitor-analysis">
            <CompetitorAnalysisDashboard />
          </TabsContent>
          
          <TabsContent value="ad-performance">
            <FacebookAdsPerformance />
          </TabsContent>
          
          <TabsContent value="strategic-insights">
            <StrategicDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
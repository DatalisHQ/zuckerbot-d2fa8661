import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BrandAnalysisForm } from "@/components/BrandAnalysisForm";
import { 
  Target, 
  Zap, 
  BarChart3, 
  TrendingUp, 
  Eye, 
  Search,
  Plus,
  ArrowRight
} from "lucide-react";

export const CompetitorAnalysisDashboard = () => {
  const [quickAnalysisUrl, setQuickAnalysisUrl] = useState('');

  const handleQuickAnalysis = async () => {
    if (!quickAnalysisUrl.trim()) return;
    
    // This would trigger the brand analysis form with the URL
    console.log('Quick analysis for:', quickAnalysisUrl);
  };

  return (
    <div className="space-y-8">
      {/* Hero Section for Competitor Analysis */}
      <div className="text-center space-y-6">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold">
            <span className="gradient-text">Spy on Your Competition</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Analyze any competitor's website, discover their strategies, and uncover hidden opportunities in seconds.
          </p>
        </div>

        {/* Quick Analysis Input */}
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Enter competitor website URL (e.g., example.com)"
                value={quickAnalysisUrl}
                onChange={(e) => setQuickAnalysisUrl(e.target.value)}
                className="pl-10 h-12 text-lg"
                onKeyPress={(e) => e.key === 'Enter' && handleQuickAnalysis()}
              />
            </div>
            <Button 
              onClick={handleQuickAnalysis}
              size="lg" 
              className="btn-primary h-12 px-6"
              disabled={!quickAnalysisUrl.trim()}
            >
              <Target className="w-4 h-4 mr-2" />
              Analyze Now
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Get instant insights about competitors' products, pricing, and positioning
          </p>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="group hover:shadow-lg transition-all duration-300 cursor-pointer">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-2 glow-sm group-hover:glow-primary transition-all duration-300">
              <Target className="w-6 h-6 text-primary-foreground" />
            </div>
            <CardTitle>Competitor Analysis</CardTitle>
            <CardDescription>
              Deep dive into any competitor's website and strategy
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              New Analysis
            </Button>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-lg transition-all duration-300 cursor-pointer">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-2 glow-sm group-hover:glow-primary transition-all duration-300">
              <BarChart3 className="w-6 h-6 text-primary-foreground" />
            </div>
            <CardTitle>Ad Intelligence</CardTitle>
            <CardDescription>
              Monitor competitor Facebook ads and campaigns
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" className="w-full">
              <Eye className="w-4 h-4 mr-2" />
              View Ad Library
            </Button>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-lg transition-all duration-300 cursor-pointer">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-2 glow-sm group-hover:glow-primary transition-all duration-300">
              <TrendingUp className="w-6 h-6 text-primary-foreground" />
            </div>
            <CardTitle>Market Intelligence</CardTitle>
            <CardDescription>
              Discover trends and opportunities in your market
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" className="w-full">
              <Zap className="w-4 h-4 mr-2" />
              Generate Report
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Main Analysis Form */}
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Detailed Competitor Analysis
            </CardTitle>
            <CardDescription>
              Comprehensive analysis with competitor discovery, feature comparison, and strategic insights
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BrandAnalysisForm />
          </CardContent>
        </Card>
      </div>

      {/* Recent Analysis Section */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Analyses</CardTitle>
            <CardDescription>Your latest competitor intelligence reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h4 className="font-medium">Shopify Analysis</h4>
                  <p className="text-sm text-muted-foreground">E-commerce platform • 2 hours ago</p>
                </div>
                <Button variant="ghost" size="sm">
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h4 className="font-medium">HubSpot Deep Dive</h4>
                  <p className="text-sm text-muted-foreground">CRM software • 1 day ago</p>
                </div>
                <Button variant="ghost" size="sm">
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-center py-4">
                <Button variant="outline" className="w-full">
                  View All Analyses
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Market Insights</CardTitle>
            <CardDescription>AI-powered insights from your analyses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="p-3 border rounded-lg">
                <h4 className="font-medium text-sm">Pricing Opportunity</h4>
                <p className="text-sm text-muted-foreground">
                  Competitors are 23% higher than market average
                </p>
                <div className="mt-2">
                  <Button variant="outline" size="sm">Learn More</Button>
                </div>
              </div>
              <div className="p-3 border rounded-lg">
                <h4 className="font-medium text-sm">Feature Gap Identified</h4>
                <p className="text-sm text-muted-foreground">
                  Mobile app integration missing from top 3 competitors
                </p>
                <div className="mt-2">
                  <Button variant="outline" size="sm">Learn More</Button>
                </div>
              </div>
              <div className="text-center py-4">
                <Button variant="outline" className="w-full">
                  Generate New Insights
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const CompetitorAnalysisDashboard = () => {
  const [quickAnalysisUrl, setQuickAnalysisUrl] = useState('');
  const [lists, setLists] = useState<any[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [playbook, setPlaybook] = useState<any>(null);
  const [isLoadingPlaybook, setIsLoadingPlaybook] = useState(false);
  const { toast } = useToast();

  const handleQuickAnalysis = async () => {
    if (!quickAnalysisUrl.trim()) return;
    
    // This would trigger the brand analysis form with the URL
    console.log('Quick analysis for:', quickAnalysisUrl);
  };

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from('competitor_lists')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);
        if (error) throw error;
        setLists(data || []);
        if ((data || []).length > 0) setSelectedListId(data![0].id);
      } catch (e: any) {
        console.error('Failed to load competitor lists', e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!selectedListId) return;
      setIsLoadingPlaybook(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase.functions.invoke('competitor-playbook', {
          body: { competitorListId: selectedListId, userId: user.id }
        });
        if (error) throw error;
        setPlaybook(data?.playbook || null);
      } catch (e: any) {
        toast({ title: 'Failed to load playbook', description: e.message || 'Please try again', variant: 'destructive' });
      } finally {
        setIsLoadingPlaybook(false);
      }
    })();
  }, [selectedListId]);

  const exportPlaybookToPdf = async () => {
    if (!playbook) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Competitor Playbook</title></head><body>`);
    w.document.write(`<h2>Competitor Playbook</h2>`);
    w.document.write(`<h3>Top Hooks</h3><ul>${(playbook.top_hooks||[]).map((h: string) => `<li>${h}</li>`).join('')}</ul>`);
    w.document.write(`<h3>Top CTAs</h3><ul>${(playbook.top_ctas||[]).map((c: string) => `<li>${c}</li>`).join('')}</ul>`);
    w.document.write(`<h3>Visual Themes</h3><ul>${(playbook.visual_themes||[]).map((t: string) => `<li>${t}</li>`).join('')}</ul>`);
    if (Array.isArray(playbook.positioning_opportunities)) {
      w.document.write(`<h3>Positioning Opportunities</h3><ul>${playbook.positioning_opportunities.map((p: string) => `<li>${p}</li>`).join('')}</ul>`);
    }
    w.document.write(`</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
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

      {/* Competitor Playbook */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Competitor Playbook
          </CardTitle>
          <CardDescription>
            Key hooks, CTAs, themes, and fatigue flags from your competitor lists
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Select Competitor List</label>
              <select
                className="w-full border rounded h-10 px-2"
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id.slice(0, 8)} • {new Date(l.created_at).toLocaleString()} • {(l.competitors || []).length} competitors
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={exportPlaybookToPdf} disabled={!playbook || isLoadingPlaybook}>
                Export PDF
              </Button>
            </div>
          </div>

          {isLoadingPlaybook && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading playbook…</div>
          )}

          {playbook && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Top Hooks</h4>
                <div className="flex flex-wrap gap-1">
                  {(playbook.top_hooks || []).map((h: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{h}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium text-sm mb-2">Top CTAs</h4>
                <div className="flex flex-wrap gap-1">
                  {(playbook.top_ctas || []).map((c: string, i: number) => (
                    <Badge key={i} className="text-xs bg-primary text-primary-foreground">{c}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium text-sm mb-2">Visual Themes</h4>
                <div className="flex flex-wrap gap-1">
                  {(playbook.visual_themes || []).map((t: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {playbook?.creative_fatigue_flags?.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2 text-red-600">Creative Fatigue Flags</h4>
              <ul className="text-xs list-disc ml-5">
                {playbook.creative_fatigue_flags.slice(0,5).map((f: any, i: number) => (
                  <li key={i}>{f.ad_id}: {f.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {playbook?.positioning_opportunities?.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2">Positioning Opportunities</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {playbook.positioning_opportunities.map((p: string, i: number) => (
                  <li key={i} className="flex items-start gap-1"><span className="text-primary">•</span>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

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
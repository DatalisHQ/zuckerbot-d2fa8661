import { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Loader2, 
  TrendingUp, 
  AlertTriangle, 
  Target, 
  Lightbulb,
  BarChart3,
  Download,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  Users,
  Bell
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DashboardMetrics {
  totalBrands: number;
  totalInsights: number;
  unreadAlerts: number;
  activeMonitoring: number;
  reportsGenerated: number;
  criticalInsights: number;
}

interface StrategicInsight {
  id: string;
  insight_type: 'opportunity' | 'threat' | 'strength' | 'weakness' | 'recommendation';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact_score: number;
  effort_score: number;
  timeframe: string;
  category: string;
  action_items: string[];
  is_implemented: boolean;
}

interface CompetitiveReport {
  id: string;
  report_name: string;
  report_type: string;
  status: string;
  created_at: string;
  executive_summary: string;
  competitor_count: number;
  key_findings: string[];
}

interface RecentActivity {
  type: 'alert' | 'insight';
  title: string;
  timestamp: string;
  severity?: string;
  priority?: string;
}

export const StrategicDashboard = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalBrands: 0,
    totalInsights: 0,
    unreadAlerts: 0,
    activeMonitoring: 0,
    reportsGenerated: 0,
    criticalInsights: 0
  });
  const [insights, setInsights] = useState<StrategicInsight[]>([]);
  const [reports, setReports] = useState<CompetitiveReport[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [generatingInsights, setGeneratingInsights] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('strategic-dashboard', {
        body: {
          action: 'get_dashboard_data',
          userId: user.id
        }
      });

      if (error) throw error;

      if (data.success) {
        setMetrics(data.data.metrics);
        setInsights(data.data.insights);
        setReports(data.data.reports || []);
        setRecentActivity(data.data.recentActivity);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast({
        title: "Error Loading Dashboard",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateInsights = async () => {
    setGeneratingInsights(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get the most recent brand analysis
      const { data: brandAnalyses } = await supabase
        .from('brand_analysis')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!brandAnalyses || brandAnalyses.length === 0) {
        toast({
          title: "No Brand Analysis Found",
          description: "Please complete a brand analysis first",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('strategic-dashboard', {
        body: {
          action: 'generate_insights',
          userId: user.id,
          brandAnalysisId: brandAnalyses[0].id
        }
      });

      if (error) throw error;

      if (data.success) {
        setInsights(data.insights);
        toast({
          title: "Insights Generated",
          description: `Generated ${data.total} strategic insights`,
        });
      }
    } catch (error) {
      console.error('Error generating insights:', error);
      toast({
        title: "Error Generating Insights",
        description: "Failed to generate strategic insights",
        variant: "destructive",
      });
    } finally {
      setGeneratingInsights(false);
    }
  };

  const createReport = async (reportType: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get the most recent brand analysis
      const { data: brandAnalyses } = await supabase
        .from('brand_analysis')
        .select('id, brand_name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!brandAnalyses || brandAnalyses.length === 0) {
        toast({
          title: "No Brand Analysis Found",
          description: "Please complete a brand analysis first",
          variant: "destructive",
        });
        return;
      }

      const brandName = brandAnalyses[0].brand_name || 'Brand';
      const reportName = `${reportType.replace('_', ' ').toUpperCase()} - ${brandName} - ${new Date().toLocaleDateString()}`;

      const { data, error } = await supabase.functions.invoke('strategic-dashboard', {
        body: {
          action: 'create_report',
          userId: user.id,
          reportName,
          reportType,
          brandAnalysisId: brandAnalyses[0].id
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Report Generated",
          description: `${reportName} has been created successfully`,
        });
        loadDashboardData(); // Refresh data
      }
    } catch (error) {
      console.error('Error creating report:', error);
      toast({
        title: "Error Creating Report",
        description: "Failed to generate report",
        variant: "destructive",
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'opportunity': return Target;
      case 'threat': return AlertTriangle;
      case 'strength': return CheckCircle2;
      case 'weakness': return XCircle;
      case 'recommendation': return Lightbulb;
      default: return Activity;
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Strategic Dashboard</h1>
          <p className="text-muted-foreground">Comprehensive competitive intelligence and strategic insights</p>
        </div>
        <Button onClick={loadDashboardData} variant="outline" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
        </Button>
      </div>

      {/* Metrics Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Brands Analyzed</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalBrands}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Strategic Insights</CardTitle>
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalInsights}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unread Alerts</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{metrics.unreadAlerts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Monitoring</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metrics.activeMonitoring}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reports Generated</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.reportsGenerated}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Insights</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metrics.criticalInsights}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="insights" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="insights">Strategic Insights</TabsTrigger>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Strategic Insights</CardTitle>
                  <CardDescription>AI-powered recommendations and opportunities</CardDescription>
                </div>
                <Button onClick={generateInsights} disabled={generatingInsights}>
                  {generatingInsights ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Lightbulb className="h-4 w-4 mr-2" />
                      Generate Insights
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {insights.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No strategic insights yet</p>
                  <p className="text-sm">Generate insights to see recommendations</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {insights.map((insight) => {
                    const InsightIcon = getInsightIcon(insight.insight_type);
                    
                    return (
                      <div key={insight.id} className="border rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-full ${getPriorityColor(insight.priority)} text-white`}>
                            <InsightIcon className="h-4 w-4" />
                          </div>
                          
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{insight.title}</h4>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={getPriorityColor(insight.priority) + ' text-white border-0'}>
                                  {insight.priority}
                                </Badge>
                                <Badge variant="secondary">
                                  {insight.timeframe.replace('_', ' ')}
                                </Badge>
                              </div>
                            </div>
                            
                            <p className="text-sm text-muted-foreground">
                              {insight.description}
                            </p>
                            
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Impact: {insight.impact_score}/10</span>
                              <span>Effort: {insight.effort_score}/10</span>
                              <span className="capitalize">{insight.category}</span>
                            </div>

                            {insight.action_items && insight.action_items.length > 0 && (
                              <div className="mt-3">
                                <h5 className="text-sm font-medium mb-2">Action Items:</h5>
                                <ul className="text-sm text-muted-foreground space-y-1">
                                  {insight.action_items.map((item, index) => (
                                    <li key={index} className="flex items-center gap-2">
                                      <div className="w-1 h-1 bg-muted-foreground rounded-full" />
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest alerts and insights</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No recent activity</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className={`p-2 rounded-full ${
                        activity.type === 'alert' 
                          ? 'bg-orange-500 text-white' 
                          : 'bg-blue-500 text-white'
                      }`}>
                        {activity.type === 'alert' ? (
                          <Bell className="h-3 w-3" />
                        ) : (
                          <Lightbulb className="h-3 w-3" />
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <p className="font-medium text-sm">{activity.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {new Date(activity.timestamp).toLocaleString()}
                        </p>
                      </div>

                      {activity.severity && (
                        <Badge variant="outline" className="text-xs">
                          {activity.severity}
                        </Badge>
                      )}
                      {activity.priority && (
                        <Badge variant="outline" className="text-xs">
                          {activity.priority}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Competitive Reports</CardTitle>
              <CardDescription>View and generate competitive analysis reports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Generate New Reports */}
              <div>
                <h4 className="font-medium mb-3">Generate New Report</h4>
                <div className="grid gap-3 md:grid-cols-3">
                  <Button 
                    onClick={() => createReport('competitive_analysis')} 
                    variant="outline"
                    className="p-4 h-auto flex flex-col items-start gap-2"
                  >
                    <Users className="h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">Competitive Analysis</div>
                      <div className="text-xs text-muted-foreground">
                        Detailed competitor comparison
                      </div>
                    </div>
                  </Button>

                  <Button 
                    onClick={() => createReport('market_position')} 
                    variant="outline"
                    className="p-4 h-auto flex flex-col items-start gap-2"
                  >
                    <TrendingUp className="h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">Market Position</div>
                      <div className="text-xs text-muted-foreground">
                        Market positioning analysis
                      </div>
                    </div>
                  </Button>

                  <Button 
                    onClick={() => createReport('strategic_overview')} 
                    variant="outline"
                    className="p-4 h-auto flex flex-col items-start gap-2"
                  >
                    <BarChart3 className="h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">Strategic Overview</div>
                      <div className="text-xs text-muted-foreground">
                        Comprehensive analysis
                      </div>
                    </div>
                  </Button>
                </div>
              </div>

              {/* Existing Reports */}
              <div>
                <h4 className="font-medium mb-3">Generated Reports</h4>
                {reports.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    <Download className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No reports generated yet</p>
                    <p className="text-sm">Generate your first competitive analysis report above</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reports.map((report) => (
                      <div key={report.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h5 className="font-medium">{report.report_name}</h5>
                              <Badge variant="outline" className="text-xs">
                                {report.report_type.replace('_', ' ')}
                              </Badge>
                            </div>
                            
                            <p className="text-sm text-muted-foreground">
                              {report.executive_summary}
                            </p>
                            
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Created: {new Date(report.created_at).toLocaleDateString()}</span>
                              <span>Competitors: {report.competitor_count}</span>
                              <span>Findings: {report.key_findings?.length || 0}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Badge variant={report.status === 'completed' ? 'default' : 'secondary'}>
                              {report.status}
                            </Badge>
                            <Button size="sm" variant="ghost">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Analytics</CardTitle>
              <CardDescription>Track your competitive intelligence performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Competitive Intelligence Score</span>
                    <span className="text-sm text-muted-foreground">75/100</span>
                  </div>
                  <Progress value={75} className="h-2" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Market Coverage</span>
                    <span className="text-sm text-muted-foreground">60%</span>
                  </div>
                  <Progress value={60} className="h-2" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Insights Implementation</span>
                    <span className="text-sm text-muted-foreground">40%</span>
                  </div>
                  <Progress value={40} className="h-2" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Monitoring Effectiveness</span>
                    <span className="text-sm text-muted-foreground">85%</span>
                  </div>
                  <Progress value={85} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
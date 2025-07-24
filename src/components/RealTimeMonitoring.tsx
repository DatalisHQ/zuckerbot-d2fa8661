import { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Bell, Eye, Clock, AlertTriangle, CheckCircle2, Globe, DollarSign, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MonitoringAlert {
  id: string;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  is_read: boolean;
  created_at: string;
  monitoring_config: {
    competitor_name: string;
    competitor_url: string;
  };
}

interface MonitoringSetupProps {
  competitorName: string;
  competitorUrl: string;
  onMonitoringCreated?: () => void;
}

export const RealTimeMonitoring = ({ 
  competitorName, 
  competitorUrl, 
  onMonitoringCreated 
}: MonitoringSetupProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [monitoringType, setMonitoringType] = useState('all');
  const [checkFrequency, setCheckFrequency] = useState(24);
  const [isMonitoringActive, setIsMonitoringActive] = useState(false);

  useEffect(() => {
    loadAlerts();
    
    // Set up real-time subscription for new alerts
    const channel = supabase
      .channel('monitoring-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'monitoring_alerts'
        },
        (payload) => {
          console.log('New alert received:', payload);
          loadAlerts(); // Reload alerts when new one is inserted
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadAlerts = async () => {
    setLoadingAlerts(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('realtime-monitoring', {
        body: {
          action: 'get_alerts',
          userId: user.id,
          limit: 20
        }
      });

      if (error) throw error;

      if (data.success) {
        setAlerts(data.alerts);
      }
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoadingAlerts(false);
    }
  };

  const handleSetupMonitoring = async () => {
    setIsLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to set up monitoring",
          variant: "destructive",
        });
        return;
      }

      console.log('Setting up monitoring for:', competitorName);
      
      const { data, error } = await supabase.functions.invoke('realtime-monitoring', {
        body: {
          action: 'create_monitoring',
          userId: user.id,
          competitorName,
          competitorUrl,
          monitoringType,
          checkFrequency
        }
      });

      if (error) {
        console.error('Error setting up monitoring:', error);
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to setup monitoring');
      }

      setIsMonitoringActive(true);
      onMonitoringCreated?.();
      
      toast({
        title: "Monitoring Setup Complete",
        description: `Now monitoring ${competitorName} for changes every ${checkFrequency} hours`,
      });

    } catch (error) {
      console.error('Error setting up monitoring:', error);
      toast({
        title: "Setup Failed",
        description: error instanceof Error ? error.message : "Failed to setup monitoring",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsRead = async (alertId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.functions.invoke('realtime-monitoring', {
        body: {
          action: 'mark_alert_read',
          alertId,
          userId: user.id
        }
      });

      // Update local state
      setAlerts(alerts.map(alert => 
        alert.id === alertId ? { ...alert, is_read: true } : alert
      ));

    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getAlertIcon = (alertType: string) => {
    switch (alertType) {
      case 'content_change': return FileText;
      case 'pricing_change': return DollarSign;
      case 'website_change': return Globe;
      default: return AlertTriangle;
    }
  };

  const unreadAlerts = alerts.filter(alert => !alert.is_read);

  return (
    <div className="w-full space-y-6">
      <Tabs defaultValue="setup" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="setup">Monitoring Setup</TabsTrigger>
          <TabsTrigger value="alerts" className="relative">
            Alerts
            {unreadAlerts.length > 0 && (
              <Badge 
                variant="destructive" 
                className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center"
              >
                {unreadAlerts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Real-time Monitoring: {competitorName}
              </CardTitle>
              <CardDescription>
                Get notified when competitors make changes to their website, pricing, or content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Monitoring Type</label>
                  <Select value={monitoringType} onValueChange={setMonitoringType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Changes</SelectItem>
                      <SelectItem value="website">Website Changes</SelectItem>
                      <SelectItem value="pricing">Pricing Changes</SelectItem>
                      <SelectItem value="content">Content Changes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Check Frequency</label>
                  <Select value={checkFrequency.toString()} onValueChange={(value) => setCheckFrequency(Number(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Every Hour</SelectItem>
                      <SelectItem value="6">Every 6 Hours</SelectItem>
                      <SelectItem value="12">Every 12 Hours</SelectItem>
                      <SelectItem value="24">Daily</SelectItem>
                      <SelectItem value="168">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Monitoring Status</p>
                    <p className="text-sm text-muted-foreground">
                      {isMonitoringActive ? 'Active monitoring enabled' : 'Not monitoring yet'}
                    </p>
                  </div>
                  <Switch 
                    checked={isMonitoringActive} 
                    disabled={!isMonitoringActive}
                  />
                </div>
              </div>

              <Button 
                onClick={handleSetupMonitoring} 
                disabled={isLoading || isMonitoringActive}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Setting up monitoring...
                  </>
                ) : isMonitoringActive ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Monitoring Active
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4 mr-2" />
                    Start Monitoring
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Recent Alerts
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadAlerts}
                  disabled={loadingAlerts}
                >
                  {loadingAlerts ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Refresh'
                  )}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingAlerts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No alerts yet</p>
                  <p className="text-sm">Set up monitoring to start receiving alerts</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => {
                    const AlertIcon = getAlertIcon(alert.alert_type);
                    
                    return (
                      <div
                        key={alert.id}
                        className={`p-4 border rounded-lg ${
                          alert.is_read ? 'bg-muted/30' : 'bg-background'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-full ${getSeverityColor(alert.severity)} text-white`}>
                            <AlertIcon className="h-4 w-4" />
                          </div>
                          
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{alert.title}</h4>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={getSeverityColor(alert.severity) + ' text-white border-0'}>
                                  {alert.severity}
                                </Badge>
                                {!alert.is_read && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleMarkAsRead(alert.id)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            
                            <p className="text-sm text-muted-foreground">
                              {alert.description}
                            </p>
                            
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{alert.monitoring_config?.competitor_name}</span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(alert.created_at).toLocaleDateString()}
                              </span>
                            </div>
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
      </Tabs>
    </div>
  );
};
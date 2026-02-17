import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface PreviewLog {
  id: string;
  url: string | null;
  business_name: string | null;
  created_at: string;
  success: boolean;
  has_images: boolean;
  image_count: number;
  ip_address: string | null;
  saved_image_urls?: string[];
  generated_ads?: any;
}

export default function AdAudit() {
  const [logs, setLogs] = useState<PreviewLog[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    loadLogs();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.email !== "davisgrainger@gmail.com") {
      navigate("/auth");
      return;
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("preview_logs")
        .select("*")
        .eq("success", true)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error loading logs:", error);
        return;
      }

      setLogs(data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Ad Generation Audit</h1>
            <p className="text-muted-foreground">
              Review generated ads to debug conversion issues
            </p>
          </div>
          <Button onClick={loadLogs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{logs.length}</div>
              <p className="text-xs text-muted-foreground">Total Tests</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {logs.filter(l => new Date(l.created_at) > new Date(Date.now() - 24*60*60*1000)).length}
              </div>
              <p className="text-xs text-muted-foreground">Last 24h</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {logs.filter(l => l.has_images).length}
              </div>
              <p className="text-xs text-muted-foreground">With Images</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading ad tests...</div>
      ) : (
        <div className="space-y-4">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No Try It Now tests found
            </div>
          ) : (
            logs.map((log) => (
              <Card key={log.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{log.business_name || "Unknown Business"}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {formatDate(log.created_at)}
                    </span>
                  </CardTitle>
                  {log.url && (
                    <p className="text-sm text-muted-foreground">{log.url}</p>
                  )}
                </CardHeader>
                
                <CardContent>
                  {/* Display saved images if available */}
                  {log.saved_image_urls && log.saved_image_urls.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                      {log.saved_image_urls.map((url: string, i: number) => (
                        <div key={i} className="aspect-square bg-muted rounded-lg overflow-hidden">
                          <img 
                            src={url} 
                            alt={`Generated ad ${i + 1}`}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => window.open(url, '_blank')}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Display generated ads if available */}
                  {log.generated_ads && Array.isArray(log.generated_ads) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {log.generated_ads.map((ad: any, i: number) => (
                        <div key={i} className="border rounded-lg p-3 bg-muted/30">
                          <div className="font-medium text-sm mb-1">
                            {ad.headline || `Ad ${i + 1} Headline`}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {ad.copy || `Ad ${i + 1} copy text`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Fallback if no ads/images stored */}
                  {!log.generated_ads && !log.saved_image_urls && (
                    <div className="text-sm text-muted-foreground italic">
                      Ad details not stored (generated before audit system)
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

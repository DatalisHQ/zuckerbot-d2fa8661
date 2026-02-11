import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/Navbar";
import {
  Loader2,
  Inbox,
  Phone,
  Mail,
  MapPin,
  MessageSquare,
  Rocket,
} from "lucide-react";

// ─── Local Interfaces ──────────────────────────────────────────────────────

interface Lead {
  id: string;
  campaign_id: string;
  business_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  suburb: string | null;
  status: string;
  sms_sent: boolean;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800",
  contacted:
    "bg-yellow-500/10 text-yellow-700 border-yellow-200 dark:text-yellow-400 dark:border-yellow-800",
  won: "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800",
  lost: "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800",
};

// ─── Component ──────────────────────────────────────────────────────────────

const LeadInbox = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeads = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/auth");
        return;
      }

      // Get the user's business first
      const { data: biz } = await supabase
        .from("businesses" as any)
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!biz) {
        setIsLoading(false);
        return;
      }

      const businessId = (biz as any).id;

      const { data, error } = await supabase
        .from("leads" as any)
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching leads:", error);
      }

      setLeads((data as unknown as Lead[]) || []);
      setIsLoading(false);
    };

    fetchLeads();
  }, [navigate]);

  const updateLeadStatus = async (leadId: string, newStatus: string) => {
    setUpdatingId(leadId);
    try {
      const { error } = await supabase
        .from("leads" as any)
        .update({ status: newStatus } as any)
        .eq("id", leadId);

      if (error) throw error;

      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );

      // Fire Conversion API feedback — tell Meta about lead quality
      // "won" or "contacted" = good signal, "lost" = bad signal
      if (["won", "contacted", "lost"].includes(newStatus)) {
        const quality = newStatus === "lost" ? "bad" : "good";
        supabase.functions
          .invoke("sync-conversions", {
            body: { lead_id: leadId, quality },
          })
          .then(({ error: capiError }) => {
            if (capiError) {
              console.warn("[LeadInbox] CAPI sync failed:", capiError);
            } else {
              console.log(`[LeadInbox] CAPI: sent ${quality} signal for lead ${leadId}`);
            }
          });
      }

      toast({
        title: "Lead updated",
        description: `Marked as ${newStatus}.`,
      });
    } catch (err: any) {
      toast({
        title: "Error updating lead",
        description: err.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredLeads =
    activeTab === "all" ? leads : leads.filter((l) => l.status === activeTab);

  const tabCounts = {
    all: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    won: leads.filter((l) => l.status === "won").length,
    lost: leads.filter((l) => l.status === "lost").length,
  };

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Your Leads</h1>
            <Badge variant="secondary" className="text-sm">
              {leads.length}
            </Badge>
          </div>

          {/* Filter Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full sm:w-auto">
              {(["all", "new", "contacted", "won", "lost"] as const).map(
                (tab) => (
                  <TabsTrigger key={tab} value={tab} className="capitalize">
                    {tab}
                    {tabCounts[tab] > 0 && (
                      <span className="ml-1.5 text-xs opacity-60">
                        ({tabCounts[tab]})
                      </span>
                    )}
                  </TabsTrigger>
                )
              )}
            </TabsList>

            {/* Lead List (shared across all tabs) */}
            {(["all", "new", "contacted", "won", "lost"] as const).map(
              (tab) => (
                <TabsContent key={tab} value={tab}>
                  {isLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredLeads.length === 0 ? (
                    /* Empty State */
                    <Card className="text-center py-16">
                      <CardContent className="space-y-4">
                        <Inbox className="h-12 w-12 text-muted-foreground mx-auto" />
                        <div>
                          <h3 className="text-lg font-semibold">No leads yet</h3>
                          <p className="text-muted-foreground text-sm mt-1">
                            Launch a campaign to start getting customers!
                          </p>
                        </div>
                        <Button onClick={() => navigate("/campaign/new")}>
                          <Rocket className="h-4 w-4 mr-2" />
                          Create Campaign
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {filteredLeads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          isUpdating={updatingId === lead.id}
                          onUpdateStatus={updateLeadStatus}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
              )
            )}
          </Tabs>
        </div>
      </main>
    </div>
  );
};

// ─── Lead Card Sub-Component ────────────────────────────────────────────────

function LeadCard({
  lead,
  isUpdating,
  onUpdateStatus,
}: {
  lead: Lead;
  isUpdating: boolean;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Lead Info */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{lead.name || "Unknown"}</h3>
              <Badge
                variant="outline"
                className={STATUS_COLORS[lead.status] || ""}
              >
                {lead.status}
              </Badge>
              {lead.sms_sent && (
                <Badge variant="outline" className="text-xs gap-1">
                  <MessageSquare className="h-3 w-3" />
                  SMS sent
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {lead.phone}
                </a>
              )}
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {lead.email}
                </a>
              )}
              {lead.suburb && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {lead.suburb}
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {relativeTime(lead.created_at)}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            {lead.status !== "contacted" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isUpdating}
                onClick={() => onUpdateStatus(lead.id, "contacted")}
              >
                Contacted
              </Button>
            )}
            {lead.status !== "won" && (
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                disabled={isUpdating}
                onClick={() => onUpdateStatus(lead.id, "won")}
              >
                Won
              </Button>
            )}
            {lead.status !== "lost" && (
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                disabled={isUpdating}
                onClick={() => onUpdateStatus(lead.id, "lost")}
              >
                Lost
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default LeadInbox;

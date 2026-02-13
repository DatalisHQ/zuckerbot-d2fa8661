import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Mail,
  Building,
  MapPin,
  Phone,
  Calendar,
  Edit,
  Save,
  X,
  Facebook,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import MediaManager from "@/components/MediaManager";

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface ProfileData {
  user_id: string;
  email: string | null;
  full_name: string | null;
  business_name: string | null;
  onboarding_completed: boolean;
  facebook_connected: boolean;
  created_at: string;
}

interface Business {
  id: string;
  name: string;
  trade: string;
  suburb: string;
  postcode: string;
  state: string;
  phone: string;
  facebook_page_id: string | null;
  facebook_ad_account_id: string | null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Profile() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({ full_name: "", phone: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchData();

    // Check for Facebook OAuth callback results in URL params
    const params = new URLSearchParams(window.location.search);
    const fbError = params.get("fb_error");
    const fbConnected = params.get("fb_connected");
    const fbDetail = params.get("detail");

    if (fbError) {
      toast({
        title: "Facebook connection failed",
        description: `Error: ${fbError}${fbDetail ? ` — ${fbDetail}` : ""}`,
        variant: "destructive",
      });
      // Clean URL
      window.history.replaceState({}, "", "/profile");
    } else if (fbConnected === "true") {
      toast({
        title: "Facebook connected! ✅",
        description: "Your Facebook account has been linked successfully.",
      });
      window.history.replaceState({}, "", "/profile");
    }
  }, []);

  const fetchData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      setCurrentUser(user);

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData as unknown as ProfileData);
        setFormData({
          full_name: profileData.full_name || "",
          phone: "",
        });
      }

      // Fetch business
      const { data: bizData } = await supabase
        .from("businesses" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (bizData) {
        const biz = bizData as unknown as Business;
        setBusiness(biz);
        setFormData((prev) => ({ ...prev, phone: biz.phone || "" }));
      }
    } catch (error: any) {
      toast({
        title: "Error loading profile",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setIsSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update profile name
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: formData.full_name })
        .eq("user_id", user.id);

      if (profileError) throw profileError;

      // Update business phone if business exists
      if (business) {
        const { error: bizError } = await supabase
          .from("businesses" as any)
          .update({ phone: formData.phone } as any)
          .eq("user_id", user.id);

        if (bizError) throw bizError;
        setBusiness((prev) => (prev ? { ...prev, phone: formData.phone } : null));
      }

      setProfile((prev) =>
        prev ? { ...prev, full_name: formData.full_name } : null
      );
      setEditMode(false);

      toast({ title: "Profile updated" });
    } catch (error: any) {
      toast({
        title: "Error saving",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectFacebook = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Not authenticated",
          description: "Please sign in first.",
          variant: "destructive",
        });
        return;
      }

      const META_APP_ID = "1119807469249263";
      const REDIRECT_URI = encodeURIComponent(
        "https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/facebook-oauth-callback"
      );
      const SCOPES = encodeURIComponent(
        "pages_manage_ads,ads_management,leads_retrieval,pages_read_engagement"
      );
      // Encode user token in state so the callback can identify them
      const STATE = encodeURIComponent(session.access_token);

      const oauthUrl =
        `https://www.facebook.com/v21.0/dialog/oauth?` +
        `client_id=${META_APP_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&scope=${SCOPES}` +
        `&state=${STATE}` +
        `&response_type=code` +
        `&auth_type=rerequest`;

      window.location.href = oauthUrl;
    } catch (error: any) {
      toast({
        title: "Error connecting Facebook",
        description: error.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  // ── Loading / empty states ────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Settings</h1>
              <p className="text-muted-foreground">
                Manage your account, business details, and media files
              </p>
            </div>
            {!editMode && (
              <Button variant="outline" onClick={() => setEditMode(true)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
          </div>

          <Tabs defaultValue="account" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 max-w-md">
              <TabsTrigger value="account" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Account
              </TabsTrigger>
              <TabsTrigger value="media" className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Media
              </TabsTrigger>
              <TabsTrigger value="billing" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Billing
              </TabsTrigger>
            </TabsList>

            <TabsContent value="account" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Account info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Account
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      {editMode ? (
                        <Input
                          value={formData.full_name}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              full_name: e.target.value,
                            }))
                          }
                          placeholder="Your name"
                        />
                      ) : (
                        <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                          {profile?.full_name || "Not set"}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <div className="h-10 px-3 py-2 border rounded-md bg-muted/30 flex items-center text-sm text-muted-foreground">
                        <Mail className="w-4 h-4 mr-2 shrink-0" />
                        {profile?.email || "—"}
                      </div>
                    </div>
                  </div>

                  {editMode && (
                    <div className="flex gap-2 pt-2">
                      <Button onClick={handleSave} disabled={isSaving} size="sm">
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditMode(false);
                          setFormData({
                            full_name: profile?.full_name || "",
                            phone: business?.phone || "",
                          });
                        }}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Business details */}
              {business && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="w-5 h-5" />
                      Business
                    </CardTitle>
                    <CardDescription>
                      Details from your onboarding setup
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Business Name
                        </p>
                        <p className="text-sm font-medium">{business.name}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Trade
                        </p>
                        <p className="text-sm font-medium capitalize">
                          {business.trade}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Location
                        </p>
                        <p className="text-sm font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {business.suburb}, {business.state} {business.postcode}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Phone
                        </p>
                        {editMode ? (
                          <Input
                            value={formData.phone}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                phone: e.target.value,
                              }))
                            }
                            placeholder="04xx xxx xxx"
                          />
                        ) : (
                          <p className="text-sm font-medium flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {business.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Facebook connection */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Facebook className="w-5 h-5" />
                    Facebook
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Status</span>
                    <Badge
                      variant={
                        !!business?.facebook_page_id ? "default" : "secondary"
                      }
                    >
                      {!!business?.facebook_page_id
                        ? "Connected"
                        : "Not Connected"}
                    </Badge>
                  </div>

                  {!business?.facebook_page_id && (
                    <>
                      <Separator />
                      <p className="text-xs text-muted-foreground">
                        Connect your Facebook Business account to launch ad
                        campaigns and receive leads.
                      </p>
                      <Button
                        className="w-full"
                        onClick={handleConnectFacebook}
                      >
                        <Facebook className="w-4 h-4 mr-2" />
                        Connect Facebook
                      </Button>
                    </>
                  )}

                  {!!business?.facebook_page_id && (
                    <>
                      <Separator />
                      {business?.facebook_ad_account_id && (
                        <div className="text-xs text-muted-foreground">
                          Ad Account: {business.facebook_ad_account_id}
                        </div>
                      )}
                      <Button
                        className="w-full"
                        variant="outline"
                        size="sm"
                        onClick={handleConnectFacebook}
                      >
                        <Facebook className="w-4 h-4 mr-2" />
                        Reconnect Facebook
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Subscription */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Subscription</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Plan</span>
                    <Badge variant="secondary">Free Trial</Badge>
                  </div>
                  <Separator />
                  <Button className="w-full" variant="outline" asChild>
                    <a href="/billing">Manage Billing</a>
                  </Button>
                </CardContent>
              </Card>

              {/* Account meta */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Member since</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {profile?.created_at
                        ? formatDate(profile.created_at)
                        : "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="media" className="space-y-6">
          {currentUser && <MediaManager userId={currentUser.id} />}
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Subscription & Billing</CardTitle>
              <CardDescription>
                Manage your subscription plan and billing information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Current Plan</span>
                <Badge variant="secondary">Free Trial</Badge>
              </div>
              <Separator />
              <Button className="w-full" variant="outline" asChild>
                <a href="/billing">Manage Billing & Subscription</a>
              </Button>
              <p className="text-xs text-muted-foreground">
                Upgrade to unlock advanced campaign features and higher spending limits.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
        </div>
      </main>
    </div>
  );
}

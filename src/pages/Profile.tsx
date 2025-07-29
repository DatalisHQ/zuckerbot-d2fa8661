import { useState, useEffect } from "react";
import { User, Mail, Building, Calendar, Edit, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  business_name: string;
  facebook_connected: boolean;
  subscription_tier: string;
  conversation_limit: number;
  conversations_used: number;
  created_at: string;
}

interface BrandAnalysis {
  id: string;
  brand_name: string;
  brand_url: string;
  business_category: string;
  niche: string;
  value_propositions: string[];
  main_products: any;
}

export default function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [brandAnalysis, setBrandAnalysis] = useState<BrandAnalysis | null>(null);
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    business_name: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      setProfile(data);
      setFormData({
        full_name: data.full_name || "",
        business_name: data.business_name || "",
      });

      // Get brand analysis and business info from onboarding
      const { data: brandData } = await supabase
        .from('brand_analysis')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (brandData) {
        setBrandAnalysis(brandData);
      }

      // Get competitors from competitor lists
      const { data: competitorLists } = await supabase
        .from('competitor_lists')
        .select('competitors')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (competitorLists?.competitors && Array.isArray(competitorLists.competitors)) {
        const competitorNames = competitorLists.competitors.map((comp: any) => comp.name || comp.url);
        setCompetitors(competitorNames);
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
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          business_name: formData.business_name,
        })
        .eq('id', profile.id);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, ...formData } : null);
      setEditMode(false);
      
      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error updating profile",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      full_name: profile?.full_name || "",
      business_name: profile?.business_name || "",
    });
    setEditMode(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Profile not found</h2>
        <p className="text-muted-foreground">Unable to load your profile information.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-muted-foreground">
            Manage your account information and preferences
          </p>
        </div>
        {!editMode && (
          <Button onClick={() => setEditMode(true)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Profile
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Profile Card */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile Information
              </CardTitle>
              <CardDescription>
                Your personal and business details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  {editMode ? (
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                      placeholder="Enter your full name"
                    />
                  ) : (
                    <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center">
                      {profile.full_name || "Not provided"}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="h-10 px-3 py-2 border rounded-md bg-muted/20 flex items-center text-muted-foreground">
                    <Mail className="w-4 h-4 mr-2" />
                    {profile.email}
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="business_name">Business Name</Label>
                  {editMode ? (
                    <Input
                      id="business_name"
                      value={formData.business_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, business_name: e.target.value }))}
                      placeholder="Enter your business name"
                    />
                  ) : (
                    <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center">
                      <Building className="w-4 h-4 mr-2" />
                      {profile.business_name || "Not provided"}
                    </div>
                  )}
                </div>
              </div>

              {editMode && (
                <div className="flex gap-2 pt-4">
                  <Button onClick={handleSave} disabled={isSaving}>
                    <Save className="w-4 h-4 mr-2" />
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button variant="outline" onClick={handleCancel}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Business Information Card */}
          {brandAnalysis && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="w-5 h-5" />
                  Business Information
                </CardTitle>
                <CardDescription>
                  Information from your onboarding
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Brand Name</Label>
                    <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center">
                      {brandAnalysis.brand_name || "Not provided"}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Website</Label>
                    <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center">
                      {brandAnalysis.brand_url || "Not provided"}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Business Category</Label>
                    <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center">
                      {brandAnalysis.business_category || "Not provided"}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Niche</Label>
                    <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center">
                      {brandAnalysis.niche || "Not provided"}
                    </div>
                  </div>

                  {brandAnalysis.value_propositions && brandAnalysis.value_propositions.length > 0 && (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Value Propositions</Label>
                      <div className="p-3 border rounded-md bg-muted/50">
                        <div className="flex flex-wrap gap-2">
                          {brandAnalysis.value_propositions.map((prop, index) => (
                            <Badge key={index} variant="secondary">{prop}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {competitors.length > 0 && (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Tracked Competitors</Label>
                      <div className="p-3 border rounded-md bg-muted/50">
                        <div className="flex flex-wrap gap-2">
                          {competitors.map((comp, index) => (
                            <Badge key={index} variant="outline">{comp}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar with Stats */}
        <div className="space-y-6">
          {/* Subscription Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <Badge variant={profile.subscription_tier === 'free' ? 'secondary' : 'default'}>
                  {profile.subscription_tier.charAt(0).toUpperCase() + profile.subscription_tier.slice(1)}
                </Badge>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Conversations Used</span>
                  <span>{profile.conversations_used}/{profile.conversation_limit}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full" 
                    style={{ 
                      width: `${Math.min((profile.conversations_used / profile.conversation_limit) * 100, 100)}%` 
                    }}
                  />
                </div>
              </div>

              <Button className="w-full" variant="outline" asChild>
                <a href="/pricing">Upgrade Plan</a>
              </Button>
            </CardContent>
          </Card>

          {/* Account Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Facebook Connected</span>
                <Badge variant={profile.facebook_connected ? 'default' : 'secondary'}>
                  {profile.facebook_connected ? 'Connected' : 'Not Connected'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Member Since</span>
                <div className="flex items-center text-sm">
                  <Calendar className="w-3 h-3 mr-1" />
                  {formatDate(profile.created_at)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
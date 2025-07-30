import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Check, X, Building, Globe, Users, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface BusinessProfile {
  id: string;
  brand_name: string;
  brand_url: string;
  business_category: string;
  niche: string;
  value_propositions: string[];
  business_display_name: string;
  is_active: boolean;
  created_at: string;
}

interface BusinessProfileManagerProps {
  subscriptionTier: string;
}

export function BusinessProfileManager({ subscriptionTier }: BusinessProfileManagerProps) {
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingBusiness, setEditingBusiness] = useState<BusinessProfile | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { toast } = useToast();

  const getBusinessLimit = (tier: string) => {
    switch (tier.toLowerCase()) {
      case 'free': return 1;
      case 'pro': return 3;
      case 'agency': return 10;
      default: return 1;
    }
  };

  const businessLimit = getBusinessLimit(subscriptionTier);
  const canAddBusiness = businesses.length < businessLimit;

  useEffect(() => {
    fetchBusinesses();
  }, []);

  const fetchBusinesses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('brand_analysis')
        .select('*')
        .eq('user_id', user.id)
        .eq('analysis_status', 'completed')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBusinesses(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading businesses",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetActive = async (businessId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // First, set all businesses to inactive
      await supabase
        .from('brand_analysis')
        .update({ is_active: false })
        .eq('user_id', user.id);

      // Then set the selected business to active
      const { error } = await supabase
        .from('brand_analysis')
        .update({ is_active: true })
        .eq('id', businessId);

      if (error) throw error;

      // Update local state
      setBusinesses(prev => prev.map(business => ({
        ...business,
        is_active: business.id === businessId
      })));

      toast({
        title: "Business activated",
        description: "This business is now your active business profile.",
      });

      // Refresh the page to update the app context
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Error switching business",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (business: BusinessProfile) => {
    setEditingBusiness(business);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async (formData: Partial<BusinessProfile>) => {
    if (!editingBusiness) return;

    try {
      const { error } = await supabase
        .from('brand_analysis')
        .update({
          brand_name: formData.brand_name,
          brand_url: formData.brand_url,
          business_category: formData.business_category,
          niche: formData.niche,
          value_propositions: formData.value_propositions,
          business_display_name: formData.business_display_name,
        })
        .eq('id', editingBusiness.id);

      if (error) throw error;

      // Update local state
      setBusinesses(prev => prev.map(business => 
        business.id === editingBusiness.id 
          ? { ...business, ...formData }
          : business
      ));

      setIsEditDialogOpen(false);
      setEditingBusiness(null);

      toast({
        title: "Business updated",
        description: "Your business profile has been successfully updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error updating business",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Business Profiles</h2>
          <p className="text-sm text-muted-foreground">
            Manage your business profiles ({businesses.length}/{businessLimit} used)
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              disabled={!canAddBusiness}
              variant={canAddBusiness ? "default" : "secondary"}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Business
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Business</DialogTitle>
              <DialogDescription>
                Create a new business profile. This will take you through the onboarding process.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                To add a new business, you'll need to go through our onboarding process where we'll analyze your business and competitors.
              </p>
              <div className="flex gap-2">
                <Button asChild className="flex-1">
                  <a href="/onboarding">Start Onboarding</a>
                </Button>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!canAddBusiness && (
        <Card className="border-warning bg-warning/5">
          <CardContent className="pt-6">
            <p className="text-sm text-warning-foreground">
              You've reached your business limit for the {subscriptionTier} plan. 
              <a href="/pricing" className="underline ml-1">Upgrade your plan</a> to add more businesses.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {businesses.map((business) => (
          <Card key={business.id} className={business.is_active ? "border-primary bg-primary/5" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building className="w-5 h-5" />
                  <div>
                    <CardTitle className="text-lg">
                      {business.business_display_name || business.brand_name}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <Globe className="w-3 h-3" />
                      {business.brand_url}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {business.is_active && (
                    <Badge variant="default">Active</Badge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {!business.is_active && (
                        <DropdownMenuItem onClick={() => handleSetActive(business.id)}>
                          <Check className="w-4 h-4 mr-2" />
                          Set as Active
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleEdit(business)}>
                        <Edit2 className="w-4 h-4 mr-2" />
                        Edit Business
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Category:</span>
                  <span className="ml-2">{business.business_category}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Niche:</span>
                  <span className="ml-2">{business.niche}</span>
                </div>
              </div>
              {business.value_propositions && business.value_propositions.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">Value Propositions:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {business.value_propositions.slice(0, 3).map((prop, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {prop}
                      </Badge>
                    ))}
                    {business.value_propositions.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{business.value_propositions.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Business Dialog */}
      <BusinessEditDialog
        business={editingBusiness}
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setEditingBusiness(null);
        }}
        onSave={handleSaveEdit}
      />
    </div>
  );
}

interface BusinessEditDialogProps {
  business: BusinessProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (formData: Partial<BusinessProfile>) => void;
}

function BusinessEditDialog({ business, isOpen, onClose, onSave }: BusinessEditDialogProps) {
  const [formData, setFormData] = useState({
    business_display_name: '',
    brand_name: '',
    brand_url: '',
    business_category: '',
    niche: '',
    value_propositions: [] as string[],
  });
  const [valuePropsText, setValuePropsText] = useState('');

  useEffect(() => {
    if (business) {
      setFormData({
        business_display_name: business.business_display_name || business.brand_name,
        brand_name: business.brand_name,
        brand_url: business.brand_url,
        business_category: business.business_category,
        niche: business.niche,
        value_propositions: business.value_propositions || [],
      });
      setValuePropsText((business.value_propositions || []).join('\n'));
    }
  }, [business]);

  const handleSave = () => {
    const valuePropositions = valuePropsText
      .split('\n')
      .map(prop => prop.trim())
      .filter(prop => prop.length > 0);

    onSave({
      ...formData,
      value_propositions: valuePropositions,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Business Profile</DialogTitle>
          <DialogDescription>
            Update your business information
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                value={formData.business_display_name}
                onChange={(e) => setFormData(prev => ({ ...prev, business_display_name: e.target.value }))}
                placeholder="My Business"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand_name">Brand Name</Label>
              <Input
                id="brand_name"
                value={formData.brand_name}
                onChange={(e) => setFormData(prev => ({ ...prev, brand_name: e.target.value }))}
                placeholder="Brand Name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="brand_url">Website URL</Label>
            <Input
              id="brand_url"
              value={formData.brand_url}
              onChange={(e) => setFormData(prev => ({ ...prev, brand_url: e.target.value }))}
              placeholder="https://example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Business Category</Label>
              <Input
                id="category"
                value={formData.business_category}
                onChange={(e) => setFormData(prev => ({ ...prev, business_category: e.target.value }))}
                placeholder="E-commerce, SaaS, etc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="niche">Niche</Label>
              <Input
                id="niche"
                value={formData.niche}
                onChange={(e) => setFormData(prev => ({ ...prev, niche: e.target.value }))}
                placeholder="Your business niche"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="value_props">Value Propositions (one per line)</Label>
            <Textarea
              id="value_props"
              value={valuePropsText}
              onChange={(e) => setValuePropsText(e.target.value)}
              placeholder="Fast delivery&#10;Quality products&#10;Great customer service"
              rows={4}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} className="flex-1">
              Save Changes
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
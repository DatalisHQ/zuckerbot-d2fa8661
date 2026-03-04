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
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchBusinesses();
  }, []);

  const fetchBusinesses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Use 'businesses' table since 'brand_analysis' doesn't exist in schema
      const { data, error } = await (supabase as any)
        .from('businesses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Map businesses table fields to BusinessProfile interface
      const mapped: BusinessProfile[] = (data || []).map((b: any) => ({
        id: b.id,
        brand_name: b.name || '',
        brand_url: b.website_url || b.website || '',
        business_category: b.trade || '',
        niche: b.trade || '',
        value_propositions: [],
        business_display_name: b.name || '',
        is_active: true,
        created_at: b.created_at,
      }));
      
      setBusinesses(mapped);
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
      setBusinesses(prev => prev.map(business => ({
        ...business,
        is_active: business.id === businessId
      })));

      toast({
        title: "Business activated",
        description: "This business is now your active business profile.",
      });
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
      const { error } = await (supabase as any)
        .from('businesses')
        .update({
          name: formData.brand_name,
          website_url: formData.brand_url,
          trade: formData.business_category,
        })
        .eq('id', editingBusiness.id);

      if (error) throw error;

      setBusinesses(prev => prev.map(b =>
        b.id === editingBusiness.id ? { ...b, ...formData } : b
      ));

      setIsEditDialogOpen(false);
      setEditingBusiness(null);

      toast({
        title: "Business updated",
        description: "Your business profile has been updated.",
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
      <Card className="bg-white/[0.02] border-white/10">
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Business Profiles</h2>
      </div>

      {businesses.length === 0 ? (
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="text-center py-12">
            <Building className="w-12 h-12 mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">No business profiles yet</p>
            <p className="text-sm text-gray-500 mt-1">Add a business from the onboarding flow</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {businesses.map((business) => (
            <Card
              key={business.id}
              className={`bg-white/[0.02] ${business.is_active ? 'border-blue-500/30' : 'border-white/10'}`}
            >
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
                    <Building className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{business.brand_name || business.business_display_name}</p>
                    <p className="text-xs text-gray-500">{business.business_category}</p>
                  </div>
                  {business.is_active && (
                    <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]">Active</Badge>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {!business.is_active && (
                      <DropdownMenuItem onClick={() => handleSetActive(business.id)}>
                        <Check className="w-4 h-4 mr-2" /> Set Active
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleEdit(business)}>
                      <Edit2 className="w-4 h-4 mr-2" /> Edit
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-[#0f0f13] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Edit Business</DialogTitle>
            <DialogDescription className="text-gray-400">
              Update your business profile details.
            </DialogDescription>
          </DialogHeader>
          {editingBusiness && (
            <EditBusinessForm
              business={editingBusiness}
              onSave={handleSaveEdit}
              onCancel={() => setIsEditDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditBusinessForm({
  business,
  onSave,
  onCancel,
}: {
  business: BusinessProfile;
  onSave: (data: Partial<BusinessProfile>) => void;
  onCancel: () => void;
}) {
  const [brandName, setBrandName] = useState(business.brand_name);
  const [brandUrl, setBrandUrl] = useState(business.brand_url);
  const [category, setCategory] = useState(business.business_category);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-gray-300">Business Name</Label>
        <Input
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          className="bg-white/5 border-white/10 text-white mt-1"
        />
      </div>
      <div>
        <Label className="text-gray-300">Website URL</Label>
        <Input
          value={brandUrl}
          onChange={(e) => setBrandUrl(e.target.value)}
          className="bg-white/5 border-white/10 text-white mt-1"
        />
      </div>
      <div>
        <Label className="text-gray-300">Category</Label>
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-white/5 border-white/10 text-white mt-1"
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onCancel} className="border-white/10 text-gray-300">
          Cancel
        </Button>
        <Button
          onClick={() => onSave({ brand_name: brandName, brand_url: brandUrl, business_category: category })}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          Save
        </Button>
      </div>
    </div>
  );
}

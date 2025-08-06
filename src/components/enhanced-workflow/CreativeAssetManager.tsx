import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Facebook, ExternalLink, Image, Check, X, FileImage } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUploadRawAssets } from '@/hooks/useUploadRawAssets';
import { useFetchFacebookAssets, FacebookAsset } from '@/hooks/useFetchFacebookAssets';
import { useGetFacebookAdAccounts, AdAccount } from '@/hooks/useGetFacebookAdAccounts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useImageFiles, UserFile } from '@/hooks/useUserFiles';

export interface CreativeAsset {
  id: string;
  url: string;
  type: 'upload' | 'url' | 'facebook';
  facebook_creative_id?: string;
  name?: string;
  selected: boolean;
}

interface CreativeAssetManagerProps {
  campaignId: string;
  onAssetsSelected: (assets: CreativeAsset[]) => void;
}

export function CreativeAssetManager({ campaignId, onAssetsSelected }: CreativeAssetManagerProps) {
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [savedAssets, setSavedAssets] = useState<CreativeAsset[]>([]);
  const [facebookAssets, setFacebookAssets] = useState<FacebookAsset[]>([]);
  const [selectedAdAccount, setSelectedAdAccount] = useState<AdAccount | null>(null);
  
  const uploadMutation = useUploadRawAssets();
  const fbMutation = useFetchFacebookAssets();
  const adAccountsQuery = useGetFacebookAdAccounts();
  const userFilesQuery = useImageFiles();
  const { toast } = useToast();

  // Load existing creative assets from database
  const { data: existingAssets, refetch: refetchAssets } = useQuery({
    queryKey: ['creative-assets', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .select('creative_assets')
        .eq('id', campaignId)
        .single();

      if (error) throw error;
      return ((data?.creative_assets as unknown) as CreativeAsset[]) || [];
    },
    enabled: !!campaignId
  });

  // Initialize saved assets from database
  useEffect(() => {
    if (existingAssets && existingAssets.length > 0) {
      setSavedAssets(existingAssets);
    }
    
    // Check for pending file from Files page
    const pendingFile = localStorage.getItem('pendingCampaignFile');
    if (pendingFile) {
      try {
        const fileInfo = JSON.parse(pendingFile);
        const newAsset: CreativeAsset = {
          id: `user_file_${fileInfo.name}`,
          url: fileInfo.url,
          type: 'upload',
          name: fileInfo.name,
          selected: true
        };
        
        setSavedAssets(prev => {
          // Check if not already added
          if (!prev.find(asset => asset.id === newAsset.id)) {
            const updated = [...prev, newAsset];
            saveAssetsToDatabase(updated);
            return updated;
          }
          return prev;
        });
        
        // Clear the pending file
        localStorage.removeItem('pendingCampaignFile');
        
        toast({
          title: "File added from library",
          description: `${fileInfo.name} has been added to your campaign assets.`
        });
      } catch (error) {
        localStorage.removeItem('pendingCampaignFile');
      }
    }
  }, [existingAssets]);

  // Save assets to database whenever savedAssets changes
  const saveAssetsToDatabase = async (assets: CreativeAsset[]) => {
    try {
      const { error } = await supabase
        .from('ad_campaigns')
        .update({ creative_assets: assets as any })
        .eq('id', campaignId);

      if (error) throw error;
      await refetchAssets();
    } catch (error) {
      console.error('Error saving assets:', error);
      toast({
        title: "Save failed",
        description: "Failed to save creative assets",
        variant: "destructive"
      });
    }
  };

  // Handle file uploads
  useEffect(() => {
    if (uploadMutation.isSuccess && uploadMutation.data) {
      const newAssets: CreativeAsset[] = uploadMutation.data.map((url, index) => ({
        id: `upload_${Date.now()}_${index}`,
        url,
        type: 'upload',
        selected: true
      }));
      
      const updatedAssets = [...savedAssets, ...newAssets];
      setSavedAssets(updatedAssets);
      saveAssetsToDatabase(updatedAssets);
      setLocalFiles([]);
      
      // Refresh user files query to show new files in "Your Files" tab
      userFilesQuery.refetch();
      
      toast({
        title: "Upload successful",
        description: `Uploaded ${newAssets.length} assets`
      });
    }
    
    if (uploadMutation.isError) {
      toast({
        title: "Upload failed",
        description: uploadMutation.error?.message || "Failed to upload files",
        variant: "destructive"
      });
    }
  }, [uploadMutation.isSuccess, uploadMutation.data, uploadMutation.isError, uploadMutation.error, userFilesQuery]);

  // Handle Facebook assets fetch
  useEffect(() => {
    if (fbMutation.isSuccess && fbMutation.data) {
      setFacebookAssets(fbMutation.data);
      toast({
        title: "Facebook assets loaded",
        description: `Found ${fbMutation.data.length} assets`
      });
    }
    
    if (fbMutation.isError) {
      toast({
        title: "Facebook fetch failed",
        description: fbMutation.error?.message || "Failed to fetch Facebook assets",
        variant: "destructive"
      });
    }
  }, [fbMutation.isSuccess, fbMutation.data, fbMutation.isError, fbMutation.error]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setLocalFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = () => {
    if (localFiles.length > 0) {
      uploadMutation.mutate(localFiles);
    }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim()) return;
    
    try {
      // Validate URL
      new URL(urlInput);
      
      // Upload URL-based asset to user's storage for consistency
      const response = await fetch(urlInput.trim());
      if (!response.ok) {
        throw new Error('Failed to fetch image from URL');
      }
      
      const blob = await response.blob();
      const fileName = `url_asset_${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`;
      const file = new File([blob], fileName, { type: blob.type });
      
      // Upload to user's folder like other assets
      await uploadMutation.mutateAsync([file]);
      setUrlInput('');
      
      toast({
        title: "URL asset added",
        description: "Asset has been downloaded and added to your library."
      });
    } catch (error: any) {
      console.error('Error adding URL asset:', error);
      
      // Fallback: Add URL directly without upload
      try {
        new URL(urlInput.trim());
        
        const newAsset: CreativeAsset = {
          id: `url_${Date.now()}`,
          url: urlInput.trim(),
          type: 'url',
          selected: true
        };
        
        const updatedAssets = [...savedAssets, newAsset];
        setSavedAssets(updatedAssets);
        await saveAssetsToDatabase(updatedAssets);
        setUrlInput('');
        
        toast({
          title: "URL added",
          description: "Asset URL has been added to your campaign."
        });
      } catch (urlError: any) {
        toast({
          title: "Invalid URL", 
          description: "Please enter a valid image/video URL.",
          variant: "destructive"
        });
      }
    }
  };

  const handleFetchFacebook = () => {
    if (selectedAdAccount?.id) {
      fbMutation.mutate({ adAccountId: selectedAdAccount.id });
    }
  };

  const toggleAssetSelection = (assetId: string) => {
    setSavedAssets(prev => {
      const updated = prev.map(asset => 
        asset.id === assetId 
          ? { ...asset, selected: !asset.selected }
          : asset
      );
      saveAssetsToDatabase(updated);
      return updated;
    });
  };

  const addFacebookAsset = (fbAsset: FacebookAsset) => {
    const newAsset: CreativeAsset = {
      id: `facebook_${fbAsset.id}`,
      url: fbAsset.url,
      type: 'facebook',
      facebook_creative_id: fbAsset.id,
      name: (fbAsset as any).name || 'Facebook Asset',
      selected: true
    };
    
    // Check if already added
    if (!savedAssets.find(asset => asset.id === newAsset.id)) {
      const updatedAssets = [...savedAssets, newAsset];
      setSavedAssets(updatedAssets);
      saveAssetsToDatabase(updatedAssets);
    }
  };

  const removeAsset = (assetId: string) => {
    const updatedAssets = savedAssets.filter(asset => asset.id !== assetId);
    setSavedAssets(updatedAssets);
    saveAssetsToDatabase(updatedAssets);
  };

  const addUserFile = (userFile: UserFile) => {
    const newAsset: CreativeAsset = {
      id: `user_file_${userFile.name}`,
      url: userFile.url,
      type: 'upload',
      name: userFile.name,
      selected: true
    };
    
    // Check if already added
    if (!savedAssets.find(asset => asset.id === newAsset.id)) {
      const updatedAssets = [...savedAssets, newAsset];
      setSavedAssets(updatedAssets);
      saveAssetsToDatabase(updatedAssets);
      toast({
        title: "File added",
        description: `${userFile.name} has been added to your creative assets.`
      });
    }
  };

  const handleContinue = () => {
    const selectedAssets = savedAssets.filter(asset => asset.selected);
    if (selectedAssets.length === 0) {
      toast({
        title: "No assets selected",
        description: "Please select at least one creative asset to continue.",
        variant: "destructive"
      });
      return;
    }
    onAssetsSelected(selectedAssets);
  };

  const selectedCount = savedAssets.filter(asset => asset.selected).length;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          Creative Asset Management
        </CardTitle>
        <p className="text-muted-foreground">
          Manage creative assets for your campaign. Selected assets will be used to generate ads.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        
        <Tabs defaultValue="your-files" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="your-files">Your Files</TabsTrigger>
            <TabsTrigger value="upload">Upload Files</TabsTrigger>
            <TabsTrigger value="url">Add URLs</TabsTrigger>
            <TabsTrigger value="facebook">Facebook Assets</TabsTrigger>
          </TabsList>
          
          <TabsContent value="your-files" className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Your File Library</Label>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.open('/files', '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Manage Files
                </Button>
              </div>
              
              {userFilesQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : userFilesQuery.data && userFilesQuery.data.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                  {userFilesQuery.data.map((file) => {
                    const isAdded = savedAssets.some(saved => saved.id === `user_file_${file.name}`);
                    return (
                      <div key={file.id} className="relative border rounded-lg p-2">
                        <img 
                          src={file.url} 
                          alt={file.name}
                          className="w-full h-24 object-cover rounded mb-2"
                        />
                        <p className="text-xs text-muted-foreground truncate mb-2">
                          {file.name}
                        </p>
                        <Button
                          variant={isAdded ? "secondary" : "default"}
                          size="sm"
                          onClick={() => addUserFile(file)}
                          disabled={isAdded}
                          className="w-full"
                        >
                          {isAdded ? (
                            <>
                              <Check className="h-4 w-4 mr-2" />
                              Added
                            </>
                          ) : (
                            <>
                              <FileImage className="h-4 w-4 mr-2" />
                              Add to Campaign
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 space-y-3">
                  <FileImage className="h-12 w-12 text-muted-foreground mx-auto" />
                  <div>
                    <p className="text-sm font-medium">No files in your library</p>
                    <p className="text-xs text-muted-foreground">Upload files to your library to use them in campaigns</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.open('/files', '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Go to File Library
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="upload" className="space-y-4">
            <div className="space-y-3">
              <Label>Upload Local Images</Label>
              <div className="flex gap-3">
                <Input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  className="flex-1"
                />
                <Button 
                  onClick={handleUpload}
                  disabled={localFiles.length === 0 || uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Upload
                </Button>
              </div>
              {localFiles.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {localFiles.length} file(s) ready to upload
                </p>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="url" className="space-y-4">
            <div className="space-y-3">
              <Label>Add Image/Video URLs</Label>
              <div className="flex gap-3">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1"
                />
                <Button onClick={handleAddUrl} disabled={!urlInput.trim()}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Add URL
                </Button>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="facebook" className="space-y-4">
            <div className="space-y-3">
              <Label>Fetch from Facebook Creative Library</Label>
              
              {/* Loading state for ad accounts */}
              {adAccountsQuery.isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading Facebook ad accounts...</span>
                </div>
              )}
              
              {/* Error state for ad accounts */}
              {adAccountsQuery.isError && (
                <div className="text-center py-8 space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {(adAccountsQuery.error as any)?.reconnectRequired ? (
                      <>
                        <p className="font-medium text-orange-600">Facebook Connection Required</p>
                        <p>Your Facebook session expired. Please reconnect to continue.</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-destructive">Failed to load ad accounts</p>
                        <p>{adAccountsQuery.error?.message || 'Unable to fetch Facebook ad accounts'}</p>
                      </>
                    )}
                  </div>
                  {(adAccountsQuery.error as any)?.reconnectRequired && (
                    <div className="pt-2">
                      <Button
                        onClick={async () => {
                          // Trigger Facebook OAuth flow
                          try {
                            await supabase.auth.signInWithOAuth({
                              provider: 'facebook',
                              options: {
                                scopes: 'ads_management,ads_read,business_management,pages_read_engagement',
                                redirectTo: `${window.location.origin}${window.location.pathname}?facebook=connected`
                              }
                            });
                          } catch (error: any) {
                            toast({
                              title: "Connection failed",
                              description: error.message,
                              variant: "destructive"
                            });
                          }
                        }}
                      >
                        <Facebook className="h-4 w-4 mr-2" />
                        Reconnect Facebook
                      </Button>
                    </div>
                  )}
                </div>
              )}
              
              {/* No ad accounts found */}
              {!adAccountsQuery.isLoading && !adAccountsQuery.isError && (!adAccountsQuery.data || adAccountsQuery.data.length === 0) && (
                <div className="text-center py-8 space-y-3">
                  <Facebook className="h-12 w-12 text-muted-foreground mx-auto" />
                  <div>
                    <p className="text-sm font-medium">No Facebook Ad Accounts Found</p>
                    <p className="text-xs text-muted-foreground">Connect your Facebook Business account to access creative assets</p>
                  </div>
                  <Button
                    onClick={async () => {
                      // Trigger Facebook OAuth flow
                      try {
                        await supabase.auth.signInWithOAuth({
                          provider: 'facebook',
                          options: {
                            scopes: 'ads_management,ads_read,business_management,pages_read_engagement',
                            redirectTo: `${window.location.origin}${window.location.pathname}?facebook=connected`
                          }
                        });
                      } catch (error: any) {
                        toast({
                          title: "Connection failed",
                          description: error.message,
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    <Facebook className="h-4 w-4 mr-2" />
                    Connect Facebook Account
                  </Button>
                </div>
              )}
              
              {/* Ad account selection and fetch */}
              {adAccountsQuery.data && adAccountsQuery.data.length > 0 && (
                <div className="space-y-3">
                  <Select onValueChange={(value) => {
                    const account = adAccountsQuery.data?.find(acc => acc.id === value);
                    setSelectedAdAccount(account || null);
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an ad account" />
                    </SelectTrigger>
                    <SelectContent>
                      {adAccountsQuery.data.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Button 
                    onClick={handleFetchFacebook}
                    disabled={!selectedAdAccount || fbMutation.isPending}
                    className="w-full"
                  >
                    {fbMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Facebook className="h-4 w-4 mr-2" />
                    )}
                    Fetch Creative Assets
                  </Button>
                </div>
              )}
              
              {/* Facebook Assets Grid */}
              {facebookAssets.length > 0 && (
                <div className="space-y-3">
                  <Label>Available Facebook Assets</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                    {facebookAssets.map((asset) => {
                      const isAdded = savedAssets.some(saved => saved.id === `facebook_${asset.id}`);
                      return (
                        <div key={asset.id} className="relative border rounded-lg p-2">
                          <img 
                            src={asset.url} 
                            alt={(asset as any).name || 'Facebook asset'}
                            className="w-full h-24 object-cover rounded mb-2"
                          />
                          <Button
                            variant={isAdded ? "secondary" : "default"}
                            size="sm"
                            onClick={() => addFacebookAsset(asset)}
                            disabled={isAdded}
                            className="w-full"
                          >
                            {isAdded ? (
                              <>
                                <Check className="h-4 w-4 mr-2" />
                                Added
                              </>
                            ) : (
                              'Add Asset'
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Selected Assets Display */}
        {savedAssets.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">
                Saved Creative Assets ({selectedCount} selected)
              </Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allSelected = savedAssets.every(asset => asset.selected);
                    const updated = savedAssets.map(asset => ({ ...asset, selected: !allSelected }));
                    setSavedAssets(updated);
                    saveAssetsToDatabase(updated);
                  }}
                >
                  {savedAssets.every(asset => asset.selected) ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {savedAssets.map((asset) => (
                <div 
                  key={asset.id}
                  className={`relative border-2 rounded-lg p-2 transition-colors ${
                    asset.selected ? 'border-primary' : 'border-border'
                  }`}
                >
                  <div className="relative">
                    <img 
                      src={asset.url} 
                      alt={asset.name || 'Creative asset'}
                      className="w-full h-24 object-cover rounded mb-2"
                    />
                    
                    {/* Selection checkbox */}
                    <div className="absolute top-1 right-1">
                      <Checkbox
                        checked={asset.selected}
                        onCheckedChange={() => toggleAssetSelection(asset.id)}
                        className="bg-background border-2"
                      />
                    </div>
                    
                    {/* Remove button */}
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-1 left-1 h-6 w-6 p-0"
                      onClick={() => removeAsset(asset.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  <div className="space-y-1">
                    <Badge variant={asset.type === 'facebook' ? 'default' : 'secondary'}>
                      {asset.type}
                    </Badge>
                    {asset.name && (
                      <p className="text-xs text-muted-foreground truncate">
                        {asset.name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Continue Button */}
        {savedAssets.length > 0 && (
          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {selectedCount} assets selected for ad creation
            </p>
            <Button 
              onClick={handleContinue}
              disabled={selectedCount === 0}
            >
              Continue with Selected Assets
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
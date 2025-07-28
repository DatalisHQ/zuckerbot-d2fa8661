import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, ExternalLink, Facebook, Check } from 'lucide-react';
import { useUploadRawAssets } from '@/hooks/useUploadRawAssets';
import { useFetchFacebookAssets, FacebookAsset } from '@/hooks/useFetchFacebookAssets';
import { useGetFacebookAdAccounts, AdAccount } from '@/hooks/useGetFacebookAdAccounts';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

interface RawAssetCollectorProps {
  onAssetsChange: (assets: string[]) => void;
}

export const RawAssetCollector = ({ onAssetsChange }: RawAssetCollectorProps) => {
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [manualUrls, setManualUrls] = useState<string[]>([]);
  const [selectedAdAccount, setSelectedAdAccount] = useState<AdAccount | null>(null);
  const [rawAssets, setRawAssets] = useState<string[]>([]);
  const [facebookAssets, setFacebookAssets] = useState<FacebookAsset[]>([]);
  
  const uploadMutation = useUploadRawAssets();
  const fbMutation = useFetchFacebookAssets();
  const adAccountsQuery = useGetFacebookAdAccounts();
  const { toast } = useToast();

  // Update parent component when assets change
  useEffect(() => {
    const selectedFacebookAssets = facebookAssets
      .filter(asset => asset.selected)
      .map(asset => asset.url);
    onAssetsChange([...rawAssets, ...manualUrls, ...selectedFacebookAssets]);
  }, [rawAssets, manualUrls, facebookAssets, onAssetsChange]);

  // Handle successful uploads
  useEffect(() => {
    if (uploadMutation.isSuccess) {
      setRawAssets(prev => [...prev, ...uploadMutation.data]);
      setLocalFiles([]);
      toast({
        title: "Success",
        description: `Uploaded ${uploadMutation.data.length} files successfully`,
      });
    }
  }, [uploadMutation.isSuccess, uploadMutation.data, toast]);

  // Handle successful Facebook fetch
  useEffect(() => {
    if (fbMutation.isSuccess) {
      setFacebookAssets(fbMutation.data);
      toast({
        title: "Success", 
        description: `Fetched ${fbMutation.data.length} assets from Facebook`,
      });
    }
  }, [fbMutation.isSuccess, fbMutation.data, toast]);

  // Handle errors
  useEffect(() => {
    if (uploadMutation.isError) {
      toast({
        title: "Upload Error",
        description: uploadMutation.error.message,
        variant: "destructive",
      });
    }
  }, [uploadMutation.isError, uploadMutation.error, toast]);

  useEffect(() => {
    if (fbMutation.isError) {
      toast({
        title: "Facebook Fetch Error",
        description: fbMutation.error.message,
        variant: "destructive",
      });
    }
  }, [fbMutation.isError, fbMutation.error, toast]);

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

  const handleAddUrl = () => {
    if (urlInput.trim()) {
      setManualUrls(prev => [...prev, urlInput.trim()]);
      setUrlInput('');
    }
  };

  const handleFetchFacebook = () => {
    if (selectedAdAccount?.id) {
      fbMutation.mutate({ adAccountId: selectedAdAccount.id });
    }
  };

  const toggleFacebookAssetSelection = (assetId: string) => {
    setFacebookAssets(prev => 
      prev.map(asset => 
        asset.id === assetId 
          ? { ...asset, selected: !asset.selected }
          : asset
      )
    );
  };

  const removeAsset = (index: number, type: 'uploaded' | 'manual') => {
    if (type === 'uploaded') {
      setRawAssets(prev => prev.filter((_, i) => i !== index));
    } else {
      setManualUrls(prev => prev.filter((_, i) => i !== index));
    }
  };

  const selectedFacebookAssets = facebookAssets.filter(asset => asset.selected);
  const allAssets = [...rawAssets, ...manualUrls, ...selectedFacebookAssets.map(a => a.url)];

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Raw Asset Collection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* File Upload Section */}
        <div className="space-y-3">
          <Label>Upload Local Images</Label>
          <div className="flex gap-3">
            <Input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileChange}
              className="flex-1"
            />
            <Button 
              onClick={handleUpload}
              disabled={localFiles.length === 0 || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Upload"
              )}
            </Button>
          </div>
          {localFiles.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {localFiles.length} file(s) selected
            </p>
          )}
        </div>

        {/* Manual URL Section */}
        <div className="space-y-3">
          <Label>Add Image URLs</Label>
          <div className="flex gap-3">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="flex-1"
            />
            <Button onClick={handleAddUrl} disabled={!urlInput.trim()}>
              <ExternalLink className="h-4 w-4" />
              Add URL
            </Button>
          </div>
        </div>

        {/* Facebook Assets Section */}
        <div className="space-y-3">
          <Label>Fetch from Facebook Creative Library</Label>
          {adAccountsQuery.isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading ad accounts...
            </div>
          )}
          {adAccountsQuery.isError && (
            <p className="text-sm text-destructive">
              Error loading ad accounts. Make sure your Facebook account is connected.
            </p>
          )}
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
                Fetch Assets from {selectedAdAccount?.name || 'Selected Account'}
              </Button>
            </div>
          )}
          {adAccountsQuery.data && adAccountsQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No Facebook ad accounts found. Connect your Facebook Business Manager first.
            </p>
          )}
        </div>

        {/* Facebook Assets Grid */}
        {facebookAssets.length > 0 && (
          <div className="space-y-3">
            <Label className="flex items-center justify-between">
              Facebook Assets ({facebookAssets.filter(a => a.selected).length} of {facebookAssets.length} selected)
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const allSelected = facebookAssets.every(asset => asset.selected);
                  setFacebookAssets(prev => 
                    prev.map(asset => ({ ...asset, selected: !allSelected }))
                  );
                }}
              >
                {facebookAssets.every(asset => asset.selected) ? 'Deselect All' : 'Select All'}
              </Button>
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
              {facebookAssets.map((asset) => (
                <div 
                  key={asset.id} 
                  className={`relative cursor-pointer rounded-lg border-2 transition-colors ${
                    asset.selected ? 'border-primary' : 'border-border'
                  }`}
                  onClick={() => toggleFacebookAssetSelection(asset.id)}
                >
                  <img 
                    src={asset.url} 
                    alt={`Facebook asset`}
                    className="w-full h-24 object-cover rounded"
                  />
                  <div className={`absolute top-2 right-2 w-5 h-5 rounded border-2 flex items-center justify-center ${
                    asset.selected 
                      ? 'bg-primary border-primary text-primary-foreground' 
                      : 'bg-background border-border'
                  }`}>
                    {asset.selected && <Check className="h-3 w-3" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Asset Preview */}
        {allAssets.length > 0 && (
          <div className="space-y-3">
            <Label>{allAssets.length} Asset(s) Collected</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {rawAssets.map((url, i) => (
                <div key={`uploaded-${i}`} className="relative group">
                  <img 
                    src={url} 
                    alt={`Uploaded asset ${i + 1}`}
                    className="w-full h-24 object-cover rounded border"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                    onClick={() => removeAsset(i, 'uploaded')}
                  >
                    ×
                  </Button>
                </div>
              ))}
              {manualUrls.map((url, i) => (
                <div key={`manual-${i}`} className="relative group">
                  <img 
                    src={url} 
                    alt={`Manual URL asset ${i + 1}`}
                    className="w-full h-24 object-cover rounded border"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                    onClick={() => removeAsset(i, 'manual')}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
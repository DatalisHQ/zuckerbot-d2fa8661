import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, ExternalLink, Facebook } from 'lucide-react';
import { useUploadRawAssets } from '@/hooks/useUploadRawAssets';
import { useFetchFacebookAssets } from '@/hooks/useFetchFacebookAssets';
import { useToast } from '@/hooks/use-toast';

interface RawAssetCollectorProps {
  onAssetsChange: (assets: string[]) => void;
}

export const RawAssetCollector = ({ onAssetsChange }: RawAssetCollectorProps) => {
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [manualUrls, setManualUrls] = useState<string[]>([]);
  const [adAccountId, setAdAccountId] = useState('');
  const [rawAssets, setRawAssets] = useState<string[]>([]);
  
  const uploadMutation = useUploadRawAssets();
  const fbMutation = useFetchFacebookAssets();
  const { toast } = useToast();

  // Update parent component when assets change
  useEffect(() => {
    onAssetsChange([...rawAssets, ...manualUrls]);
  }, [rawAssets, manualUrls, onAssetsChange]);

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
      setRawAssets(prev => [...prev, ...fbMutation.data]);
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
    if (adAccountId.trim()) {
      fbMutation.mutate({ adAccountId: adAccountId.trim() });
    }
  };

  const removeAsset = (index: number, type: 'uploaded' | 'manual') => {
    if (type === 'uploaded') {
      setRawAssets(prev => prev.filter((_, i) => i !== index));
    } else {
      setManualUrls(prev => prev.filter((_, i) => i !== index));
    }
  };

  const allAssets = [...rawAssets, ...manualUrls];

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
          <div className="flex gap-3">
            <Input
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              placeholder="Enter Ad Account ID (e.g., act_123456789)"
              className="flex-1"
            />
            <Button 
              onClick={handleFetchFacebook}
              disabled={!adAccountId.trim() || fbMutation.isPending}
            >
              {fbMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Facebook className="h-4 w-4" />
                  Fetch
                </>
              )}
            </Button>
          </div>
        </div>

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
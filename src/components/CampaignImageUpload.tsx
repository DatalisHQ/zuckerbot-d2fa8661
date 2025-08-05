import { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Image, Link, Facebook } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CampaignImageUploadProps {
  campaignId: string;
  existingData?: any;
  onImagesSelected: (images: any[]) => void;
}

interface ImageData {
  id: string;
  url: string;
  source: 'upload' | 'url' | 'facebook';
  name?: string;
  description?: string;
}

export const CampaignImageUpload = ({ campaignId, existingData, onImagesSelected }: CampaignImageUploadProps) => {
  const [selectedImages, setSelectedImages] = useState<ImageData[]>(existingData?.images || []);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const { toast } = useToast();

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${campaignId}/${Date.now()}.${fileExt}`;
        
        const { data, error } = await supabase.storage
          .from('user-files')
          .upload(fileName, file);

        if (error) throw error;

        const { data: publicUrl } = supabase.storage
          .from('user-files')
          .getPublicUrl(fileName);

        return {
          id: data.path,
          url: publicUrl.publicUrl,
          source: 'upload' as const,
          name: file.name
        };
      });

      const uploadedImages = await Promise.all(uploadPromises);
      const newImages = [...selectedImages, ...uploadedImages];
      setSelectedImages(newImages);
      
      toast({
        title: "Images uploaded",
        description: `${uploadedImages.length} image(s) uploaded successfully.`,
      });
    } catch (error) {
      console.error('Error uploading images:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload images. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }, [campaignId, selectedImages, toast]);

  const handleUrlSubmit = () => {
    if (!imageUrl.trim()) return;

    const newImage: ImageData = {
      id: `url-${Date.now()}`,
      url: imageUrl.trim(),
      source: 'url'
    };

    const newImages = [...selectedImages, newImage];
    setSelectedImages(newImages);
    setImageUrl('');
    
    toast({
      title: "Image added",
      description: "Image from URL added successfully.",
    });
  };

  const removeImage = (imageId: string) => {
    const newImages = selectedImages.filter(img => img.id !== imageId);
    setSelectedImages(newImages);
  };

  const handleContinue = () => {
    if (selectedImages.length === 0) {
      toast({
        title: "No images selected",
        description: "Please add at least one image to continue.",
        variant: "destructive",
      });
      return;
    }

    onImagesSelected(selectedImages);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Upload Creative Assets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upload">Upload Files</TabsTrigger>
              <TabsTrigger value="url">From URL</TabsTrigger>
              <TabsTrigger value="facebook">Facebook Library</TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload" className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <div className="space-y-2">
                  <p className="text-lg font-medium">Upload your images</p>
                  <p className="text-muted-foreground">
                    Drag and drop files here, or click to browse
                  </p>
                </div>
                <Input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="mt-4"
                />
                {uploading && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Uploading images...
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="url" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="imageUrl">Image URL</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="imageUrl"
                      placeholder="https://example.com/image.jpg"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                    <Button onClick={handleUrlSubmit} disabled={!imageUrl.trim()}>
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="facebook" className="space-y-4">
              <div className="text-center py-8">
                <Facebook className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium">Facebook Ad Library</p>
                <p className="text-muted-foreground mb-4">
                  Select images from your Facebook ad account
                </p>
                <Button variant="outline" disabled>
                  Connect Facebook Account
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Feature coming soon
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {selectedImages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Selected Images ({selectedImages.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {selectedImages.map((image) => (
                <div key={image.id} className="relative group">
                  <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                    <img
                      src={image.url}
                      alt={image.name || 'Selected image'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder.svg';
                      }}
                    />
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeImage(image.id)}
                  >
                    ×
                  </Button>
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground truncate">
                      {image.name || 'Image'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {image.source}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 flex justify-end">
              <Button onClick={handleContinue} disabled={selectedImages.length === 0}>
                Continue to Campaign Creation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
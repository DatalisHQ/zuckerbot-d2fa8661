import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { 
  Image as ImageIcon,
  Video,
  Check,
  Plus,
  Eye,
  Loader2
} from "lucide-react";

interface MediaFile {
  id: string;
  name: string;
  publicUrl: string;
  isVideo: boolean;
}

interface ImageSelectorProps {
  userId: string;
  selectedImages: string[];
  onSelectionChange: (urls: string[]) => void;
  maxSelection?: number;
  className?: string;
}

export default function ImageSelector({ 
  userId, 
  selectedImages, 
  onSelectionChange, 
  maxSelection = 5,
  className 
}: ImageSelectorProps) {
  const { toast } = useToast();
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<MediaFile | null>(null);

  const loadMediaFiles = async () => {
    setIsLoading(true);
    try {
      const { data: files, error } = await supabase.storage
        .from('business-photos')
        .list(userId, {
          limit: 50,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) throw error;

      if (!files || files.length === 0) {
        setMediaFiles([]);
        setIsLoading(false);
        return;
      }

      const videoExtensions = ['.mp4', '.mov', '.avi', '.webm'];
      
      // Get public URLs for all files
      const mediaWithUrls: MediaFile[] = files.map(file => {
        const { data: urlData } = supabase.storage
          .from('business-photos')
          .getPublicUrl(`${userId}/${file.name}`);
        
        const isVideo = videoExtensions.some(ext => 
          file.name.toLowerCase().endsWith(ext)
        );
        
        return {
          id: file.id || file.name,
          name: file.name,
          publicUrl: urlData.publicUrl,
          isVideo
        };
      });

      setMediaFiles(mediaWithUrls);
    } catch (error: any) {
      console.error('Error loading media files:', error);
      toast({
        title: "Error loading media",
        description: error.message || "Failed to load your media files.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadMediaFiles();
    }
  }, [userId]);

  const handleImageToggle = (url: string) => {
    const isSelected = selectedImages.includes(url);
    
    if (isSelected) {
      // Remove from selection
      onSelectionChange(selectedImages.filter(img => img !== url));
    } else {
      // Add to selection if under limit
      if (selectedImages.length < maxSelection) {
        onSelectionChange([...selectedImages, url]);
      } else {
        toast({
          title: "Selection limit reached",
          description: `You can select up to ${maxSelection} images for your campaign.`,
          variant: "destructive"
        });
      }
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading your media...</span>
      </div>
    );
  }

  if (mediaFiles.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No media uploaded</h3>
          <p className="text-muted-foreground text-sm text-center">
            Upload some images or videos in Settings → Media to use them in your campaigns.
          </p>
          <Button variant="outline" className="mt-4" asChild>
            <a href="/profile?tab=media">Upload Media</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Choose Campaign Images</h4>
          <Badge variant="outline" className="text-xs">
            {selectedImages.length}/{maxSelection} selected
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {mediaFiles.map((file) => {
            const isSelected = selectedImages.includes(file.publicUrl);
            
            return (
              <Card 
                key={file.id} 
                className={`group cursor-pointer transition-all duration-200 overflow-hidden ${
                  isSelected 
                    ? 'ring-2 ring-primary shadow-lg' 
                    : 'hover:shadow-md hover:ring-1 hover:ring-muted-foreground/25'
                }`}
                onClick={() => !file.isVideo && handleImageToggle(file.publicUrl)}
              >
                <div className="aspect-square bg-muted relative overflow-hidden">
                  {file.isVideo ? (
                    <div className="w-full h-full flex items-center justify-center bg-muted/50">
                      <Video className="h-6 w-6 text-muted-foreground" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <Badge variant="secondary" className="text-xs">
                          Video not supported for ads yet
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <>
                      <img 
                        src={file.publicUrl}
                        alt={file.name}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />
                      
                      {/* Selection indicator */}
                      <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 transition-all ${
                        isSelected 
                          ? 'bg-primary border-primary text-white' 
                          : 'bg-white/80 border-white/60 text-transparent group-hover:text-muted-foreground'
                      } flex items-center justify-center`}>
                        {isSelected ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                      </div>
                      
                      {/* Preview overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Dialog open={previewImage?.id === file.id} onOpenChange={(open) => setPreviewImage(open ? file : null)}>
                          <DialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImage(file);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                        </Dialog>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {selectedImages.length > 0 && (
          <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-sm text-primary font-medium">
              ✓ {selectedImages.length} image{selectedImages.length > 1 ? 's' : ''} selected for your campaign
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Facebook will automatically test different images to find the best performing one.
            </p>
          </div>
        )}
      </div>

      {/* Preview dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => setPreviewImage(open ? previewImage : null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate">{previewImage?.name}</DialogTitle>
          </DialogHeader>
          
          {previewImage && !previewImage.isVideo && (
            <div className="space-y-4">
              <div className="max-h-[60vh] overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                <img 
                  src={previewImage.publicUrl}
                  alt={previewImage.name}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Badge variant={selectedImages.includes(previewImage.publicUrl) ? "default" : "outline"}>
                  {selectedImages.includes(previewImage.publicUrl) ? "Selected" : "Not selected"}
                </Badge>
                <Button 
                  onClick={() => {
                    handleImageToggle(previewImage.publicUrl);
                    setPreviewImage(null);
                  }}
                  variant={selectedImages.includes(previewImage.publicUrl) ? "outline" : "default"}
                >
                  {selectedImages.includes(previewImage.publicUrl) ? "Remove" : "Select"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
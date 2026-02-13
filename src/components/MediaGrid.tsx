import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { 
  Trash2, 
  Eye, 
  Download, 
  Image as ImageIcon,
  Video,
  Calendar,
  HardDrive,
  Loader2
} from "lucide-react";

interface MediaFile {
  id: string;
  name: string;
  created_at: string;
  metadata: {
    size: number;
    mimetype?: string;
  };
  publicUrl: string;
}

interface MediaGridProps {
  userId: string;
  onMediaChange?: () => void;
}

export default function MediaGrid({ userId, onMediaChange }: MediaGridProps) {
  const { toast } = useToast();
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);

  const loadMediaFiles = async () => {
    setIsLoading(true);
    try {
      const { data: files, error } = await supabase.storage
        .from('business-photos')
        .list(userId, {
          limit: 100,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) throw error;

      if (!files || files.length === 0) {
        setMediaFiles([]);
        setIsLoading(false);
        return;
      }

      // Get public URLs for all files
      const mediaWithUrls: MediaFile[] = files.map(file => {
        const { data: urlData } = supabase.storage
          .from('business-photos')
          .getPublicUrl(`${userId}/${file.name}`);
        
        return {
          id: file.id || file.name,
          name: file.name,
          created_at: file.created_at || new Date().toISOString(),
          metadata: file.metadata || { size: 0 },
          publicUrl: urlData.publicUrl
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

  const deleteFile = async (fileName: string) => {
    setDeleteLoading(fileName);
    try {
      const { error } = await supabase.storage
        .from('business-photos')
        .remove([`${userId}/${fileName}`]);

      if (error) throw error;

      // Remove from local state
      setMediaFiles(prev => prev.filter(file => file.name !== fileName));
      setSelectedMedia(null);
      onMediaChange?.();

      toast({
        title: "File deleted",
        description: `${fileName} has been removed.`
      });
    } catch (error: any) {
      toast({
        title: "Error deleting file",
        description: error.message || "Failed to delete the file.",
        variant: "destructive"
      });
    } finally {
      setDeleteLoading(null);
    }
  };

  const downloadFile = async (file: MediaFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('business-photos')
        .download(`${userId}/${file.name}`);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download started",
        description: `${file.name} is being downloaded.`
      });
    } catch (error: any) {
      toast({
        title: "Error downloading file",
        description: error.message || "Failed to download the file.",
        variant: "destructive"
      });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isVideoFile = (fileName: string): boolean => {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm'];
    return videoExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading media...</span>
      </div>
    );
  }

  if (mediaFiles.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No media files</h3>
        <p className="text-muted-foreground text-sm">
          Upload some images or videos to get started with your campaigns.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {mediaFiles.map((file) => (
          <Card key={file.id} className="group overflow-hidden">
            <div className="aspect-square bg-muted relative overflow-hidden">
              {isVideoFile(file.name) ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Video className="h-8 w-8 text-muted-foreground" />
                  <video 
                    src={file.publicUrl}
                    className="absolute inset-0 w-full h-full object-cover"
                    muted
                  />
                </div>
              ) : (
                <img 
                  src={file.publicUrl}
                  alt={file.name}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              )}
              
              {/* Overlay with actions */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Dialog open={selectedMedia?.id === file.id} onOpenChange={(open) => setSelectedMedia(open ? file : null)}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="secondary">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                </Dialog>

                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={() => downloadFile(file)}
                >
                  <Download className="h-4 w-4" />
                </Button>

                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => deleteFile(file.name)}
                  disabled={deleteLoading === file.name}
                >
                  {deleteLoading === file.name ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* File type badge */}
              <div className="absolute top-2 right-2">
                <Badge variant="secondary" className="text-xs">
                  {isVideoFile(file.name) ? (
                    <><Video className="h-3 w-3 mr-1" /> Video</>
                  ) : (
                    <><ImageIcon className="h-3 w-3 mr-1" /> Image</>
                  )}
                </Badge>
              </div>
            </div>

            <CardContent className="p-3">
              <p className="text-sm font-medium truncate" title={file.name}>
                {file.name}
              </p>
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                <div className="flex items-center gap-1">
                  <HardDrive className="h-3 w-3" />
                  {formatFileSize(file.metadata.size)}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(file.created_at)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Preview dialog */}
      <Dialog open={!!selectedMedia} onOpenChange={(open) => setSelectedMedia(open ? selectedMedia : null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="truncate">{selectedMedia?.name}</DialogTitle>
          </DialogHeader>
          
          {selectedMedia && (
            <div className="space-y-4">
              <div className="max-h-[60vh] overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                {isVideoFile(selectedMedia.name) ? (
                  <video 
                    src={selectedMedia.publicUrl}
                    controls
                    className="max-w-full max-h-full"
                  />
                ) : (
                  <img 
                    src={selectedMedia.publicUrl}
                    alt={selectedMedia.name}
                    className="max-w-full max-h-full object-contain"
                  />
                )}
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <div className="space-y-1">
                  <p><span className="font-medium">Size:</span> {formatFileSize(selectedMedia.metadata.size)}</p>
                  <p><span className="font-medium">Uploaded:</span> {formatDate(selectedMedia.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    onClick={() => downloadFile(selectedMedia)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={() => deleteFile(selectedMedia.name)}
                    disabled={deleteLoading === selectedMedia.name}
                  >
                    {deleteLoading === selectedMedia.name ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
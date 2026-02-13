import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import MediaUpload from "./MediaUpload";
import MediaGrid from "./MediaGrid";
import { Image as ImageIcon, Video, HardDrive } from "lucide-react";

interface MediaManagerProps {
  userId: string;
}

interface StorageStats {
  totalFiles: number;
  totalSize: number;
  imageCount: number;
  videoCount: number;
}

export default function MediaManager({ userId }: MediaManagerProps) {
  const [stats, setStats] = useState<StorageStats>({
    totalFiles: 0,
    totalSize: 0,
    imageCount: 0,
    videoCount: 0
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const loadStats = async () => {
    try {
      const { data: files, error } = await supabase.storage
        .from('business-photos')
        .list(userId, { limit: 1000 });

      if (error) throw error;

      if (!files || files.length === 0) {
        setStats({ totalFiles: 0, totalSize: 0, imageCount: 0, videoCount: 0 });
        return;
      }

      const videoExtensions = ['.mp4', '.mov', '.avi', '.webm'];
      
      let totalSize = 0;
      let imageCount = 0;
      let videoCount = 0;

      files.forEach(file => {
        totalSize += file.metadata?.size || 0;
        
        const isVideo = videoExtensions.some(ext => 
          file.name.toLowerCase().endsWith(ext)
        );
        
        if (isVideo) {
          videoCount++;
        } else {
          imageCount++;
        }
      });

      setStats({
        totalFiles: files.length,
        totalSize,
        imageCount,
        videoCount
      });
    } catch (error) {
      console.error('Error loading storage stats:', error);
    }
  };

  useEffect(() => {
    if (userId) {
      loadStats();
    }
  }, [userId, refreshTrigger]);

  const handleMediaChange = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Storage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Files</p>
              <p className="text-2xl font-bold">{stats.totalFiles}</p>
            </div>
            <HardDrive className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Images</p>
              <p className="text-2xl font-bold">{stats.imageCount}</p>
            </div>
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Videos</p>
              <p className="text-2xl font-bold">{stats.videoCount}</p>
            </div>
            <Video className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Storage Used</p>
              <p className="text-2xl font-bold">{formatFileSize(stats.totalSize)}</p>
            </div>
            <div className="text-xs text-muted-foreground">
              of 1GB free
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Media</CardTitle>
          <CardDescription>
            Upload images and videos for your ad campaigns. Supported formats: JPG, PNG, WebP, MP4, MOV.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MediaUpload 
            userId={userId} 
            onUploadComplete={handleMediaChange}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* Media Library */}
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Media Library</h3>
          <p className="text-sm text-muted-foreground">
            Manage your uploaded images and videos
          </p>
        </div>
        
        <MediaGrid 
          userId={userId} 
          onMediaChange={handleMediaChange}
        />
      </div>
    </div>
  );
}
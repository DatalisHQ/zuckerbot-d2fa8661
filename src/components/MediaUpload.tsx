import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { Upload, X, AlertCircle } from "lucide-react";

interface MediaUploadProps {
  onUploadComplete: () => void;
  userId: string;
}

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  error?: string;
  success?: boolean;
}

const ACCEPTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp'];
const ACCEPTED_VIDEO_TYPES = ['.mp4', '.mov'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

export default function MediaUpload({ onUploadComplete, userId }: MediaUploadProps) {
  const { toast } = useToast();
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const validateFile = (file: File): string | null => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isImage = ACCEPTED_IMAGE_TYPES.includes(extension);
    const isVideo = ACCEPTED_VIDEO_TYPES.includes(extension);

    if (!isImage && !isVideo) {
      return `Unsupported file type: ${extension}. Supported: ${[...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(', ')}`;
    }

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      return `Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 5MB`;
    }

    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      return `Video too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 50MB`;
    }

    return null;
  };

  const uploadFile = async (uploadFile: UploadFile): Promise<void> => {
    const { file } = uploadFile;
    const fileName = `${Date.now()}-${file.name}`;
    const filePath = `${userId}/${fileName}`;

    try {
      // Upload to Supabase storage
      const { error } = await supabase.storage
        .from('business-photos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Mark as successful
      setUploads(prev => prev.map(u => 
        u.id === uploadFile.id 
          ? { ...u, progress: 100, success: true }
          : u
      ));

    } catch (error: any) {
      setUploads(prev => prev.map(u => 
        u.id === uploadFile.id 
          ? { ...u, error: error.message || 'Upload failed' }
          : u
      ));
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // Validate all files first
    const validatedFiles: UploadFile[] = [];
    
    for (const file of acceptedFiles) {
      const error = validateFile(file);
      const uploadFile: UploadFile = {
        id: Math.random().toString(36).substr(2, 9),
        file,
        progress: 0,
        error
      };
      validatedFiles.push(uploadFile);
    }

    setUploads(validatedFiles);

    // Only upload valid files
    const validFiles = validatedFiles.filter(f => !f.error);
    if (validFiles.length === 0) return;

    setIsUploading(true);

    try {
      // Upload files sequentially to avoid overwhelming the server
      for (const uploadFile of validFiles) {
        setUploads(prev => prev.map(u => 
          u.id === uploadFile.id ? { ...u, progress: 50 } : u
        ));
        await uploadFile(uploadFile);
      }

      // Clear successful uploads after a delay
      setTimeout(() => {
        setUploads(prev => prev.filter(u => !u.success));
        onUploadComplete();
      }, 1500);

      const successCount = validFiles.length;
      toast({
        title: `${successCount} file${successCount > 1 ? 's' : ''} uploaded successfully`,
        description: "Your media is now available for campaigns."
      });

    } finally {
      setIsUploading(false);
    }
  }, [userId, onUploadComplete, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ACCEPTED_IMAGE_TYPES,
      'video/*': ACCEPTED_VIDEO_TYPES
    },
    maxFiles: 10,
    multiple: true
  });

  const removeUpload = (id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <Card 
        {...getRootProps()}
        className={`p-8 border-2 border-dashed transition-colors cursor-pointer ${
          isDragActive 
            ? 'border-primary bg-primary/5' 
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center text-center space-y-2">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {isDragActive 
                ? "Drop files here..." 
                : "Drag & drop media files here, or click to select"
              }
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Images: JPG, PNG, WebP (max 5MB) • Videos: MP4, MOV (max 50MB)
            </p>
          </div>
        </div>
      </Card>

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Uploading files</h4>
          {uploads.map((upload) => (
            <div key={upload.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{upload.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(upload.file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                {upload.error ? (
                  <div className="flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-xs">{upload.error}</span>
                  </div>
                ) : upload.success ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <span className="text-xs">✓ Uploaded</span>
                  </div>
                ) : (
                  <div className="w-20">
                    <Progress value={upload.progress} className="h-1" />
                  </div>
                )}
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeUpload(upload.id)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
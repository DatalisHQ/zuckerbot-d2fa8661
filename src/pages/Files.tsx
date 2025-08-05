import { useState, useEffect } from "react";
import { Upload, FileText, Download, Trash2, Search, File, Image, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOnboardingGuard } from "@/hooks/useOnboardingGuard";

interface FileItem {
  id: string;
  name: string;
  bucket_id: string;
  created_at: string;
  updated_at: string;
  metadata: {
    size?: number;
    mimetype?: string;
    [key: string]: any;
  };
}

export default function Files() {
  useOnboardingGuard();
  
  const [files, setFiles] = useState<FileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUser(user);

      const { data, error } = await supabase.storage
        .from('user-files')
        .list(`${user.id}/`, {
          limit: 100,
          offset: 0,
        });

      if (error) throw error;
      
      const filesWithMetadata = data?.map(file => ({
        ...file,
        id: file.name,
        bucket_id: 'user-files',
        created_at: file.created_at || new Date().toISOString(),
        updated_at: file.updated_at || new Date().toISOString(),
        metadata: {
          size: file.metadata?.size || 0,
          mimetype: file.metadata?.mimetype || 'application/octet-stream',
          ...file.metadata
        }
      })) || [];

      setFiles(filesWithMetadata);
    } catch (error: any) {
      toast({
        title: "Error loading files",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('user-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      toast({
        title: "File uploaded successfully",
        description: `${file.name} has been uploaded to your library.`,
      });

      // Refresh the files list
      fetchFiles();
    } catch (error: any) {
      toast({
        title: "Error uploading file",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      // Reset the input
      event.target.value = '';
    }
  };

  const downloadFile = async (fileName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.storage
        .from('user-files')
        .download(`${user.id}/${fileName}`);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Error downloading file",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteFile = async (fileName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.storage
        .from('user-files')
        .remove([`${user.id}/${fileName}`]);

      if (error) throw error;

      setFiles(prev => prev.filter(file => file.name !== fileName));
      toast({
        title: "File deleted",
        description: "The file has been removed from your library.",
      });
    } catch (error: any) {
      toast({
        title: "Error deleting file",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (mimetype?: string) => {
    if (!mimetype) return File;
    if (mimetype.startsWith('image/')) return Image;
    if (mimetype.startsWith('video/')) return Video;
    return File;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">File Library</h1>
          <p className="text-muted-foreground">
            Upload and manage files for your ZuckerBot conversations
          </p>
        </div>
        <div className="relative">
          <Input
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
            id="file-upload"
          />
          <Button asChild disabled={uploading}>
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? "Uploading..." : "Upload File"}
            </label>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Files Grid */}
      {filteredFiles.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? "No files found" : "No files uploaded yet"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery 
                ? "Try adjusting your search terms" 
                : "Upload your first file to start building your library"
              }
            </p>
            <div className="relative inline-block">
              <Input
                type="file"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
                id="file-upload-empty"
              />
              <Button asChild disabled={uploading}>
                <label htmlFor="file-upload-empty" className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload First File
                </label>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFiles.map((file) => {
            const FileIcon = getFileIcon(file.metadata.mimetype);
            return (
              <Card key={file.id} className="group hover:shadow-lg transition-all duration-200">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileIcon className="w-8 h-8 text-primary flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm truncate">{file.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {formatFileSize(file.metadata?.size || 0)}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="text-xs">
                      {file.metadata?.mimetype?.split('/')[0] || 'unknown'}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {new Date(file.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => downloadFile(file.name)}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteFile(file.name)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  
                  {/* Use in Campaign Button for image/video files */}
                  {file.metadata?.mimetype?.startsWith('image/') || file.metadata?.mimetype?.startsWith('video/') ? (
                    <Button
                      size="sm"
                      variant="default"
                      className="w-full mt-2"
                      onClick={() => {
                        // Store file info in localStorage for campaign workflow to pick up
                        const fileInfo = {
                          id: file.id,
                          name: file.name,
                          url: `https://wrjqevcpxkfvfudbmdhp.supabase.co/storage/v1/object/public/user-files/${encodeURIComponent(currentUser?.id || '')}/${encodeURIComponent(file.name)}`,
                          type: 'upload'
                        };
                        localStorage.setItem('pendingCampaignFile', JSON.stringify(fileInfo));
                        
                        // Check if there's an active campaign workflow
                        const currentCampaignId = localStorage.getItem('currentCampaignId');
                        if (currentCampaignId) {
                          window.location.href = `/campaign-flow?id=${currentCampaignId}&step=3`;
                        } else {
                          toast({
                            title: "File ready for campaign",
                            description: "This file will be automatically added when you create a new campaign.",
                          });
                        }
                      }}
                    >
                      <Image className="w-3 h-3 mr-1" />
                      Use in Campaign
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Globe,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

const API_BASE =
  (import.meta.env.VITE_API_V1_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  `${window.location.origin}/api/v1`;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface BusinessContextUpload {
  id: string;
  filename: string;
  file_type: string;
  uploaded_at: string;
  summary: string | null;
  context_type: string | null;
  extracted_data: Record<string, unknown> | null;
}

interface BusinessContextManagerProps {
  business: {
    id: string;
    name: string;
    website: string | null;
    website_url?: string | null;
    web_context?: Record<string, any> | null;
    web_context_updated_at?: string | null;
  };
  userId: string;
  onBusinessContextUpdated?: (next: {
    web_context: Record<string, any> | null;
    web_context_updated_at: string | null;
  }) => void;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString();
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  return session.access_token;
}

export default function BusinessContextManager({
  business,
  userId,
  onBusinessContextUpdated,
}: BusinessContextManagerProps) {
  const { toast } = useToast();
  const [uploads, setUploads] = useState<BusinessContextUpload[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(true);
  const [refreshingWebContext, setRefreshingWebContext] = useState(false);
  const [processingUploadIds, setProcessingUploadIds] = useState<string[]>([]);
  const [webContext, setWebContext] = useState<Record<string, any> | null>(
    business.web_context || null
  );
  const [webContextUpdatedAt, setWebContextUpdatedAt] = useState<string | null>(
    business.web_context_updated_at || null
  );

  useEffect(() => {
    setWebContext(business.web_context || null);
    setWebContextUpdatedAt(business.web_context_updated_at || null);
  }, [business.web_context, business.web_context_updated_at]);

  const website = business.website_url || business.website;
  const hasWebsite = Boolean(website);
  const targetAudience = useMemo(() => {
    return Array.isArray(webContext?.target_audience)
      ? (webContext.target_audience as string[]).slice(0, 4)
      : [];
  }, [webContext]);

  const apiRequest = useCallback(
    async (path: string, init?: RequestInit) => {
      const accessToken = await getAccessToken();
      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      });

      const payload = await response
        .json()
        .catch(() => ({ error: { message: "Unexpected response from server." } }));

      if (!response.ok) {
        throw new Error(payload?.error?.message || "Request failed.");
      }

      return payload;
    },
    []
  );

  const loadUploads = useCallback(async () => {
    setLoadingUploads(true);
    try {
      const payload = await apiRequest(`/businesses/${business.id}/uploads`, {
        method: "GET",
      });
      setUploads(Array.isArray(payload?.uploads) ? payload.uploads : []);
    } catch (error: any) {
      toast({
        title: "Unable to load uploads",
        description: error?.message || "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoadingUploads(false);
    }
  }, [apiRequest, business.id, toast]);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads]);

  const handleRefreshWebContext = useCallback(async () => {
    if (!hasWebsite) {
      toast({
        title: "Website required",
        description: "Add a website before refreshing web context.",
        variant: "destructive",
      });
      return;
    }

    setRefreshingWebContext(true);
    try {
      const payload = await apiRequest(`/businesses/${business.id}/enrich`, {
        method: "POST",
        body: JSON.stringify({
          url: website,
          force_refresh: true,
        }),
      });

      const nextContext = payload?.web_context || null;
      const nextUpdatedAt = nextContext?.scraped_at || new Date().toISOString();
      setWebContext(nextContext);
      setWebContextUpdatedAt(nextUpdatedAt);
      onBusinessContextUpdated?.({
        web_context: nextContext,
        web_context_updated_at: nextUpdatedAt,
      });

      toast({
        title: "Business context refreshed",
        description: "Latest website context is now available for campaign planning.",
      });
    } catch (error: any) {
      toast({
        title: "Refresh failed",
        description: error?.message || "Unable to refresh business context.",
        variant: "destructive",
      });
    } finally {
      setRefreshingWebContext(false);
    }
  }, [apiRequest, business.id, hasWebsite, onBusinessContextUpdated, toast, website]);

  const uploadFile = useCallback(
    async (file: File) => {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (!["csv", "pdf", "txt", "md", "markdown"].includes(extension)) {
        throw new Error(`Unsupported file type: ${file.name}`);
      }
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(`${file.name} is larger than 10MB.`);
      }

      const processingId = `${file.name}-${Date.now()}`;
      setProcessingUploadIds((prev) => [...prev, processingId]);

      try {
        const filePath = `${userId}/business-context/${business.id}/${Date.now()}-${sanitizeFilename(file.name)}`;
        const uploadResult = await supabase.storage
          .from("user-files")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || undefined,
          });

        if (uploadResult.error) throw uploadResult.error;

        const payload = await apiRequest(`/businesses/${business.id}/uploads`, {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            file_path: filePath,
            file_type: file.type || undefined,
            file_size_bytes: file.size,
          }),
        });

        if (payload?.upload) {
          setUploads((prev) => [payload.upload, ...prev.filter((item) => item.id !== payload.upload.id)]);
        }
      } finally {
        setProcessingUploadIds((prev) => prev.filter((id) => id !== processingId));
      }
    },
    [apiRequest, business.id, userId]
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      try {
        for (const file of acceptedFiles) {
          await uploadFile(file);
        }
        toast({
          title: "Uploads processed",
          description: "Business context files are now available to campaign intelligence.",
        });
      } catch (error: any) {
        toast({
          title: "Upload failed",
          description: error?.message || "Unable to process the selected file.",
          variant: "destructive",
        });
        await loadUploads();
      }
    },
    [loadUploads, toast, uploadFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxFiles: 10,
    accept: {
      "application/pdf": [".pdf"],
      "text/csv": [".csv"],
      "text/plain": [".txt"],
      "text/markdown": [".md", ".markdown"],
    },
  });

  const handleDelete = useCallback(
    async (uploadId: string) => {
      try {
        await apiRequest(`/businesses/${business.id}/uploads/${uploadId}`, {
          method: "DELETE",
        });
        setUploads((prev) => prev.filter((upload) => upload.id !== uploadId));
        toast({
          title: "Upload removed",
          description: "The context file has been deleted.",
        });
      } catch (error: any) {
        toast({
          title: "Delete failed",
          description: error?.message || "Unable to delete the context file.",
          variant: "destructive",
        });
      }
    },
    [apiRequest, business.id, toast]
  );

  const handleReExtract = useCallback(
    async (uploadId: string) => {
      setProcessingUploadIds((prev) => [...prev, uploadId]);
      try {
        const payload = await apiRequest(
          `/businesses/${business.id}/uploads/${uploadId}/re-extract`,
          {
            method: "POST",
          }
        );
        if (payload?.upload) {
          setUploads((prev) =>
            prev.map((upload) =>
              upload.id === uploadId ? payload.upload : upload
            )
          );
        }
        toast({
          title: "Extraction refreshed",
          description: "The uploaded file was re-processed successfully.",
        });
      } catch (error: any) {
        toast({
          title: "Re-extract failed",
          description: error?.message || "Unable to re-process this file.",
          variant: "destructive",
        });
      } finally {
        setProcessingUploadIds((prev) => prev.filter((id) => id !== uploadId));
      }
    },
    [apiRequest, business.id, toast]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Context Enrichment</CardTitle>
        <CardDescription>
          Website context and uploaded files that the intelligence planner can use.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-border/60 p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Web context</p>
                {webContext ? (
                  <Badge variant="secondary">Ready</Badge>
                ) : (
                  <Badge variant="outline">Missing</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {hasWebsite
                  ? `${website} • Last refreshed ${formatTimestamp(webContextUpdatedAt)}`
                  : "Add a website to unlock automatic context enrichment."}
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleRefreshWebContext}
              disabled={!hasWebsite || refreshingWebContext}
            >
              {refreshingWebContext ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>

          {webContext ? (
            <div className="space-y-2 text-sm">
              {webContext.description ? (
                <p className="text-muted-foreground">{webContext.description}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {(targetAudience.length > 0 ? targetAudience : [webContext.business_type || business.name]).map(
                  (item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  )
                )}
              </div>
              {Array.isArray(webContext.value_props) && webContext.value_props.length > 0 ? (
                <p className="text-muted-foreground">
                  Top value prop: <span className="text-foreground">{webContext.value_props[0]}</span>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              Campaign planning is currently using only business basics, market data, and any uploaded files.
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Upload supporting context</p>
            <p className="text-sm text-muted-foreground">
              CSV, PDF, TXT, or Markdown files. Examples: brand guidelines, past ad results, customer segments, competitor notes.
            </p>
          </div>

          <div
            {...getRootProps()}
            className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border/60 hover:border-primary/50"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">
              {isDragActive ? "Drop files here" : "Drag files here or click to upload"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              CSV, PDF, TXT, MD up to 10MB
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Uploaded context</p>
            {loadingUploads ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>

          {uploads.length === 0 && !loadingUploads ? (
            <div className="rounded-lg border border-border/60 p-4 text-sm text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              No uploaded context yet.
            </div>
          ) : null}

          <div className="space-y-3">
            {uploads.map((upload) => {
              const isProcessing = processingUploadIds.includes(upload.id);
              return (
                <div
                  key={upload.id}
                  className="rounded-lg border border-border/60 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{upload.filename}</p>
                        {upload.context_type ? (
                          <Badge variant="secondary">{upload.context_type}</Badge>
                        ) : null}
                        {isProcessing ? (
                          <Badge variant="outline">Processing</Badge>
                        ) : (
                          <Badge variant="outline">Ready</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Uploaded {formatTimestamp(upload.uploaded_at)}
                      </p>
                      {upload.summary ? (
                        <p className="text-sm text-muted-foreground">{upload.summary}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleReExtract(upload.id)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(upload.id)}
                        disabled={isProcessing}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {processingUploadIds.length > 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            Processing {processingUploadIds.length} upload{processingUploadIds.length > 1 ? "s" : ""}.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

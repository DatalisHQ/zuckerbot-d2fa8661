import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe,
  Upload,
  Sparkles,
  ArrowRight,
  X,
  AlertCircle,
  ThumbsUp,
  MessageCircle,
  Share2,
  ImageIcon,
  Lock,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdPreview {
  image_base64: string;
  headline: string;
  copy: string;
}

interface PreviewResult {
  business_name: string;
  description: string;
  ads: AdPreview[];
}

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FUNCTION_URL =
  "https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/generate-preview";

const LOADING_MESSAGES = [
  "AI is analyzing your business...",
  "Crafting your ad creatives...",
  "Generating eye-catching designs...",
  "Writing compelling ad copy...",
  "Almost there...",
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function TryItNow({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState(false);

  // Cycle loading messages
  const startLoadingMessages = () => {
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % LOADING_MESSAGES.length;
      setLoadingMessage(LOADING_MESSAGES[idx]);
    }, 2500);
    return interval;
  };

  // Generate preview from URL
  const handleUrlSubmit = async () => {
    if (!url.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setScrapeError(false);
    const msgInterval = startLoadingMessages();

    try {
      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "scrape_failed") {
          setScrapeError(true);
          setError(data.message);
        } else {
          setError(data.error || "Something went wrong. Please try again.");
        }
        return;
      }

      setResult(data);
    } catch (err) {
      setError("Network error. Please check your connection and try again.");
    } finally {
      clearInterval(msgInterval);
      setIsLoading(false);
    }
  };

  // Generate preview from uploaded photos
  const handlePhotoSubmit = async () => {
    if (uploadedFiles.length === 0) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setScrapeError(false);
    const msgInterval = startLoadingMessages();

    try {
      // Convert files to base64
      const base64Images = await Promise.all(
        uploadedFiles.map(
          (uf) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                // Strip the data:image/...;base64, prefix
                const base64 = result.split(",")[1];
                resolve(base64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(uf.file);
            })
        )
      );

      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: base64Images }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setResult(data);
    } catch (err) {
      setError("Network error. Please check your connection and try again.");
    } finally {
      clearInterval(msgInterval);
      setIsLoading(false);
    }
  };

  // Dropzone for photo upload
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const remaining = 3 - uploadedFiles.length;
      const filesToAdd = acceptedFiles.slice(0, remaining);

      const newFiles: UploadedFile[] = filesToAdd.map((file) => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file),
      }));

      setUploadedFiles((prev) => [...prev, ...newFiles]);
    },
    [uploadedFiles.length]
  );

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp"] },
    maxFiles: 3,
    maxSize: 5 * 1024 * 1024,
    disabled: uploadedFiles.length >= 3,
  });

  const reset = () => {
    setResult(null);
    setError(null);
    setScrapeError(false);
    setUrl("");
    setUploadedFiles([]);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <section className={compact ? "" : "container mx-auto px-4 sm:px-6 py-20"}>
      <div className={compact ? "" : "max-w-4xl mx-auto"}>
        {/* Header — hidden in compact mode (hero provides it) */}
        {!compact && (
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              Free preview — no signup required
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              See what AI ads look like for{" "}
              <span className="text-primary">YOUR</span> business
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Enter your website or upload a few photos. Our AI will generate
              real Facebook ad creatives in seconds.
            </p>
          </div>
        )}

        {/* ── Results ────────────────────────────────────────────────────── */}
        {result ? (
          <ResultsWithGate
            result={result}
            url={url}
            onSignup={() => navigate("/auth")}
            onReset={reset}
          />
        ) : (
          /* ── Input form ──────────────────────────────────────────────── */
          <Card className="border-2">
            <CardContent className="pt-6 pb-6 px-6">
              <Tabs defaultValue="url" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="url" className="gap-2">
                    <Globe className="w-4 h-4" />
                    Enter your website URL
                  </TabsTrigger>
                  <TabsTrigger value="photos" className="gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Upload photos
                  </TabsTrigger>
                </TabsList>

                {/* URL tab */}
                <TabsContent value="url" className="space-y-4">
                  <div className="flex gap-3">
                    <Input
                      type="url"
                      placeholder="www.yourbusiness.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                      disabled={isLoading}
                      className="text-base h-12"
                    />
                    <Button
                      size="lg"
                      onClick={handleUrlSubmit}
                      disabled={isLoading || !url.trim()}
                      className="shrink-0 h-12 px-6"
                    >
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
                          Generating...
                        </span>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate My Ads
                        </>
                      )}
                    </Button>
                  </div>

                  {scrapeError && (
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                      <AlertCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                          We couldn't read your website
                        </p>
                        <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                          Some websites block automated access. Try uploading
                          photos of your business instead — the results are
                          just as good!
                        </p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Photos tab */}
                <TabsContent value="photos" className="space-y-4">
                  <div
                    {...getRootProps()}
                    className={`p-8 border-2 border-dashed rounded-lg transition-colors cursor-pointer text-center ${
                      isDragActive
                        ? "border-primary bg-primary/5"
                        : uploadedFiles.length >= 3
                        ? "border-muted opacity-50 cursor-not-allowed"
                        : "border-muted-foreground/25 hover:border-muted-foreground/50"
                    }`}
                  >
                    <input {...getInputProps()} />
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium">
                      {isDragActive
                        ? "Drop photos here..."
                        : uploadedFiles.length >= 3
                        ? "Maximum 3 photos"
                        : "Drag & drop photos here, or click to select"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG, WebP (max 5MB each) • Up to 3 photos
                    </p>
                  </div>

                  {/* Preview thumbnails */}
                  {uploadedFiles.length > 0 && (
                    <div className="flex gap-3">
                      {uploadedFiles.map((uf) => (
                        <div key={uf.id} className="relative group">
                          <img
                            src={uf.preview}
                            alt="Preview"
                            className="w-20 h-20 rounded-lg object-cover border"
                          />
                          <button
                            onClick={() => removeFile(uf.id)}
                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    size="lg"
                    onClick={handlePhotoSubmit}
                    disabled={isLoading || uploadedFiles.length === 0}
                    className="w-full h-12"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
                        Generating...
                      </span>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate My Ads
                      </>
                    )}
                  </Button>
                </TabsContent>
              </Tabs>

              {/* Loading state */}
              {isLoading && (
                <div className="mt-8 space-y-6">
                  <div className="text-center">
                    <p className="text-sm font-medium text-primary animate-pulse">
                      {loadingMessage}
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-6">
                    {[0, 1].map((i) => (
                      <div key={i} className="space-y-3">
                        <Skeleton className="w-full aspect-square rounded-lg" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-5/6" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generic error */}
              {error && !scrapeError && (
                <div className="mt-4 flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

// ─── Results with Blur Gate ───────────────────────────────────────────────────

function ResultsWithGate({
  result,
  url,
  onSignup,
  onReset,
}: {
  result: PreviewResult;
  url: string;
  onSignup: () => void;
  onReset: () => void;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const firstAd = result.ads[0];
  const restAds = result.ads.slice(1);

  return (
    <div className="space-y-8">
      {/* Business info */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Showing AI-generated ads for
        </p>
        <h3 className="text-2xl font-bold">{result.business_name}</h3>
      </div>

      {/* First ad — always visible */}
      <div className="grid sm:grid-cols-2 gap-6">
        {firstAd && (
          <FacebookAdCard ad={firstAd} businessName={result.business_name} />
        )}

        {/* Second ad — blurred or visible */}
        {restAds[0] && (
          unlocked ? (
            <FacebookAdCard ad={restAds[0]} businessName={result.business_name} />
          ) : (
            <div className="relative">
              <div className="blur-[8px] pointer-events-none select-none">
                <FacebookAdCard ad={restAds[0]} businessName={result.business_name} />
              </div>
              {/* Overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[2px] rounded-lg">
                <div className="text-center space-y-2 px-4">
                  <Lock className="w-8 h-8 mx-auto text-primary" />
                  <p className="font-semibold text-lg">1 more ad creative</p>
                  <p className="text-sm text-muted-foreground">
                    Enter your email below to unlock
                  </p>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Email capture — between ads and CTA */}
      {!unlocked ? (
        <EmailCapture
          businessName={result.business_name}
          url={url}
          onSignup={onSignup}
          onUnlock={() => setUnlocked(true)}
        />
      ) : (
        <div className="text-center space-y-4 pt-4">
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl p-6">
            <p className="text-lg font-semibold text-green-800 dark:text-green-200">
              📬 Check your inbox — a full strategy brief is on the way
            </p>
            <p className="text-sm text-green-600 dark:text-green-400 mt-2">
              Includes audience personas, campaign structure, budget recs & ROI projections.
            </p>
          </div>
          <Button
            size="lg"
            className="text-lg px-10 py-7 shadow-lg hover:shadow-xl transition-shadow"
            onClick={onSignup}
          >
            Start Free Trial — Go Live in 60 Seconds
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <p className="text-sm text-muted-foreground">
            $49/mo after trial · Cancel anytime
          </p>
        </div>
      )}

      <div className="text-center">
        <Button variant="ghost" onClick={onReset}>
          Try another business
        </Button>
      </div>
    </div>
  );
}

// ─── Email Capture Component ─────────────────────────────────────────────────

const BRIEF_FUNCTION_URL =
  "https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/send-preview-brief";

function EmailCapture({
  businessName,
  url,
  onSignup,
  onUnlock,
}: {
  businessName: string;
  url: string;
  onSignup: () => void;
  onUnlock?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleSendBrief = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setSending(true);
    setEmailError(null);

    try {
      const response = await fetch(BRIEF_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, url, business_name: businessName }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setEmailError(data.error || "Failed to send. Please try again.");
        return;
      }

      setSent(true);
      onUnlock?.();
    } catch {
      setEmailError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-primary/5 border-2 border-primary/20 rounded-2xl p-8 space-y-5">
      <h3 className="text-2xl font-bold">
        Unlock all your ads + get a free strategy brief
      </h3>
      <p className="text-lg text-muted-foreground max-w-md mx-auto">
        See your second ad creative and get a detailed marketing strategy for{" "}
        <strong className="text-foreground">{businessName}</strong> —
        audience personas, campaign structure, budget recs and ROI projections. Free.
      </p>
      <div className="flex gap-3 max-w-md mx-auto">
        <Input
          type="email"
          placeholder="you@yourbusiness.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendBrief()}
          disabled={sending}
          className="text-base h-12"
        />
        <Button
          size="lg"
          onClick={handleSendBrief}
          disabled={sending || !email.trim()}
          className="shrink-0 h-12 px-6"
        >
          {sending ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
            </span>
          ) : (
            "Unlock & Send Brief"
          )}
        </Button>
      </div>
      {emailError && (
        <p className="text-sm text-destructive">{emailError}</p>
      )}
      <div className="pt-2">
        <p className="text-xs text-muted-foreground">
          Or{" "}
          <button
            className="text-primary underline hover:no-underline cursor-pointer"
            onClick={onSignup}
          >
            skip straight to your free trial
          </button>{" "}
          and launch these ads now. $49/mo after trial.
        </p>
      </div>
    </div>
  );
}

// ─── Facebook Ad Preview Card ────────────────────────────────────────────────

function FacebookAdCard({
  ad,
  businessName,
}: {
  ad: AdPreview;
  businessName: string;
}) {
  return (
    <Card className="overflow-hidden border-2 hover:shadow-lg transition-shadow">
      {/* Facebook post header */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
          {businessName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold">{businessName}</p>
          <p className="text-xs text-muted-foreground">
            Sponsored · 🌏
          </p>
        </div>
      </div>

      {/* Ad copy (primary text) */}
      <div className="px-4 pb-3">
        <p className="text-sm leading-relaxed">{ad.copy}</p>
      </div>

      {/* Ad image */}
      <div className="relative">
        <img
          src={`data:image/png;base64,${ad.image_base64}`}
          alt="AI-generated ad creative"
          className="w-full aspect-square object-cover"
        />
      </div>

      {/* Headline bar */}
      <div className="px-4 py-3 bg-muted/30 border-t">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {businessName.toLowerCase().replace(/\s+/g, "") + ".com"}
        </p>
        <p className="font-semibold text-sm mt-0.5">{ad.headline}</p>
      </div>

      {/* Facebook action bar */}
      <div className="px-4 py-2.5 border-t flex items-center justify-around text-muted-foreground">
        <button className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors">
          <ThumbsUp className="w-4 h-4" />
          Like
        </button>
        <button className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors">
          <MessageCircle className="w-4 h-4" />
          Comment
        </button>
        <button className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors">
          <Share2 className="w-4 h-4" />
          Share
        </button>
      </div>
    </Card>
  );
}

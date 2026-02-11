import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  Wrench,
  MapPin,
  Camera,
  ChevronLeft,
  ChevronRight,
  Check,
  ChevronsUpDown,
  Upload,
  X,
  ImagePlus,
  LogOut,
} from "lucide-react";
import { useEnhancedAuth, validateSession } from "@/utils/auth";
import { cn } from "@/lib/utils";

// ─── Constants ───────────────────────────────────────────────────────────────

const TRADES = [
  "Plumber",
  "Electrician",
  "Carpenter",
  "Landscaper",
  "Cleaner",
  "Painter",
  "Roofer",
  "Fencer",
  "Concreter",
  "Tiler",
  "Bricklayer",
  "HVAC/Air Con",
  "Pest Control",
  "Pool Maintenance",
  "Handyman",
] as const;

const STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"] as const;

const STEPS = [
  { label: "Your Trade", icon: Wrench },
  { label: "Location", icon: MapPin },
  { label: "Photos", icon: Camera },
] as const;

const MAX_PHOTOS = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// ─── Types ───────────────────────────────────────────────────────────────────

interface PhotoFile {
  file: File;
  preview: string;
  id: string;
}

interface BusinessForm {
  trade: string;
  customTrade: string;
  businessName: string;
  suburb: string;
  postcode: string;
  state: string;
  phone: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

const Onboarding = () => {
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<BusinessForm>({
    trade: "",
    customTrade: "",
    businessName: "",
    suburb: "",
    postcode: "",
    state: "",
    phone: "",
  });

  const navigate = useNavigate();
  const { toast } = useToast();
  const { logout } = useEnhancedAuth();

  // ── Auth check ─────────────────────────────────────────────────────────

  useEffect(() => {
    const checkUser = async () => {
      const { user, isValid } = await validateSession();
      if (!isValid || !user) {
        navigate("/auth");
        return;
      }
      setUserId(user.id);

      // Check if user already has a business profile → skip to dashboard
      const { data: business } = await (supabase as any)
        .from("businesses")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (business) {
        navigate("/campaign/new");
        return;
      }
    };
    checkUser();
  }, [navigate]);

  // ── Cleanup photo previews on unmount ──────────────────────────────────

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
    };
  }, [photos]);

  // ── Form helpers ───────────────────────────────────────────────────────

  const updateForm = useCallback(
    (field: keyof BusinessForm, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const effectiveTrade =
    form.trade === "Other" ? form.customTrade.trim() : form.trade;

  const isStep1Valid = effectiveTrade.length > 0 && form.businessName.trim().length > 0;
  const isStep2Valid =
    form.suburb.trim().length > 0 &&
    form.postcode.trim().length >= 4 &&
    form.state.length > 0 &&
    form.phone.trim().length >= 8;

  // ── Photo handling ─────────────────────────────────────────────────────

  const handlePhotoSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const remaining = MAX_PHOTOS - photos.length;
      const selected = Array.from(files).slice(0, remaining);

      const invalid = selected.filter((f) => f.size > MAX_FILE_SIZE);
      if (invalid.length > 0) {
        toast({
          title: "File too large",
          description: "Each photo must be under 5MB.",
          variant: "destructive",
        });
      }

      const valid = selected.filter((f) => f.size <= MAX_FILE_SIZE);
      const newPhotos: PhotoFile[] = valid.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        id: crypto.randomUUID(),
      }));

      setPhotos((prev) => [...prev, ...newPhotos].slice(0, MAX_PHOTOS));

      // Reset input so re-selecting the same file works
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [photos.length, toast]
  );

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  // ── Drag & Drop ────────────────────────────────────────────────────────

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (!files) return;

      const remaining = MAX_PHOTOS - photos.length;
      const selected = Array.from(files)
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, remaining);

      const invalid = selected.filter((f) => f.size > MAX_FILE_SIZE);
      if (invalid.length > 0) {
        toast({
          title: "File too large",
          description: "Each photo must be under 5MB.",
          variant: "destructive",
        });
      }

      const valid = selected.filter((f) => f.size <= MAX_FILE_SIZE);
      const newPhotos: PhotoFile[] = valid.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        id: crypto.randomUUID(),
      }));

      setPhotos((prev) => [...prev, ...newPhotos].slice(0, MAX_PHOTOS));
    },
    [photos.length, toast]
  );

  // ── Save & Submit ──────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!userId) return;
    setIsSaving(true);

    try {
      // 1. Upload photos to Supabase Storage
      const photoUrls: string[] = [];

      for (const photo of photos) {
        const ext = photo.file.name.split(".").pop() || "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("business-photos")
          .upload(path, photo.file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          console.error("Photo upload failed:", uploadError);
          continue; // Don't block onboarding for a failed photo upload
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("business-photos").getPublicUrl(path);

        photoUrls.push(publicUrl);
      }

      // 2. Insert business profile
      const { error: insertError } = await (supabase as any)
        .from("businesses")
        .insert({
          user_id: userId,
          name: form.businessName.trim(),
          trade: effectiveTrade.toLowerCase(),
          suburb: form.suburb.trim(),
          postcode: form.postcode.trim(),
          state: form.state,
          phone: form.phone.trim(),
        });

      if (insertError) {
        throw new Error(insertError.message);
      }

      // 3. Upsert profiles row to mark onboarding completed
      try {
        await supabase
          .from("profiles")
          .upsert({
            user_id: userId,
            email: (await supabase.auth.getUser()).data.user?.email || null,
            full_name: null,
            business_name: form.businessName,
            onboarding_completed: true,
            facebook_connected: false,
          }, { onConflict: "user_id" });
      } catch {
        // profiles table may not exist in v2 — that's fine
      }

      toast({
        title: "You're all set! 🎉",
        description: "Let's create your first ad campaign.",
      });

      navigate("/campaign/new");
    } catch (error: any) {
      console.error("Onboarding save error:", error);
      toast({
        title: "Something went wrong",
        description:
          error.message ||
          "Couldn't save your business profile. Give it another crack.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Navigation ─────────────────────────────────────────────────────────

  const canGoNext =
    (step === 0 && isStep1Valid) ||
    (step === 1 && isStep2Valid) ||
    step === 2;

  const goNext = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const handleSignOut = () => {
    logout(navigate, false);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const progressValue = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Wrench className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">Zuckerbot</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-lg">
        {/* Progress */}
        <div className="mb-8 space-y-3">
          <div className="flex justify-between text-sm text-muted-foreground">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === step;
              const isDone = i < step;
              return (
                <div
                  key={s.label}
                  className={cn(
                    "flex items-center gap-1.5 transition-colors",
                    isActive && "text-primary font-medium",
                    isDone && "text-primary"
                  )}
                >
                  {isDone ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              );
            })}
          </div>
          <Progress value={progressValue} className="h-2" />
        </div>

        {/* ── Step 1: Trade ─────────────────────────────────────────────── */}
        {step === 0 && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">What's your trade?</h2>
                <p className="text-muted-foreground">
                  Tell us what you do — we'll tailor your ads to suit.
                </p>
              </div>

              {/* Trade selector (searchable combobox) */}
              <div className="space-y-2">
                <Label>Trade</Label>
                <Popover open={tradeOpen} onOpenChange={setTradeOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={tradeOpen}
                      className="w-full justify-between font-normal"
                    >
                      {form.trade || "Select your trade…"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                      <CommandInput placeholder="Search trades…" />
                      <CommandList>
                        <CommandEmpty>No trade found.</CommandEmpty>
                        <CommandGroup>
                          {TRADES.map((t) => (
                            <CommandItem
                              key={t}
                              value={t}
                              onSelect={() => {
                                updateForm("trade", t);
                                setTradeOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  form.trade === t
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              {t}
                            </CommandItem>
                          ))}
                          <CommandItem
                            value="Other"
                            onSelect={() => {
                              updateForm("trade", "Other");
                              setTradeOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                form.trade === "Other"
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            Other
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Custom trade input (only if "Other") */}
              {form.trade === "Other" && (
                <div className="space-y-2">
                  <Label htmlFor="customTrade">What do you do?</Label>
                  <Input
                    id="customTrade"
                    placeholder="e.g. Solar installer"
                    value={form.customTrade}
                    onChange={(e) => updateForm("customTrade", e.target.value)}
                    autoFocus
                  />
                </div>
              )}

              {/* Business name */}
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  placeholder="e.g. Dave's Plumbing"
                  value={form.businessName}
                  onChange={(e) => updateForm("businessName", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Location ──────────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Where do you work?</h2>
                <p className="text-muted-foreground">
                  We'll target your ads to people nearby.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="suburb">Suburb</Label>
                <Input
                  id="suburb"
                  placeholder="e.g. Paddington"
                  value={form.suburb}
                  onChange={(e) => updateForm("suburb", e.target.value)}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>State</Label>
                  <Select
                    value={form.state}
                    onValueChange={(v) => updateForm("state", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="postcode">Postcode</Label>
                  <Input
                    id="postcode"
                    placeholder="4000"
                    value={form.postcode}
                    onChange={(e) =>
                      updateForm(
                        "postcode",
                        e.target.value.replace(/\D/g, "").slice(0, 4)
                      )
                    }
                    inputMode="numeric"
                    maxLength={4}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  placeholder="04XX XXX XXX"
                  value={form.phone}
                  onChange={(e) => updateForm("phone", e.target.value)}
                  type="tel"
                  inputMode="tel"
                />
                <p className="text-xs text-muted-foreground">
                  We'll use this for lead notifications.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Photos ────────────────────────────────────────────── */}
        {step === 2 && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Show off your work</h2>
                <p className="text-muted-foreground">
                  Upload 1–3 photos of your best jobs. These will be used in
                  your Facebook ads.
                </p>
              </div>

              {/* Drop zone */}
              {photos.length < MAX_PHOTOS && (
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50"
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <ImagePlus className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Drag photos here or click to browse
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        JPG, PNG, or WebP — max 5MB each
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Photo previews */}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative group aspect-square">
                      <img
                        src={photo.preview}
                        alt="Upload preview"
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove photo"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                {photos.length}/{MAX_PHOTOS} photos added
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Navigation buttons ────────────────────────────────────────── */}
        <div className="flex items-center justify-between mt-6 gap-4">
          {step > 0 ? (
            <Button variant="outline" onClick={goBack} disabled={isSaving}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          ) : (
            <div /> /* spacer */
          )}

          {step < STEPS.length - 1 ? (
            <Button onClick={goNext} disabled={!canGoNext}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <div className="flex gap-3">
              {photos.length === 0 && (
                <Button
                  variant="ghost"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  Skip photos
                </Button>
              )}
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save & Continue
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Onboarding;

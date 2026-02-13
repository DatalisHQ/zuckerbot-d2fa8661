import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { trackFunnelEvent, trackPageView } from "@/utils/analytics";
import { mpFunnel } from "@/lib/mixpanel";
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
  Building,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Check,
  ChevronsUpDown,
  LogOut,
  Globe,
} from "lucide-react";
import { useEnhancedAuth, validateSession } from "@/utils/auth";
import { cn } from "@/lib/utils";

// ─── Constants ───────────────────────────────────────────────────────────────

const BUSINESS_TYPES = [
  "Restaurant / Café",
  "Gym / Fitness",
  "Beauty / Salon",
  "Dental / Medical",
  "Real Estate",
  "Retail / E-commerce",
  "Professional Services",
  "Trades / Home Services",
  "Health & Wellness",
  "Education / Tutoring",
  "Automotive",
] as const;

/** Business types that default to "local" targeting */
const LOCAL_BUSINESS_TYPES = new Set([
  "Restaurant / Café",
  "Gym / Fitness",
  "Beauty / Salon",
  "Dental / Medical",
  "Real Estate",
  "Trades / Home Services",
  "Health & Wellness",
  "Automotive",
  "Education / Tutoring",
]);

/** Business types that default to "online" targeting */
const ONLINE_BUSINESS_TYPES = new Set([
  "Retail / E-commerce",
  "Professional Services",
]);

const AU_STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"] as const;

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

const UK_REGIONS = ["England", "Scotland", "Wales", "Northern Ireland"] as const;

const CA_PROVINCES = [
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
] as const;

const COUNTRIES = [
  "Australia",
  "United States",
  "United Kingdom",
  "Canada",
  "Other",
] as const;

const PHONE_HINTS: Record<string, string> = {
  Australia: "04XX XXX XXX",
  "United States": "(555) 123-4567",
  "United Kingdom": "07XXX XXXXXX",
  Canada: "(555) 123-4567",
  Other: "+X XXX XXX XXXX",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type TargetType = "local" | "online";

interface BusinessForm {
  trade: string;
  customTrade: string;
  businessName: string;
  websiteUrl: string;
  phone: string;
  country: string;
  targetType: TargetType;
  suburb: string;
  postcode: string;
  state: string;
  targetRadiusKm: number;
  targetRegions: string[];
}

// ─── Component ───────────────────────────────────────────────────────────────

const Onboarding = () => {
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [form, setForm] = useState<BusinessForm>({
    trade: "",
    customTrade: "",
    businessName: "",
    websiteUrl: "",
    phone: "",
    country: "",
    targetType: "local",
    suburb: "",
    postcode: "",
    state: "",
    targetRadiusKm: 25,
    targetRegions: [],
  });

  const navigate = useNavigate();
  const { toast } = useToast();
  const { logout } = useEnhancedAuth();

  // ── Auth check ─────────────────────────────────────────────────────────

  useEffect(() => {
    // Track page view
    trackFunnelEvent.viewOnboarding();
    trackPageView("/onboarding", "ZuckerBot — Business Setup");
    mpFunnel.startOnboarding();

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

  // ── Form helpers ───────────────────────────────────────────────────────

  const updateForm = useCallback(
    <K extends keyof BusinessForm>(field: K, value: BusinessForm[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const effectiveTrade =
    form.trade === "Other" ? form.customTrade.trim() : form.trade;

  // Determine whether the selected business type naturally defaults to local or online
  const isNaturallyLocal = LOCAL_BUSINESS_TYPES.has(form.trade);
  const isNaturallyOnline = ONLINE_BUSINESS_TYPES.has(form.trade);

  // When business type changes, auto-set target type
  useEffect(() => {
    if (isNaturallyOnline) {
      updateForm("targetType", "online");
    } else if (isNaturallyLocal) {
      updateForm("targetType", "local");
    }
  }, [form.trade, isNaturallyLocal, isNaturallyOnline, updateForm]);

  // Determine total steps: always 2 (step 1 = business info, step 2 = target area)
  const totalSteps = 2;

  // Step definitions for the progress bar
  const stepDefs = [
    { label: "Your Business", icon: Building },
    { label: "Target Area", icon: MapPin },
  ];

  // ── Validation ─────────────────────────────────────────────────────────

  const isStep1Valid =
    effectiveTrade.length > 0 &&
    form.businessName.trim().length > 0 &&
    form.phone.trim().length >= 8 &&
    form.country.length > 0;

  const isStep2Valid =
    form.targetType === "online" ||
    (form.targetType === "local" &&
      form.suburb.trim().length > 0 &&
      form.postcode.trim().length >= 3 &&
      form.state.length > 0);

  // ── Region toggle helpers ──────────────────────────────────────────────

  const toggleRegion = (state: string) => {
    setForm((prev) => {
      const regions = prev.targetRegions.includes(state)
        ? prev.targetRegions.filter((r) => r !== state)
        : [...prev.targetRegions, state];
      return { ...prev, targetRegions: regions };
    });
  };

  const currentRegions =
    form.country === "United States"
      ? [...US_STATES]
      : form.country === "United Kingdom"
      ? [...UK_REGIONS]
      : form.country === "Canada"
      ? [...CA_PROVINCES]
      : [...AU_STATES];

  const allRegionsSelected = currentRegions.length > 0 && form.targetRegions.length === currentRegions.length;

  const toggleAllRegions = () => {
    if (allRegionsSelected) {
      updateForm("targetRegions", []);
    } else {
      updateForm("targetRegions", currentRegions);
    }
  };

  // ── Save & Submit ──────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!userId) return;
    setIsSaving(true);

    try {
      // Build the insert payload
      const insertData: Record<string, any> = {
        user_id: userId,
        name: form.businessName.trim(),
        trade: effectiveTrade.toLowerCase(),
        phone: form.phone.trim(),
        website_url: form.websiteUrl.trim() || null,
        country: form.country || "Australia",
        target_type: form.targetType,
        target_radius_km: form.targetType === "local" ? form.targetRadiusKm : null,
      };

      if (form.targetType === "local") {
        insertData.suburb = form.suburb.trim();
        insertData.postcode = form.postcode.trim();
        insertData.state = form.state;
      }

      const { error: insertError } = await (supabase as any)
        .from("businesses")
        .insert(insertData);

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Upsert profiles row to mark onboarding completed
      try {
        await supabase.from("profiles").upsert(
          {
            user_id: userId,
            email:
              (await supabase.auth.getUser()).data.user?.email || null,
            full_name: null,
            business_name: form.businessName,
            onboarding_completed: true,
            facebook_connected: false,
          },
          { onConflict: "user_id" }
        );
      } catch {
        // profiles table may not exist in v2 — that's fine
      }

      // Track onboarding completion
      const tradeName =
        form.trade === "Other" ? form.customTrade : form.trade;
      trackFunnelEvent.completeOnboarding(
        tradeName,
        form.suburb || "online",
        form.businessName
      );
      mpFunnel.completeOnboarding({
        user_id: userId,
        business_type: tradeName,
        location: form.suburb || "online",
        business_name: form.businessName,
      });

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

  const canGoNext = step === 0 && isStep1Valid;

  const goNext = () => {
    if (step < totalSteps - 1) setStep((s) => s + 1);
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const handleSignOut = () => {
    logout(navigate, false);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const progressValue = ((step + 1) / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Building className="h-4 w-4 text-primary-foreground" />
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
            {stepDefs.map((s, i) => {
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

        {/* ── Step 1: About Your Business ───────────────────────────────── */}
        {step === 0 && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">
                  Tell us about your business
                </h2>
                <p className="text-muted-foreground">
                  We'll use this to tailor your ad campaigns.
                </p>
              </div>

              {/* Trade selector (searchable combobox) */}
              <div className="space-y-2">
                <Label>Business type</Label>
                <Popover open={tradeOpen} onOpenChange={setTradeOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={tradeOpen}
                      className="w-full justify-between font-normal"
                    >
                      {form.trade || "Select your business type…"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                      <CommandInput placeholder="Search business types…" />
                      <CommandList>
                        <CommandEmpty>No business type found.</CommandEmpty>
                        <CommandGroup>
                          {BUSINESS_TYPES.map((t) => (
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
                  <Label htmlFor="customTrade">
                    What does your business do?
                  </Label>
                  <Input
                    id="customTrade"
                    placeholder="e.g. Solar installation, Dog walking"
                    value={form.customTrade}
                    onChange={(e) => updateForm("customTrade", e.target.value)}
                    autoFocus
                  />
                </div>
              )}

              {/* Business name */}
              <div className="space-y-2">
                <Label htmlFor="businessName">Business name</Label>
                <Input
                  id="businessName"
                  placeholder="e.g. Bright Spark Solar"
                  value={form.businessName}
                  onChange={(e) => updateForm("businessName", e.target.value)}
                />
              </div>

              {/* Country */}
              <div className="space-y-2">
                <Label>Country</Label>
                <Select
                  value={form.country}
                  onValueChange={(v) => {
                    updateForm("country", v);
                    updateForm("state", "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your country…" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Website URL */}
              <div className="space-y-2">
                <Label htmlFor="websiteUrl">
                  Website URL{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="websiteUrl"
                  placeholder="https://yourbusiness.com"
                  value={form.websiteUrl}
                  onChange={(e) => updateForm("websiteUrl", e.target.value)}
                  type="url"
                  inputMode="url"
                />
                <p className="text-xs text-muted-foreground">
                  We'll use this to tailor your ads and landing pages.
                </p>
              </div>

              {/* Phone number */}
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  placeholder={PHONE_HINTS[form.country] || "Your phone number"}
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

        {/* ── Step 2: Target Area ───────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">
                  Where are your customers?
                </h2>
                <p className="text-muted-foreground">
                  Help us target the right audience for your business.
                </p>
              </div>

              {/* Target type toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">
                    {form.targetType === "local"
                      ? "My business serves a specific area"
                      : "My business serves customers anywhere"}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {form.targetType === "local"
                      ? "We'll target ads to people near you"
                      : "We'll target ads across your selected regions"}
                  </p>
                </div>
                <Switch
                  checked={form.targetType === "online"}
                  onCheckedChange={(checked) =>
                    updateForm("targetType", checked ? "online" : "local")
                  }
                />
              </div>

              {/* LOCAL: suburb/city, state, postcode/zip, radius */}
              {form.targetType === "local" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="suburb">
                      {form.country === "United States" ? "City" : "Suburb / City"}
                    </Label>
                    <Input
                      id="suburb"
                      placeholder={
                        form.country === "United States"
                          ? "e.g. Austin"
                          : form.country === "United Kingdom"
                          ? "e.g. Manchester"
                          : "e.g. Paddington"
                      }
                      value={form.suburb}
                      onChange={(e) => updateForm("suburb", e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>
                        {form.country === "United States"
                          ? "State"
                          : form.country === "United Kingdom"
                          ? "Region"
                          : form.country === "Canada"
                          ? "Province"
                          : "State / Province"}
                      </Label>
                      {form.country === "Australia" ? (
                        <Select
                          value={form.state}
                          onValueChange={(v) => updateForm("state", v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="State" />
                          </SelectTrigger>
                          <SelectContent>
                            {AU_STATES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : form.country === "United States" ? (
                        <Select
                          value={form.state}
                          onValueChange={(v) => updateForm("state", v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="State" />
                          </SelectTrigger>
                          <SelectContent>
                            {US_STATES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : form.country === "United Kingdom" ? (
                        <Select
                          value={form.state}
                          onValueChange={(v) => updateForm("state", v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Region" />
                          </SelectTrigger>
                          <SelectContent>
                            {UK_REGIONS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : form.country === "Canada" ? (
                        <Select
                          value={form.state}
                          onValueChange={(v) => updateForm("state", v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Province" />
                          </SelectTrigger>
                          <SelectContent>
                            {CA_PROVINCES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          placeholder="State / Province"
                          value={form.state}
                          onChange={(e) => updateForm("state", e.target.value)}
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="postcode">
                        {form.country === "United States" ? "Zip code" : "Postcode"}
                      </Label>
                      <Input
                        id="postcode"
                        placeholder={
                          form.country === "United States"
                            ? "90210"
                            : form.country === "United Kingdom"
                            ? "SW1A 1AA"
                            : form.country === "Canada"
                            ? "K1A 0A6"
                            : "4000"
                        }
                        value={form.postcode}
                        onChange={(e) => {
                          if (form.country === "United States") {
                            updateForm("postcode", e.target.value.replace(/\D/g, "").slice(0, 5));
                          } else if (form.country === "United Kingdom" || form.country === "Canada") {
                            updateForm("postcode", e.target.value.slice(0, 7));
                          } else {
                            updateForm("postcode", e.target.value.replace(/\D/g, "").slice(0, 4));
                          }
                        }}
                        inputMode={form.country === "United Kingdom" || form.country === "Canada" ? "text" : "numeric"}
                        maxLength={form.country === "United States" ? 5 : form.country === "United Kingdom" || form.country === "Canada" ? 7 : 4}
                      />
                    </div>
                  </div>

                  {/* Radius slider */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Target radius</Label>
                      <span className="text-sm font-medium text-primary">
                        {form.country === "United States"
                          ? `${Math.round(form.targetRadiusKm * 0.621)} mi`
                          : `${form.targetRadiusKm} km`}
                      </span>
                    </div>
                    <Slider
                      value={[form.targetRadiusKm]}
                      onValueChange={([val]) =>
                        updateForm("targetRadiusKm", val)
                      }
                      min={10}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{form.country === "United States" ? "6 mi" : "10 km"}</span>
                      <span>{form.country === "United States" ? "62 mi" : "100 km"}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ONLINE: target regions */}
              {form.targetType === "online" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <Label>Target regions</Label>
                  </div>

                  {/* Select all toggle */}
                  <button
                    type="button"
                    onClick={toggleAllRegions}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left text-sm transition-colors",
                      allRegionsSelected
                        ? "border-primary bg-primary/5 text-primary"
                        : "hover:border-primary/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {form.country === "United States"
                          ? "All of United States"
                          : form.country === "United Kingdom"
                          ? "All of United Kingdom"
                          : form.country === "Canada"
                          ? "All of Canada"
                          : "All regions"}
                      </span>
                      {allRegionsSelected && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </button>

                  {/* Individual region chips */}
                  <div className="grid grid-cols-4 gap-2">
                    {(form.country === "United States"
                      ? [...US_STATES]
                      : form.country === "United Kingdom"
                      ? [...UK_REGIONS]
                      : form.country === "Canada"
                      ? [...CA_PROVINCES]
                      : [...AU_STATES]
                    ).map((s) => {
                      const isSelected = form.targetRegions.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleRegion(s)}
                          className={cn(
                            "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                            isSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "hover:border-primary/50"
                          )}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>

                  {form.targetRegions.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Select at least one region
                    </p>
                  )}
                </div>
              )}
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

          {step === 0 ? (
            <Button onClick={goNext} disabled={!canGoNext}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={isSaving || !isStep2Valid}
            >
              {isSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save & Continue
            </Button>
          )}
        </div>
      </main>
    </div>
  );
};

export default Onboarding;

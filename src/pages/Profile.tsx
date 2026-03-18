import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Mail,
  Building,
  MapPin,
  Phone,
  Calendar,
  Edit,
  Save,
  X,
  Facebook,
  Image as ImageIcon,
  Globe,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import MediaManager from "@/components/MediaManager";

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface ProfileData {
  user_id: string;
  email: string | null;
  full_name: string | null;
  business_name: string | null;
  onboarding_completed: boolean;
  facebook_connected: boolean;
  created_at: string;
}

interface Business {
  id: string;
  name: string;
  trade: string;
  suburb: string;
  postcode: string;
  state: string;
  phone: string;
  website: string | null;
  facebook_access_token: string | null;
  facebook_page_id: string | null;
  facebook_ad_account_id: string | null;
  meta_pixel_id: string | null;
  currency: string;
  markets: string[];
}

interface PortfolioTier {
  tier: string;
  budget_pct: number;
  target_cpa_multiplier: number;
  description?: string;
}

const META_STANDARD_EVENT_OPTIONS = [
  "Lead",
  "Contact",
  "InitiateCheckout",
  "Purchase",
  "CompleteRegistration",
  "Schedule",
  "StartTrial",
  "Subscribe",
] as const;

const DEFAULT_EVENT_MAPPING = {
  lead: { meta_event: "Lead", value: 0 },
  marketingqualifiedlead: { meta_event: "Lead", value: 0 },
  salesqualifiedlead: { meta_event: "Contact", value: 0 },
  opportunity: { meta_event: "InitiateCheckout", value: 0 },
  customer: { meta_event: "Purchase", value: 0 },
} as const;

interface FacebookPageOption {
  id: string;
  name: string;
}

interface FacebookAdAccountOption {
  id: string;
  account_id: string | null;
  name: string;
  account_status: number | null;
  currency: string | null;
  business_name: string | null;
  amount_spent: string | null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Profile() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    business_name: "",
    trade: "",
    suburb: "",
    postcode: "",
    state: "",
    website: "",
    meta_pixel_id: "",
    currency: "USD",
    markets: "",
    target_cpa_cents: 5000,
    max_daily_budget_cents: 10000,
    crm_source: "hubspot",
    optimise_for: "lead",
    evaluation_frequency_hours: 4,
    capi_lookback_days: 30,
    min_spend_before_evaluation_cents: 500,
    portfolio_name: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [availableAdAccounts, setAvailableAdAccounts] = useState<FacebookAdAccountOption[]>([]);
  const [selectedAdAccountId, setSelectedAdAccountId] = useState("");
  const [showAdAccountSelector, setShowAdAccountSelector] = useState(false);
  const [isLoadingAdAccounts, setIsLoadingAdAccounts] = useState(false);
  const [isUpdatingAdAccount, setIsUpdatingAdAccount] = useState(false);
  const [availablePages, setAvailablePages] = useState<FacebookPageOption[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isUpdatingPage, setIsUpdatingPage] = useState(false);
  const [capiConfig, setCapiConfig] = useState<any>(null);
  const [autonomousPolicy, setAutonomousPolicy] = useState<any>(null);
  const [audiencePortfolio, setAudiencePortfolio] = useState<any>(null);
  const [portfolioTiers, setPortfolioTiers] = useState<PortfolioTier[]>([]);
  const [eventMapping, setEventMapping] = useState<Record<string, { meta_event: string; value: number }>>({
    ...DEFAULT_EVENT_MAPPING,
  });

  useEffect(() => {
    fetchData();

    // Check for Facebook OAuth callback results in URL params
    const params = new URLSearchParams(window.location.search);
    const fbError = params.get("fb_error");
    const fbConnected = params.get("fb_connected");
    const fbDetail = params.get("detail");

    if (fbError) {
      toast({
        title: "Facebook connection failed",
        description: `Error: ${fbError}${fbDetail ? ` — ${fbDetail}` : ""}`,
        variant: "destructive",
      });
      // Clean URL
      window.history.replaceState({}, "", "/profile");
    } else if (fbConnected === "true") {
      toast({
        title: "Facebook connected! ✅",
        description: "Your Facebook account has been linked successfully.",
      });
      window.history.replaceState({}, "", "/profile");
    }
  }, []);

  const updatePortfolioTier = (
    tierName: string,
    field: keyof PortfolioTier,
    value: string | number
  ) => {
    setPortfolioTiers((prev) =>
      prev.map((tier) =>
        tier.tier === tierName
          ? {
              ...tier,
              [field]:
                field === "description"
                  ? String(value)
                  : Number(value),
            }
          : tier
      )
    );
  };

  const updateEventMappingField = (
    stage: string,
    field: "meta_event" | "value",
    value: string | number
  ) => {
    setEventMapping((prev) => ({
      ...prev,
      [stage]: {
        ...prev[stage],
        [field]: field === "value" ? Number(value) : String(value),
      },
    }));
  };

  const fetchData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      setCurrentUser(user);

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData as unknown as ProfileData);
        setFormData((prev) => ({
          ...prev,
          full_name: profileData.full_name || "",
        }));
      }

      // Fetch business
      const { data: bizData } = await supabase
        .from("businesses" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (bizData) {
        const biz = bizData as unknown as Business;
        setBusiness(biz);
        setFormData((prev) => ({
          ...prev,
          phone: biz.phone || "",
          business_name: biz.name || "",
          trade: biz.trade || "",
          suburb: biz.suburb || "",
          postcode: biz.postcode || "",
          state: biz.state || "",
          website: biz.website || "",
          meta_pixel_id: biz.meta_pixel_id || "",
          currency: biz.currency || "USD",
          markets: Array.isArray(biz.markets) ? biz.markets.join(", ") : "",
        }));

        if (biz.facebook_access_token) {
          await loadFacebookAdAccounts({
            userId: user.id,
            openSelector: !biz.facebook_ad_account_id,
            silent: true,
          });
          if (biz.facebook_ad_account_id || biz.facebook_page_id) {
            await loadFacebookPages({
              userId: user.id,
              openSelector: !biz.facebook_page_id,
              requireSelection: !biz.facebook_page_id,
              silent: true,
            });
          }
        }

        const [capiResult, policyResult, portfolioResult] = await Promise.all([
          (supabase as any)
            .from("capi_configs")
            .select("*")
            .eq("business_id", biz.id)
            .maybeSingle(),
          (supabase as any)
            .from("autonomous_policies")
            .select("*")
            .eq("business_id", biz.id)
            .maybeSingle(),
          (supabase as any)
            .from("audience_portfolios")
            .select("*")
            .eq("business_id", biz.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);

        if (capiResult.data) {
          setCapiConfig(capiResult.data);
          setEventMapping(
            (capiResult.data.event_mapping as Record<string, { meta_event: string; value: number }>) ||
              { ...DEFAULT_EVENT_MAPPING }
          );
          setFormData((prev) => ({
            ...prev,
            crm_source: capiResult.data.crm_source || "hubspot",
            optimise_for: capiResult.data.optimise_for || prev.optimise_for,
          }));
        }

        if (policyResult.data) {
          setAutonomousPolicy(policyResult.data);
          setFormData((prev) => ({
            ...prev,
            target_cpa_cents: policyResult.data.target_cpa_cents || Math.round((policyResult.data.target_cpa || 50) * 100),
            max_daily_budget_cents:
              policyResult.data.max_daily_budget_cents || Math.round((policyResult.data.max_daily_budget || 100) * 100),
            optimise_for: policyResult.data.optimise_for || prev.optimise_for,
            evaluation_frequency_hours: policyResult.data.evaluation_frequency_hours || 4,
            capi_lookback_days: policyResult.data.capi_lookback_days || 30,
            min_spend_before_evaluation_cents:
              policyResult.data.min_spend_before_evaluation_cents || 500,
          }));
        }

        if (portfolioResult.data) {
          setAudiencePortfolio(portfolioResult.data);
          setPortfolioTiers((portfolioResult.data.tiers as PortfolioTier[]) || []);
          setFormData((prev) => ({
            ...prev,
            portfolio_name: portfolioResult.data.name || "",
          }));
        }
      }
    } catch (error: any) {
      toast({
        title: "Error loading profile",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setIsSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update profile name
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: formData.full_name })
        .eq("user_id", user.id);

      if (profileError) throw profileError;

      // Update business details if business exists
      if (business) {
        const markets = formData.markets
          .split(",")
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean);
        const bizUpdate: Record<string, string | string[] | null> = {
          phone: formData.phone,
          currency: formData.currency.trim().toUpperCase() || "USD",
          markets,
        };
        if (formData.business_name.trim()) bizUpdate.name = formData.business_name.trim();
        if (formData.trade.trim()) bizUpdate.trade = formData.trade.trim();
        if (formData.suburb.trim()) bizUpdate.suburb = formData.suburb.trim();
        if (formData.postcode.trim()) bizUpdate.postcode = formData.postcode.trim();
        if (formData.state.trim()) bizUpdate.state = formData.state.trim();
        bizUpdate.website = formData.website.trim() || null;
        bizUpdate.meta_pixel_id = formData.meta_pixel_id.trim() || null;

        const { error: bizError } = await supabase
          .from("businesses" as any)
          .update(bizUpdate as any)
          .eq("user_id", user.id);

        if (bizError) throw bizError;

        const [capiResult, policyResult] = await Promise.all([
          (supabase as any).from("capi_configs").upsert(
            {
              business_id: business.id,
              user_id: user.id,
              is_enabled: capiConfig?.is_enabled ?? false,
              event_mapping: eventMapping,
              currency: formData.currency.trim().toUpperCase() || "USD",
              crm_source: formData.crm_source.trim().toLowerCase() || "hubspot",
              optimise_for: formData.optimise_for,
              webhook_secret: capiConfig?.webhook_secret,
            },
            { onConflict: "business_id" }
          ),
          (supabase as any).from("autonomous_policies").upsert(
            {
              business_id: business.id,
              user_id: user.id,
              enabled: autonomousPolicy?.enabled ?? true,
              target_cpa: Number(formData.target_cpa_cents) / 100,
              target_cpa_cents: Number(formData.target_cpa_cents),
              pause_multiplier: autonomousPolicy?.pause_multiplier ?? 2.5,
              scale_multiplier: autonomousPolicy?.scale_multiplier ?? 0.7,
              frequency_cap: autonomousPolicy?.frequency_cap ?? 3.5,
              max_daily_budget: Number(formData.max_daily_budget_cents) / 100,
              max_daily_budget_cents: Number(formData.max_daily_budget_cents),
              scale_pct: autonomousPolicy?.scale_pct ?? 0.2,
              min_conversions_to_scale: autonomousPolicy?.min_conversions_to_scale ?? 3,
              optimise_for: formData.optimise_for,
              capi_lookback_days: Number(formData.capi_lookback_days),
              min_spend_before_evaluation_cents: Number(formData.min_spend_before_evaluation_cents),
              evaluation_frequency_hours: Number(formData.evaluation_frequency_hours),
            },
            { onConflict: "business_id" }
          ),
        ]);

        if (capiResult.error) throw capiResult.error;
        if (policyResult.error) throw policyResult.error;

        if (portfolioTiers.length > 0) {
          const portfolioPayload = {
            business_id: business.id,
            user_id: user.id,
            name: formData.portfolio_name.trim() || audiencePortfolio?.name || `${formData.business_name || business.name} Portfolio`,
            total_daily_budget_cents: Number(formData.max_daily_budget_cents),
            tiers: portfolioTiers,
            is_active: audiencePortfolio?.is_active ?? true,
          };

          const portfolioQuery = audiencePortfolio
            ? (supabase as any)
                .from("audience_portfolios")
                .update(portfolioPayload)
                .eq("id", audiencePortfolio.id)
            : (supabase as any).from("audience_portfolios").insert(portfolioPayload);

          const { data: savedPortfolio, error: portfolioError } = await portfolioQuery
            .select("*")
            .single();

          if (portfolioError) throw portfolioError;
          setAudiencePortfolio(savedPortfolio);
        }

        setBusiness((prev) =>
          prev
            ? {
                ...prev,
                phone: formData.phone,
                name: formData.business_name.trim() || prev.name,
                trade: formData.trade.trim() || prev.trade,
                suburb: formData.suburb.trim() || prev.suburb,
                postcode: formData.postcode.trim() || prev.postcode,
                state: formData.state.trim() || prev.state,
                website: formData.website.trim() || null,
                meta_pixel_id: formData.meta_pixel_id.trim() || null,
                currency: formData.currency.trim().toUpperCase() || prev.currency,
                markets,
              }
            : null
        );
      }

      setProfile((prev) =>
        prev ? { ...prev, full_name: formData.full_name } : null
      );
      setCapiConfig((prev: any) => ({
        ...(prev || {}),
        business_id: business?.id,
        user_id: user.id,
        is_enabled: prev?.is_enabled ?? false,
        event_mapping: eventMapping,
        currency: formData.currency.trim().toUpperCase() || "USD",
        crm_source: formData.crm_source.trim().toLowerCase() || "hubspot",
        optimise_for: formData.optimise_for,
        webhook_secret: prev?.webhook_secret || null,
      }));
      setAutonomousPolicy((prev: any) => ({
        ...(prev || {}),
        business_id: business?.id,
        user_id: user.id,
        target_cpa_cents: Number(formData.target_cpa_cents),
        max_daily_budget_cents: Number(formData.max_daily_budget_cents),
        optimise_for: formData.optimise_for,
        evaluation_frequency_hours: Number(formData.evaluation_frequency_hours),
        capi_lookback_days: Number(formData.capi_lookback_days),
        min_spend_before_evaluation_cents: Number(formData.min_spend_before_evaluation_cents),
      }));
      setEditMode(false);

      toast({ title: "Profile updated" });
    } catch (error: any) {
      toast({
        title: "Error saving",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const loadFacebookAdAccounts = async ({
    userId = currentUser?.id,
    openSelector = true,
    silent = false,
  }: {
    userId?: string;
    openSelector?: boolean;
    silent?: boolean;
  } = {}) => {
    setIsLoadingAdAccounts(true);

    try {
      if (!userId) throw new Error("Not authenticated");

      const { data: biz, error: bizError } = await supabase
        .from("businesses" as any)
        .select("facebook_access_token, facebook_ad_account_id")
        .eq("user_id", userId)
        .single();

      if (bizError) throw bizError;
      if (!biz?.facebook_access_token) {
        throw new Error("No Facebook access token found. Reconnect Facebook first.");
      }

      const adAccountsRes = await fetch(
        `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_id,account_status,currency,business_name,amount_spent&limit=100&access_token=${encodeURIComponent(
          biz.facebook_access_token
        )}`
      );
      const adAccountsData = await adAccountsRes.json();

      if (!adAccountsRes.ok) {
        throw new Error(
          adAccountsData?.error?.message || "Failed to fetch Meta ad accounts."
        );
      }

      const adAccounts: FacebookAdAccountOption[] = Array.isArray(adAccountsData?.data)
        ? adAccountsData.data
            .filter(
              (account: any) =>
                typeof account?.id === "string" &&
                typeof account?.name === "string"
            )
            .map((account: any) => ({
              id: account.id,
              account_id:
                typeof account?.account_id === "string"
                  ? account.account_id
                  : null,
              name: account.name,
              account_status:
                typeof account?.account_status === "number"
                  ? account.account_status
                  : null,
              currency:
                typeof account?.currency === "string"
                  ? account.currency
                  : null,
              business_name:
                typeof account?.business_name === "string"
                  ? account.business_name
                  : null,
              amount_spent:
                typeof account?.amount_spent === "string"
                  ? account.amount_spent
                  : typeof account?.amount_spent === "number"
                  ? String(account.amount_spent)
                  : null,
            }))
        : [];

      if (adAccounts.length === 0) {
        throw new Error("No Meta ad accounts found for this account.");
      }

      const currentAdAccountId =
        adAccounts.find((account) => account.id === biz.facebook_ad_account_id)?.id ||
        biz.facebook_ad_account_id ||
        adAccounts[0].id;

      setAvailableAdAccounts(adAccounts);
      setSelectedAdAccountId(currentAdAccountId);

      if (openSelector || !biz.facebook_ad_account_id) {
        setShowAdAccountSelector(true);
      }
    } catch (error: any) {
      if (!silent) {
        toast({
          title: "Error loading Meta ad accounts",
          description: error.message || "Unable to fetch your Meta ad accounts.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoadingAdAccounts(false);
    }
  };

  const fetchFirstPixelForAdAccount = async (
    accessToken: string,
    adAccountId: string
  ) => {
    try {
      const pixelRes = await fetch(
        `https://graph.facebook.com/v21.0/${adAccountId}/adspixels?fields=id,name&limit=1&access_token=${encodeURIComponent(
          accessToken
        )}`
      );
      const pixelData = await pixelRes.json();

      if (!pixelRes.ok) {
        console.warn("Unable to fetch Meta Pixel for selected ad account:", pixelData);
        return null;
      }

      return Array.isArray(pixelData?.data) &&
        typeof pixelData.data[0]?.id === "string"
        ? pixelData.data[0].id
        : null;
    } catch (error) {
      console.warn("Unable to fetch Meta Pixel for selected ad account:", error);
      return null;
    }
  };

  const handleConnectFacebook = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Not authenticated",
          description: "Please sign in first.",
          variant: "destructive",
        });
        return;
      }

      const META_APP_ID = "1119807469249263";
      const REDIRECT_URI = encodeURIComponent(
        "https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/facebook-oauth-callback"
      );
      const SCOPES = encodeURIComponent(
        "pages_manage_ads,ads_management,leads_retrieval,pages_read_engagement"
      );
      // Encode user token in state so the callback can identify them
      const STATE = encodeURIComponent(session.access_token);

      const oauthUrl =
        `https://www.facebook.com/v21.0/dialog/oauth?` +
        `client_id=${META_APP_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&scope=${SCOPES}` +
        `&state=${STATE}` +
        `&response_type=code` +
        `&auth_type=rerequest`;

      window.location.href = oauthUrl;
    } catch (error: any) {
      toast({
        title: "Error connecting Facebook",
        description: error.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    }
  };

  const loadFacebookPages = async ({
    userId = currentUser?.id,
    openSelector = true,
    requireSelection = false,
    silent = false,
  }: {
    userId?: string;
    openSelector?: boolean;
    requireSelection?: boolean;
    silent?: boolean;
  } = {}) => {
    setIsLoadingPages(true);

    try {
      if (!userId) throw new Error("Not authenticated");

      const { data: biz, error: bizError } = await supabase
        .from("businesses" as any)
        .select("facebook_access_token, facebook_page_id")
        .eq("user_id", userId)
        .single();

      if (bizError) throw bizError;
      if (!biz?.facebook_access_token) {
        throw new Error("No Facebook access token found. Reconnect Facebook first.");
      }

      const pagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(
          biz.facebook_access_token
        )}&fields=id,name`
      );
      const pagesData = await pagesRes.json();

      if (!pagesRes.ok) {
        throw new Error(
          pagesData?.error?.message || "Failed to fetch Facebook pages."
        );
      }

      const pages: FacebookPageOption[] = Array.isArray(pagesData?.data)
        ? pagesData.data
            .filter(
              (page: any) =>
                typeof page?.id === "string" && typeof page?.name === "string"
            )
            .map((page: any) => ({ id: page.id, name: page.name }))
        : [];

      if (pages.length === 0) {
        throw new Error("No Facebook pages found for this account.");
      }

      const currentPageId =
        pages.find((page) => page.id === biz.facebook_page_id)?.id || pages[0].id;

      setAvailablePages(pages);
      setSelectedPageId(currentPageId);

      if (requireSelection || openSelector || !biz.facebook_page_id) {
        setShowPageSelector(true);
        if (requireSelection && !silent) {
          toast({
            title: "Select a Facebook Page",
            description:
              "Choose the page to pair with this ad account before launching campaigns.",
          });
        }
        return;
      }

      if (pages.length === 1 && !silent) {
        setShowPageSelector(false);
        toast({
          title: "Only one page available",
          description: `${pages[0].name} is the only Facebook Page on this account.`,
        });
        return;
      }

      setShowPageSelector(false);
    } catch (error: any) {
      if (!silent) {
        toast({
          title: "Error loading Facebook pages",
          description: error.message || "Unable to fetch your Facebook pages.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoadingPages(false);
    }
  };

  const handleLoadFacebookPages = async () => {
    await loadFacebookPages({
      openSelector: true,
      requireSelection: !business?.facebook_page_id,
      silent: false,
    });
  };

  const handleUpdateFacebookAdAccount = async () => {
    if (!selectedAdAccountId || !currentUser?.id) return;

    if (selectedAdAccountId === business?.facebook_ad_account_id) {
      setShowAdAccountSelector(false);
      if (!business?.facebook_page_id) {
        await loadFacebookPages({
          userId: currentUser.id,
          openSelector: true,
          requireSelection: true,
          silent: false,
        });
      }
      return;
    }

    setIsUpdatingAdAccount(true);

    try {
      const { data: biz, error: bizError } = await supabase
        .from("businesses" as any)
        .select("facebook_access_token")
        .eq("user_id", currentUser.id)
        .single();

      if (bizError) throw bizError;
      if (!biz?.facebook_access_token) {
        throw new Error("No Facebook access token found. Reconnect Facebook first.");
      }

      const pixelId = await fetchFirstPixelForAdAccount(
        biz.facebook_access_token,
        selectedAdAccountId
      );

      const { data: updatedBusiness, error } = await supabase
        .from("businesses" as any)
        .update({
          facebook_ad_account_id: selectedAdAccountId,
          facebook_page_id: null,
          meta_pixel_id: pixelId,
        })
        .eq("user_id", currentUser.id)
        .select("*")
        .single();

      if (error) throw error;

      if (updatedBusiness) {
        const typedBusiness = updatedBusiness as unknown as Business;
        setBusiness(typedBusiness);
        setFormData((prev) => ({
          ...prev,
          meta_pixel_id: typedBusiness.meta_pixel_id || "",
        }));
      }

      const selectedAdAccount = availableAdAccounts.find(
        (account) => account.id === selectedAdAccountId
      );

      setShowAdAccountSelector(false);
      setAvailablePages([]);
      setSelectedPageId("");

      toast({
        title: "Meta ad account updated",
        description: selectedAdAccount
          ? `Now using ${selectedAdAccount.name}. Select a Facebook Page to finish setup.`
          : "Your Meta ad account has been updated. Select a Facebook Page to finish setup.",
      });

      await loadFacebookPages({
        userId: currentUser.id,
        openSelector: true,
        requireSelection: true,
        silent: true,
      });
    } catch (error: any) {
      toast({
        title: "Error updating Meta ad account",
        description: error.message || "Unable to update the selected Meta ad account.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingAdAccount(false);
    }
  };

  const handleUpdateFacebookPage = async () => {
    if (!selectedPageId || !currentUser?.id) return;
    if (selectedPageId === business?.facebook_page_id) {
      setShowPageSelector(false);
      return;
    }

    setIsUpdatingPage(true);

    try {
      const { data: updatedBusiness, error } = await supabase
        .from("businesses" as any)
        .update({ facebook_page_id: selectedPageId })
        .eq("user_id", currentUser.id)
        .select("*")
        .single();

      if (error) throw error;

      if (updatedBusiness) {
        setBusiness(updatedBusiness as unknown as Business);
      }

      setShowPageSelector(false);

      const selectedPage = availablePages.find((page) => page.id === selectedPageId);
      toast({
        title: "Facebook page updated",
        description: selectedPage
          ? `Now using ${selectedPage.name}.`
          : "Your Facebook Page has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error updating Facebook page",
        description: error.message || "Unable to update the selected Facebook Page.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingPage(false);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const currentFacebookPage = availablePages.find(
    (page) => page.id === business?.facebook_page_id
  );
  const currentFacebookAdAccount = availableAdAccounts.find(
    (account) => account.id === business?.facebook_ad_account_id
  );
  const hasFacebookToken = !!business?.facebook_access_token;
  const hasFacebookAdAccount = !!business?.facebook_ad_account_id;
  const hasFacebookPage = !!business?.facebook_page_id;
  const facebookReady = hasFacebookAdAccount && hasFacebookPage;

  const currentAdAccountStatus =
    currentFacebookAdAccount?.account_status === 1
      ? "Active"
      : typeof currentFacebookAdAccount?.account_status === "number"
      ? `Status ${currentFacebookAdAccount.account_status}`
      : null;
  const currentAdAccountMeta = [
    currentAdAccountStatus,
    currentFacebookAdAccount?.currency || null,
  ]
    .filter(Boolean)
    .join(" • ");

  // ── Loading / empty states ────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Settings</h1>
              <p className="text-muted-foreground">
                Manage your account, business details, and media files
              </p>
            </div>
            {!editMode && (
              <Button variant="outline" onClick={() => setEditMode(true)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
          </div>

          <Tabs defaultValue="account" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 max-w-md">
              <TabsTrigger value="account" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Account
              </TabsTrigger>
              <TabsTrigger value="media" className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Media
              </TabsTrigger>
              <TabsTrigger value="billing" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Billing
              </TabsTrigger>
            </TabsList>

            <TabsContent value="account" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Account info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Account
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      {editMode ? (
                        <Input
                          value={formData.full_name}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              full_name: e.target.value,
                            }))
                          }
                          placeholder="Your name"
                        />
                      ) : (
                        <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                          {profile?.full_name || "Not set"}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <div className="h-10 px-3 py-2 border rounded-md bg-muted/30 flex items-center text-sm text-muted-foreground">
                        <Mail className="w-4 h-4 mr-2 shrink-0" />
                        {profile?.email || "—"}
                      </div>
                    </div>
                  </div>

                  {editMode && (
                    <div className="flex gap-2 pt-2">
                      <Button onClick={handleSave} disabled={isSaving} size="sm">
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditMode(false);
                          setFormData({
                            full_name: profile?.full_name || "",
                            phone: business?.phone || "",
                            business_name: business?.name || "",
                            trade: business?.trade || "",
                            suburb: business?.suburb || "",
                            postcode: business?.postcode || "",
                            state: business?.state || "",
                            website: business?.website || "",
                            meta_pixel_id: business?.meta_pixel_id || "",
                            currency: business?.currency || "USD",
                            markets: business?.markets?.join(", ") || "",
                            target_cpa_cents:
                              autonomousPolicy?.target_cpa_cents ||
                              Math.round((autonomousPolicy?.target_cpa || 50) * 100),
                            max_daily_budget_cents:
                              autonomousPolicy?.max_daily_budget_cents ||
                              Math.round((autonomousPolicy?.max_daily_budget || 100) * 100),
                            crm_source: capiConfig?.crm_source || "hubspot",
                            optimise_for:
                              autonomousPolicy?.optimise_for ||
                              capiConfig?.optimise_for ||
                              "lead",
                            evaluation_frequency_hours:
                              autonomousPolicy?.evaluation_frequency_hours || 4,
                            capi_lookback_days:
                              autonomousPolicy?.capi_lookback_days || 30,
                            min_spend_before_evaluation_cents:
                              autonomousPolicy?.min_spend_before_evaluation_cents || 500,
                            portfolio_name: audiencePortfolio?.name || "",
                          });
                          setEventMapping(
                            (capiConfig?.event_mapping as Record<string, { meta_event: string; value: number }>) ||
                              { ...DEFAULT_EVENT_MAPPING }
                          );
                          setPortfolioTiers(
                            (audiencePortfolio?.tiers as PortfolioTier[]) || []
                          );
                        }}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Business details */}
              {business && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="w-5 h-5" />
                      Business
                    </CardTitle>
                    <CardDescription>
                      {editMode ? "Edit your business details below" : "Your business details — click Edit to update"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Business Name
                        </Label>
                        {editMode ? (
                          <Input
                            value={formData.business_name}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                business_name: e.target.value,
                              }))
                            }
                            placeholder="Your business name"
                          />
                        ) : (
                          <p className="text-sm font-medium">{business.name}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Business Type
                        </Label>
                        {editMode ? (
                          <Input
                            value={formData.trade}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                trade: e.target.value,
                              }))
                            }
                            placeholder="e.g. Restaurant, Gym, Salon"
                          />
                        ) : (
                          <p className="text-sm font-medium capitalize">
                            {business.trade}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Suburb
                        </Label>
                        {editMode ? (
                          <Input
                            value={formData.suburb}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                suburb: e.target.value,
                              }))
                            }
                            placeholder="Suburb"
                          />
                        ) : (
                          <p className="text-sm font-medium flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {business.suburb}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                            State
                          </Label>
                          {editMode ? (
                            <Input
                              value={formData.state}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  state: e.target.value,
                                }))
                              }
                              placeholder="QLD"
                            />
                          ) : (
                            <p className="text-sm font-medium">{business.state}</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                            Postcode
                          </Label>
                          {editMode ? (
                            <Input
                              value={formData.postcode}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  postcode: e.target.value,
                                }))
                              }
                              placeholder="4000"
                            />
                          ) : (
                            <p className="text-sm font-medium">{business.postcode}</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Phone
                        </Label>
                        {editMode ? (
                          <Input
                            value={formData.phone}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                phone: e.target.value,
                              }))
                            }
                            placeholder="04xx xxx xxx"
                          />
                        ) : (
                          <p className="text-sm font-medium flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {business.phone}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Website
                        </Label>
                        {editMode ? (
                          <Input
                            value={formData.website}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                website: e.target.value,
                              }))
                            }
                            placeholder="https://yourbusiness.com"
                          />
                        ) : (
                          <p className="text-sm font-medium flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {business.website ? (
                              <a href={business.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                {business.website}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">Not set</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Currency
                        </Label>
                        {editMode ? (
                          <Input
                            value={formData.currency}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                currency: e.target.value.toUpperCase(),
                              }))
                            }
                            placeholder="USD"
                          />
                        ) : (
                          <p className="text-sm font-medium">{business.currency || "USD"}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Markets
                        </Label>
                        {editMode ? (
                          <Input
                            value={formData.markets}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                markets: e.target.value,
                              }))
                            }
                            placeholder="US, AU, GB"
                          />
                        ) : (
                          <p className="text-sm font-medium">
                            {business.markets?.join(", ") || "Not set"}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {business && (
                <Card>
                  <CardHeader>
                    <CardTitle>Autonomous Policy</CardTitle>
                    <CardDescription>
                      Per-business targets used for portfolio planning and autonomous evaluation.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Target CPA (cents)</Label>
                        {editMode ? (
                          <Input
                            type="number"
                            value={formData.target_cpa_cents}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                target_cpa_cents: Number(e.target.value) || 0,
                              }))
                            }
                          />
                        ) : (
                          <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                            {formData.target_cpa_cents}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Max daily budget (cents)</Label>
                        {editMode ? (
                          <Input
                            type="number"
                            value={formData.max_daily_budget_cents}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                max_daily_budget_cents: Number(e.target.value) || 0,
                              }))
                            }
                          />
                        ) : (
                          <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                            {formData.max_daily_budget_cents}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Optimise for</Label>
                        {editMode ? (
                          <Select
                            value={formData.optimise_for}
                            onValueChange={(value) =>
                              setFormData((prev) => ({
                                ...prev,
                                optimise_for: value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lead">Lead</SelectItem>
                              <SelectItem value="sql">SQL</SelectItem>
                              <SelectItem value="customer">Customer</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm capitalize">
                            {formData.optimise_for}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Evaluation cadence (hours)</Label>
                        {editMode ? (
                          <Input
                            type="number"
                            value={formData.evaluation_frequency_hours}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                evaluation_frequency_hours: Number(e.target.value) || 1,
                              }))
                            }
                          />
                        ) : (
                          <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                            {formData.evaluation_frequency_hours}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>CAPI lookback (days)</Label>
                        {editMode ? (
                          <Input
                            type="number"
                            value={formData.capi_lookback_days}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                capi_lookback_days: Number(e.target.value) || 1,
                              }))
                            }
                          />
                        ) : (
                          <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                            {formData.capi_lookback_days}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Min spend before evaluation</Label>
                        {editMode ? (
                          <Input
                            type="number"
                            value={formData.min_spend_before_evaluation_cents}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                min_spend_before_evaluation_cents: Number(e.target.value) || 0,
                              }))
                            }
                          />
                        ) : (
                          <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                            {formData.min_spend_before_evaluation_cents}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {business && (
                <Card>
                  <CardHeader>
                    <CardTitle>Audience Portfolio</CardTitle>
                    <CardDescription>
                      Tier-level budget splits copied into this business portfolio.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Portfolio name</Label>
                      {editMode ? (
                        <Input
                          value={formData.portfolio_name}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              portfolio_name: e.target.value,
                            }))
                          }
                        />
                      ) : (
                        <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                          {formData.portfolio_name || "Not set"}
                        </div>
                      )}
                    </div>

                    {portfolioTiers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No audience portfolio has been configured for this business yet.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {portfolioTiers.map((tier) => (
                          <div key={tier.tier} className="rounded-lg border p-4 space-y-3">
                            <div>
                              <p className="font-medium capitalize">
                                {tier.tier.replace(/_/g, " ")}
                              </p>
                              {tier.description && (
                                <p className="text-sm text-muted-foreground">
                                  {tier.description}
                                </p>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Budget %</Label>
                                {editMode ? (
                                  <Input
                                    type="number"
                                    value={tier.budget_pct}
                                    onChange={(e) =>
                                      updatePortfolioTier(
                                        tier.tier,
                                        "budget_pct",
                                        Number(e.target.value) || 0
                                      )
                                    }
                                  />
                                ) : (
                                  <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                                    {tier.budget_pct}%
                                  </div>
                                )}
                              </div>

                              <div className="space-y-2">
                                <Label>CPA multiplier</Label>
                                {editMode ? (
                                  <Input
                                    type="number"
                                    value={tier.target_cpa_multiplier}
                                    onChange={(e) =>
                                      updatePortfolioTier(
                                        tier.tier,
                                        "target_cpa_multiplier",
                                        Number(e.target.value) || 0
                                      )
                                    }
                                  />
                                ) : (
                                  <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                                    {tier.target_cpa_multiplier}x
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {business && (
                <Card>
                  <CardHeader>
                    <CardTitle>Conversions API</CardTitle>
                    <CardDescription>
                      CRM mapping, webhook authentication, and downstream optimisation settings.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>CAPI enabled</Label>
                        {editMode ? (
                          <Select
                            value={String(capiConfig?.is_enabled ?? false)}
                            onValueChange={(value) =>
                              setCapiConfig((prev: any) => ({
                                ...(prev || {}),
                                is_enabled: value === "true",
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Enabled</SelectItem>
                              <SelectItem value="false">Disabled</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                            {capiConfig?.is_enabled ? "Enabled" : "Disabled"}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>CRM source</Label>
                        {editMode ? (
                          <Input
                            value={formData.crm_source}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                crm_source: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                            {formData.crm_source || "hubspot"}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Webhook secret</Label>
                      <div className="h-10 px-3 py-2 border rounded-md bg-muted/30 flex items-center text-sm text-muted-foreground">
                        {capiConfig?.webhook_secret || "Will be generated on first save"}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label>Event mapping</Label>
                      {Object.entries(eventMapping).map(([stage, mapping]) => (
                        <div key={stage} className="grid grid-cols-[1.2fr_1fr_0.7fr] gap-3 items-end">
                          <div className="space-y-2">
                            <Label className="capitalize">{stage}</Label>
                            <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                              {stage}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Meta event</Label>
                            {editMode ? (
                              <Select
                                value={mapping.meta_event}
                                onValueChange={(value) =>
                                  updateEventMappingField(stage, "meta_event", value)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {META_STANDARD_EVENT_OPTIONS.map((eventName) => (
                                    <SelectItem key={eventName} value={eventName}>
                                      {eventName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                                {mapping.meta_event}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label>Value</Label>
                            {editMode ? (
                              <Input
                                type="number"
                                value={mapping.value}
                                onChange={(e) =>
                                  updateEventMappingField(
                                    stage,
                                    "value",
                                    Number(e.target.value) || 0
                                  )
                                }
                              />
                            ) : (
                              <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                                {mapping.value}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Facebook connection */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Facebook className="w-5 h-5" />
                    Facebook
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Status</span>
                    <Badge variant={facebookReady ? "default" : "secondary"}>
                      {!hasFacebookToken
                        ? "Not Connected"
                        : facebookReady
                        ? "Connected"
                        : "Setup Required"}
                    </Badge>
                  </div>

                  {!hasFacebookToken && (
                    <>
                      <Separator />
                      <p className="text-xs text-muted-foreground">
                        Connect your Facebook Business account to launch ad
                        campaigns and receive leads.
                      </p>
                      <Button
                        className="w-full"
                        onClick={handleConnectFacebook}
                      >
                        <Facebook className="w-4 h-4 mr-2" />
                        Connect Facebook
                      </Button>
                    </>
                  )}

                  {hasFacebookToken && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                              Meta Ad Account
                            </Label>
                            <p className="text-sm font-medium">
                              {currentFacebookAdAccount
                                ? `${currentFacebookAdAccount.name} (${business?.facebook_ad_account_id})`
                                : business?.facebook_ad_account_id || "Not selected"}
                            </p>
                            {currentAdAccountMeta ? (
                              <p className="text-xs text-muted-foreground">
                                {currentAdAccountMeta}
                              </p>
                            ) : null}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              loadFacebookAdAccounts({
                                openSelector: true,
                                silent: false,
                              })
                            }
                            disabled={isLoadingAdAccounts || isUpdatingAdAccount}
                          >
                            {isLoadingAdAccounts ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : null}
                            {business?.facebook_ad_account_id
                              ? "Change Account"
                              : "Select Account"}
                          </Button>
                        </div>

                        {!business?.facebook_ad_account_id && (
                          <p className="text-xs text-muted-foreground">
                            Select the Meta ad account ZuckerBot should use for launches,
                            reporting, and autonomous management.
                          </p>
                        )}

                        {showAdAccountSelector && (
                          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                            <div className="space-y-1">
                              <Label>Select a Meta Ad Account</Label>
                              <Select
                                value={selectedAdAccountId}
                                onValueChange={setSelectedAdAccountId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a Meta ad account" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableAdAccounts.map((account) => (
                                    <SelectItem key={account.id} value={account.id}>
                                      {account.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={handleUpdateFacebookAdAccount}
                                disabled={!selectedAdAccountId || isUpdatingAdAccount}
                              >
                                {isUpdatingAdAccount ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : null}
                                Save Account
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowAdAccountSelector(false)}
                                disabled={isUpdatingAdAccount}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                              Facebook Page
                            </Label>
                            <p className="text-sm font-medium">
                              {currentFacebookPage
                                ? `${currentFacebookPage.name} (${business.facebook_page_id})`
                                : business.facebook_page_id || "Not selected"}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleLoadFacebookPages}
                            disabled={
                              isLoadingPages ||
                              isUpdatingPage ||
                              !business?.facebook_ad_account_id
                            }
                          >
                            {isLoadingPages ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : null}
                            Change Page
                          </Button>
                        </div>

                        {!business?.facebook_page_id && (
                          <p className="text-xs text-muted-foreground">
                            Select the Facebook Page to pair with the active ad account
                            before launching campaigns.
                          </p>
                        )}

                        {showPageSelector && (
                          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                            <div className="space-y-1">
                              <Label>Select a Facebook Page</Label>
                              <Select
                                value={selectedPageId}
                                onValueChange={setSelectedPageId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a Facebook Page" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availablePages.map((page) => (
                                    <SelectItem key={page.id} value={page.id}>
                                      {page.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={handleUpdateFacebookPage}
                                disabled={!selectedPageId || isUpdatingPage}
                              >
                                {isUpdatingPage ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : null}
                                Save Page
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowPageSelector(false)}
                                disabled={isUpdatingPage}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                          Meta Pixel ID
                        </Label>
                        {editMode ? (
                          <Input
                            value={formData.meta_pixel_id}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                meta_pixel_id: e.target.value,
                              }))
                            }
                            placeholder="123456789012345"
                          />
                        ) : (
                          <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center text-sm">
                            {business.meta_pixel_id || "Not set"}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Required for conversion tracking campaigns
                        </p>
                      </div>
                      <Button
                        className="w-full"
                        variant="outline"
                        size="sm"
                        onClick={handleConnectFacebook}
                      >
                        <Facebook className="w-4 h-4 mr-2" />
                        Reconnect Facebook
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Subscription */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Subscription</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Plan</span>
                    <Badge variant="secondary">Free Trial</Badge>
                  </div>
                  <Separator />
                  <Button className="w-full" variant="outline" asChild>
                    <a href="/billing">Manage Billing</a>
                  </Button>
                </CardContent>
              </Card>

              {/* Account meta */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Member since</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {profile?.created_at
                        ? formatDate(profile.created_at)
                        : "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="media" className="space-y-6">
          {currentUser && <MediaManager userId={currentUser.id} />}
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Subscription & Billing</CardTitle>
              <CardDescription>
                Manage your subscription plan and billing information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Current Plan</span>
                <Badge variant="secondary">Free Trial</Badge>
              </div>
              <Separator />
              <Button className="w-full" variant="outline" asChild>
                <a href="/billing">Manage Billing & Subscription</a>
              </Button>
              <p className="text-xs text-muted-foreground">
                Upgrade to unlock advanced campaign features and higher spending limits.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
        </div>
      </main>
    </div>
  );
}

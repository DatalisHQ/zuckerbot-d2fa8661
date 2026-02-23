// ── ZuckerBot API Types ──────────────────────────────────────────────

/** Standard API error envelope */
export interface ApiError {
  error: {
    code: string;
    message: string;
    retry_after?: number;
  };
}

// ── Campaign types ───────────────────────────────────────────────────

export interface PreviewRequest {
  url: string;
  ad_count?: number;
}

export interface AdVariant {
  headline: string;
  copy: string;
  rationale: string;
  image_url?: string;
  image_base64?: string;
  cta?: string;
  angle?: string;
  image_prompt?: string;
}

export interface PreviewResponse {
  id: string;
  business_name: string;
  description?: string;
  ads: AdVariant[];
  enrichment?: Record<string, unknown>;
  created_at: string;
}

export interface LocationInput {
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

export interface CreateCampaignRequest {
  url: string;
  business_name?: string;
  business_type?: string;
  location?: LocationInput;
  budget_daily_cents?: number;
  objective?: "leads" | "traffic" | "awareness";
}

export interface CampaignStrategy {
  objective: string;
  summary: string;
  strengths?: string[];
  opportunities?: string[];
  recommended_daily_budget_cents?: number;
  projected_cpl_cents?: number;
  projected_monthly_leads?: number;
}

export interface CampaignTargeting {
  age_min?: number;
  age_max?: number;
  radius_km?: number;
  interests?: string[];
  geo_locations?: Record<string, unknown>;
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
}

export interface CreateCampaignResponse {
  id: string;
  status: string;
  business_name?: string;
  business_type?: string;
  strategy?: CampaignStrategy;
  targeting?: CampaignTargeting;
  variants?: AdVariant[];
  roadmap?: Record<string, string[]>;
  created_at: string;
}

export interface LaunchCampaignRequest {
  campaign_id: string;
  meta_access_token: string;
  meta_ad_account_id: string;
  meta_page_id: string;
  variant_index?: number;
  daily_budget_cents?: number;
  radius_km?: number;
}

export interface LaunchCampaignResponse {
  id: string;
  status: string;
  meta_campaign_id: string;
  meta_adset_id: string;
  meta_ad_id: string;
  meta_leadform_id: string;
  daily_budget_cents: number;
  launched_at: string;
}

export interface PauseCampaignRequest {
  campaign_id: string;
  action?: "pause" | "resume";
}

export interface PerformanceResponse {
  campaign_id: string;
  status: string;
  performance_status: string;
  metrics: {
    impressions: number;
    clicks: number;
    spend_cents: number;
    leads_count: number;
    cpl_cents: number;
    ctr_pct: number;
  };
  hours_since_launch: number;
  last_synced_at: string;
}

// ── Conversion types ─────────────────────────────────────────────────

export interface UserData {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
}

export interface SyncConversionRequest {
  campaign_id: string;
  lead_id: string;
  quality: "good" | "bad";
  meta_access_token: string;
  user_data?: UserData;
}

export interface SyncConversionResponse {
  success: boolean;
  capi_sent: boolean;
  events_received: number;
  quality: string;
  lead_id: string;
}

// ── Research types ───────────────────────────────────────────────────

export interface ResearchReviewsRequest {
  business_name: string;
  location?: string;
}

export interface ResearchReviewsResponse {
  business_name: string;
  rating: number;
  review_count: number;
  themes: string[];
  best_quotes: string[];
  sentiment_breakdown?: {
    positive: number;
    neutral: number;
    negative: number;
  };
  sources: string[];
}

export interface ResearchCompetitorsRequest {
  industry: string;
  location: string;
  country?: string;
}

export interface ResearchCompetitorsResponse {
  competitor_ads: Array<{
    page_name: string;
    ad_body_text: string;
    started_running_date?: string;
    platforms?: string;
  }>;
  insights: {
    summary: string;
    common_hooks: string[];
    gaps: string[];
    opportunity: string;
  };
  ad_count: number;
}

export interface ResearchMarketRequest {
  industry: string;
  location: string;
}

// ── Creatives types ──────────────────────────────────────────────────

export interface GenerateCreativesRequest {
  business_name: string;
  description: string;
  count?: number;
  generate_images?: boolean;
}

export interface GenerateCreativesResponse {
  creatives: AdVariant[];
}

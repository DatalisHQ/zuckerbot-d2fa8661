import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// BUILD signature for troubleshooting/deployment tracing
const BUILD = {
  deployedAt: new Date().toISOString(),
  versionTag: Deno.env.get('VERSION_TAG') || Deno.env.get('COMMIT_SHA') || 'dev'
};

// Meta Graph Client
const GRAPH_VERSION = Deno.env.get('FACEBOOK_API_VERSION') || 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

class MetaGraphClient {
  constructor(private accessToken: string, private appSecret: string) {}

  // Generate appsecret_proof for enhanced security
  private async generateAppSecretProof(): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(this.accessToken));
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async get(path: string, params: Record<string, string> = {}) {
    const url = new URL(`${GRAPH_BASE}${path}`);
    url.searchParams.set('access_token', this.accessToken);
    url.searchParams.set('appsecret_proof', await this.generateAppSecretProof());
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString());
    const fbtrace_id = res.headers.get('x-fb-trace-id') || undefined;
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json, fbtrace_id } as const;
  }

  async postForm(path: string, form: URLSearchParams) {
    form.set('access_token', this.accessToken);
    form.set('appsecret_proof', await this.generateAppSecretProof());
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const fbtrace_id = res.headers.get('x-fb-trace-id') || undefined;
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json, fbtrace_id } as const;
  }
}

// Zod Schemas to validate incoming payload
const TargetingSchema = z.object({
  geo_locations: z.object({ countries: z.array(z.string()).min(1) }).or(z.any()).optional(),
  age_min: z.coerce.number().int().min(13).optional(),
  age_max: z.coerce.number().int().optional(),
  genders: z.array(z.coerce.number()).optional(),
  // interest_terms are raw strings; converted server-side
  interest_terms: z.array(z.string()).optional(),
  custom_audiences: z.array(z.union([z.string(), z.number(), z.object({ id: z.union([z.string(), z.number()]) })])).optional(),
}).passthrough();

const AdSetCreateInput = z.object({
  name: z.string().min(1),
  daily_budget: z.coerce.number().int().positive(),
  billing_event: z.string().optional(),
  optimization_goal: z.string().optional(),
  targeting: TargetingSchema,
  placements: z.any().optional(),
  status: z.enum(['PAUSED', 'ACTIVE']).optional(),
});

const CampaignSchema = z.object({
  name: z.string().min(1),
  objective: z.string().min(1),
  status: z.enum(['PAUSED', 'ACTIVE']),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
});

const AdCreateInput = z.object({
  name: z.string().min(1),
  adset_index: z.coerce.number().int().min(0),
  creative: z.union([
    z.object({ creative_id: z.string().min(1) }),
    z.object({ object_story_spec: z.any() })
  ]),
  status: z.enum(['PAUSED', 'ACTIVE'])
});

const PayloadSchema = z.object({
  adAccountId: z.string().min(1),
  campaign: CampaignSchema,
  adSets: z.array(AdSetCreateInput).min(1),
  ads: z.array(AdCreateInput).min(1),
});

interface CampaignPayload {
  adAccountId: string;
  campaign: {
    name: string;
    objective: string;
    status: 'PAUSED' | 'ACTIVE';
    start_time?: string;
    end_time?: string;
  };
  adSets: Array<{
    name: string;
    daily_budget: number;
    billing_event: string;
    optimization_goal: string;
    targeting: object;
    placements?: object;
    status?: 'PAUSED' | 'ACTIVE';
  }>;
  ads: Array<{
    name: string;
    adset_index: number; // Index to match with adSets array
    creative: { creative_id?: string; object_story_spec?: any };
    status: 'PAUSED' | 'ACTIVE';
  }>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== FACEBOOK CAMPAIGN CREATION START ===');
    console.log('Request timestamp:', new Date().toISOString());
    
    // Extract Supabase session token from Authorization header
    const authHeader = req.headers.get('authorization');
    console.log('🔐 Auth validation:');
    console.log('- Authorization header present:', !!authHeader);
    console.log('- Header starts with Bearer:', !!authHeader?.startsWith('Bearer '));
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ Missing or malformed Authorization header');
      return new Response(
        JSON.stringify({ 
          error: 'Missing or invalid Supabase session token'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract Supabase session token
    const sessionToken = authHeader.slice(7); // Remove 'Bearer ' prefix
    console.log('- Session token length:', sessionToken.length);
    console.log('- Session token prefix:', sessionToken.slice(0, 4));
    console.log('- Session token suffix:', sessionToken.slice(-4));
    console.log('- Token is empty/undefined:', !sessionToken || sessionToken === 'undefined' || sessionToken === 'null');

    if (!sessionToken || sessionToken === 'undefined' || sessionToken === 'null') {
      console.error('❌ Invalid session token');
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized: no valid Supabase session'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with session token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Validate Supabase session and get user
    console.log('🔍 Validating Supabase session...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('❌ Supabase auth failed:', authError?.message || 'No user found');
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized: no valid Supabase session'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Supabase auth successful');
    console.log('- User ID:', user.id);
    console.log('- User email:', user.email);

    // Get user's Facebook access token from profile
    console.log('🔍 Fetching Facebook access token from profile...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('facebook_access_token')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile?.facebook_access_token) {
      console.error('❌ Facebook token not found:', profileError?.message || 'No token in profile');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Facebook access token not found. Please reconnect your Facebook account.',
          reconnectRequired: true,
          build: BUILD,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userFacebookToken = profile.facebook_access_token;
    console.log('✅ Facebook token retrieved from profile');
    console.log('- Facebook token length:', userFacebookToken.length);
    console.log('- Facebook token prefix:', userFacebookToken.slice(0, 5));
    console.log('- Facebook token suffix:', userFacebookToken.slice(-5));

    // Get Facebook app credentials for token validation
    const appId = Deno.env.get('FACEBOOK_APP_ID');
    const appSecret = Deno.env.get('FACEBOOK_APP_SECRET');
    
    if (!appId || !appSecret) {
      console.error('❌ Missing Facebook app credentials');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Facebook app not configured properly', 
          build: BUILD 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate app access token for validation
    const appAccessToken = `${appId}|${appSecret}`;
    
    // Validate Facebook token with Facebook debug endpoint
    console.log('🔍 Validating Facebook token with Facebook...');
    const debugUrl = `https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${userFacebookToken}&access_token=${appAccessToken}`;
    
    let debugResponse;
    try {
      debugResponse = await fetch(debugUrl);
    } catch (networkError) {
      console.error('❌ Network error during Facebook token validation:', networkError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Network error validating Facebook token',
          details: String(networkError),
          build: BUILD,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const debugData = await debugResponse.json();
    console.log('Facebook token debug response:', JSON.stringify(debugData, null, 2));

    if (!debugResponse.ok || !debugData?.data?.is_valid) {
      const errorMsg = debugData?.data?.error?.message || debugData?.error?.message || 'Facebook token validation failed';
      console.error('❌ Facebook token validation failed:', errorMsg);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid Facebook access token: ${errorMsg}`,
          reconnectRequired: true,
          build: BUILD,
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = debugData.data;
    const now = Math.floor(Date.now() / 1000);
    
    // Check token expiry
    if (tokenData.expires_at && tokenData.expires_at <= now) {
      console.error('❌ Facebook token has expired');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Facebook access token has expired. Please reconnect your account.',
          reconnectRequired: true,
          build: BUILD,
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check required scopes
    const requiredScopes = ['ads_management'];
    const tokenScopes = tokenData.scopes || [];
    const missingScopes = requiredScopes.filter(scope => !tokenScopes.includes(scope));
    
    if (missingScopes.length > 0) {
      console.error('❌ Missing required Facebook scopes:', missingScopes);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Missing required Facebook permissions: ${missingScopes.join(', ')}. Please reconnect with full permissions.`,
          reconnectRequired: true,
          build: BUILD,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Facebook token validation successful');
    console.log('- App ID:', tokenData.app_id);
    console.log('- Facebook User ID:', tokenData.user_id);
    console.log('- Expires at:', new Date(tokenData.expires_at * 1000).toISOString());
    console.log('- Scopes:', tokenScopes.join(', '));

    const raw = await req.json();
    const parsed = PayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid payload',
          issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
          build: BUILD,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const payload: CampaignPayload = parsed.data as any;
    
    let { adAccountId, campaign, adSets, ads } = payload;

    // Normalize adAccountId: strip any leading 'act_' (even if duplicated)
    adAccountId = adAccountId.replace(/^act_+/i, '');

    // Validate required fields
    if (!adAccountId || !campaign || !adSets || !ads) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: adAccountId, campaign, adSets, ads' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use the validated Facebook token for Meta API calls
    const accessToken = userFacebookToken;

    const apiVersion = Deno.env.get('FACEBOOK_API_VERSION') || 'v21.0';
    const baseUrl = `https://graph.facebook.com/${apiVersion}`;

    // Resolve interest names to valid numeric IDs using Facebook Interest Search
    const interestCache = new Map<string, { id: string; name: string }>();
    const isNumeric = (v: any) => /^\d+$/.test(String(v || ''));
    const resolveInterest = async (term: string): Promise<{ id: string; name: string } | null> => {
      const key = term.toLowerCase();
      if (interestCache.has(key)) return interestCache.get(key)!;
      try {
        const url = new URL(`${baseUrl}/search`);
        url.searchParams.set('type', 'adinterest');
        url.searchParams.set('q', JSON.stringify([term]));
        url.searchParams.set('limit', '1');
        url.searchParams.set('access_token', accessToken!);
        const res = await fetch(url.toString());
        const data = await res.json().catch(() => ({}));
        const first = data?.data?.[0];
        if (first?.id && isNumeric(first.id)) {
          const entry = { id: String(first.id), name: String(first.name || term) };
          interestCache.set(key, entry);
          return entry;
        }
      } catch { /* ignore */ }
      return null;
    };

    console.log('Starting Facebook campaign creation for account:', adAccountId);

    // Step 1: Create Campaign
    console.log('Creating campaign:', campaign.name);

    // Map legacy/abstract objectives to valid Graph API values
    const normalizeObjective = (obj: string) => {
      const o = (obj || '').toUpperCase();
      const map: Record<string, string> = {
        'AWARENESS': 'OUTCOME_AWARENESS',
        'TRAFFIC': 'OUTCOME_TRAFFIC',
        'LINK_CLICKS': 'OUTCOME_TRAFFIC',
        'CONVERSIONS': 'OUTCOME_SALES',
        'SALES': 'OUTCOME_SALES',
        'LEADS': 'OUTCOME_LEADS',
        'BRAND_AWARENESS': 'OUTCOME_AWARENESS',
        'REACH': 'OUTCOME_AWARENESS',
        'APP_INSTALLS': 'APP_INSTALLS',
        'ENGAGEMENT': 'OUTCOME_ENGAGEMENT'
      };
      const allowed = new Set([
        'APP_INSTALLS','BRAND_AWARENESS','EVENT_RESPONSES','LEAD_GENERATION','LINK_CLICKS','LOCAL_AWARENESS','MESSAGES','OFFER_CLAIMS','PAGE_LIKES','POST_ENGAGEMENT','PRODUCT_CATALOG_SALES','REACH','STORE_VISITS','VIDEO_VIEWS','OUTCOME_AWARENESS','OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_SALES','OUTCOME_TRAFFIC','OUTCOME_APP_PROMOTION','CONVERSIONS'
      ]);
      const normalized = map[o] || o;
      // If still not allowed but looks like a known alias, fallback sensibly
      if (!allowed.has(normalized)) {
        if (normalized === 'AWARENESS') return 'OUTCOME_AWARENESS';
        if (normalized === 'TRAFFIC') return 'OUTCOME_TRAFFIC';
        if (normalized === 'ENGAGEMENT') return 'OUTCOME_ENGAGEMENT';
        if (normalized === 'LEAD_GENERATION' || normalized === 'LEADS') return 'OUTCOME_LEADS';
        if (normalized === 'SALES' || normalized === 'PURCHASE' || normalized === 'CONVERSIONS') return 'OUTCOME_SALES';
      }
      return normalized;
    };

    const normalizedObjective = normalizeObjective(campaign.objective);

    // Derive safe defaults for ad set optimization/billing based on objective
    const deriveAdsetGoals = (objective: string) => {
      switch (objective) {
        case 'OUTCOME_TRAFFIC':
        case 'LINK_CLICKS':
          return { optimization_goal: 'LINK_CLICKS', billing_event: 'LINK_CLICKS' };
        case 'OUTCOME_AWARENESS':
        case 'REACH':
        case 'BRAND_AWARENESS':
          return { optimization_goal: 'REACH', billing_event: 'IMPRESSIONS' };
        case 'OUTCOME_ENGAGEMENT':
        case 'POST_ENGAGEMENT':
          return { optimization_goal: 'POST_ENGAGEMENT', billing_event: 'IMPRESSIONS' };
        case 'OUTCOME_LEADS':
        case 'LEAD_GENERATION':
          return { optimization_goal: 'LEAD_GENERATION', billing_event: 'IMPRESSIONS' };
        case 'OUTCOME_SALES':
        case 'CONVERSIONS':
          return { optimization_goal: 'CONVERSIONS', billing_event: 'IMPRESSIONS' };
        default:
          return { optimization_goal: 'REACH', billing_event: 'IMPRESSIONS' };
      }
    };
    const defaultAdsetGoals = deriveAdsetGoals(normalizedObjective);

    // Cache a discovered pixel id per request if needed for CONVERSIONS
    let discoveredPixelId: string | null = null;
    const getDefaultPixelId = async (): Promise<string | null> => {
      if (discoveredPixelId) return discoveredPixelId;
      try {
        const url = new URL(`${baseUrl}/act_${adAccountId}/adspixels`);
        url.searchParams.set('fields', 'id');
        url.searchParams.set('limit', '1');
        url.searchParams.set('access_token', accessToken!);
        const res = await fetch(url.toString());
        const data = await res.json().catch(() => ({}));
        const first = data?.data?.[0];
        if (first?.id) {
          discoveredPixelId = String(first.id);
          return discoveredPixelId;
        }
      } catch { /* ignore */ }
      return null;
    };
    const campaignParams = new URLSearchParams({
      access_token: accessToken,
      name: campaign.name,
      objective: normalizedObjective,
      status: campaign.status,
      special_ad_categories: '[]' // Empty array for regular ads
    });
    if (campaign.start_time) {
      campaignParams.append('start_time', campaign.start_time);
    }
    if (campaign.end_time) {
      campaignParams.append('end_time', campaign.end_time);
    }

    const mg = new MetaGraphClient(accessToken, appSecret);
    let campaignResponse;
    try {
      campaignResponse = await mg.postForm(`/act_${adAccountId}/campaigns`, campaignParams);
    } catch (networkError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Network error creating campaign',
          details: String(networkError),
          build: BUILD,
          suggestion: 'Check network connectivity and Facebook API availability.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!campaignResponse.ok) {
      const errorData = campaignResponse.json;
      const fbMessage = errorData?.error?.message || errorData?.message || 'Unknown Facebook API error';
      console.error('Campaign creation failed:', errorData);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to create campaign',
          details: fbMessage,
          fbtrace_id: campaignResponse.fbtrace_id,
          build: BUILD,
          suggestion: 'Check your Facebook ad account permissions, campaign objective, and naming conventions.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const campaignData = campaignResponse.json;
    const campaignId = campaignData.id;
    console.log('Campaign created successfully:', campaignId);

    // Step 2: Create Ad Sets
    const createdAdSetIds: string[] = [];
    
    for (let i = 0; i < adSets.length; i++) {
      const adSet = adSets[i];
      console.log(`Creating ad set ${i + 1}/${adSets.length}:`, adSet.name);

      // Extract placements (should be top-level ad set params, not inside targeting)
      const placements = (adSet as any).placements || {};

      // Normalize targeting
      const baseTargeting = { ...(adSet.targeting || {}) } as any;
      // Hard sanitize: never allow top-level interests to pass to Graph
      if (Object.prototype.hasOwnProperty.call(baseTargeting, 'interests')) {
        delete (baseTargeting as any).interests;
      }
      // Support alternate key from clients
      const incomingInterestTerms = Array.isArray((adSet.targeting as any)?.interest_terms)
        ? (adSet.targeting as any).interest_terms
        : Array.isArray((adSet.targeting as any)?.interests)
          ? (adSet.targeting as any).interests
          : [];
      // Resolve interests provided as names into numeric IDs
      let validInterests: { id: string; name: string }[] = [];
      if (Array.isArray(incomingInterestTerms)) {
        const resolved: any[] = [];
        for (const interest of incomingInterestTerms) {
          if (isNumeric(interest?.id)) {
            resolved.push({ id: String(interest.id), name: String(interest.name || '') });
          } else if (typeof interest === 'string' && interest.trim()) {
            const hit = await resolveInterest(interest.trim());
            if (hit) resolved.push(hit);
          } else if (interest?.name) {
            const hit = await resolveInterest(String(interest.name));
            if (hit) resolved.push(hit);
          }
        }
        validInterests = resolved.filter((it: any) => isNumeric(it?.id));
        // Ensure both potential keys are removed from targeting clone
        delete (baseTargeting as any).interests;
        delete (baseTargeting as any).interest_terms;
      }

      const targetingObj: any = {
        ...baseTargeting,
      };

      // Ensure required geo_locations with safe fallback
      const hasGeo = targetingObj?.geo_locations && (
        Array.isArray(targetingObj.geo_locations.countries) ? targetingObj.geo_locations.countries.length > 0 : true
      );
      if (!hasGeo) {
        targetingObj.geo_locations = { countries: ['US'] };
      }

      // Normalize age range defaults
      if (typeof targetingObj.age_min !== 'number' || targetingObj.age_min < 13) targetingObj.age_min = 18;
      if (typeof targetingObj.age_max !== 'number' || targetingObj.age_max < targetingObj.age_min) targetingObj.age_max = 65;

      // Normalize genders: allow 1 or 2; if both/all -> omit
      if (Array.isArray(targetingObj.genders)) {
        const vals = (targetingObj.genders as any[]).map((v) => Number(v)).filter((v) => v === 1 || v === 2);
        const unique = Array.from(new Set(vals));
        if (unique.length !== 1) {
          delete targetingObj.genders;
        } else {
          targetingObj.genders = unique;
        }
      }

      // Merge placements into targeting as per Graph API spec
      if (placements && Array.isArray((placements as any).publisher_platforms) && (placements as any).publisher_platforms.length > 0) {
        (targetingObj as any).publisher_platforms = (placements as any).publisher_platforms;
      }
      if (placements && Array.isArray((placements as any).facebook_positions) && (placements as any).facebook_positions.length > 0) {
        (targetingObj as any).facebook_positions = (placements as any).facebook_positions;
      }
      if (placements && Array.isArray((placements as any).instagram_positions) && (placements as any).instagram_positions.length > 0) {
        (targetingObj as any).instagram_positions = (placements as any).instagram_positions;
      }

      // Normalize custom_audiences to expected array of objects with id
      if (Array.isArray((targetingObj as any).custom_audiences)) {
        (targetingObj as any).custom_audiences = (targetingObj as any).custom_audiences
          .filter((v: any) => !!v)
          .map((v: any) => (typeof v === 'string' || typeof v === 'number') ? { id: String(v) } : (v?.id ? { id: String(v.id) } : null))
          .filter((v: any) => v && /^\d+$/.test(v.id));
        if ((targetingObj as any).custom_audiences.length === 0) {
          delete (targetingObj as any).custom_audiences;
        }
      }

      // Ensure no stray top-level interests leak through to the Graph API
      delete (targetingObj as any).interests;
      delete (targetingObj as any).interest_terms;

      // If we have valid interests, attach them under flexible_spec as per current API
      if (validInterests.length > 0) {
        targetingObj.flexible_spec = [ { interests: validInterests } ];
      }

      console.log('Final targeting payload for ad set', i + 1, JSON.stringify(targetingObj).slice(0, 400));

      // Determine goals; if optimizing for conversions but no pixel is available, fallback to LINK_CLICKS
      let goals = { ...defaultAdsetGoals } as { optimization_goal: string; billing_event: string };
      let promotedObject: any = undefined;
      if (goals.optimization_goal === 'CONVERSIONS') {
        const pixelId = await getDefaultPixelId();
        if (pixelId) {
          promotedObject = { pixel_id: pixelId, custom_event_type: 'PURCHASE' };
        } else {
          goals = { optimization_goal: 'LINK_CLICKS', billing_event: 'LINK_CLICKS' };
        }
      }

      const adSetParams = new URLSearchParams({
        access_token: accessToken,
        campaign_id: campaignId,
        name: adSet.name,
        // Client sends minor units already (e.g., cents). Do not convert again.
        daily_budget: String(adSet.daily_budget),
        // Use backend-derived goals to avoid invalid combinations
        billing_event: goals.billing_event,
        optimization_goal: goals.optimization_goal,
        targeting: JSON.stringify(targetingObj),
        status: adSet.status || 'PAUSED'
      });

      // Use validate_only to get detailed errors without creating objects
      adSetParams.append('execution_options', 'validate_only');
      // Add debug output from Graph
      adSetParams.append('debug', 'all');

      // Attach promoted_object if available
      if (promotedObject) {
        adSetParams.append('promoted_object', JSON.stringify(promotedObject));
      }

      // Placements are included in targetingObj; no top-level placement params

      let adSetResponse;
      try {
        adSetResponse = await mg.postForm(`/act_${adAccountId}/adsets`, adSetParams);
      } catch (networkError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Network error creating ad set ${i + 1}`,
            details: String(networkError),
            build: BUILD,
            partialResults: { campaignId, adSetIds: createdAdSetIds },
            suggestion: 'Retry later or verify Facebook API status.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!adSetResponse.ok) {
        const errorData = adSetResponse.json;
        const fbMessage = errorData?.error?.message || errorData?.message || 'Unknown Facebook API error';
        const fbUser = errorData?.error?.error_user_msg || errorData?.error_user_msg;
        const fbData = errorData?.error?.error_data || errorData?.error_data;
        const fbCode = errorData?.error?.code;
        const fbSub = errorData?.error?.error_subcode;
        const fbUserTitle = errorData?.error?.error_user_title;
        const detailParts = [fbMessage];
        if (fbUser) detailParts.push(String(fbUser));
        if (fbData) detailParts.push(typeof fbData === 'string' ? fbData : JSON.stringify(fbData));
        if (fbCode) detailParts.push(`code:${fbCode}`);
        if (fbSub) detailParts.push(`sub:${fbSub}`);
        if (fbUserTitle) detailParts.push(`title:${fbUserTitle}`);
        if (adSetResponse.fbtrace_id) detailParts.push(`trace_id:${adSetResponse.fbtrace_id}`);
        const details = detailParts.join(' | ');
        console.error(`Ad set ${i + 1} creation failed:`, errorData);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to create ad set ${i + 1}`,
            details,
            fbtrace_id: adSetResponse.fbtrace_id,
            raw: errorData,
            sent: {
              billing_event: goals.billing_event,
              optimization_goal: goals.optimization_goal,
              targeting: targetingObj,
              placements: placements || null,
              promoted_object: promotedObject || null
            },
            build: BUILD,
            partialResults: { campaignId, adSetIds: createdAdSetIds },
            suggestion: 'Enable fewer placements, verify geo_locations, age/gender, budget min, and interest keywords.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const adSetData = adSetResponse.json;
      createdAdSetIds.push(adSetData.id);
      console.log(`Ad set ${i + 1} created successfully:`, adSetData.id);
    }

    // Step 3: Create Ads
    const createdAdIds: string[] = [];
    
    for (let i = 0; i < ads.length; i++) {
      const ad = ads[i];
      const adSetId = createdAdSetIds[ad.adset_index];
      
      if (!adSetId) {
        console.error(`Invalid adset_index ${ad.adset_index} for ad ${i + 1}`);
        continue;
      }

      console.log(`Creating ad ${i + 1}/${ads.length}:`, ad.name);

      // Handle creative - either creative_id or object_story_spec
      let creativeParams: any = {};
      
      if (ad.creative.creative_id) {
        // Existing creative ID case
        const creativeId = ad.creative.creative_id;
        if (!/^\d+$/.test(String(creativeId))) {
          console.error(`Creative resolution failed for ad ${i + 1}:`, {
            scope: 'creative',
            message: 'Invalid creative_id format',
            details: 'creative_id must be a numeric ID',
            status: 400
          });
          return new Response(
            JSON.stringify({
              success: false,
              error: `Failed to create creative for ad ${i + 1}`,
              details: 'Invalid creative_id format',
              partialResults: { campaignId, adSetIds: createdAdSetIds, adIds: createdAdIds },
              raw: {},
              build: BUILD
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        creativeParams.creative = JSON.stringify({ creative_id: String(creativeId) });
        
      } else if (ad.creative.object_story_spec) {
        // Inline creative case - create AdCreative first
        const objectStorySpec = ad.creative.object_story_spec;
        
        // Resolve page_id if set to 'auto'
        if (objectStorySpec.page_id === 'auto') {
          try {
            const pagesUrl = new URL(`${baseUrl}/me/accounts`);
            pagesUrl.searchParams.set('fields', 'id,name');
            pagesUrl.searchParams.set('access_token', accessToken!);
            const pagesRes = await fetch(pagesUrl.toString());
            const pagesData = await pagesRes.json();
            const firstPage = pagesData?.data?.[0];
            if (firstPage?.id) {
              objectStorySpec.page_id = firstPage.id;
            } else {
              // Fallback to ad account ID if no pages found
              objectStorySpec.page_id = adAccountId;
            }
          } catch (e) {
            console.log('Could not auto-resolve page_id, using ad account ID');
            objectStorySpec.page_id = adAccountId;
          }
        }
        
        // Create AdCreative
        const creativeCreateParams = new URLSearchParams({
          access_token: accessToken,
          name: `Creative for ${ad.name}`,
          object_story_spec: JSON.stringify(objectStorySpec)
        });
        
        let creativeResponse;
        try {
          creativeResponse = await mg.postForm(`/act_${adAccountId}/adcreatives`, creativeCreateParams);
        } catch (networkError) {
          console.error(`Creative creation failed for ad ${i + 1}:`, {
            scope: 'creative',
            message: 'Network error creating creative',
            details: String(networkError),
            status: 500
          });
          return new Response(
            JSON.stringify({
              success: false,
              error: `Failed to create creative for ad ${i + 1}`,
              details: 'Network error creating creative',
              partialResults: { campaignId, adSetIds: createdAdSetIds, adIds: createdAdIds },
              raw: {},
              build: BUILD
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        if (!creativeResponse.ok) {
          const errorData = creativeResponse.json;
          const fbMessage = errorData?.error?.message || 'Creative creation failed';
          console.error(`Creative resolution failed for ad ${i + 1}:`, {
            scope: 'creative',
            message: fbMessage,
            details: errorData,
            status: creativeResponse.status
          });
          return new Response(
            JSON.stringify({
              success: false,
              error: `Failed to create creative for ad ${i + 1}`,
              details: fbMessage,
              partialResults: { campaignId, adSetIds: createdAdSetIds, adIds: createdAdIds },
              raw: errorData || {},
              build: BUILD
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const creativeData = creativeResponse.json;
        creativeParams.creative = JSON.stringify({ creative_id: creativeData.id });
        
      } else {
        console.error(`Creative resolution failed for ad ${i + 1}:`, {
          scope: 'creative',
          message: 'Missing creative or object_story_spec',
          details: null,
          status: 400
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to create creative for ad ${i + 1}`,
            details: 'Missing creative or object_story_spec',
            partialResults: { campaignId, adSetIds: createdAdSetIds, adIds: createdAdIds },
            raw: {},
            build: BUILD
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const adParams = new URLSearchParams({
        access_token: accessToken,
        name: ad.name,
        adset_id: adSetId,
        status: ad.status,
        ...creativeParams
      });

      let adResponse;
      try {
        adResponse = await mg.postForm(`/act_${adAccountId}/ads`, adParams);
      } catch (networkError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Network error creating ad ${i + 1}`,
            details: String(networkError),
            build: BUILD,
            partialResults: { campaignId, adSetIds: createdAdSetIds, adIds: createdAdIds },
            suggestion: 'Retry later or verify Facebook API status.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!adResponse.ok) {
        const errorData = adResponse.json;
        const fbMessage = errorData?.error?.message || errorData?.message || 'Unknown Facebook API error';
        console.error(`Ad ${i + 1} creation failed:`, errorData);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to create ad ${i + 1}`,
            details: fbMessage,
            fbtrace_id: adResponse.fbtrace_id,
            build: BUILD,
            partialResults: { campaignId, adSetIds: createdAdSetIds, adIds: createdAdIds },
            suggestion: 'Check creative assets, ad copy, and Facebook ad policies.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const adData = adResponse.json;
      createdAdIds.push(adData.id);
      console.log(`Ad ${i + 1} created successfully:`, adData.id);
    }

    console.log('Facebook campaign creation completed successfully');
    console.log('Campaign ID:', campaignId);
    console.log('Ad Set IDs:', createdAdSetIds);
    console.log('Ad IDs:', createdAdIds);

    return new Response(
      JSON.stringify({
        success: true,
        campaignId,
        adSetIds: createdAdSetIds,
        adIds: createdAdIds,
        summary: {
          campaignName: campaign.name,
          adSetsCreated: createdAdSetIds.length,
          adsCreated: createdAdIds.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-facebook-campaign function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
        details: error.stack || null,
        suggestion: 'Try again or contact support if the issue persists.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
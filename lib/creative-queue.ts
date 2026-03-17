import { createClient } from "@supabase/supabase-js";
import { buildCreativeLinkData } from "./objective.js";
import { sendSlackCreativeApproval, sendSlackCreativeLaunched } from "./slack.js";

const SUPABASE_URL =
  process.env.SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || "https://bqqmkiocynvlaianwisd.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface CampaignRecord {
  id: string;
  business_id: string;
  name: string;
  ad_headline: string | null;
  ad_copy: string | null;
  ad_image_url: string | null;
  meta_ad_id: string | null;
  meta_adset_id: string | null;
  meta_campaign_id: string | null;
  meta_leadform_id: string | null;
}

interface BusinessRecord {
  id: string;
  user_id: string;
  name: string;
  trade: string | null;
  website: string | null;
  website_url: string | null;
  facebook_access_token: string | null;
  facebook_ad_account_id: string | null;
  facebook_page_id: string | null;
  meta_pixel_id: string | null;
}

interface CreativeVariant {
  headline: string;
  body: string;
  cta: string;
  image_url: string | null;
  theme: string;
  prompt_used?: string | null;
}

interface QueueCreativeRefreshArgs {
  businessId: string;
  campaignId: string;
  campaignName: string;
  reason: string;
  sourceRunId?: string | null;
  requestedVariants?: number;
  creativeThemes?: string[];
}

interface QueueCreativeRefreshResult {
  ok: boolean;
  status: string;
  error?: string;
  detail?: Record<string, unknown>;
}

interface LaunchCreativeQueueArgs {
  queueId: string;
  userId: string;
  pauseExistingAd?: boolean;
}

interface LaunchCreativeQueueResult {
  ok: boolean;
  status: string;
  error?: string;
  detail?: Record<string, unknown>;
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

function mapCtaToMetaType(cta?: string | null): string {
  const label = (cta || "Learn More").trim().toUpperCase().replace(/\s+/g, "_");
  const valid = new Set([
    "LEARN_MORE",
    "GET_QUOTE",
    "CALL_NOW",
    "SIGN_UP",
    "BOOK_NOW",
    "CONTACT_US",
    "GET_STARTED",
    "APPLY_NOW",
    "SHOP_NOW",
  ]);

  return valid.has(label) ? label : "LEARN_MORE";
}

async function metaPost(
  endpoint: string,
  data: Record<string, unknown>,
  accessToken: string,
): Promise<{ ok: boolean; data: any; rawBody: string }> {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) form.append(key, String(value));
  }
  form.set("access_token", accessToken);

  const response = await fetch(`${GRAPH_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const rawBody = await response.text();
  let parsed: any;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    parsed = { raw: rawBody };
  }

  return { ok: response.ok && !parsed?.error, data: parsed, rawBody };
}

async function fetchCampaignAndBusiness(
  campaignId: string,
  businessId: string,
): Promise<{ campaign: CampaignRecord; business: BusinessRecord }> {
  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("campaigns")
    .select("id, business_id, name, ad_headline, ad_copy, ad_image_url, meta_ad_id, meta_adset_id, meta_campaign_id, meta_leadform_id")
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .single();

  if (campaignError || !campaign) {
    throw new Error(`campaign_not_found: ${campaignError?.message || campaignId}`);
  }

  const { data: business, error: businessError } = await supabaseAdmin
    .from("businesses")
    .select("id, user_id, name, trade, website, website_url, facebook_access_token, facebook_ad_account_id, facebook_page_id, meta_pixel_id")
    .eq("id", businessId)
    .single();

  if (businessError || !business) {
    throw new Error(`business_not_found: ${businessError?.message || businessId}`);
  }

  return {
    campaign: campaign as CampaignRecord,
    business: business as BusinessRecord,
  };
}

async function generateVariantsViaEdgeFunction(
  business: BusinessRecord,
): Promise<CreativeVariant[]> {
  const websiteUrl = normalizeUrl(business.website || business.website_url);
  if (!websiteUrl) return [];

  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-preview-v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: websiteUrl }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`creative_engine_failed: ${response.status} ${text.slice(0, 250)}`);
  }

  const payload = await response.json();
  const ads = Array.isArray(payload?.ads) ? payload.ads : [];

  return ads.slice(0, 3).map((ad: any, index: number) => ({
    headline: ad?.headline || `${business.name} Variant ${index + 1}`,
    body: ad?.copy || ad?.body || "",
    cta: ad?.cta || "Learn More",
    image_url: ad?.image_url || null,
    theme: ad?.theme || `variant_${index + 1}`,
    prompt_used: ad?.prompt_used || null,
  }));
}

async function generateVariantsViaClaude(
  business: BusinessRecord,
  campaign: CampaignRecord,
  reason: string,
  creativeThemes: string[],
  requestedVariants: number,
): Promise<CreativeVariant[]> {
  if (!ANTHROPIC_API_KEY) {
    return [];
  }

  const prompt = `Generate ${requestedVariants} fresh Facebook ad creative variants for this campaign.

BUSINESS:
- Name: ${business.name}
- Trade: ${business.trade || "Unknown"}
- Website: ${normalizeUrl(business.website || business.website_url) || "n/a"}

CURRENT CAMPAIGN:
- Campaign name: ${campaign.name}
- Headline: ${campaign.ad_headline || "n/a"}
- Body: ${campaign.ad_copy || "n/a"}
- Refresh reason: ${reason}
- Existing image URL: ${campaign.ad_image_url || "n/a"}

THEMES:
${creativeThemes.join(", ")}

Return JSON only:
{
  "variants": [
    {
      "headline": "string",
      "body": "string",
      "cta": "string",
      "theme": "string"
    }
  ]
}

Requirements:
- Distinct angles across variants
- 5-8 word headlines
- 2-3 sentence body copy
- No em dashes
- Keep the CTA specific and conversion-focused`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`creative_copy_failed: ${response.status}`);
  }

  const payload = await response.json();
  const text = payload?.content?.[0]?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
  const variants = Array.isArray(parsed?.variants) ? parsed.variants : [];

  return variants.slice(0, requestedVariants).map((variant: any, index: number) => ({
    headline: variant?.headline || `${business.name} Refresh ${index + 1}`,
    body: variant?.body || campaign.ad_copy || "",
    cta: variant?.cta || "Learn More",
    image_url: campaign.ad_image_url,
    theme: variant?.theme || creativeThemes[index] || `variant_${index + 1}`,
  }));
}

async function generateCreativeVariants(args: {
  business: BusinessRecord;
  campaign: CampaignRecord;
  reason: string;
  creativeThemes: string[];
  requestedVariants: number;
}): Promise<CreativeVariant[]> {
  const edgeVariants = await generateVariantsViaEdgeFunction(args.business).catch((error) => {
    console.warn("[creative-queue] Edge-function variant generation failed:", error);
    return [];
  });

  if (edgeVariants.length >= args.requestedVariants) {
    return edgeVariants
      .slice(0, args.requestedVariants)
      .map((variant, index) => ({
        ...variant,
        image_url: variant.image_url || args.campaign.ad_image_url,
        theme: variant.theme || args.creativeThemes[index] || `variant_${index + 1}`,
      }));
  }

  const claudeVariants = await generateVariantsViaClaude(
    args.business,
    args.campaign,
    args.reason,
    args.creativeThemes,
    args.requestedVariants,
  ).catch((error) => {
    console.warn("[creative-queue] Claude fallback generation failed:", error);
    return [];
  });

  const combined = [...edgeVariants, ...claudeVariants];
  return combined.slice(0, args.requestedVariants);
}

function inferObjective(campaign: CampaignRecord, business: BusinessRecord): "leads" | "traffic" | "conversions" {
  if (campaign.meta_leadform_id) return "leads";
  if (business.meta_pixel_id && normalizeUrl(business.website || business.website_url)) return "conversions";
  return "traffic";
}

export async function queueCreativeRefresh(
  args: QueueCreativeRefreshArgs,
): Promise<QueueCreativeRefreshResult> {
  try {
    const { campaign, business } = await fetchCampaignAndBusiness(args.campaignId, args.businessId);
    const requestedVariants = args.requestedVariants ?? 3;
    const creativeThemes = args.creativeThemes ?? [
      "missed_call",
      "reliability",
      "on_the_job",
      "static_audio",
    ];

    const { data: existingRows } = await supabaseAdmin
      .from("creative_queue")
      .select("id")
      .eq("campaign_id", args.campaignId)
      .eq("status", "pending_approval");

    if (existingRows && existingRows.length > 0) {
      return {
        ok: true,
        status: "creative_already_queued",
        detail: {
          existing_pending_variants: existingRows.length,
          queue_ids: existingRows.map((row: any) => row.id),
        },
      };
    }

    const variants = await generateCreativeVariants({
      business,
      campaign,
      reason: args.reason,
      creativeThemes,
      requestedVariants,
    });

    if (variants.length === 0) {
      return {
        ok: false,
        status: "creative_generation_failed",
        error: "No creative variants could be generated",
      };
    }

    const payload = variants.map((variant, index) => ({
      campaign_id: args.campaignId,
      variant_data: {
        ...variant,
        reason: args.reason,
        campaign_name: args.campaignName,
        source_run_id: args.sourceRunId || null,
        variant_index: index,
      },
      status: "pending_approval",
    }));

    const { data: insertedRows, error: insertError } = await supabaseAdmin
      .from("creative_queue")
      .insert(payload)
      .select("id, variant_data");

    if (insertError || !insertedRows) {
      throw new Error(`creative_queue_insert_failed: ${insertError?.message || "unknown"}`);
    }

    await sendSlackCreativeApproval({
      campaignName: args.campaignName,
      reason: args.reason,
      variants,
      queueIds: insertedRows.map((row: any) => row.id),
    });

    return {
      ok: true,
      status: "creative_queued",
      detail: {
        variants_generated: variants.length,
        queue_ids: insertedRows.map((row: any) => row.id),
      },
    };
  } catch (error: any) {
    return {
      ok: false,
      status: "creative_queue_error",
      error: error?.message || "Unexpected creative queue error",
    };
  }
}

export async function launchCreativeQueueVariant(
  args: LaunchCreativeQueueArgs,
): Promise<LaunchCreativeQueueResult> {
  try {
    const { data: queueRow, error: queueError } = await supabaseAdmin
      .from("creative_queue")
      .select("id, campaign_id, status, variant_data")
      .eq("id", args.queueId)
      .single();

    if (queueError || !queueRow) {
      return { ok: false, status: "not_found", error: "Creative queue row not found" };
    }

    const { data: campaignRow, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .select("business_id")
      .eq("id", queueRow.campaign_id)
      .single();

    if (campaignError || !campaignRow?.business_id) {
      return { ok: false, status: "campaign_not_found", error: "Campaign for creative queue row not found" };
    }

    const { campaign, business } = await fetchCampaignAndBusiness(queueRow.campaign_id, campaignRow.business_id);

    const accessToken = business.facebook_access_token;
    const adAccountId = business.facebook_ad_account_id?.replace(/^act_/, "");
    const pageId = business.facebook_page_id;

    if (!accessToken || !adAccountId || !pageId || !campaign.meta_adset_id) {
      return {
        ok: false,
        status: "missing_meta_config",
        error: "facebook_access_token, facebook_ad_account_id, facebook_page_id, and campaign.meta_adset_id are required",
      };
    }

    const variant = (queueRow.variant_data || {}) as Record<string, any>;
    const objective = inferObjective(campaign, business);
    const campaignUrl = normalizeUrl(business.website || business.website_url);

    if ((objective === "traffic" || objective === "conversions") && !campaignUrl) {
      return {
        ok: false,
        status: "missing_campaign_url",
        error: "A website URL is required to launch non-lead creative variants",
      };
    }

    const headline = variant.headline || campaign.ad_headline || campaign.name;
    const body = variant.body || variant.copy || campaign.ad_copy || `Check out ${campaign.name}`;
    const ctaType = mapCtaToMetaType(variant.cta);
    const imageUrl = variant.image_url || campaign.ad_image_url || null;

    const linkData = buildCreativeLinkData(objective, {
      headline,
      body,
      ctaType,
      imageUrl,
      leadFormId: campaign.meta_leadform_id || undefined,
      campaignUrl,
    });

    const creativeResult = await metaPost(`/act_${adAccountId}/adcreatives`, {
      name: `${campaign.name} - Refresh Creative`,
      object_story_spec: JSON.stringify({
        page_id: pageId,
        link_data: linkData,
      }),
    }, accessToken);

    if (!creativeResult.ok || !creativeResult.data?.id) {
      return {
        ok: false,
        status: "meta_creative_error",
        error: creativeResult.data?.error?.message || "Failed to create refreshed ad creative",
        detail: { meta_error: creativeResult.data?.error },
      };
    }

    const adResult = await metaPost(`/act_${adAccountId}/ads`, {
      name: `${campaign.name} - Refresh Ad`,
      adset_id: campaign.meta_adset_id,
      creative: JSON.stringify({ creative_id: creativeResult.data.id }),
      status: "PAUSED",
    }, accessToken);

    if (!adResult.ok || !adResult.data?.id) {
      return {
        ok: false,
        status: "meta_ad_error",
        error: adResult.data?.error?.message || "Failed to create refreshed ad",
        detail: { meta_error: adResult.data?.error },
      };
    }

    await metaPost(`/${adResult.data.id}`, { status: "ACTIVE" }, accessToken);

    if (args.pauseExistingAd && campaign.meta_ad_id) {
      await metaPost(`/${campaign.meta_ad_id}`, { status: "PAUSED" }, accessToken);
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("creative_queue")
      .update({
        status: "launched",
        approved_by: args.userId,
        approved_at: now,
        launched_at: now,
        meta_ad_id: adResult.data.id,
      })
      .eq("id", args.queueId);

    await supabaseAdmin
      .from("campaigns")
      .update({
        meta_ad_id: adResult.data.id,
        ad_headline: headline,
        ad_copy: body,
        ad_image_url: imageUrl,
      })
      .eq("id", campaign.id);

    await sendSlackCreativeLaunched({
      campaignName: campaign.name,
      headline,
      queueId: args.queueId,
      metaAdId: adResult.data.id,
    });

    return {
      ok: true,
      status: "launched",
      detail: {
        campaign_id: campaign.id,
        queue_id: args.queueId,
        meta_ad_id: adResult.data.id,
        creative_id: creativeResult.data.id,
      },
    };
  } catch (error: any) {
    return {
      ok: false,
      status: "launch_error",
      error: error?.message || "Unexpected launch error",
    };
  }
}

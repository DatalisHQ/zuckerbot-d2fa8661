# ZuckerBot → Ad Factory Adapter — Codex Build Spec

## Problem

ZuckerBot's `request_creative` generates creative briefs with angle names, hooks, messages, and CTAs. The Sophiie Ad Factory expects a completely different payload: full scripts (hook_script, voiceover_script, cta_script, full_script) plus a Sora video prompt. There's no translation layer between them.

## What the Ad Factory Expects

The n8n webhook accepts a POST with this schema:

```json
{
  "runId": "uuid-v4",
  "callbackUrl": "https://sophiieadfactory-production.up.railway.app/api/jobs/{runId}/callback",
  "fontPreset": "impact_blue",
  "ads": [
    {
      "name": "Hook - Never Miss a Call",
      "hook_script": "You're a tradie, not a receptionist. So why are you answering phones all day?",
      "voiceover_script": "Sophiie answers your calls 24/7. Books appointments. Sends quotes. So you can stay on the tools where you belong.",
      "cta_script": "Book a free demo at sophiie.ai",
      "full_script": "HOOK: You're a tradie, not a receptionist...\nVO: Sophiie answers your calls...\nCTA: Book a free demo...",
      "sora_prompt": "A tired Australian tradesman lying under a kitchen sink fixing pipes, phone ringing on the counter above, warm natural lighting, realistic UGC style, handheld camera feel"
    }
  ]
}
```

## What ZuckerBot Currently Outputs

The `request_creative` endpoint returns:

```json
{
  "angles": [
    {
      "angle_name": "Never Miss a Call",
      "hook": "While you're under the sink, your AI receptionist just booked your next 3 jobs",
      "message": "Show tradesperson working while phone rings in background, then cut to AI handling calls...",
      "cta": "Book a Demo",
      "variants": 3
    }
  ]
}
```

## The Gap

ZuckerBot has angle descriptions. The Ad Factory needs production-ready scripts and Sora prompts. The adapter must use Claude to expand each angle into full scripts.

## Solution

### 1. Ad Factory Adapter in request_creative

When `request_creative` is called with a `creative_handoff.webhook_url`, and the business has an `ad_factory_config` stored (or the webhook URL matches a known Ad Factory pattern), ZuckerBot:

1. Takes the approved creative angles from the campaign strategy
2. For each angle, calls Claude to generate:
   - `hook_script`: 1-2 sentences, punchy opening (matches the angle's hook concept)
   - `voiceover_script`: 3-5 sentences, the main sell
   - `cta_script`: 1 sentence, clear call to action
   - `full_script`: Concatenation of all three with labels
   - `sora_prompt`: Detailed text-to-video prompt for Sora 2 Pro (scene, character, lighting, camera style)
3. Formats the payload in the Ad Factory's expected schema
4. POSTs to the n8n webhook URL
5. Stores the `runId` on the campaign's `workflow_state` for callback tracking

### 2. Script Generation Prompt

```typescript
function buildScriptGenerationPrompt(
  angle: CreativeAngle,
  business: WebScrapedContext,
  market: string,
  productFocus: string,
  fontPreset: string,
): string {
  return `You are a direct-response ad scriptwriter for video ads targeting 
${market === 'AU' ? 'Australian' : market === 'UK' ? 'British' : market === 'US' ? 'American' : 'New Zealand'} 
trades businesses (plumbers, electricians, HVAC, builders).

BUSINESS: ${business.business_name}
PRODUCT: ${business.primary_product_focus}
PRODUCT FOCUS FOR THIS AD: ${productFocus}
TARGET AUDIENCE: ${business.target_audience?.join(', ')}

CREATIVE ANGLE:
- Name: ${angle.angle_name}
- Hook concept: ${angle.hook}
- Message direction: ${angle.message}
- CTA: ${angle.cta}
- Format: ${angle.format}

Generate a complete ad script as JSON:
{
  "name": "Hook - ${angle.angle_name}",
  "hook_script": "Opening 1-2 sentences. Punchy, relatable, stops the scroll. Use ${market === 'AU' ? 'Australian slang and casual tone' : market === 'UK' ? 'British English and relatable tone' : 'American English'}. Must hook within 3 seconds.",
  "voiceover_script": "Main sell, 3-5 sentences. Explain the benefit, paint the picture of life with the product. Be specific about what it does (answers calls, books appointments, sends quotes). Reference the specific product focus: ${productFocus}.",
  "cta_script": "Clear call to action, 1 sentence. Direct the viewer to ${angle.cta.toLowerCase()} at sophiie.ai.",
  "full_script": "HOOK: [hook_script]\\nVO: [voiceover_script]\\nCTA: [cta_script]",
  "sora_prompt": "Detailed scene description for Sora 2 Pro video generation. Include: specific character (${market === 'AU' ? 'Australian tradesman in high-vis or work clothes' : market === 'UK' ? 'British tradesperson in work gear' : 'American contractor'}), specific setting (job site, van, under a sink, on a roof, etc.), action, lighting (natural, warm), camera style (handheld UGC feel, realistic), mood. 12 seconds of footage. No text overlays — those are added in post."
}

RULES:
- Scripts should feel like they were written by a tradie, not a marketer
- Keep it conversational and authentic
- Reference specific trade scenarios (under a sink, on a roof, in the van between jobs)
- The hook must work in the first 3 seconds of a video
- The Sora prompt must describe a SINGLE continuous scene, not multiple cuts
- No emojis in scripts
- Product name is "Sophiie" (pronounced "Sophie")

Return ONLY the JSON object, no markdown fences.`;
}
```

### 3. Payload Assembly

```typescript
async function buildAdFactoryPayload(
  campaign: Campaign,
  angles: CreativeAngle[],
  config: {
    webhookUrl: string;
    callbackBaseUrl: string;
    fontPreset: string;
    market: string;
    productFocus: string;
  },
  business: Business,
): Promise<AdFactoryPayload> {
  const runId = crypto.randomUUID();
  
  // Generate scripts for each angle using Claude
  const ads = [];
  for (const angle of angles) {
    const prompt = buildScriptGenerationPrompt(
      angle, 
      business.web_context,
      config.market,
      config.productFocus,
      config.fontPreset,
    );
    
    const scriptJson = await callClaude(prompt);
    const script = JSON.parse(scriptJson);
    
    // Generate multiple variants if requested
    for (let v = 0; v < (angle.variants_recommended || 1); v++) {
      if (v === 0) {
        ads.push(script);
      } else {
        // For variants, regenerate with a "variation" instruction
        const variantPrompt = prompt + `\n\nThis is VARIANT ${v + 1}. Use the same angle but with a DIFFERENT hook, different scene, and different wording. Do not repeat the previous version.`;
        const variantJson = await callClaude(variantPrompt);
        const variant = JSON.parse(variantJson);
        variant.name = `${script.name} - V${v + 1}`;
        ads.push(variant);
      }
    }
  }
  
  return {
    runId,
    callbackUrl: `${config.callbackBaseUrl}/api/jobs/${runId}/callback`,
    fontPreset: config.fontPreset,
    ads,
  };
}
```

### 4. Dispatch and Callback

```typescript
// In request_creative handler, after building the payload:

// POST to Ad Factory n8n webhook
const response = await fetch(config.webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(adFactoryPayload),
});

// Store the runId for callback tracking
await updateCampaignWorkflowState(campaign.id, {
  ad_factory_run_id: adFactoryPayload.runId,
  ad_factory_dispatched_at: new Date().toISOString(),
  ad_factory_status: 'dispatched',
});

// Send Slack notification
await sendSlackNotification({
  text: `🎬 Ad Factory job dispatched for campaign "${campaign.business_name}".\nRun ID: ${adFactoryPayload.runId}\n${adFactoryPayload.ads.length} variants queued.\nEstimated completion: ~${adFactoryPayload.ads.length * 13} minutes.`,
});
```

### 5. Callback Endpoint

When the Ad Factory finishes, it POSTs results back. ZuckerBot needs to receive these and store the Cloudinary URLs as pending creatives.

```typescript
// POST /api/v1/campaigns/:id/creative-callback
// Already exists in the codebase — but needs to handle Ad Factory's result format:

/*
Ad Factory callback payload:
{
  "runId": "...",
  "step": "complete",
  "results": [
    {
      "variantIndex": 1,
      "name": "Hook - Never Miss a Call",
      "cloudinaryUrl": "https://res.cloudinary.com/...",
      "thumbnailUrl": "https://res.cloudinary.com/...",
      "driveFolderUrl": "https://drive.google.com/..."
    }
  ]
}
*/

// Map Ad Factory results to ZuckerBot creative records
for (const result of callback.results) {
  // Find the matching angle from the approved strategy
  const angle = findAngleByName(campaign, result.name);
  
  // Store as a pending creative (not yet uploaded to Meta)
  await storePendingCreative({
    campaign_id: campaign.id,
    angle_name: angle?.angle_name || result.name,
    variant_index: result.variantIndex,
    asset_url: result.cloudinaryUrl,
    asset_type: 'video',
    thumbnail_url: result.thumbnailUrl,
    status: 'pending_review',  // Needs human approval before upload to Meta
  });
}

// Update workflow state
await updateCampaignWorkflowState(campaign.id, {
  ad_factory_status: 'complete',
  ad_factory_completed_at: new Date().toISOString(),
  pending_creatives: callback.results.length,
});

// Send Slack notification
await sendSlackNotification({
  text: `✅ Ad Factory complete for "${campaign.business_name}".\n${callback.results.length} video variants ready for review.\nApprove via ZuckerBot dashboard or MCP tools.`,
});
```

### 6. Ad Factory Config on Business

Store per-business Ad Factory configuration so it doesn't need to be passed every time:

```sql
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS ad_factory_webhook_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ad_factory_callback_base_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ad_factory_font_preset text DEFAULT 'impact_blue',
  ADD COLUMN IF NOT EXISTS ad_factory_default_market text DEFAULT 'AU';
```

### 7. MCP Tool Update

Update `zuckerbot_request_creative` to support dispatching to the Ad Factory:

```typescript
{
  name: "zuckerbot_request_creative",
  description: "Create or dispatch a creative handoff package for an approved intelligence campaign. When an Ad Factory webhook URL is configured (on the business or in creative_handoff), ZuckerBot generates full ad scripts using Claude and dispatches them to the Ad Factory's n8n webhook. The Ad Factory then generates videos and calls back with Cloudinary URLs.",
  inputSchema: {
    type: "object",
    properties: {
      campaign_id: { type: "string", description: "Intelligence campaign ID" },
      creative_handoff: {
        type: "object",
        properties: {
          webhook_url: { type: "string", description: "Ad Factory n8n webhook URL" },
          callback_url: { type: "string", description: "Base URL for Ad Factory callbacks" },
          product_focus: { type: "string", description: "Product focus for scripts (e.g., 'Full Product', 'Missed Calls')" },
          font_preset: { type: "string", description: "Ad Factory font preset (e.g., 'impact_blue', 'Sophiie Blue')" },
          market: { type: "string", description: "Target market for localised scripts (AU, UK, US, NZ)" },
          notes: { type: "string", description: "Additional production notes" },
          reference_urls: { type: "array", items: { type: "string" } },
        }
      }
    },
    required: ["campaign_id"]
  }
}
```

## Build Order

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | Script generation prompt + Claude integration | 2-3 hrs | Core translation layer |
| 2 | Ad Factory payload assembly (angles → scripts → payload) | 2 hrs | Formats for n8n webhook |
| 3 | Dispatch to n8n webhook from request_creative | 1 hr | Sends the brief |
| 4 | Creative callback handler (Ad Factory → ZuckerBot) | 2 hrs | Receives finished videos |
| 5 | Ad Factory config on businesses table | 30 min | Per-business config |
| 6 | Slack notifications for dispatch and completion | 30 min | Visibility |
| 7 | Variant generation (multiple scripts per angle) | 1 hr | Production volume |

**Total: ~1.5 days focused Codex work**

## Codex Prompt

```
Add an Ad Factory adapter to ZuckerBot's request_creative flow.

When request_creative is called with a webhook_url (either in creative_handoff 
or stored on the business as ad_factory_webhook_url), ZuckerBot should:

1. Take the approved creative angles from the campaign strategy
2. For each angle, call Claude to generate full ad scripts:
   - hook_script (1-2 sentences, punchy opener)
   - voiceover_script (3-5 sentences, main sell)
   - cta_script (1 sentence, call to action)
   - full_script (concatenation with labels)
   - sora_prompt (detailed Sora 2 Pro video scene description)
3. Format as the Ad Factory's expected payload:
   { runId, callbackUrl, fontPreset, ads: [{name, hook_script, voiceover_script, cta_script, full_script, sora_prompt}] }
4. POST to the webhook URL
5. Store runId on campaign workflow_state
6. Send Slack notification

The callback endpoint (POST /api/v1/campaigns/:id/creative-callback) should 
handle the Ad Factory's result format:
{ runId, step: "complete", results: [{variantIndex, name, cloudinaryUrl, thumbnailUrl, driveFolderUrl}] }

Map results to pending creative records, update workflow state, send Slack notification.

Add business-level config columns:
- ad_factory_webhook_url text
- ad_factory_callback_base_url text  
- ad_factory_font_preset text DEFAULT 'impact_blue'
- ad_factory_default_market text DEFAULT 'AU'

The script generation prompt should produce scripts that feel authentic to 
trades businesses — conversational, specific scenarios (under the sink, on 
the roof, in the van), localised by market (AU/UK/US/NZ slang and accents 
in the Sora prompt). Product name is "Sophiie" (pronounced "Sophie").

For multiple variants per angle, regenerate with variation instructions 
so each variant has a different hook, scene, and wording.
```

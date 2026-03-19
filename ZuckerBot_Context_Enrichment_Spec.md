# ZuckerBot Context Enrichment — Codex Build Spec

## Problem

The Campaign Intelligence Layer generates mediocre strategies when it lacks business context. Currently it depends on CAPI/CRM data and historical Meta insights — but most new users won't have either. A brand new user who connects their Meta account and enters a URL gets a strategy based on generic market research. That's not good enough.

We need two additional context sources that work for ANY business, even one with zero ad history and no CRM:

1. **Agentic web scrape** — automatically extract business context from the user's website
2. **User uploads** — let users provide additional data (CSVs, PDFs, text) that enriches the context

Both feed into the same `CampaignContext` object the intelligence layer already uses.

---

## Part 1: Agentic Business Context Extraction

### What it does

When a user provides a URL during campaign creation (or business onboarding), ZuckerBot crawls the site and extracts structured business intelligence. This runs automatically — no user input needed beyond the URL.

### What to extract

```typescript
interface WebScrapedContext {
  // Business basics
  business_name: string;
  tagline?: string;
  description: string;           // 2-3 sentence summary of what the business does
  business_type: string;         // 'saas', 'local_services', 'ecommerce', 'agency', etc.
  
  // Product/Service info
  products_services: Array<{
    name: string;
    description: string;
    price?: string;              // "$300/mo", "From $49", "Free trial", etc.
    key_features?: string[];
  }>;
  primary_product_focus?: string; // The main thing they sell
  
  // Target market signals
  target_audience: string[];     // ["trades businesses", "plumbers", "electricians"]
  industries_served?: string[];  // ["construction", "automotive", "healthcare"]
  geographic_focus?: string[];   // ["Australia", "UK", "US"] — from content/language cues
  
  // Value propositions (for ad copy)
  value_props: string[];         // ["24/7 availability", "Save $58K/year", "Never miss a call"]
  pain_points_addressed: string[]; // ["missed calls", "expensive receptionists", "after-hours"]
  social_proof: Array<{
    type: 'testimonial' | 'stat' | 'logo' | 'award' | 'review_count';
    content: string;             // "Over 3,000 businesses trust us" or "4.8 stars on Google"
  }>;
  
  // Competitive positioning
  differentiators: string[];     // What makes them different from competitors
  competitors_mentioned?: string[]; // Any competitors named on the site
  
  // Technical/marketing signals
  has_pricing_page: boolean;
  has_free_trial: boolean;
  has_demo_booking: boolean;
  primary_cta: string;           // "Start Free Trial", "Book a Demo", "Get a Quote"
  languages_detected: string[];  // ['en-AU', 'en-GB']
  
  // Ad-relevant assets
  logo_url?: string;
  hero_images?: string[];        // URLs of key hero/banner images
  video_urls?: string[];         // Any embedded videos (YouTube, Vimeo, etc.)
  
  // Metadata
  scraped_at: string;
  pages_crawled: number;
  source_urls: string[];
}
```

### Implementation

```typescript
// POST /api/v1/businesses/:id/enrich
// Also called automatically during campaign creation if no cached context exists

async function enrichBusinessContext(businessId: string, url: string): Promise<WebScrapedContext> {
  // Step 1: Fetch the homepage
  const homepage = await fetchAndParse(url);
  
  // Step 2: Identify key pages to crawl (max 5-8 pages)
  const pagesToCrawl = identifyKeyPages(homepage, url);
  // Priority: homepage, pricing, about, features/product, testimonials/reviews
  // Skip: blog posts, legal pages, careers, etc.
  
  // Step 3: Fetch and parse each page
  const pageContents = await Promise.all(
    pagesToCrawl.map(pageUrl => fetchAndParse(pageUrl))
  );
  
  // Step 4: Feed all page content to Claude for structured extraction
  const extractionPrompt = buildExtractionPrompt(pageContents);
  const context = await callClaude(extractionPrompt);
  
  // Step 5: Store on the business record
  await supabase
    .from('businesses')
    .update({ 
      web_context: context,
      web_context_updated_at: new Date().toISOString()
    })
    .eq('id', businessId);
  
  return context;
}
```

### Extraction Prompt (fed to Claude)

```
You are extracting structured business intelligence from a website to inform 
Meta ad campaign strategy. Analyze the following pages and return a JSON object.

PAGES:
${pageContents.map(p => `--- ${p.url} ---\n${p.text}`).join('\n\n')}

Extract the following as JSON (omit fields you can't confidently determine):

{
  "business_name": "string",
  "tagline": "string or null",
  "description": "2-3 sentence summary of what this business does and who it serves",
  "business_type": "one of: saas, local_services, ecommerce, agency, marketplace, education, healthcare, finance, other",
  "products_services": [{"name": "...", "description": "...", "price": "...", "key_features": [...]}],
  "primary_product_focus": "The single most important product/service",
  "target_audience": ["who they sell to — be specific"],
  "industries_served": ["if B2B, which industries"],
  "geographic_focus": ["countries/regions based on language, currency, phone numbers, addresses"],
  "value_props": ["key selling points, max 5"],
  "pain_points_addressed": ["problems they solve, max 5"],
  "social_proof": [{"type": "testimonial|stat|logo|award|review_count", "content": "..."}],
  "differentiators": ["what makes them unique vs competitors"],
  "has_pricing_page": true/false,
  "has_free_trial": true/false,
  "has_demo_booking": true/false,
  "primary_cta": "The main call-to-action button text",
  "languages_detected": ["en-AU", "en-GB", etc.],
  "logo_url": "URL or null",
  "hero_images": ["URLs of key images"],
  "video_urls": ["URLs of embedded videos"]
}

IMPORTANT:
- Be specific about target audience. "Small businesses" is too vague. "Australian trades businesses (plumbers, electricians, HVAC)" is good.
- Extract actual numbers from social proof. "Over 3,000 businesses" not "many businesses".
- Geographic focus should be inferred from currency symbols, phone number formats, addresses, language variants (en-AU vs en-US), and any explicit market mentions.
- Value props should be phrased as ad-ready benefit statements.
- Pain points should be the problems the audience has BEFORE using this product.
```

### How it feeds into Campaign Intelligence

The `CampaignContext` assembly function adds a new section:

```typescript
// In the campaign context assembler:
if (!context.business.description || !context.business.target_audience) {
  // No business context yet — scrape the website
  const webContext = await enrichBusinessContext(business.id, url);
  
  context.business.name = webContext.business_name;
  context.business.type = webContext.business_type;
  context.business.description = webContext.description;
  context.business.target_audience = webContext.target_audience;
  context.business.industries_served = webContext.industries_served;
  context.business.geographic_focus = webContext.geographic_focus;
  context.business.products = webContext.products_services;
  context.business.value_props = webContext.value_props;
  context.business.pain_points = webContext.pain_points_addressed;
  context.business.social_proof = webContext.social_proof;
  context.business.differentiators = webContext.differentiators;
  context.business.primary_cta = webContext.primary_cta;
}
```

Then the campaign planning prompt receives all of this context, and Claude generates audience tiers and creative angles that are actually specific to the business — not generic "local services" targeting.

### Database changes

```sql
-- Add web context storage to businesses table
ALTER TABLE public.businesses 
  ADD COLUMN IF NOT EXISTS web_context jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS web_context_updated_at timestamptz DEFAULT NULL;
```

### MCP Tool

```typescript
{
  name: "zuckerbot_enrich_business",
  description: "Crawl a business website and extract structured context (product info, target audience, value propositions, social proof, pricing, geographic focus). This context is used by the Campaign Intelligence Layer to generate data-informed campaign strategies. Runs automatically during campaign creation but can also be triggered manually to refresh stale context.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Business website URL to crawl" },
      business_id: { type: "string", description: "Optional business ID to store results against" },
      force_refresh: { type: "boolean", description: "Re-scrape even if cached context exists (default: false)" }
    },
    required: ["url"]
  }
}
```

### Caching / Refresh

- Web context is cached on the `businesses` table
- Auto-refresh if `web_context_updated_at` is older than 30 days
- Manual refresh via MCP tool or Settings page
- Don't re-scrape on every campaign creation — use cached context

---

## Part 2: User Data Uploads

### What it does

Users can upload files (CSV, PDF, text) that provide additional business context. This is for data that can't be scraped from a website:

- Historical ad performance from other platforms (Google Ads, TikTok, etc.)
- Customer lists or segment breakdowns
- Brand guidelines or tone of voice documents
- Competitor analysis reports
- Sales data or conversion funnels
- Any other context they want the intelligence layer to consider

### Upload Flow

```
User uploads file(s) via Settings page or MCP tool
  → ZuckerBot stores the raw file (Supabase Storage or S3)
  → Claude extracts structured context from the file
  → Extracted context is stored as JSON on the business record
  → Campaign Intelligence Layer includes it in the planning prompt
```

### What gets extracted

Depends on the file type, but the goal is always: structured data that informs campaign strategy.

```typescript
interface UserUploadedContext {
  uploads: Array<{
    id: string;
    filename: string;
    file_type: string;         // 'csv', 'pdf', 'txt', 'md'
    uploaded_at: string;
    
    // Claude-extracted summary
    summary: string;           // 1-2 paragraph summary of what this file contains
    context_type: string;      // 'ad_performance', 'customer_data', 'brand_guidelines', 'competitor_analysis', 'sales_data', 'other'
    
    // Structured extractions (varies by context_type)
    extracted_data: {
      // For ad_performance:
      historical_cpl?: number;
      historical_ctr?: number;
      best_performing_audiences?: string[];
      best_performing_creatives?: string[];
      
      // For customer_data:
      customer_segments?: Array<{ name: string; size: number; characteristics: string }>;
      top_converting_demographics?: string[];
      geographic_distribution?: Record<string, number>;
      
      // For brand_guidelines:
      tone_of_voice?: string;
      brand_values?: string[];
      messaging_dos?: string[];
      messaging_donts?: string[];
      color_palette?: string[];
      
      // For competitor_analysis:
      competitors?: Array<{ name: string; positioning: string; weaknesses: string[] }>;
      market_gaps?: string[];
      
      // For sales_data:
      average_deal_value?: number;
      sales_cycle_length?: string;
      conversion_rates_by_stage?: Record<string, number>;
      
      // Generic
      key_insights?: string[];  // Always extracted regardless of type
    };
  }>;
}
```

### API Endpoints

```
POST /api/v1/businesses/:id/uploads          — Upload a file + trigger extraction
GET  /api/v1/businesses/:id/uploads          — List uploaded files and their extracted context
DELETE /api/v1/businesses/:id/uploads/:fileId — Remove an upload
POST /api/v1/businesses/:id/uploads/:fileId/re-extract — Re-run extraction on an existing upload
```

### Upload Processing

```typescript
async function processUpload(businessId: string, file: File): Promise<UploadedContext> {
  // Step 1: Store raw file
  const filePath = `business-uploads/${businessId}/${file.name}`;
  await supabase.storage.from('uploads').upload(filePath, file);
  
  // Step 2: Extract text content
  let textContent: string;
  if (file.type === 'text/csv') {
    textContent = await parseCSV(file);
  } else if (file.type === 'application/pdf') {
    textContent = await parsePDF(file);
  } else {
    textContent = await file.text();
  }
  
  // Step 3: Claude extracts structured context
  const extraction = await callClaude(`
    You are extracting business intelligence from a user-uploaded file to inform 
    Meta ad campaign strategy.
    
    FILE NAME: ${file.name}
    FILE TYPE: ${file.type}
    CONTENT:
    ${textContent.slice(0, 50000)}  // Cap at ~50K chars
    
    First, determine what type of data this is:
    - ad_performance: Historical ad metrics, campaign results
    - customer_data: Customer lists, segments, demographics
    - brand_guidelines: Brand voice, messaging guidelines, visual identity
    - competitor_analysis: Competitor research, market positioning
    - sales_data: Revenue, conversion funnels, deal data
    - other: Anything else useful for ad strategy
    
    Then extract structured data as JSON:
    {
      "summary": "1-2 paragraph description of what this file contains",
      "context_type": "one of the types above",
      "extracted_data": {
        // Type-specific fields (see schema above)
        "key_insights": ["Always include 3-5 key takeaways relevant to ad strategy"]
      }
    }
    
    Focus on information that would help create better-targeted, higher-converting 
    Meta ad campaigns. Ignore irrelevant data.
  `);
  
  // Step 4: Store extraction result
  const uploadRecord = {
    id: gen_random_uuid(),
    business_id: businessId,
    filename: file.name,
    file_type: file.type,
    file_path: filePath,
    summary: extraction.summary,
    context_type: extraction.context_type,
    extracted_data: extraction.extracted_data,
    uploaded_at: new Date().toISOString(),
  };
  
  await supabase.from('business_uploads').insert(uploadRecord);
  
  return uploadRecord;
}
```

### Database changes

```sql
CREATE TABLE IF NOT EXISTS public.business_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_type text NOT NULL,
  file_path text NOT NULL,
  file_size_bytes integer,
  summary text,
  context_type text,          -- 'ad_performance', 'customer_data', 'brand_guidelines', etc.
  extracted_data jsonb,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_uploads_business ON public.business_uploads(business_id);

ALTER TABLE public.business_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_uploads_select_own" ON public.business_uploads
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "business_uploads_insert_own" ON public.business_uploads
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "business_uploads_delete_own" ON public.business_uploads
  FOR DELETE USING (user_id = auth.uid());
```

### MCP Tools

```typescript
{
  name: "zuckerbot_upload_business_context",
  description: "Upload a file (CSV, PDF, or text) containing business context that the Campaign Intelligence Layer will use when generating campaign strategies. Examples: historical ad performance data, customer segment breakdowns, brand guidelines, competitor analysis, sales funnel data. The file is processed by AI to extract structured insights.",
  inputSchema: {
    type: "object",
    properties: {
      business_id: { type: "string", description: "Business ID" },
      filename: { type: "string", description: "Name of the file" },
      content: { type: "string", description: "File content as text (for CSV/text files)" },
      context_type: { 
        type: "string", 
        enum: ["ad_performance", "customer_data", "brand_guidelines", "competitor_analysis", "sales_data", "other"],
        description: "What type of data this is (auto-detected if not specified)"
      }
    },
    required: ["business_id", "filename", "content"]
  }
}

{
  name: "zuckerbot_list_business_context",
  description: "List all uploaded business context files and their extracted insights for a business.",
  inputSchema: {
    type: "object",
    properties: {
      business_id: { type: "string", description: "Business ID" }
    },
    required: ["business_id"]
  }
}
```

### How it feeds into Campaign Intelligence

```typescript
// In the campaign context assembler:

// Pull all uploaded context for this business
const uploads = await supabase
  .from('business_uploads')
  .select('*')
  .eq('business_id', business.id);

if (uploads.length > 0) {
  context.user_uploaded = uploads.map(u => ({
    context_type: u.context_type,
    summary: u.summary,
    extracted_data: u.extracted_data,
  }));
}
```

Then the campaign planning prompt includes a section like:

```
## User-Provided Business Context
${context.user_uploaded.map(u => `
### ${u.context_type} (${u.filename})
${u.summary}
Key insights: ${u.extracted_data.key_insights.join(', ')}
`).join('\n')}
```

---

## Part 3: Updated Context Hierarchy

The Campaign Intelligence Layer now assembles context in this order:

```
1. CAPI/CRM pipeline data     (if CAPI enabled + events flowing)
2. Historical Meta insights    (if ad account has history)
3. Web-scraped business context (auto-scraped from URL)
4. User-uploaded context        (if files uploaded)
5. Market research              (always available as baseline)
6. Business profile basics      (name, type, currency from businesses table)
```

Every layer is optional. The intelligence prompt adapts:
- All 6 layers available → highly specific, data-driven strategy
- Only layers 3 + 5 → decent strategy based on website content and market benchmarks  
- Only layer 5 → generic but still usable (current behaviour for new users)

The planning prompt should explicitly note what context IS and ISN'T available:

```
## Available Context
✅ Web-scraped business profile (8 pages crawled)
✅ Market research for "AI virtual receptionist, Australia"
❌ No historical Meta ad data (new advertiser)
❌ No CRM pipeline data (CAPI not configured)
✅ User-uploaded: brand_guidelines.pdf, past_google_ads.csv

NOTE: Strategy recommendations are limited by available data. 
Recommendations will improve as more data becomes available 
(especially after CAPI is configured and ad history accumulates).
```

---

## Build Order

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | Web scraping + extraction endpoint | 4-6 hrs | Biggest bang — every user gets better context |
| 2 | Store web_context on businesses table | 30 min | Database change |
| 3 | Integrate web context into campaign planning prompt | 1-2 hrs | Makes intelligence layer use the scraped data |
| 4 | business_uploads table + upload endpoint | 3-4 hrs | Enables user data uploads |
| 5 | Upload processing (CSV/PDF/text → Claude extraction) | 2-3 hrs | AI extraction pipeline |
| 6 | Integrate uploads into campaign planning prompt | 1 hr | Completes the context chain |
| 7 | MCP tools (enrich_business, upload_context, list_context) | 2 hrs | Makes it all accessible |
| 8 | Auto-enrich during campaign creation if no cached context | 1 hr | Seamless UX |

**Total: 2-3 days focused Codex work**

---

## Codex Prompt

```
Add two context enrichment sources to ZuckerBot's Campaign Intelligence Layer.

## 1. Agentic Web Scraping

When creating a campaign or onboarding a business, if no cached web_context 
exists (or it's older than 30 days), automatically crawl the business website 
(max 8 pages: homepage, pricing, about, features, testimonials) and extract 
structured business intelligence using Claude.

Extract: business_name, description, business_type, products_services (with 
pricing), target_audience, industries_served, geographic_focus, value_props, 
pain_points_addressed, social_proof, differentiators, primary_cta, 
has_pricing_page, has_free_trial, has_demo_booking.

Store as web_context (jsonb) and web_context_updated_at on the businesses table.

Add endpoint: POST /api/v1/businesses/:id/enrich
Add MCP tool: zuckerbot_enrich_business

Auto-trigger during campaign creation if web_context is null or stale.

## 2. User Data Uploads

Let users upload files (CSV, PDF, text) containing business context. Process 
each upload through Claude to extract structured insights categorised as: 
ad_performance, customer_data, brand_guidelines, competitor_analysis, 
sales_data, or other.

Create business_uploads table (id, business_id, user_id, filename, file_type, 
file_path, summary, context_type, extracted_data jsonb, uploaded_at).

Add endpoints:
- POST /api/v1/businesses/:id/uploads (upload + extract)
- GET /api/v1/businesses/:id/uploads (list)
- DELETE /api/v1/businesses/:id/uploads/:fileId

Add MCP tools: zuckerbot_upload_business_context, zuckerbot_list_business_context

## 3. Integration

Update the campaign context assembler to include:
- web_context from the businesses table
- extracted_data from business_uploads

Update the campaign planning prompt to show what context IS and ISN'T available,
and to use web-scraped product info, value props, and pain points when generating 
creative angles and targeting.

The hierarchy: CAPI > Meta insights > web scrape > user uploads > market research.
Every layer is optional. The prompt adapts to what's available.
```

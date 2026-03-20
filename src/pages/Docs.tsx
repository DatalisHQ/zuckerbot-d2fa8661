import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BookOpenText,
  Bot,
  Code2,
  Lock,
  TerminalSquare,
  TriangleAlert,
  Wrench,
} from "lucide-react";

import { NavBar } from "@/components/ui/NavBar";
import { SidebarShell } from "@/components/ui/SidebarShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { GradientButton } from "@/components/ui/GradientButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CodeBlock as SharedCodeBlock } from "@/components/ui/CodeBlock";

// ── Sidebar sections ───────────────────────────────────────────────────────

const sections = [
  { id: "getting-started", label: "Getting Started" },
  { id: "authentication", label: "Authentication" },
  { id: "endpoints", label: "Endpoints" },
  { id: "ep-preview", label: "POST /campaigns/preview", indent: true },
  { id: "ep-create", label: "POST /campaigns/create", indent: true },
  { id: "ep-business-enrich", label: "POST /businesses/:id/enrich", indent: true },
  { id: "ep-business-uploads-list", label: "GET /businesses/:id/uploads", indent: true },
  { id: "ep-business-uploads-create", label: "POST /businesses/:id/uploads", indent: true },
  { id: "ep-business-uploads-reextract", label: "POST /businesses/:id/uploads/:fileId/re-extract", indent: true },
  { id: "ep-detail", label: "GET /campaigns/:id", indent: true },
  { id: "ep-approve-strategy", label: "POST /campaigns/:id/approve-strategy", indent: true },
  { id: "ep-request-creative", label: "POST /campaigns/:id/request-creative", indent: true },
  { id: "ep-upload-creative", label: "POST /campaigns/:id/upload-creative", indent: true },
  { id: "ep-activate", label: "POST /campaigns/:id/activate", indent: true },
  { id: "ep-launch", label: "POST /campaigns/:id/launch", indent: true },
  { id: "ep-pause", label: "POST /campaigns/:id/pause", indent: true },
  { id: "ep-performance", label: "GET /campaigns/:id/performance", indent: true },
  { id: "ep-conversions", label: "POST /campaigns/:id/conversions", indent: true },
  { id: "ep-audiences-create-seed", label: "POST /audiences/create-seed", indent: true },
  { id: "ep-audiences-create-lal", label: "POST /audiences/create-lal", indent: true },
  { id: "ep-audiences-list", label: "GET /audiences/list", indent: true },
  { id: "ep-audiences-refresh", label: "POST /audiences/refresh", indent: true },
  { id: "ep-audience-status", label: "GET /audiences/:id/status", indent: true },
  { id: "ep-audience-delete", label: "DELETE /audiences/:id", indent: true },
  { id: "ep-reviews", label: "POST /research/reviews", indent: true },
  { id: "ep-competitors", label: "POST /research/competitors", indent: true },
  { id: "ep-market", label: "POST /research/market", indent: true },
  { id: "ep-creatives", label: "POST /creatives/generate", indent: true },
  { id: "ep-keys", label: "POST /keys/create", indent: true },
  { id: "ep-meta-ad-accounts", label: "GET /meta/ad-accounts", indent: true },
  { id: "ep-meta-select-ad-account", label: "POST /meta/select-ad-account", indent: true },
  { id: "ep-lead-forms", label: "GET /lead-forms", indent: true },
  { id: "ep-lead-forms-select", label: "POST /lead-forms/select", indent: true },
  { id: "ep-pixels", label: "GET /pixels", indent: true },
  { id: "ep-pixels-select", label: "POST /pixels/select", indent: true },
  { id: "mcp-server", label: "MCP Server" },
  { id: "rate-limits", label: "Rate Limits" },
  { id: "errors", label: "Errors" },
  { id: "pricing", label: "Pricing" },
];

const docsSidebarItems = [
  { id: "getting-started", label: "Getting Started", href: "#getting-started", icon: BookOpenText },
  { id: "api-reference", label: "API Reference", href: "#endpoints", icon: Code2 },
  { id: "mcp-integration", label: "MCP Integration", href: "#mcp-server", icon: TerminalSquare },
  { id: "authentication", label: "Authentication", href: "#authentication", icon: Lock },
  { id: "troubleshooting", label: "Troubleshooting", href: "#errors", icon: Wrench },
];

function resolveSidebarItem(sectionId: string) {
  if (sectionId === "getting-started") return "getting-started";
  if (sectionId === "authentication") return "authentication";
  if (sectionId === "mcp-server") return "mcp-integration";
  if (sectionId === "errors" || sectionId === "rate-limits") return "troubleshooting";
  return "api-reference";
}

// ── Code block component ───────────────────────────────────────────────────

function CodeBlock({ title, lang, children }: { title?: string; lang?: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4">
      <button
        onClick={handleCopy}
        className="absolute right-4 top-3 z-10 font-label text-[10px] font-semibold uppercase tracking-[0.18em] text-outline transition-colors hover:text-on-surface"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <SharedCodeBlock title={title} bodyClassName="text-primary-fixed-dim">
        {children}
      </SharedCodeBlock>
    </div>
  );
}

// ── Method badge ───────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const color = method === "GET"
    ? "border border-tertiary/20 bg-tertiary-container/20 text-tertiary"
    : method === "POST"
    ? "border border-primary/20 bg-primary/10 text-primary"
    : "border border-outline-variant/20 bg-surface-container-high text-on-surface-variant";

  return (
    <span className={`rounded-full px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.2em] ${color}`}>
      {method}
    </span>
  );
}

// ── Endpoint section component ─────────────────────────────────────────────

function EndpointSection({
  id,
  method,
  path,
  description,
  requestBody,
  responseBody,
  curlExample,
  notes,
}: {
  id: string;
  method: string;
  path: string;
  description: string;
  requestBody?: string;
  responseBody: string;
  curlExample: string;
  notes?: string;
}) {
  return (
    <GlassCard id={id} className="scroll-mt-24 p-6 sm:p-8">
      <div className="mb-3 flex items-center gap-3">
        <MethodBadge method={method} />
        <code className="text-lg font-mono font-semibold text-on-surface">{path}</code>
      </div>
      <p className="mb-4 leading-relaxed text-on-surface-variant">{description}</p>
      {notes && (
        <p className="mb-4 text-sm leading-relaxed text-outline">{notes}</p>
      )}

      {requestBody && (
        <>
          <h4 className="mb-2 text-sm font-semibold text-on-surface">Request Body</h4>
          <CodeBlock lang="json" title="JSON">{requestBody}</CodeBlock>
        </>
      )}

      <h4 className="mb-2 mt-4 text-sm font-semibold text-on-surface">Response</h4>
      <CodeBlock lang="json" title="200 OK">{responseBody}</CodeBlock>

      <h4 className="mb-2 mt-4 text-sm font-semibold text-on-surface">Example</h4>
      <CodeBlock lang="bash" title="curl">{curlExample}</CodeBlock>
    </GlassCard>
  );
}

// ── Main Docs component ────────────────────────────────────────────────────

const Docs = () => {
  const location = useLocation();
  const [activeSection, setActiveSection] = useState("getting-started");

  // Track scroll position for active section highlighting
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  // Scroll to hash on load
  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 100);
      }
    }
  }, [location.hash]);

  const activeSidebarItem = resolveSidebarItem(activeSection);

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <NavBar
        links={[
          { label: "Getting Started", href: "#getting-started" },
          { label: "API Reference", href: "#endpoints" },
          { label: "MCP Integration", href: "#mcp-server" },
          { label: "Authentication", href: "#authentication" },
        ]}
        secondaryAction={{ label: "Execution Log", href: "/execution-log", variant: "tertiary" }}
        primaryAction={{ label: "Get API Key", href: "/auth?returnTo=/developer" }}
      />

      <div className="pt-16">
        <div className="fixed left-0 top-16 hidden h-[calc(100vh-4rem)] w-[18rem] lg:block">
          <SidebarShell
            items={docsSidebarItems}
            activeItem={activeSidebarItem}
            ctaHref="#mcp-server"
            ctaLabel="View MCP Config"
            footerItems={[
              { label: "Dashboard", href: "/dashboard" },
              { label: "Developer", href: "/developer" },
            ]}
            className="h-full"
          />
        </div>

        <main className="px-6 py-8 lg:ml-[18rem] lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-10 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <article className="min-w-0 max-w-4xl space-y-6">

              {/* Getting Started */}
              <GlassCard id="getting-started" className="scroll-mt-24 p-8 sm:p-10">
                <StatusBadge status="ai" className="mb-4">Documentation</StatusBadge>
                <h1 className="font-headline text-4xl font-black tracking-tight text-on-surface sm:text-5xl mb-4">
              ZuckerBot API Documentation
                </h1>
                <p className="text-lg text-on-surface-variant mb-8 leading-relaxed">
              REST API and MCP server for AI agents to create, launch, and optimize
              Meta ad campaigns. Give your agent the ability to run Facebook ads.
                </p>

                <h2 className="font-headline text-2xl font-bold text-on-surface mb-4">Quick start</h2>
                <ol className="space-y-4 text-on-surface-variant mb-6">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">1</span>
                <div>
                  <strong className="text-on-surface">Get an API key</strong>
                  <span className="text-on-surface-variant"> - Sign up at </span>
                  <a href="/auth" className="text-primary hover:text-primary/80 underline underline-offset-2">zuckerbot.ai</a>
                  <span className="text-on-surface-variant"> and create a key from the developer dashboard. Free tier included.</span>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">2</span>
                <div>
                  <strong className="text-on-surface">Make your first call</strong>
                  <span className="text-on-surface-variant"> - Generate an ad preview from any business URL:</span>
                </div>
              </li>
                </ol>

                <CodeBlock title="curl" lang="bash">{`curl -X POST https://zuckerbot.ai/api/v1/campaigns/preview \\
  -H "Authorization: Bearer zb_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://joes-pizza-austin.com"}'`}</CodeBlock>

                <p className="mt-4 leading-relaxed text-on-surface-variant">
              That's it. The API scrapes the website, generates ad copy and images with AI,
              and returns a complete campaign preview in seconds.
                </p>

                <div className="mt-6 rounded-[1.25rem] border border-primary/15 bg-primary/10 p-4">
                  <p className="text-sm text-primary">
                <strong>Base URL:</strong>{" "}
                    <code className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary-fixed-dim">
                  https://zuckerbot.ai/api/v1/
                </code>
                  </p>
                  <p className="mt-1 text-sm text-primary">
                All endpoints are relative to this base URL.
                  </p>
                </div>
              </GlassCard>

              {/* Authentication */}
              <GlassCard id="authentication" className="scroll-mt-24 p-8 sm:p-10">
                <h2 className="font-headline text-2xl font-bold text-on-surface mb-4">Authentication</h2>
                <p className="mb-4 leading-relaxed text-on-surface-variant">
                  All requests require a Bearer token in the <code className="rounded bg-surface-container-high px-1.5 py-0.5 text-sm text-on-surface">Authorization</code> header.
                </p>

                <CodeBlock title="Header">{`Authorization: Bearer zb_live_abc123def456`}</CodeBlock>

                <h3 className="mt-6 mb-3 text-lg font-semibold text-on-surface">API key format</h3>
                <div className="space-y-2 text-on-surface-variant">
              <div className="flex items-start gap-3">
                <code className="text-green-400 bg-green-500/10 px-2 py-0.5 rounded text-xs font-mono shrink-0">zb_live_*</code>
                <span>Production keys. Calls hit real endpoints and count toward your quota.</span>
              </div>
              <div className="flex items-start gap-3">
                <code className="text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded text-xs font-mono shrink-0">zb_test_*</code>
                <span>Sandbox keys. Safe for development. Simulated responses, no real ad spend.</span>
              </div>
                </div>

                <p className="mt-4 leading-relaxed text-on-surface-variant">
              API keys are scoped to your developer account. Create and manage keys from the
                  developer dashboard or via the <code className="rounded bg-surface-container-high px-1.5 py-0.5 text-sm text-on-surface">/v1/keys/create</code> endpoint.
                </p>

                <div className="mt-4 rounded-[1.25rem] border border-error/20 bg-error-container/20 p-4">
                  <p className="text-sm text-on-error-container">
                <strong>Keep keys secret.</strong> Never expose API keys in client-side code or public repositories.
                Rotate keys immediately if compromised.
                  </p>
                </div>
              </GlassCard>

              {/* Endpoints */}
              <GlassCard id="endpoints" className="scroll-mt-24 p-8">
                <h2 className="font-headline text-2xl font-bold text-on-surface mb-2">API Reference</h2>
                <p className="mb-6 text-on-surface-variant">
              10 endpoints covering the full ad campaign lifecycle: research, create, launch, A/B test, monitor, and optimize.
                </p>
              </GlassCard>

          {/* POST /v1/campaigns/preview */}
          <EndpointSection
            id="ep-preview"
            method="POST"
            path="/v1/campaigns/preview"
            description="Generate a campaign preview from a business URL. Scrapes the site, infers business type, generates ad copy and images with AI. No Meta account needed."
            notes="Only the url field is required. Providing review_data and competitor_data steers copy generation for more targeted results."
            requestBody={`{
  "url": "https://joes-pizza-austin.com",
  "ad_count": 2,
  "review_data": {
    "rating": 4.8,
    "review_count": 127,
    "themes": ["fast delivery", "authentic taste"],
    "best_quotes": ["Best pizza in Austin, hands down"]
  },
  "competitor_data": {
    "common_hooks": ["free delivery", "family recipe"],
    "gaps": ["no social proof", "no urgency"]
  }
}`}
            responseBody={`{
  "id": "prev_abc123",
  "business_name": "Joe's Pizza",
  "description": "Authentic New York-style pizza in Austin, TX",
  "ads": [
    {
      "headline": "4.8 Stars, 127 Reviews",
      "copy": "Austin's favorite pizza since 2019. Try the slice that has 127 five-star fans. Order now.",
      "rationale": "Uses the 4.8-star rating as social proof. Competitors are not mentioning reviews.",
      "image_url": "https://storage.zuckerbot.ai/ad-previews/prev-abc123-0.png"
    },
    {
      "headline": "Tonight's Dinner, Sorted",
      "copy": "Hot, fresh, authentic NY-style pizza delivered to your door. Order before 8pm for same-day delivery.",
      "rationale": "Urgency play. Competitors rely on evergreen messaging with no time pressure.",
      "image_url": "https://storage.zuckerbot.ai/ad-previews/prev-abc123-1.png"
    }
  ],
  "enrichment": {
    "has_reviews": true,
    "has_competitors": true,
    "review_themes_used": ["fast delivery", "authentic taste"],
    "competitor_gaps_exploited": ["no social proof", "no urgency"]
  },
  "created_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/campaigns/preview \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://joes-pizza-austin.com"}'`}
          />

          {/* POST /v1/campaigns/create */}
          <EndpointSection
            id="ep-create"
            method="POST"
            path="/v1/campaigns/create"
            description="Create a campaign draft. In intelligence mode, ZuckerBot resolves the linked business, assembles account context, and returns audience tiers, creative angles, warnings, and next steps alongside the legacy compatibility fields."
            notes="Only the url field is required. mode defaults to auto. auto prefers intelligence when a business can be resolved from the API key or business_id; legacy forces the generic flow; intelligence requires a resolvable business."
            requestBody={`{
  "url": "https://joes-pizza-austin.com",
  "business_id": "biz_123",
  "business_name": "Joe's Pizza",
  "business_type": "restaurant",
  "mode": "intelligence",
  "location": {
    "city": "Austin",
    "state": "TX",
    "country": "US",
    "lat": 30.2672,
    "lng": -97.7431
  },
  "budget_daily_cents": 2000,
  "objective": "traffic",
  "goals": {
    "target_monthly_leads": 120,
    "target_cpl": 22,
    "markets_to_target": ["US"]
  },
  "creative_handoff": {
    "webhook_url": "https://studio.example.com/zuckerbot/intake",
    "product_focus": "Family dinner bundles",
    "font_preset": "bold_sans"
  }
}

// Supported objectives:
// "leads"       → Lead forms (OUTCOME_LEADS, ON_AD)
// "traffic"     → Website clicks (OUTCOME_TRAFFIC, WEBSITE) — default
// "conversions" → Website actions (OUTCOME_SALES, WEBSITE, pixel required)
// "awareness"   → Reach (OUTCOME_AWARENESS)`}
            responseBody={`{
  "id": "camp_xyz789",
  "campaign_version": "intelligence",
  "status": "draft",
  "creative_status": "awaiting_strategy_approval",
  "business_name": "Joe's Pizza",
  "business_type": "restaurant",
  "strategy": {
    "objective": "traffic",
    "summary": "Use a broad local prospecting tier to drive scale, support with customer lookalikes, then retarget warm users.",
    "strengths": ["Strong review profile", "Established local brand"],
    "opportunities": ["Frequency risk if creative is not refreshed every 10-14 days"],
    "recommended_daily_budget_cents": 2000,
    "projected_cpl_cents": 2200,
    "projected_monthly_leads": 120
  },
  "targeting": {
    "age_min": 25,
    "age_max": 55,
    "radius_km": 25,
    "interests": [],
    "geo_locations": {
      "countries": ["US"]
    },
    "publisher_platforms": ["facebook", "instagram"],
    "facebook_positions": ["feed"],
    "instagram_positions": ["stream"]
  },
  "audience_tiers": [
    {
      "tier_name": "US Broad ADV+",
      "tier_type": "prospecting_broad",
      "geo": ["US"],
      "targeting_type": "broad",
      "targeting_details": "Broad local prospecting with Meta signal expansion.",
      "age_min": 25,
      "age_max": 55,
      "daily_budget_cents": 1100,
      "budget_pct": 55,
      "expected_cpl": 24,
      "rationale": "Primary scale tier."
    },
    {
      "tier_name": "US Customer LAL",
      "tier_type": "prospecting_lal",
      "geo": ["US"],
      "targeting_type": "lal",
      "targeting_details": "1% customer lookalike seeded from downstream purchase events.",
      "age_min": 25,
      "age_max": 55,
      "daily_budget_cents": 600,
      "budget_pct": 30,
      "expected_cpl": 20,
      "rationale": "Uses the strongest downstream signal."
    }
  ],
  "creative_angles": [
    {
      "angle_name": "Proof Over Promise",
      "hook": "Austin families already trust Joe's Pizza for dinner.",
      "message": "Lead with reviews, consistency, and delivery speed.",
      "cta": "Order Now",
      "format": "static_image",
      "rationale": "Competitors underuse proof.",
      "variants_recommended": 3
    }
  ],
  "variants": [
    {
      "headline": "Proof Over Promise",
      "copy": "Austin families already trust Joe's Pizza for dinner. Lead with reviews, consistency, and delivery speed.",
      "cta": "Order Now",
      "angle": "proof_over_promise",
      "image_prompt": null
    }
  ],
  "total_daily_budget_cents": 2000,
  "total_monthly_budget": 60000,
  "projected_monthly_leads": 120,
  "projected_cpl": 22,
  "warnings": ["Retargeting volume may stay light until site traffic grows."],
  "context_summary": {
    "has_historical_data": true,
    "has_crm_data": true,
    "has_market_data": true,
    "has_portfolio": false,
    "has_web_context": true,
    "has_uploaded_context": true,
    "uploaded_context_count": 2,
    "web_context_age_days": 0,
    "months_of_data": 12
  },
  "goals": {
    "target_monthly_leads": 120,
    "target_cpl": 22,
    "markets_to_target": ["US"]
  },
  "creative_handoff": {
    "webhook_url": "https://studio.example.com/zuckerbot/intake",
    "product_focus": "Family dinner bundles",
    "font_preset": "bold_sans"
  },
  "next_steps": [
    "Approve the strategy and audience tiers.",
    "Request or upload finished creative assets.",
    "Activate the ready audience tiers once assets are attached."
  ],
  "created_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/campaigns/create \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://joes-pizza-austin.com",
    "business_id": "biz_123",
    "mode": "intelligence",
    "objective": "traffic",
    "location": {"city": "Austin", "state": "TX", "country": "US"},
    "budget_daily_cents": 2000,
    "goals": {"target_monthly_leads": 120, "target_cpl": 22}
  }'`}
          />

          <EndpointSection
            id="ep-business-enrich"
            method="POST"
            path="/v1/businesses/:id/enrich"
            description="Crawl the stored business website and cache structured web context used by intelligence planning."
            notes="Accepts either an API key or a signed-in user session. force_refresh bypasses the 30-day cache."
            requestBody={`{
  "url": "https://joes-pizza-austin.com",
  "force_refresh": true
}`}
            responseBody={`{
  "business_id": "biz_123",
  "cached": false,
  "web_context": {
    "business_name": "Joe's Pizza",
    "description": "New York-style pizza shop serving Austin families and late-night delivery customers.",
    "business_type": "local_services",
    "target_audience": ["Austin families", "late-night delivery customers"],
    "value_props": ["Fast delivery", "Authentic NY-style slices"],
    "pain_points_addressed": ["last-minute dinner decisions"],
    "primary_cta": "Order Now",
    "pages_crawled": 5,
    "scraped_at": "2026-03-19T00:00:00Z",
    "source_urls": ["https://joes-pizza-austin.com/"]
  }
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/businesses/biz_123/enrich \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"force_refresh": true}'`}
          />

          <EndpointSection
            id="ep-business-uploads-list"
            method="GET"
            path="/v1/businesses/:id/uploads"
            description="List uploaded business-context files and their extracted summaries."
            responseBody={`{
  "business_id": "biz_123",
  "uploads": [
    {
      "id": "upload_123",
      "filename": "brand-guidelines.md",
      "file_type": "text/markdown",
      "uploaded_at": "2026-03-19T00:00:00Z",
      "summary": "Brand voice and positioning notes for Joe's Pizza.",
      "context_type": "brand_guidelines",
      "extracted_data": {
        "tone_of_voice": "Warm, local, high-energy",
        "key_insights": ["Lead with family dinner convenience"]
      }
    }
  ]
}`}
            curlExample={`curl https://zuckerbot.ai/api/v1/businesses/biz_123/uploads \\
  -H "Authorization: Bearer zb_live_abc123"`}
          />

          <EndpointSection
            id="ep-business-uploads-create"
            method="POST"
            path="/v1/businesses/:id/uploads"
            description="Register a direct-uploaded file or send inline text content, then extract structured planning insights."
            notes="Use file_path for the web app's direct-to-storage flow. Use content for MCP or other text-only clients. DELETE /v1/businesses/:id/uploads/:fileId removes the row and storage object."
            requestBody={`{
  "filename": "brand-guidelines.md",
  "file_path": "user_123/business-context/biz_123/1710800000-brand-guidelines.md",
  "file_type": "text/markdown",
  "file_size_bytes": 4200
}`}
            responseBody={`{
  "business_id": "biz_123",
  "upload": {
    "id": "upload_123",
    "filename": "brand-guidelines.md",
    "file_type": "text/markdown",
    "uploaded_at": "2026-03-19T00:00:00Z",
    "summary": "Brand voice and positioning notes for Joe's Pizza.",
    "context_type": "brand_guidelines",
    "extracted_data": {
      "tone_of_voice": "Warm, local, high-energy",
      "key_insights": ["Lead with family dinner convenience"]
    }
  }
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/businesses/biz_123/uploads \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{
    "filename": "brand-guidelines.md",
    "content": "# Joe's Pizza\\nLead with family bundles and delivery speed."
  }'`}
          />

          <EndpointSection
            id="ep-business-uploads-reextract"
            method="POST"
            path="/v1/businesses/:id/uploads/:fileId/re-extract"
            description="Re-run extraction for an existing uploaded business-context file without re-uploading it."
            responseBody={`{
  "business_id": "biz_123",
  "upload": {
    "id": "upload_123",
    "filename": "brand-guidelines.md",
    "file_type": "text/markdown",
    "uploaded_at": "2026-03-19T00:00:00Z",
    "summary": "Updated brand voice and positioning notes for Joe's Pizza.",
    "context_type": "brand_guidelines",
    "extracted_data": {
      "tone_of_voice": "Warm, local, high-energy",
      "key_insights": ["Lead with family dinner convenience", "Avoid generic discount language"]
    }
  }
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/businesses/biz_123/uploads/upload_123/re-extract \\
  -H "Authorization: Bearer zb_live_abc123"`}
          />

          {/* GET /v1/campaigns/:id */}
          <EndpointSection
            id="ep-detail"
            method="GET"
            path="/v1/campaigns/:id"
            description="Fetch a campaign draft or live campaign, including intelligence workflow state, stored creative uploads, and linked tier executions."
            responseBody={`{
  "campaign": {
    "id": "camp_xyz789",
    "campaign_version": "intelligence",
    "status": "draft",
    "creative_status": "ready_to_activate",
    "approved_strategy": {
      "strategy_summary": "Scale broad first, then support with seeded lookalikes and retargeting."
    },
    "workflow_state": {
      "portfolio_id": "portfolio_123",
      "tier_campaigns": {
        "us_broad_adv": {
          "tier_name": "US Broad ADV+",
          "status": "paused",
          "meta_campaign_id": "120211234567890",
          "meta_adset_id": "120211234567891"
        }
      }
    }
  },
  "creatives": [
    {
      "id": "apc_123",
      "tier_name": "US Broad ADV+",
      "angle_name": "Proof Over Promise",
      "asset_type": "image",
      "asset_url": "https://cdn.example.com/proof-1.png",
      "status": "paused",
      "meta_ad_id": "120211234567892"
    }
  ],
  "tier_campaigns": [
    {
      "id": "atc_123",
      "tier": "us_broad_adv",
      "status": "paused",
      "meta_campaign_id": "120211234567890",
      "meta_adset_id": "120211234567891"
    }
  ],
  "fetched_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl https://zuckerbot.ai/api/v1/campaigns/camp_xyz789 \\
  -H "Authorization: Bearer zb_live_abc123"`}
          />

          {/* POST /v1/campaigns/:id/approve-strategy */}
          <EndpointSection
            id="ep-approve-strategy"
            method="POST"
            path="/v1/campaigns/:id/approve-strategy"
            description="Approve the generated intelligence strategy and freeze the specific tiers and creative angles that should move into production."
            requestBody={`{
  "tier_names": ["US Broad ADV+", "US Customer LAL"],
  "angle_names": ["Proof Over Promise", "Pain Interruption"]
}`}
            responseBody={`{
  "id": "camp_xyz789",
  "campaign_version": "intelligence",
  "status": "draft",
  "creative_status": "awaiting_creative",
  "portfolio_id": "portfolio_123",
  "approved_strategy": {
    "strategy_summary": "Scale broad first, then support with customer lookalikes.",
    "audience_tiers": [
      { "tier_name": "US Broad ADV+" },
      { "tier_name": "US Customer LAL" }
    ],
    "creative_angles": [
      { "angle_name": "Proof Over Promise" },
      { "angle_name": "Pain Interruption" }
    ]
  },
  "approved_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/campaigns/camp_xyz789/approve-strategy \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"tier_names":["US Broad ADV+"],"angle_names":["Proof Over Promise"]}'`}
          />

          {/* POST /v1/campaigns/:id/request-creative */}
          <EndpointSection
            id="ep-request-creative"
            method="POST"
            path="/v1/campaigns/:id/request-creative"
            description="Create a creative-production handoff package for an approved intelligence campaign. If a webhook_url is present, ZuckerBot POSTs the package to that endpoint."
            notes="creative-callback accepts the same creative payload as upload-creative. Use it when an external studio needs to push finished assets back into the campaign."
            requestBody={`{
  "creative_handoff": {
    "webhook_url": "https://studio.example.com/zuckerbot/intake",
    "callback_url": "https://zuckerbot.ai/api/v1/campaigns/camp_xyz789/creative-callback",
    "product_focus": "Family dinner bundles",
    "font_preset": "bold_sans"
  }
}`}
            responseBody={`{
  "campaign_id": "camp_xyz789",
  "dispatched": true,
  "creative_request": {
    "campaign_id": "camp_xyz789",
    "callback_url": "https://zuckerbot.ai/api/v1/campaigns/camp_xyz789/creative-callback",
    "market": "US",
    "product_focus": "Family dinner bundles",
    "font_preset": "bold_sans",
    "angles": [
      {
        "angle_name": "Proof Over Promise",
        "hook": "Austin families already trust Joe's Pizza for dinner."
      }
    ]
  },
  "updated_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/campaigns/camp_xyz789/request-creative \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{
    "creative_handoff": {
      "webhook_url": "https://studio.example.com/zuckerbot/intake",
      "product_focus": "Family dinner bundles"
    }
  }'`}
          />

          {/* POST /v1/campaigns/:id/upload-creative */}
          <EndpointSection
            id="ep-upload-creative"
            method="POST"
            path="/v1/campaigns/:id/upload-creative"
            description="Attach finished creative assets to an approved intelligence campaign. ZuckerBot creates or reuses paused tier executions, uploads the asset to Meta, creates paused ads, and stores the resulting Meta IDs."
            requestBody={`{
  "creatives": [
    {
      "tier_name": "US Broad ADV+",
      "angle_name": "Proof Over Promise",
      "asset_url": "https://cdn.example.com/proof-1.png",
      "asset_type": "image",
      "headline": "4.8 Stars, 127 Reviews",
      "body": "Austin families already trust Joe's Pizza for dinner.",
      "cta": "Order Now",
      "link_url": "https://joes-pizza-austin.com/order",
      "variant_index": 0
    }
  ]
}`}
            responseBody={`{
  "campaign_id": "camp_xyz789",
  "creative_status": "ready_to_activate",
  "portfolio_id": "portfolio_123",
  "creatives": [
    {
      "id": "apc_123",
      "tier_name": "US Broad ADV+",
      "status": "paused",
      "meta_campaign_id": "120211234567890",
      "meta_adset_id": "120211234567891",
      "meta_ad_id": "120211234567892",
      "meta_adcreative_id": "120211234567893"
    }
  ],
  "uploaded_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/campaigns/camp_xyz789/upload-creative \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{
    "creatives": [{
      "tier_name": "US Broad ADV+",
      "asset_url": "https://cdn.example.com/proof-1.png",
      "asset_type": "image",
      "headline": "4.8 Stars, 127 Reviews",
      "body": "Austin families already trust Joe's Pizza for dinner."
    }]
  }'`}
          />

          {/* POST /v1/campaigns/:id/activate */}
          <EndpointSection
            id="ep-activate"
            method="POST"
            path="/v1/campaigns/:id/activate"
            description="Activate only the ready audience tiers for an intelligence campaign. Tiers without approved strategy or uploaded creatives are skipped."
            requestBody={`{
  "tier_names": ["US Broad ADV+", "US Customer LAL"]
}`}
            responseBody={`{
  "id": "camp_xyz789",
  "campaign_version": "intelligence",
  "status": "active",
  "activated_tiers": [
    {
      "tier_name": "US Broad ADV+",
      "meta_campaign_id": "120211234567890",
      "meta_adset_id": "120211234567891",
      "meta_ad_ids": ["120211234567892"],
      "launched_at": "2026-02-23T00:15:00Z"
    }
  ],
  "skipped_tiers": [
    {
      "tier_name": "US Customer LAL",
      "reason": "Tier has no ready creatives to activate."
    }
  ],
  "activated_at": "2026-02-23T00:15:00Z"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/campaigns/camp_xyz789/activate \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"tier_names":["US Broad ADV+"]}'`}
          />

          {/* POST /v1/campaigns/:id/launch */}
          <EndpointSection
            id="ep-launch"
            method="POST"
            path="/v1/campaigns/:id/launch"
            description="Launch a draft campaign on Meta. Creates the ad campaign, ad set, creative, and ad on Meta, then activates everything. This is the endpoint that spends real money."
            notes="Legacy single-campaign launch path. Intelligence campaigns must use /campaigns/:id/activate instead and receive HTTP 409 from this endpoint."
            requestBody={`{
  "variant_index": 0,
  "daily_budget_cents": 2000,
  "radius_km": 15,
  "launch_all_variants": false,

  // Optional — omit if Facebook is connected on /developer
  "meta_access_token": "EAAGm0PX4ZCps...",
  "meta_ad_account_id": "act_123456789",
  "meta_page_id": "987654321"
}`}
            responseBody={`{
  "id": "camp_xyz789",
  "status": "active",
  "meta_campaign_id": "120211234567890",
  "meta_adset_id": "120211234567891",
  "meta_ad_id": "120211234567892",
  "daily_budget_cents": 2000,
  "launched_at": "2026-02-23T00:15:00Z"
}`}
            curlExample={`# With stored credentials (Facebook connected on /developer):
curl -X POST https://zuckerbot.ai/api/v1/campaigns/camp_xyz789/launch \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"variant_index": 0, "daily_budget_cents": 2000}'

# With A/B testing (launches all creative variants):
curl -X POST https://zuckerbot.ai/api/v1/campaigns/camp_xyz789/launch \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"launch_all_variants": true, "daily_budget_cents": 2000}'`}
          />

          {/* POST /v1/campaigns/:id/pause */}
          <EndpointSection
            id="ep-pause"
            method="POST"
            path="/v1/campaigns/:id/pause"
            description="Pause a running campaign on Meta. The campaign can be relaunched later."
            requestBody={`{
  "meta_access_token": "EAAGm0PX4ZCps..."
}`}
            responseBody={`{
  "campaign_id": "camp_xyz789",
  "status": "paused",
  "meta_campaign_id": "120211234567890"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/campaigns/camp_xyz789/pause \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"meta_access_token": "EAAGm0PX4ZCps..."}'`}
          />

          {/* GET /v1/campaigns/:id/performance */}
          <EndpointSection
            id="ep-performance"
            method="GET"
            path="/v1/campaigns/:id/performance"
            description="Pull real-time performance metrics from Meta Marketing API. Syncs fresh data on every call. Returns impressions, clicks, spend, leads, CPL, CTR, and a performance status indicator."
            notes="Performance status values: learning (first 48h or under 500 impressions), healthy (CPL under $30 with leads), underperforming (CPL over $30 or $50+ spend with zero leads), paused."
            responseBody={`{
  "campaign_id": "camp_xyz789",
  "status": "active",
  "performance_status": "healthy",
  "metrics": {
    "impressions": 12450,
    "clicks": 234,
    "spend_cents": 4520,
    "leads_count": 6,
    "cpl_cents": 753,
    "ctr_pct": 1.88
  },
  "hours_since_launch": 72.5,
  "last_synced_at": "2026-02-23T12:00:00Z"
}`}
            curlExample={`curl https://zuckerbot.ai/api/v1/campaigns/camp_xyz789/performance \\
  -H "Authorization: Bearer zb_live_abc123"`}
          />

          {/* POST /v1/campaigns/:id/conversions */}
          <EndpointSection
            id="ep-conversions"
            method="POST"
            path="/v1/campaigns/:id/conversions"
            description='Send conversion feedback to Meta via the Conversions API. When a lead converts, mark it as "good". When a lead is lost, mark it as "bad". This teaches Meta to find better leads over time.'
            notes='Good leads send a "Lead" event with value=100. Bad leads send an "Other" event with value=0, telling Meta to deprioritize similar profiles.'
            requestBody={`{
  "lead_id": "lead_abc123",
  "quality": "good",
  "meta_access_token": "EAAGm0PX4ZCps...",
  "user_data": {
    "email": "customer@example.com",
    "phone": "+15125551234",
    "first_name": "John",
    "last_name": "Doe"
  }
}`}
            responseBody={`{
  "success": true,
  "capi_sent": true,
  "events_received": 1,
  "quality": "good",
  "lead_id": "lead_abc123"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/campaigns/camp_xyz789/conversions \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{
    "lead_id": "lead_abc123",
    "quality": "good",
    "meta_access_token": "EAAGm0PX4ZCps..."
  }'`}
          />

          {/* POST /v1/audiences/create-seed */}
          <EndpointSection
            id="ep-audiences-create-seed"
            method="POST"
            path="/v1/audiences/create-seed"
            description="Create a Meta custom audience from stored hashed CAPI user data for a business and CRM stage."
            notes="Seed creation requires at least min_contacts matched profiles. The default minimum is 100."
            requestBody={`{
  "business_id": "biz_123",
  "source_stage": "customer",
  "name": "Joe's Pizza Customer Seed",
  "lookback_days": 180,
  "min_contacts": 100
}`}
            responseBody={`{
  "audience": {
    "id": "fa_123",
    "business_id": "biz_123",
    "audience_id": "23851234567890001",
    "audience_name": "Joe's Pizza Customer Seed",
    "audience_type": "custom",
    "audience_size": 184,
    "seed_source_stage": "customer",
    "lookback_days": 180,
    "delivery_status": "uploaded"
  },
  "uploaded_users": 184,
  "created_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/audiences/create-seed \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"business_id":"biz_123","source_stage":"customer","lookback_days":180}'`}
          />

          {/* POST /v1/audiences/create-lal */}
          <EndpointSection
            id="ep-audiences-create-lal"
            method="POST"
            path="/v1/audiences/create-lal"
            description="Create a Meta lookalike audience from a previously stored seed audience."
            requestBody={`{
  "seed_audience_id": "fa_123",
  "percentage": 1,
  "name": "Joe's Pizza 1% Customer LAL",
  "country": "US"
}`}
            responseBody={`{
  "audience": {
    "id": "fa_124",
    "audience_id": "23851234567890002",
    "audience_name": "Joe's Pizza 1% Customer LAL",
    "audience_type": "lookalike",
    "seed_source_stage": "customer",
    "lookalike_pct": 1,
    "seed_audience_id": "23851234567890001",
    "delivery_status": "building"
  },
  "created_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/audiences/create-lal \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"seed_audience_id":"fa_123","percentage":1,"country":"US"}'`}
          />

          {/* GET /v1/audiences/list */}
          <EndpointSection
            id="ep-audiences-list"
            method="GET"
            path="/v1/audiences/list"
            description="List the stored audience registry rows for a business, including seed metadata, sizes, and delivery status."
            responseBody={`{
  "business_id": "biz_123",
  "audiences": [
    {
      "id": "fa_123",
      "audience_name": "Joe's Pizza Customer Seed",
      "audience_type": "custom",
      "audience_size": 184,
      "seed_source_stage": "customer",
      "delivery_status": "uploaded"
    },
    {
      "id": "fa_124",
      "audience_name": "Joe's Pizza 1% Customer LAL",
      "audience_type": "lookalike",
      "lookalike_pct": 1,
      "delivery_status": "building"
    }
  ],
  "fetched_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl "https://zuckerbot.ai/api/v1/audiences/list?business_id=biz_123" \\
  -H "Authorization: Bearer zb_live_abc123"`}
          />

          {/* POST /v1/audiences/refresh */}
          <EndpointSection
            id="ep-audiences-refresh"
            method="POST"
            path="/v1/audiences/refresh"
            description="Refresh a stored audience. Seed audiences are rebuilt from hashed CAPI users; lookalikes sync their latest Meta status after the seed refresh runs."
            requestBody={`{
  "audience_id": "fa_123"
}`}
            responseBody={`{
  "audience": {
    "id": "fa_123",
    "audience_name": "Joe's Pizza Customer Seed",
    "audience_type": "custom",
    "audience_size": 196,
    "delivery_status": "uploaded",
    "last_refreshed_at": "2026-02-23T00:00:00Z"
  },
  "refreshed_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/audiences/refresh \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"audience_id":"fa_123"}'`}
          />

          {/* GET /v1/audiences/:id/status */}
          <EndpointSection
            id="ep-audience-status"
            method="GET"
            path="/v1/audiences/:id/status"
            description="Fetch the latest Meta audience status and update the local registry row."
            responseBody={`{
  "audience": {
    "id": "fa_124",
    "audience_name": "Joe's Pizza 1% Customer LAL",
    "audience_type": "lookalike",
    "audience_size": 24000,
    "delivery_status": "ready",
    "last_refreshed_at": "2026-02-23T00:00:00Z"
  },
  "meta_status": {
    "id": "23851234567890002",
    "name": "Joe's Pizza 1% Customer LAL",
    "approximate_count_lower_bound": 24000
  },
  "fetched_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl https://zuckerbot.ai/api/v1/audiences/fa_124/status \\
  -H "Authorization: Bearer zb_live_abc123"`}
          />

          {/* DELETE /v1/audiences/:id */}
          <EndpointSection
            id="ep-audience-delete"
            method="DELETE"
            path="/v1/audiences/:id"
            description="Delete a stored Meta audience and remove the matching local registry row."
            responseBody={`{
  "success": true,
  "deleted_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl -X DELETE https://zuckerbot.ai/api/v1/audiences/fa_124 \\
  -H "Authorization: Bearer zb_live_abc123"`}
          />

          {/* POST /v1/research/reviews */}
          <EndpointSection
            id="ep-reviews"
            method="POST"
            path="/v1/research/reviews"
            description="Get review intelligence for a business. Searches Google Reviews, Yelp, and other review sites, then synthesizes themes, sentiment, and best quotes using AI."
            notes="Validation errors include error.example_body and error.docs_url to speed up debugging."
            requestBody={`{
  "business_name": "Joe's Pizza",
  "location": "Austin, TX"
}`}
            responseBody={`{
  "business_name": "Joe's Pizza",
  "rating": 4.8,
  "review_count": 127,
  "themes": ["fast delivery", "authentic taste", "friendly staff", "great value"],
  "best_quotes": [
    "Best pizza in Austin, hands down",
    "Reminds me of actual New York pizza"
  ],
  "sentiment_breakdown": {
    "positive": 0.89,
    "neutral": 0.08,
    "negative": 0.03
  },
  "sources": ["Google Reviews", "Yelp", "TripAdvisor"]
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/research/reviews \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"business_name": "Joe'\\''s Pizza", "location": "Austin, TX"}'`}
          />

          {/* POST /v1/research/competitors */}
          <EndpointSection
            id="ep-competitors"
            method="POST"
            path="/v1/research/competitors"
            description="Analyze competitor ads for a business category and location. Searches Meta Ad Library and web results, then synthesizes insights including common hooks, gaps, and opportunities."
            notes="Validation errors include error.example_body and error.docs_url to speed up debugging."
            requestBody={`{
  "industry": "pizza restaurant",
  "location": "Austin, TX",
  "country": "US",
  "business_name": "Joe's Pizza"
}`}
            responseBody={`{
  "business_name": "Joe's Pizza",
  "competitor_ads": [
    {
      "page_name": "Domino's Pizza Austin",
      "ad_body_text": "Half price pizza every Tuesday...",
      "started_running_date": "2026-01-15",
      "platforms": "Facebook, Instagram"
    }
  ],
  "insights": {
    "summary": "Found 5 active competitor ads in pizza restaurant.",
    "common_hooks": ["discounts", "free delivery", "family deals"],
    "gaps": ["no social proof", "no urgency", "no local angle"],
    "opportunity": "Competitors rely on evergreen ads. Fresh creative could stand out."
  },
  "ad_count": 5
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/research/competitors \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"industry": "pizza restaurant", "location": "Austin, TX", "country": "US"}'`}
          />

          {/* POST /v1/research/market */}
          <EndpointSection
            id="ep-market"
            method="POST"
            path="/v1/research/market"
            description="Get market intelligence for a business category and location. Returns market size estimates, trends, audience insights, and advertising benchmarks for the category."
            requestBody={`{
  "industry": "pizza restaurant",
  "location": "Austin, TX",
  "country": "US"
}`}
            responseBody={`{
  "industry": "pizza restaurant",
  "location": "Austin, TX",
  "market_size": {
    "estimated_businesses": 340,
    "estimated_monthly_ad_spend_usd": 125000,
    "growth_trend": "stable"
  },
  "audience_insights": {
    "primary_age_range": "25-44",
    "peak_engagement_hours": ["11:00-13:00", "17:00-20:00"],
    "top_interests": ["food delivery", "dining out", "local restaurants"]
  },
  "benchmarks": {
    "avg_cpl_cents": 950,
    "avg_ctr_pct": 1.6,
    "avg_daily_budget_cents": 2500
  }
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/research/market \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"industry": "pizza restaurant", "location": "Austin, TX", "country": "US"}'`}
          />

          {/* POST /v1/creatives/generate */}
          <EndpointSection
            id="ep-creatives"
            method="POST"
            path="/v1/creatives/generate"
            description="Generate AI-powered ad creatives. Seedream/Imagen return images; Kling returns short videos."
            notes='Alias fields are supported for compatibility: image_count (alias of count) and use_market_intel (alias of use_market_intelligence). `model` supports `auto|seedream|imagen|kling`. `quality` supports `fast|ultra`, and `ultra` is valid only with `model=\"kling\"`. Validation errors include example_body and docs_url.'
            requestBody={`{
  "url": "https://joes-pizza.com",
  "style": "photo",
  "aspect_ratio": "1:1",
  "count": 2,
  "image_count": 2,
  "model": "auto",
  "quality": "fast",
  "use_market_intel": false
}`}
            responseBody={`{
  "creatives": [
    {
      "base64": "iVBORw0KGgo...",
      "mimeType": "image/png",
      "prompt": "Vibrant overhead shot of fresh pizza...",
      "aspect_ratio": "1:1"
    }
  ]
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/creatives/generate \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://joes-pizza.com", "style": "photo", "count": 2, "model": "kling", "quality": "ultra"}'`}
          />

          {/* POST /v1/keys/create */}
          <EndpointSection
            id="ep-keys"
            method="POST"
            path="/v1/keys/create"
            description="Generate a new API key. Requires authentication via Supabase JWT in the Authorization header (not an API key). Returns the full key once. Store it securely; it cannot be retrieved again."
            notes="This endpoint uses Supabase JWT authentication, not API key authentication. Use the JWT from your logged-in session."
            requestBody={`{
  "name": "my-production-key",
  "environment": "live"
}`}
            responseBody={`{
  "id": "key_abc123",
  "key": "zb_live_abc123def456ghi789",
  "name": "my-production-key",
  "environment": "live",
  "prefix": "zb_live_abc123",
  "created_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/keys/create \\
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \\
  -H "Content-Type: application/json" \\
  -d '{"name": "my-production-key", "environment": "live"}'`}
          />

          {/* GET /v1/meta/ad-accounts */}
          <EndpointSection
            id="ep-meta-ad-accounts"
            method="GET"
            path="/v1/meta/ad-accounts"
            description="List every Meta ad account accessible to the connected user and mark which account is currently selected for launches and autonomous management."
            notes="Uses the stored `businesses.facebook_access_token`. If only one account exists but none is stored, launch/create flows can auto-select it; this read-only endpoint does not mutate state."
            responseBody={`{
  "ad_accounts": [
    {
      "id": "act_1699470517622963",
      "account_id": "1699470517622963",
      "name": "ZuckerBot.ai",
      "account_status": 1,
      "currency": "AUD",
      "business_name": "DatalisHQ",
      "amount_spent": "12345",
      "selected": true,
      "is_selected": true
    }
  ],
  "selected_ad_account_id": "act_1699470517622963",
  "ad_account_count": 1
}`}
            curlExample={`curl https://zuckerbot.ai/api/v1/meta/ad-accounts \\
  -H "Authorization: Bearer zb_live_abc123"`}
          />

          {/* POST /v1/meta/select-ad-account */}
          <EndpointSection
            id="ep-meta-select-ad-account"
            method="POST"
            path="/v1/meta/select-ad-account"
            description="Select the active Meta ad account for future launches. Switching accounts clears the stored Facebook Page and auto-selects the Meta Pixel only when exactly one pixel exists on the account."
            requestBody={`{
  "ad_account_id": "act_2064725353887861"
}`}
            responseBody={`{
  "selected_ad_account_id": "act_2064725353887861",
  "selected_ad_account_name": "Sophiie.ai",
  "selected_pixel_id": null,
  "pixel_selection_required": true,
  "page_selection_required": true,
  "page_id_cleared": true,
  "stored": true
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/meta/select-ad-account \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"ad_account_id": "act_2064725353887861"}'`}
          />

          {/* GET /v1/lead-forms */}
          <EndpointSection
            id="ep-lead-forms"
            method="GET"
            path="/v1/lead-forms"
            description="List Meta Instant Forms available on the selected Facebook Page and indicate which form is currently selected for future lead generation launches."
            notes="Lead forms are fetched from the stored business page selection. If no page is selected, the endpoint returns `Select a Facebook page first.` If exactly one form exists and none is stored yet, ZuckerBot auto-selects and persists it on the business record."
            responseBody={`{
  "selected_page_id": "102938475610293",
  "forms": [
    {
      "id": "123456789012345",
      "name": "Sophiie Demo Request",
      "status": "ACTIVE",
      "leads_count": 482,
      "created_time": "2025-03-01T10:00:00+0000",
      "selected": true,
      "is_selected": true
    }
  ],
  "selected_form_id": "123456789012345",
  "form_count": 1
}`}
            curlExample={`curl https://zuckerbot.ai/api/v1/lead-forms \\
  -H "Authorization: Bearer zb_live_abc123"`}
          />

          {/* POST /v1/lead-forms/select */}
          <EndpointSection
            id="ep-lead-forms-select"
            method="POST"
            path="/v1/lead-forms/select"
            description="Select the Meta Instant Form from the selected Facebook Page to use for all future lead generation launches for the linked business."
            requestBody={`{
  "form_id": "123456789012345"
}`}
            responseBody={`{
  "selected_page_id": "102938475610293",
  "selected_form_id": "123456789012345",
  "selected_form_name": "Sophiie Demo Request",
  "stored": true
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/lead-forms/select \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"form_id": "123456789012345"}'`}
          />

          {/* GET /v1/pixels */}
          <EndpointSection
            id="ep-pixels"
            method="GET"
            path="/v1/pixels"
            description="List every Meta Pixel available on the currently selected Meta ad account and mark which pixel is currently selected for conversion tracking."
            notes="If the selected ad account contains exactly one pixel and none is stored yet, ZuckerBot auto-selects and persists it."
            responseBody={`{
  "selected_ad_account_id": "act_2064725353887861",
  "pixels": [
    {
      "id": "123456789012345",
      "name": "Main Website Pixel",
      "selected": true,
      "is_selected": true
    }
  ],
  "selected_pixel_id": "123456789012345",
  "pixel_count": 1
}`}
            curlExample={`curl https://zuckerbot.ai/api/v1/pixels \\
  -H "Authorization: Bearer zb_live_abc123"`}
          />

          {/* POST /v1/pixels/select */}
          <EndpointSection
            id="ep-pixels-select"
            method="POST"
            path="/v1/pixels/select"
            description="Select the active Meta Pixel for future conversion tracking and store it on the business record."
            requestBody={`{
  "pixel_id": "123456789012345"
}`}
            responseBody={`{
  "selected_ad_account_id": "act_2064725353887861",
  "selected_pixel_id": "123456789012345",
  "selected_pixel_name": "Main Website Pixel",
  "stored": true
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/pixels/select \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{"pixel_id": "123456789012345"}'`}
          />

              {/* MCP Server */}
              <GlassCard id="mcp-server" className="scroll-mt-24 p-8 sm:p-10">
                <div className="mb-4 flex items-center gap-3">
                  <StatusBadge status="ai">Advanced Integrations</StatusBadge>
                </div>
                <h2 className="font-headline text-3xl font-bold text-on-surface mb-4">MCP Server Integration</h2>
                <p className="mb-6 leading-relaxed text-on-surface-variant">
              The ZuckerBot MCP server exposes the API as Model Context Protocol tools. Works with
              Claude Desktop, OpenClaw, Cursor, and any MCP-compatible agent.
                </p>

                <h3 className="mb-3 text-lg font-semibold text-on-surface">Install</h3>
                <CodeBlock title="npx (recommended)" lang="bash">{`npx zuckerbot-mcp`}</CodeBlock>

                <h3 className="mt-6 mb-3 text-lg font-semibold text-on-surface">Claude Desktop config</h3>
                <CodeBlock title="claude_desktop_config.json" lang="json">{`{
  "mcpServers": {
    "zuckerbot": {
      "command": "npx",
      "args": ["-y", "zuckerbot-mcp"],
      "env": {
        "ZUCKERBOT_API_KEY": "zb_live_your_key_here"
      }
    }
  }
}`}</CodeBlock>

                <div className="mb-8 rounded-r-[1.5rem] border-l-4 border-tertiary bg-tertiary/5 p-6">
                  <div className="flex gap-4">
                    <TerminalSquare className="mt-0.5 h-5 w-5 shrink-0 text-tertiary" />
                    <div>
                      <h4 className="mb-1 font-semibold text-tertiary">Architecture Note</h4>
                      <p className="text-sm leading-6 text-on-surface-variant">
                        ZuckerBot&apos;s MCP server uses a secure bridge to orchestrate local tools and private marketing systems.
                        Ensure outbound access on port <code className="rounded bg-surface-container-high px-1.5 py-0.5 text-xs text-tertiary">443</code> is available for orchestration traffic.
                      </p>
                    </div>
                  </div>
                </div>

                <h3 className="mt-6 mb-3 text-lg font-semibold text-on-surface">OpenClaw config</h3>
                <CodeBlock title="skill config" lang="json">{`{
  "skills": {
    "zuckerbot": {
      "command": "npx",
      "args": ["-y", "zuckerbot-mcp"],
      "env": {
        "ZUCKERBOT_API_KEY": "zb_live_your_key_here"
      }
    }
  }
}`}</CodeBlock>

                <div className="mb-8 rounded-r-[1.5rem] border-l-4 border-error bg-error/5 p-6">
                  <div className="flex gap-4">
                    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-error" />
                    <div>
                      <h4 className="mb-1 font-semibold text-error">Critical Security Step</h4>
                      <p className="text-sm leading-6 text-on-surface-variant">
                        Never commit <code className="rounded bg-surface-container-high px-1.5 py-0.5 text-xs text-error">ZUCKERBOT_API_KEY</code> to source control.
                        Use environment variables in your runtime instead.
                      </p>
                    </div>
                  </div>
                </div>

                <h3 className="mt-8 mb-4 text-lg font-semibold text-on-surface">Available tools</h3>
                <div className="space-y-2">
              {[
                { name: "zuckerbot_preview_campaign", desc: "Generate ad previews from a URL" },
                { name: "zuckerbot_create_campaign", desc: "Create a legacy or intelligence campaign draft" },
                { name: "zuckerbot_enrich_business", desc: "Refresh cached website context for a business" },
                { name: "zuckerbot_upload_business_context", desc: "Upload text business context and extract planning insights" },
                { name: "zuckerbot_list_business_context", desc: "List uploaded business-context summaries" },
                { name: "zuckerbot_get_campaign", desc: "Fetch campaign detail, workflow state, creatives, and tier executions" },
                { name: "zuckerbot_approve_campaign_strategy", desc: "Freeze the approved tiers and creative angles for an intelligence campaign" },
                { name: "zuckerbot_request_creative", desc: "Create or dispatch a creative production handoff" },
                { name: "zuckerbot_upload_creative", desc: "Upload finished creative assets and provision paused Meta executions" },
                { name: "zuckerbot_activate_campaign", desc: "Activate ready intelligence tiers after approval and creative upload" },
                { name: "zuckerbot_suggest_angles", desc: "Return the current creative angles and audience tiers for a campaign" },
                { name: "zuckerbot_launch_campaign", desc: "Launch to Meta with A/B testing support" },
                { name: "zuckerbot_pause_campaign", desc: "Pause or resume a running campaign" },
                { name: "zuckerbot_get_performance", desc: "Get real-time campaign metrics" },
                { name: "zuckerbot_create_seed_audience", desc: "Build a Meta seed audience from hashed CAPI users" },
                { name: "zuckerbot_create_lookalike_audience", desc: "Create a Meta lookalike from a stored seed audience" },
                { name: "zuckerbot_list_audiences", desc: "List stored audience registry rows for a business" },
                { name: "zuckerbot_refresh_audience", desc: "Refresh a stored audience or sync its latest state" },
                { name: "zuckerbot_get_audience_status", desc: "Fetch the latest Meta audience status" },
                { name: "zuckerbot_delete_audience", desc: "Delete a stored audience from Meta and ZuckerBot" },
                { name: "zuckerbot_sync_conversion", desc: "Send conversion feedback to Meta CAPI" },
                { name: "zuckerbot_research_reviews", desc: "Get review intelligence for a business" },
                { name: "zuckerbot_research_competitors", desc: "Analyze competitor ads" },
                { name: "zuckerbot_research_market", desc: "Get market intelligence and benchmarks" },
                { name: "zuckerbot_generate_creatives", desc: "Generate ad images via AI" },
                { name: "zuckerbot_meta_status", desc: "Check Facebook connection status" },
                { name: "zuckerbot_list_ad_accounts", desc: "List Meta ad accounts and current selection" },
                { name: "zuckerbot_select_ad_account", desc: "Switch the active Meta ad account" },
                { name: "zuckerbot_list_lead_forms", desc: "List available Meta Instant Forms and the current selection" },
                { name: "zuckerbot_select_lead_form", desc: "Choose the existing Meta Instant Form used for lead campaigns" },
                { name: "zuckerbot_list_pixels", desc: "List Meta Pixels for the selected ad account" },
                { name: "zuckerbot_select_pixel", desc: "Switch the active Meta Pixel" },
                { name: "zuckerbot_list_meta_pages", desc: "List Facebook pages for the connected Meta user" },
                { name: "zuckerbot_select_meta_page", desc: "Switch the active Facebook Page" },
                { name: "zuckerbot_get_launch_credentials", desc: "Resolve stored Meta launch credentials" },
                { name: "zuckerbot_capi_config", desc: "Get or update the per-business CAPI configuration, including action_source" },
                { name: "zuckerbot_capi_status", desc: "Inspect 7-day and 30-day CAPI delivery status" },
                { name: "zuckerbot_capi_test", desc: "Send a synthetic CAPI test event" },
                { name: "zuckerbot_create_portfolio", desc: "Create a business-owned audience portfolio" },
                { name: "zuckerbot_portfolio_performance", desc: "Get tier-by-tier audience portfolio performance" },
                { name: "zuckerbot_rebalance_portfolio", desc: "Dry-run or apply a portfolio rebalance" },
              ].map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-start gap-3 rounded-[1rem] border border-outline-variant/15 bg-surface-container-low px-4 py-3"
                >
                  <code className="shrink-0 text-sm font-mono text-primary">{tool.name}</code>
                  <span className="text-sm text-on-surface-variant">{tool.desc}</span>
                </div>
              ))}
                </div>
              </GlassCard>

              {/* Rate Limits */}
              <GlassCard id="rate-limits" className="scroll-mt-24 p-8">
                <h2 className="font-headline text-2xl font-bold text-on-surface mb-4">Rate Limits</h2>
                <p className="mb-6 leading-relaxed text-on-surface-variant">
              Rate limits are enforced per API key. Headers are included on every response.
                </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 pr-6 text-gray-400 font-medium">Tier</th>
                    <th className="text-left py-3 pr-6 text-gray-400 font-medium">Requests / min</th>
                    <th className="text-left py-3 pr-6 text-gray-400 font-medium">Requests / day</th>
                    <th className="text-left py-3 text-gray-400 font-medium">Previews / month</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-6 text-white font-medium">Free</td>
                    <td className="py-3 pr-6 text-gray-300">10</td>
                    <td className="py-3 pr-6 text-gray-300">100</td>
                    <td className="py-3 text-gray-300">25</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-6 text-white font-medium">Pro</td>
                    <td className="py-3 pr-6 text-gray-300">60</td>
                    <td className="py-3 pr-6 text-gray-300">1,000</td>
                    <td className="py-3 text-gray-300">500</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-6 text-white font-medium">Enterprise</td>
                    <td className="py-3 pr-6 text-gray-300">300</td>
                    <td className="py-3 pr-6 text-gray-300">50,000</td>
                    <td className="py-3 text-gray-300">Unlimited</td>
                  </tr>
                </tbody>
              </table>
            </div>

                <h3 className="mt-6 mb-3 text-lg font-semibold text-on-surface">Response headers</h3>
                <CodeBlock title="Rate limit headers">{`X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1708646400`}</CodeBlock>

                <p className="mt-4 text-sm text-on-surface-variant">
              When you exceed the limit, the API returns <code className="text-gray-300 bg-white/5 px-1.5 py-0.5 rounded text-xs">429 Too Many Requests</code> with
              a <code className="text-gray-300 bg-white/5 px-1.5 py-0.5 rounded text-xs">retry_after</code> field in the error body.
                </p>
              </GlassCard>

              {/* Errors */}
              <GlassCard id="errors" className="scroll-mt-24 p-8">
                <h2 className="font-headline text-2xl font-bold text-on-surface mb-4">Troubleshooting</h2>
                <p className="mb-4 leading-relaxed text-on-surface-variant">
              All errors follow a standard JSON format with a machine-readable code and human-readable message.
                </p>

                <CodeBlock title="Error response format" lang="json">{`{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Too many requests. Retry after 32 seconds.",
    "retry_after": 32
  }
}`}</CodeBlock>

                <h3 className="mt-6 mb-3 text-lg font-semibold text-on-surface">Common error codes</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 pr-6 text-gray-400 font-medium">Status</th>
                    <th className="text-left py-3 pr-6 text-gray-400 font-medium">Code</th>
                    <th className="text-left py-3 text-gray-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-6"><code className="text-red-400 text-xs">400</code></td>
                    <td className="py-3 pr-6 text-gray-300 font-mono text-xs">bad_request</td>
                    <td className="py-3 text-gray-400">Invalid or missing request parameters</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-6"><code className="text-red-400 text-xs">401</code></td>
                    <td className="py-3 pr-6 text-gray-300 font-mono text-xs">unauthorized</td>
                    <td className="py-3 text-gray-400">Missing or invalid API key</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-6"><code className="text-red-400 text-xs">403</code></td>
                    <td className="py-3 pr-6 text-gray-300 font-mono text-xs">forbidden</td>
                    <td className="py-3 text-gray-400">API key does not have permission for this action</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-6"><code className="text-yellow-400 text-xs">429</code></td>
                    <td className="py-3 pr-6 text-gray-300 font-mono text-xs">rate_limit_exceeded</td>
                    <td className="py-3 text-gray-400">Too many requests. Check retry_after field.</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-6"><code className="text-red-400 text-xs">502</code></td>
                    <td className="py-3 pr-6 text-gray-300 font-mono text-xs">meta_api_error</td>
                    <td className="py-3 text-gray-400">Meta API call failed. Check step and meta_error fields.</td>
                  </tr>
                </tbody>
              </table>
            </div>
              </GlassCard>

              {/* Pricing */}
              <GlassCard id="pricing" className="scroll-mt-24 p-8">
                <h2 className="font-headline text-2xl font-bold text-on-surface mb-4">Pricing</h2>
                <p className="mb-8 leading-relaxed text-on-surface-variant">
              Start free, upgrade when your agents need more capacity.
                </p>

            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  name: "Free",
                  price: "$0",
                  period: "",
                  desc: "For prototyping and testing.",
                  features: [
                    "25 previews / month",
                    "5 campaign creates / month",
                    "10 research calls / month",
                    "10 requests / minute",
                    "Community support",
                  ],
                  highlighted: false,
                },
                {
                  name: "Pro",
                  price: "$49",
                  period: "/mo",
                  desc: "For production agents and serious builders.",
                  features: [
                    "500 previews / month",
                    "100 campaign creates / month",
                    "200 research calls / month",
                    "60 requests / minute",
                    "Email support",
                  ],
                  highlighted: true,
                },
                {
                  name: "Enterprise",
                  price: "Custom",
                  period: "",
                  desc: "High-volume, dedicated infrastructure.",
                  features: [
                    "Unlimited previews",
                    "Unlimited campaigns",
                    "Unlimited research",
                    "300 requests / minute",
                    "Dedicated Slack support",
                  ],
                  highlighted: false,
                },
              ].map((tier) => (
                <div
                  key={tier.name}
                  className={`rounded-lg border p-6 ${
                    tier.highlighted
                      ? "border-blue-500/40 bg-blue-500/5"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  {tier.highlighted && (
                    <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 w-fit mb-3 text-[10px]">
                      Most popular
                    </Badge>
                  )}
                  <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                  <div className="mt-2 mb-1">
                    <span className="text-3xl font-extrabold text-white">{tier.price}</span>
                    {tier.period && (
                      <span className="text-gray-400 text-sm">{tier.period}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-5">{tier.desc}</p>
                  <ul className="space-y-2">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                        <svg
                          className="w-4 h-4 text-green-400 mt-0.5 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
              </GlassCard>

              {/* Footer spacer */}
              <div className="h-12" />
            </article>

            <aside className="hidden xl:block">
              <div className="sticky top-24 space-y-6">
                <div>
                  <h4 className="mb-5 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-outline">
                    On This Page
                  </h4>
                  <nav className="space-y-3">
                    {[
                      { id: "getting-started", label: "Quick Start" },
                      { id: "authentication", label: "Authentication" },
                      { id: "mcp-server", label: "MCP Integration" },
                      { id: "rate-limits", label: "Rate Limits" },
                      { id: "errors", label: "Troubleshooting" },
                    ].map((item) => {
                      const isActive = resolveSidebarItem(activeSection) === resolveSidebarItem(item.id) || activeSection === item.id;

                      return (
                        <a
                          key={item.id}
                          href={`#${item.id}`}
                          className={`block border-l-2 pl-4 text-sm transition-colors ${
                            isActive
                              ? "border-primary text-primary"
                              : "border-transparent text-on-surface-variant hover:border-outline-variant hover:text-on-surface"
                          }`}
                        >
                          {item.label}
                        </a>
                      );
                    })}
                  </nav>
                </div>

                <GlassCard className="p-5">
                  <Bot className="mb-3 h-5 w-5 text-tertiary" />
                  <h5 className="mb-2 text-sm font-semibold text-on-surface">Need help?</h5>
                  <p className="mb-4 text-sm leading-6 text-on-surface-variant">
                    Our AI assistant can help debug MCP setup, auth headers, and endpoint payloads.
                  </p>
                  <GradientButton asChild size="sm" variant="tertiary" className="w-full justify-center">
                    <Link to="/developer">
                      Ask AI Assistant
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </GradientButton>
                </GlassCard>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Docs;

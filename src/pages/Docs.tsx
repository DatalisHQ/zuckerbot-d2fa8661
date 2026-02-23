import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Sidebar sections ───────────────────────────────────────────────────────

const sections = [
  { id: "getting-started", label: "Getting Started" },
  { id: "authentication", label: "Authentication" },
  { id: "endpoints", label: "Endpoints" },
  { id: "ep-preview", label: "POST /campaigns/preview", indent: true },
  { id: "ep-create", label: "POST /campaigns/create", indent: true },
  { id: "ep-launch", label: "POST /campaigns/:id/launch", indent: true },
  { id: "ep-pause", label: "POST /campaigns/:id/pause", indent: true },
  { id: "ep-performance", label: "GET /campaigns/:id/performance", indent: true },
  { id: "ep-conversions", label: "POST /campaigns/:id/conversions", indent: true },
  { id: "ep-reviews", label: "POST /research/reviews", indent: true },
  { id: "ep-competitors", label: "POST /research/competitors", indent: true },
  { id: "ep-market", label: "POST /research/market", indent: true },
  { id: "ep-keys", label: "POST /keys/create", indent: true },
  { id: "mcp-server", label: "MCP Server" },
  { id: "rate-limits", label: "Rate Limits" },
  { id: "errors", label: "Errors" },
  { id: "pricing", label: "Pricing" },
];

// ── Code block component ───────────────────────────────────────────────────

function CodeBlock({ title, lang, children }: { title?: string; lang?: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#0f0f13] overflow-hidden my-4">
      {title && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
          <span className="text-xs text-gray-400 font-mono">{title}</span>
          <button
            onClick={handleCopy}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors font-mono"
          >
            {copied ? "copied!" : "copy"}
          </button>
        </div>
      )}
      {!title && (
        <div className="flex justify-end px-4 py-2 border-b border-white/5 bg-white/[0.02]">
          <button
            onClick={handleCopy}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors font-mono"
          >
            {copied ? "copied!" : "copy"}
          </button>
        </div>
      )}
      <pre className="p-4 text-sm font-mono overflow-x-auto leading-relaxed">
        <code className="text-gray-300">{children}</code>
      </pre>
    </div>
  );
}

// ── Method badge ───────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const color = method === "GET"
    ? "bg-green-500/10 text-green-400 border-green-500/20"
    : method === "POST"
    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
    : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";

  return (
    <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded border ${color}`}>
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
    <div id={id} className="scroll-mt-24 pt-8 pb-6 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3 mb-3">
        <MethodBadge method={method} />
        <code className="text-lg font-mono text-white font-semibold">{path}</code>
      </div>
      <p className="text-gray-400 mb-4 leading-relaxed">{description}</p>
      {notes && (
        <p className="text-sm text-gray-500 mb-4 leading-relaxed">{notes}</p>
      )}

      {requestBody && (
        <>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Request Body</h4>
          <CodeBlock lang="json" title="JSON">{requestBody}</CodeBlock>
        </>
      )}

      <h4 className="text-sm font-semibold text-gray-300 mb-2 mt-4">Response</h4>
      <CodeBlock lang="json" title="200 OK">{responseBody}</CodeBlock>

      <h4 className="text-sm font-semibold text-gray-300 mb-2 mt-4">Example</h4>
      <CodeBlock lang="bash" title="curl">{curlExample}</CodeBlock>
    </div>
  );
}

// ── Main Docs component ────────────────────────────────────────────────────

const Docs = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState("getting-started");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setSidebarOpen(false);
    }
  };

  return (
    <div className="dark bg-[#09090b] text-gray-100 min-h-screen font-sans antialiased">
      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Mobile sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <a href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white">
                Zucker<span className="text-blue-500">Bot</span>
              </span>
              <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] font-medium">
                Docs
              </Badge>
            </a>
          </div>
          <div className="flex items-center gap-6">
            <a href="/" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">
              Home
            </a>
            <a href="/#pricing" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">
              Pricing
            </a>
            <Button
              size="sm"
              onClick={() => navigate("/auth")}
              className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-none"
            >
              Get API Key
            </Button>
          </div>
        </div>
      </nav>

      <div className="pt-16 flex max-w-7xl mx-auto">
        {/* ── Sidebar ──────────────────────────────────────────────────── */}

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`fixed lg:sticky top-16 left-0 z-40 h-[calc(100vh-4rem)] w-64 border-r border-white/5 bg-[#09090b] overflow-y-auto transition-transform lg:transition-none lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <nav className="py-6 px-4">
            <ul className="space-y-0.5">
              {sections.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => scrollTo(s.id)}
                    className={`w-full text-left py-1.5 text-sm rounded-md transition-colors ${
                      s.indent ? "pl-6 pr-3" : "pl-3 pr-3 font-medium"
                    } ${
                      activeSection === s.id
                        ? "text-blue-400 bg-blue-500/10"
                        : s.indent
                        ? "text-gray-500 hover:text-gray-300"
                        : "text-gray-300 hover:text-white"
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 px-6 sm:px-8 lg:px-12 py-10 max-w-4xl">

          {/* Getting Started */}
          <section id="getting-started" className="scroll-mt-24 mb-16">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
              ZuckerBot API Documentation
            </h1>
            <p className="text-lg text-gray-400 mb-8 leading-relaxed">
              REST API and MCP server for AI agents to create, launch, and optimize
              Meta ad campaigns. Give your agent the ability to run Facebook ads.
            </p>

            <h2 className="text-xl font-bold text-white mb-4">Quick start</h2>
            <ol className="space-y-4 text-gray-300 mb-6">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 text-xs font-bold flex items-center justify-center">1</span>
                <div>
                  <strong className="text-white">Get an API key</strong>
                  <span className="text-gray-400"> - Sign up at </span>
                  <a href="/auth" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">zuckerbot.ai</a>
                  <span className="text-gray-400"> and create a key from the developer dashboard. Free tier included.</span>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 text-xs font-bold flex items-center justify-center">2</span>
                <div>
                  <strong className="text-white">Make your first call</strong>
                  <span className="text-gray-400"> - Generate an ad preview from any business URL:</span>
                </div>
              </li>
            </ol>

            <CodeBlock title="curl" lang="bash">{`curl -X POST https://zuckerbot.ai/api/v1/campaigns/preview \\
  -H "Authorization: Bearer zb_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://joes-pizza-austin.com"}'`}</CodeBlock>

            <p className="text-gray-400 mt-4 leading-relaxed">
              That's it. The API scrapes the website, generates ad copy and images with AI,
              and returns a complete campaign preview in seconds.
            </p>

            <div className="mt-6 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="text-sm text-blue-300">
                <strong>Base URL:</strong>{" "}
                <code className="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-xs">
                  https://zuckerbot.ai/api/v1/
                </code>
              </p>
              <p className="text-sm text-blue-300 mt-1">
                All endpoints are relative to this base URL.
              </p>
            </div>
          </section>

          {/* Authentication */}
          <section id="authentication" className="scroll-mt-24 mb-16">
            <h2 className="text-2xl font-bold text-white mb-4">Authentication</h2>
            <p className="text-gray-400 mb-4 leading-relaxed">
              All requests require a Bearer token in the <code className="text-gray-300 bg-white/5 px-1.5 py-0.5 rounded text-sm">Authorization</code> header.
            </p>

            <CodeBlock title="Header">{`Authorization: Bearer zb_live_abc123def456`}</CodeBlock>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">API key format</h3>
            <div className="space-y-2 text-gray-400">
              <div className="flex items-start gap-3">
                <code className="text-green-400 bg-green-500/10 px-2 py-0.5 rounded text-xs font-mono shrink-0">zb_live_*</code>
                <span>Production keys. Calls hit real endpoints and count toward your quota.</span>
              </div>
              <div className="flex items-start gap-3">
                <code className="text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded text-xs font-mono shrink-0">zb_test_*</code>
                <span>Sandbox keys. Safe for development. Simulated responses, no real ad spend.</span>
              </div>
            </div>

            <p className="text-gray-400 mt-4 leading-relaxed">
              API keys are scoped to your developer account. Create and manage keys from the
              developer dashboard or via the <code className="text-gray-300 bg-white/5 px-1.5 py-0.5 rounded text-sm">/v1/keys/create</code> endpoint.
            </p>

            <div className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
              <p className="text-sm text-yellow-300">
                <strong>Keep keys secret.</strong> Never expose API keys in client-side code or public repositories.
                Rotate keys immediately if compromised.
              </p>
            </div>
          </section>

          {/* Endpoints */}
          <section id="endpoints" className="scroll-mt-24 mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Endpoints</h2>
            <p className="text-gray-400 mb-6">
              10 endpoints covering the full ad campaign lifecycle: research, create, launch, monitor, and optimize.
            </p>
          </section>

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
            description="Create a full campaign strategy with targeting, budget recommendations, and creatives. Returns a draft campaign ready for review and launch. Does not create anything on Meta."
            notes="Only the url field is required. Everything else improves the results. The meta_access_token is optional at this stage."
            requestBody={`{
  "url": "https://joes-pizza-austin.com",
  "business_name": "Joe's Pizza",
  "business_type": "restaurant",
  "location": {
    "city": "Austin",
    "state": "TX",
    "country": "US",
    "lat": 30.2672,
    "lng": -97.7431
  },
  "budget_daily_cents": 2000,
  "objective": "leads"
}`}
            responseBody={`{
  "id": "camp_xyz789",
  "status": "draft",
  "business_name": "Joe's Pizza",
  "strategy": {
    "objective": "leads",
    "summary": "Lead generation campaign targeting pizza lovers in Austin, TX within 15km radius.",
    "strengths": ["Strong review profile", "Established local brand"],
    "opportunities": ["Competitors lack social proof in ads"],
    "recommended_daily_budget_cents": 2000,
    "projected_cpl_cents": 800,
    "projected_monthly_leads": 75
  },
  "targeting": {
    "age_min": 21,
    "age_max": 55,
    "radius_km": 15,
    "interests": ["restaurants", "food and drink", "dining out", "pizza"],
    "publisher_platforms": ["facebook", "instagram"]
  },
  "variants": [
    {
      "headline": "4.8 Stars, 127 Reviews",
      "copy": "Austin's favorite pizza since 2019. Try the slice locals can't stop raving about.",
      "cta": "Learn More",
      "angle": "social_proof",
      "image_url": "https://storage.zuckerbot.ai/..."
    },
    {
      "headline": "Tonight's Dinner, Sorted",
      "copy": "Hot, fresh, authentic NY-style pizza delivered to your door. Order before 8pm tonight.",
      "cta": "Call Now",
      "angle": "urgency",
      "image_url": "https://storage.zuckerbot.ai/..."
    },
    {
      "headline": "Free Slice With Your First Order",
      "copy": "New to Joe's? Your first order comes with a free slice on the house. Limited time.",
      "cta": "Get Quote",
      "angle": "value",
      "image_url": "https://storage.zuckerbot.ai/..."
    }
  ],
  "created_at": "2026-02-23T00:00:00Z"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/campaigns/create \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://joes-pizza-austin.com",
    "location": {"city": "Austin", "state": "TX", "country": "US"},
    "budget_daily_cents": 2000
  }'`}
          />

          {/* POST /v1/campaigns/:id/launch */}
          <EndpointSection
            id="ep-launch"
            method="POST"
            path="/v1/campaigns/:id/launch"
            description="Launch a draft campaign on Meta. Creates the ad campaign, ad set, lead form, creative, and ad on Meta, then activates everything. This is the endpoint that spends real money."
            notes="All fields are required. The variant_index selects which creative variant from the draft campaign to use. Requires the end user's Meta access token, ad account ID, and Facebook Page ID."
            requestBody={`{
  "meta_access_token": "EAAGm0PX4ZCps...",
  "meta_ad_account_id": "act_123456789",
  "meta_page_id": "987654321",
  "variant_index": 0,
  "daily_budget_cents": 2000,
  "radius_km": 15
}`}
            responseBody={`{
  "id": "camp_xyz789",
  "status": "active",
  "meta_campaign_id": "120211234567890",
  "meta_adset_id": "120211234567891",
  "meta_ad_id": "120211234567892",
  "meta_leadform_id": "120211234567893",
  "daily_budget_cents": 2000,
  "launched_at": "2026-02-23T00:15:00Z"
}`}
            curlExample={`curl -X POST https://zuckerbot.ai/api/v1/campaigns/camp_xyz789/launch \\
  -H "Authorization: Bearer zb_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{
    "meta_access_token": "EAAGm0PX4ZCps...",
    "meta_ad_account_id": "act_123456789",
    "meta_page_id": "987654321",
    "variant_index": 0,
    "daily_budget_cents": 2000,
    "radius_km": 15
  }'`}
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

          {/* POST /v1/research/reviews */}
          <EndpointSection
            id="ep-reviews"
            method="POST"
            path="/v1/research/reviews"
            description="Get review intelligence for a business. Searches Google Reviews, Yelp, and other review sites, then synthesizes themes, sentiment, and best quotes using AI."
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

          {/* MCP Server */}
          <section id="mcp-server" className="scroll-mt-24 mb-16 pt-8">
            <h2 className="text-2xl font-bold text-white mb-4">MCP Server</h2>
            <p className="text-gray-400 mb-6 leading-relaxed">
              The ZuckerBot MCP server exposes the API as Model Context Protocol tools. Works with
              Claude Desktop, OpenClaw, Cursor, and any MCP-compatible agent.
            </p>

            <h3 className="text-lg font-semibold text-white mb-3">Install</h3>
            <CodeBlock title="npx (recommended)" lang="bash">{`npx @zuckerbot/mcp-server`}</CodeBlock>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">Claude Desktop config</h3>
            <CodeBlock title="claude_desktop_config.json" lang="json">{`{
  "mcpServers": {
    "zuckerbot": {
      "command": "npx",
      "args": ["-y", "@zuckerbot/mcp-server"],
      "env": {
        "ZUCKERBOT_API_KEY": "zb_live_your_key_here"
      }
    }
  }
}`}</CodeBlock>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">OpenClaw config</h3>
            <CodeBlock title="skill config" lang="json">{`{
  "skills": {
    "zuckerbot": {
      "command": "npx",
      "args": ["-y", "@zuckerbot/mcp-server"],
      "env": {
        "ZUCKERBOT_API_KEY": "zb_live_your_key_here"
      }
    }
  }
}`}</CodeBlock>

            <h3 className="text-lg font-semibold text-white mt-8 mb-4">Available tools</h3>
            <div className="space-y-2">
              {[
                { name: "zuckerbot_preview_campaign", desc: "Generate ad previews from a URL" },
                { name: "zuckerbot_create_campaign", desc: "Create full campaign with strategy and targeting" },
                { name: "zuckerbot_launch_campaign", desc: "Launch a draft campaign on Meta" },
                { name: "zuckerbot_get_performance", desc: "Get real-time campaign metrics" },
                { name: "zuckerbot_pause_campaign", desc: "Pause a running campaign" },
                { name: "zuckerbot_delete_campaign", desc: "Delete a campaign from Meta and ZuckerBot" },
                { name: "zuckerbot_research_competitors", desc: "Analyze competitor ads" },
                { name: "zuckerbot_research_reviews", desc: "Get review intelligence for a business" },
                { name: "zuckerbot_generate_creatives", desc: "Generate ad copy and images" },
                { name: "zuckerbot_sync_conversion", desc: "Send conversion feedback to Meta" },
              ].map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-start gap-3 py-2.5 px-4 rounded-lg border border-white/5 bg-white/[0.02]"
                >
                  <code className="text-sm font-mono text-blue-400 shrink-0">{tool.name}</code>
                  <span className="text-sm text-gray-500">{tool.desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Rate Limits */}
          <section id="rate-limits" className="scroll-mt-24 mb-16">
            <h2 className="text-2xl font-bold text-white mb-4">Rate Limits</h2>
            <p className="text-gray-400 mb-6 leading-relaxed">
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

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">Response headers</h3>
            <CodeBlock title="Rate limit headers">{`X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1708646400`}</CodeBlock>

            <p className="text-gray-400 mt-4 text-sm">
              When you exceed the limit, the API returns <code className="text-gray-300 bg-white/5 px-1.5 py-0.5 rounded text-xs">429 Too Many Requests</code> with
              a <code className="text-gray-300 bg-white/5 px-1.5 py-0.5 rounded text-xs">retry_after</code> field in the error body.
            </p>
          </section>

          {/* Errors */}
          <section id="errors" className="scroll-mt-24 mb-16">
            <h2 className="text-2xl font-bold text-white mb-4">Errors</h2>
            <p className="text-gray-400 mb-4 leading-relaxed">
              All errors follow a standard JSON format with a machine-readable code and human-readable message.
            </p>

            <CodeBlock title="Error response format" lang="json">{`{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Too many requests. Retry after 32 seconds.",
    "retry_after": 32
  }
}`}</CodeBlock>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">Common error codes</h3>
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
          </section>

          {/* Pricing */}
          <section id="pricing" className="scroll-mt-24 mb-16">
            <h2 className="text-2xl font-bold text-white mb-4">Pricing</h2>
            <p className="text-gray-400 mb-8 leading-relaxed">
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
          </section>

          {/* Footer spacer */}
          <div className="h-12" />
        </main>
      </div>
    </div>
  );
};

export default Docs;

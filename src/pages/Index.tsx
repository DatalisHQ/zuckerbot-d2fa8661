import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── Feature cards data ─────────────────────────────────────────────────────

const features = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
    title: "Campaign Generation",
    description: "Send a URL. Get back a full campaign strategy with ad copy, targeting, and creative recommendations. Powered by deep page analysis.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
      </svg>
    ),
    title: "Market Research",
    description: "Analyze any market or niche. Get audience insights, keyword opportunities, and positioning data your agent can act on.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
    title: "Competitor Analysis",
    description: "See what competitors are running on Meta. Ad spend patterns, creative strategies, and audience targeting decoded for your agent.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
    title: "Review Intelligence",
    description: "Extract customer sentiment from Google reviews. Find the phrases and pain points that make great ad copy, automatically.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      </svg>
    ),
    title: "Launch & Manage",
    description: "Deploy campaigns directly to Meta Ads Manager. Connect your Meta token and let your agent handle the full lifecycle.",
  },
];

// ── Endpoint data ──────────────────────────────────────────────────────────

const endpoints = [
  { method: "POST", path: "campaigns/preview", desc: "Generate ad previews from any URL" },
  { method: "POST", path: "campaigns/create", desc: "Full campaign strategy with targeting" },
  { method: "POST", path: "campaigns/:id/launch", desc: "Deploy to Meta" },
  { method: "POST", path: "campaigns/:id/pause", desc: "Pause or resume campaigns" },
  { method: "GET", path: "campaigns/:id/performance", desc: "Real-time metrics" },
  { method: "POST", path: "campaigns/:id/conversions", desc: "CAPI feedback loop" },
  { method: "POST", path: "research/reviews", desc: "Review intelligence" },
  { method: "POST", path: "research/competitors", desc: "Competitor analysis" },
  { method: "POST", path: "research/market", desc: "Market research" },
  { method: "POST", path: "keys/create", desc: "Generate API keys" },
];

const pricingTiers = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Get started. No credit card required.",
    features: [
      "25 preview calls / month",
      "5 campaign creates / month",
      "10 research calls / month",
      "10 requests / minute",
      "Community support",
    ],
    cta: "Get API Key",
    href: "/developer",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mo",
    description: "For production agents and serious builders.",
    features: [
      "500 preview calls / month",
      "100 campaign creates / month",
      "200 research calls / month",
      "60 requests / minute",
      "Email support",
    ],
    cta: "Start Pro",
    href: "/developer",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "High-volume, white-label, dedicated infra.",
    features: [
      "Custom preview calls",
      "Custom campaign creates",
      "Custom research calls",
      "300 requests / minute",
      "Dedicated support",
    ],
    cta: "Contact Us",
    href: "mailto:davis@zuckerbot.ai",
    highlighted: false,
  },
];

// ── Component ──────────────────────────────────────────────────────────────

const Index = () => {
  const navigate = useNavigate();

  // Redirect logged-in users to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) navigate("/developer");
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) navigate("/developer");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="dark bg-[#09090b] text-gray-100 min-h-screen font-sans antialiased">
      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-white">
              Zucker<span className="text-blue-500">Bot</span>
            </span>
            <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] font-medium">
              API
            </Badge>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">
              Features
            </a>
            <a href="#endpoints" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">
              API
            </a>
            <a href="#mcp" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">
              MCP
            </a>
            <a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">
              Pricing
            </a>
            <Button
              size="sm"
              onClick={() => navigate("/developer")}
              className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-none"
            >
              Get API Key
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <Badge className="bg-green-500/10 text-green-400 border-green-500/20 mb-6">
            v0.1.0 / Early Access
          </Badge>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] text-white mb-6">
            Facebook Ads infrastructure
            <br />
            for AI agents.
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mb-8 leading-relaxed">
            Let your agent run Meta ad campaigns with a single API call.
            REST API + MCP server. Research, create, launch, and optimize.
          </p>
          <div className="flex flex-wrap gap-3 mb-12">
            <Button
              size="lg"
              onClick={() => navigate("/developer")}
              className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-600/20"
            >
              Get Your API Key
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                document.getElementById("endpoints")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="border-white/10 text-gray-300 hover:bg-white/5 hover:text-white hover:border-white/20"
            >
              View Endpoints
            </Button>
          </div>

          {/* Terminal snippet */}
          <div className="rounded-lg border border-white/10 bg-[#0f0f13] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="text-xs text-gray-500 ml-2 font-mono">terminal</span>
            </div>
            <pre className="p-5 text-sm font-mono overflow-x-auto leading-relaxed">
              <code>
                <span className="text-gray-500">$ </span>
                <span className="text-green-400">curl</span>
                <span className="text-gray-300"> -X POST https://zuckerbot.ai/api/v1/campaigns/preview \</span>
{"\n"}
                <span className="text-gray-300">  -H </span>
                <span className="text-yellow-300">"Authorization: Bearer zk_your_api_key"</span>
                <span className="text-gray-300"> \</span>
{"\n"}
                <span className="text-gray-300">  -H </span>
                <span className="text-yellow-300">"Content-Type: application/json"</span>
                <span className="text-gray-300"> \</span>
{"\n"}
                <span className="text-gray-300">  -d </span>
                <span className="text-yellow-300">'{`{"url": "https://joes-pizza.com"}`}'</span>
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-12">
            How it works
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "1",
                title: "Get an API key",
                desc: "Free tier includes 25 preview calls per month. No credit card required.",
                code: "zk_live_abc123...",
              },
              {
                step: "2",
                title: "Install or call",
                desc: "Use the MCP server with Claude, Cursor, or any agent. Or call the REST API directly.",
                code: "npx zuckerbot-mcp",
              },
              {
                step: "3",
                title: "Your agent runs ads",
                desc: "Create campaigns, launch to Meta, and optimize with real-time performance data.",
                code: "campaigns/launch ✓",
              },
            ].map((item) => (
              <div key={item.step} className="group">
                <div className="w-10 h-10 rounded-lg bg-blue-600/10 border border-blue-600/20 flex items-center justify-center text-blue-400 font-bold text-sm mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed mb-3">{item.desc}</p>
                <code className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
                  {item.code}
                </code>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-3">
            What your agent can do
          </h2>
          <p className="text-gray-400 mb-10">
            Five capabilities. Everything an AI agent needs to run Facebook ads end to end.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-white/15 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-600/10 border border-blue-600/20 flex items-center justify-center text-blue-400 mb-4 group-hover:bg-blue-600/15 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── API Endpoints ──────────────────────────────────────────────── */}
      <section id="endpoints" className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-3">
            API Endpoints
          </h2>
          <p className="text-gray-400 mb-2">
            Base URL: <code className="text-sm font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">https://zuckerbot.ai/api/v1/</code>
          </p>
          <p className="text-gray-500 text-sm mb-10">
            10 endpoints. Everything an AI agent needs to run a full ad campaign lifecycle.
          </p>
          <div className="grid gap-2">
            {endpoints.map((ep) => (
              <div
                key={ep.path}
                className="flex items-start sm:items-center gap-3 sm:gap-4 py-3 px-4 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors group"
              >
                <span
                  className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded shrink-0 ${
                    ep.method === "GET"
                      ? "bg-green-500/10 text-green-400"
                      : "bg-blue-500/10 text-blue-400"
                  }`}
                >
                  {ep.method}
                </span>
                <code className="text-sm font-mono text-gray-300 group-hover:text-white transition-colors shrink-0">
                  {ep.path}
                </code>
                <span className="text-sm text-gray-500 hidden sm:block ml-auto">
                  {ep.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Code Example (Agent Flow) ──────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-3">
            What your agent sees
          </h2>
          <p className="text-gray-400 mb-10">
            A real conversation. Your user says one sentence. Your agent handles the rest.
          </p>
          <div className="rounded-lg border border-white/10 bg-[#0f0f13] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="text-xs text-gray-500 ml-2 font-mono">agent session</span>
            </div>
            <div className="p-5 font-mono text-sm leading-loose">
              <div className="text-gray-400">
                <span className="text-purple-400">User:</span>{" "}
                <span className="text-gray-200">"Set up Facebook ads for my pizza restaurant"</span>
              </div>
              <div className="mt-4 space-y-1.5">
                <div>
                  <span className="text-gray-500 select-none">  → </span>
                  <span className="text-blue-400">zuckerbot_research_reviews</span>
                  <span className="text-gray-600">{" // "}pulls Google reviews, finds "best crust in Brooklyn"</span>
                </div>
                <div>
                  <span className="text-gray-500 select-none">  → </span>
                  <span className="text-blue-400">zuckerbot_research_competitors</span>
                  <span className="text-gray-600">{" // "}scans competitor Facebook ads</span>
                </div>
                <div>
                  <span className="text-gray-500 select-none">  → </span>
                  <span className="text-blue-400">zuckerbot_create_campaign</span>
                  <span className="text-gray-600">{" // "}builds full campaign with targeting + creatives</span>
                </div>
                <div className="mt-3 text-gray-400">
                  <span className="text-purple-400">Agent:</span>{" "}
                  <span className="text-gray-300">"Here is your campaign plan. 3 ad sets targeting pizza lovers</span>
                </div>
                <div className="text-gray-300 ml-[4.5rem]">
                  within 10 miles. Budget: $20/day. Ready to launch?"
                </div>
                <div className="mt-3">
                  <span className="text-gray-500 select-none">  → </span>
                  <span className="text-green-400">zuckerbot_launch_campaign</span>
                  <span className="text-gray-600">{" // "}deploys to Meta Ads Manager</span>
                </div>
                <div>
                  <span className="text-gray-500 select-none">  → </span>
                  <span className="text-green-400">zuckerbot_get_performance</span>
                  <span className="text-gray-600">{" // "}monitors CTR, CPA, ROAS in real time</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MCP Server ─────────────────────────────────────────────────── */}
      <section id="mcp" className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-3">
            MCP Server
          </h2>
          <p className="text-gray-400 mb-10">
            Works with Claude Desktop, Cursor, and any MCP-compatible agent.
            One command to install.
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Claude Desktop config */}
            <div className="rounded-lg border border-white/10 bg-[#0f0f13] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                <span className="text-xs text-gray-400 font-mono">claude_desktop_config.json</span>
              </div>
              <pre className="p-5 text-sm font-mono overflow-x-auto leading-relaxed">
                <code className="text-gray-300">{`{
  "mcpServers": {
    "zuckerbot": {
      "command": "npx",
      "args": [
        "-y",
        "zuckerbot-mcp"
      ],
      "env": {
        "ZUCKERBOT_API_KEY": "zk_your_key"
      }
    }
  }
}`}</code>
              </pre>
            </div>

            {/* Cursor config */}
            <div className="rounded-lg border border-white/10 bg-[#0f0f13] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                <span className="text-xs text-gray-400 font-mono">.cursor/mcp.json</span>
              </div>
              <pre className="p-5 text-sm font-mono overflow-x-auto leading-relaxed">
                <code className="text-gray-300">{`{
  "mcpServers": {
    "zuckerbot": {
      "command": "npx",
      "args": [
        "-y",
        "zuckerbot-mcp"
      ],
      "env": {
        "ZUCKERBOT_API_KEY": "zk_your_key"
      }
    }
  }
}`}</code>
              </pre>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-white/10 bg-[#0f0f13] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
              <span className="text-xs text-gray-400 font-mono">or install directly</span>
            </div>
            <pre className="p-5 text-sm font-mono overflow-x-auto">
              <code>
                <span className="text-gray-500">$ </span>
                <span className="text-green-400">npx</span>
                <span className="text-gray-300"> zuckerbot-mcp</span>
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-3">
            Pricing
          </h2>
          <p className="text-gray-400 mb-10">
            Start free. Scale when your agents need more.
          </p>
          <div className="grid gap-6 sm:grid-cols-3">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-lg border p-6 flex flex-col ${
                  tier.highlighted
                    ? "border-blue-500/40 bg-blue-500/5"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                {tier.highlighted && (
                  <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 w-fit mb-4 text-[10px]">
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
                <p className="text-sm text-gray-500 mb-6">{tier.description}</p>
                <ul className="space-y-2.5 mb-8 flex-1">
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
                {tier.href.startsWith("mailto") ? (
                  <a
                    href={tier.href}
                    className={`inline-flex items-center justify-center h-11 px-6 rounded-lg text-sm font-semibold transition-all ${
                      tier.highlighted
                        ? "bg-blue-600 hover:bg-blue-500 text-white"
                        : "bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10"
                    }`}
                  >
                    {tier.cta}
                  </a>
                ) : (
                  <Button
                    onClick={() => navigate(tier.href)}
                    className={
                      tier.highlighted
                        ? "bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-600/20"
                        : "bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 shadow-none"
                    }
                  >
                    {tier.cta}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-4">
            Ready to build?
          </h2>
          <p className="text-gray-400 mb-8">
            Get your API key and start generating campaigns in minutes.
            Free tier, no credit card.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              onClick={() => navigate("/developer")}
              className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-600/20"
            >
              Get Your API Key
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="border-white/10 text-gray-300 hover:bg-white/5 hover:text-white hover:border-white/20"
            >
              <a href="https://www.npmjs.com/package/zuckerbot-mcp" target="_blank" rel="noopener noreferrer">
                View on npm
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-sm text-gray-500">
            Built by{" "}
            <a
              href="https://twitter.com/daavsss"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Davis Grainger
            </a>
          </div>
          <div className="flex items-center gap-6">
            <a href="/docs" className="text-sm text-gray-500 hover:text-white transition-colors">
              Docs
            </a>
            <a
              href="https://github.com/DatalisHQ/zuckerbot-d2fa8661"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-white transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/zuckerbot-mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-white transition-colors"
            >
              npm
            </a>
            <a
              href="https://twitter.com/daavsss"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-white transition-colors"
            >
              Twitter
            </a>
            <a
              href="https://zuckerbot.ai/api/v1/health"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-white transition-colors"
            >
              Status
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;

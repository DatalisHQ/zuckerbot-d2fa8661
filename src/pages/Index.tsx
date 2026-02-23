import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    href: "/auth",
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
    href: "/auth",
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
      if (session?.user) navigate("/agency");
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) navigate("/agency");
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
              onClick={() => navigate("/auth")}
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
            Now in public beta
          </Badge>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] text-white mb-6">
            Your AI agent can now
            <br />
            run Facebook ads.
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mb-8 leading-relaxed">
            REST API and MCP server for AI agents to create, launch, and optimize
            Meta ad campaigns. Like AgentMail, but for ads.
          </p>
          <div className="flex flex-wrap gap-3 mb-12">
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-600/20"
            >
              Get API Key
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                document.getElementById("endpoints")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="border-white/10 text-gray-300 hover:bg-white/5 hover:text-white hover:border-white/20"
            >
              View Docs
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
                desc: "Use the MCP server with Claude, OpenClaw, or Cursor. Or call the REST API directly.",
                code: "npx @zuckerbot/mcp-server",
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

      {/* ── API Endpoints ──────────────────────────────────────────────── */}
      <section id="endpoints" className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-3">
            API Endpoints
          </h2>
          <p className="text-gray-400 mb-10">
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
            Works with Claude Desktop, OpenClaw, Cursor, and any MCP-compatible agent.
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
        "@zuckerbot/mcp-server"
      ],
      "env": {
        "ZUCKERBOT_API_KEY": "zk_your_key"
      }
    }
  }
}`}</code>
              </pre>
            </div>

            {/* OpenClaw config */}
            <div className="rounded-lg border border-white/10 bg-[#0f0f13] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                <span className="text-xs text-gray-400 font-mono">openclaw config</span>
              </div>
              <pre className="p-5 text-sm font-mono overflow-x-auto leading-relaxed">
                <code className="text-gray-300">{`{
  "skills": {
    "zuckerbot": {
      "command": "npx",
      "args": [
        "-y",
        "@zuckerbot/mcp-server"
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
                <span className="text-gray-300"> @zuckerbot/mcp-server</span>
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
            <a href="#endpoints" className="text-sm text-gray-500 hover:text-white transition-colors">
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
              API Status
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;

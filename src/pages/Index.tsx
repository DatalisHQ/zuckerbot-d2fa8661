import { Link } from "react-router-dom";
import {
  Activity,
  BrainCircuit,
  Cable,
  ExternalLink,
  Film,
  Rocket,
  Sparkles,
  Target,
} from "lucide-react";

import { CodeBlock } from "@/components/ui/CodeBlock";
import { GlassCard } from "@/components/ui/GlassCard";
import { GradientButton } from "@/components/ui/GradientButton";
import { MetricCard } from "@/components/ui/MetricCard";
import { NavBar } from "@/components/ui/NavBar";
import { StatusBadge } from "@/components/ui/StatusBadge";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "API Docs", href: "/docs" },
  { label: "MCP Server", href: "https://www.npmjs.com/package/zuckerbot-mcp", external: true },
];

const workflowSteps = [
  {
    step: "1",
    title: "Create Campaign",
    description:
      "Pass a URL. ZuckerBot scrapes the site, pulls recent ad history, and builds audience strategy with creative angles and budget logic.",
    icon: BrainCircuit,
    tone: "primary" as const,
    code: ['create_campaign({', '  url: "sophiie.ai",', '  objective: "leads"', "})"],
  },
  {
    step: "2",
    title: "Generate Creative",
    description:
      "Approve the strategy. ZuckerBot generates ad scripts and production prompts, dispatches work to your creative stack, and waits for callbacks.",
    icon: Film,
    tone: "tertiary" as const,
    code: ['request_creative({', '  campaign_id: "camp_xxx"', "})"],
  },
  {
    step: "3",
    title: "Launch & Optimise",
    description:
      "Activate. ZuckerBot creates Meta campaigns, checks performance every four hours, pauses waste, scales winners, and reports back to your agent.",
    icon: Rocket,
    tone: "primary" as const,
    code: ['activate_campaign({', '  campaign_id: "camp_xxx"', "})"],
  },
];

const featureCards = [
  {
    title: "Campaign Intelligence",
    description:
      "Every campaign is built from data: historical ads, business context, CRM stages, and live market research. No templates, no guesswork.",
    icon: BrainCircuit,
    accent: "primary",
  },
  {
    title: "Conversions API Pipeline",
    description:
      "Feed downstream conversion data back to Meta. Map CRM stages to events and optimise for revenue instead of vanity clicks.",
    icon: Cable,
    accent: "tertiary",
  },
  {
    title: "Autonomous Management",
    description:
      "Set targets and let go. ZuckerBot pauses budget leaks, scales healthy ad sets, detects creative fatigue, and keeps the loop moving.",
    icon: Activity,
    accent: "primary",
  },
  {
    title: "MCP Native",
    description:
      "Use 40+ tools from Claude, ChatGPT, Cursor, or any MCP-compatible agent to create campaigns, inspect results, and manage audiences from chat.",
    icon: Sparkles,
    accent: "tertiary",
  },
];

const technicalStats = [
  { label: "MCP Tools", value: "40+" },
  { label: "Optimisation Cycle", value: "4hr" },
  { label: "Strategy to Launch", value: "5 min" },
  { label: "Platform Fee", value: "$0" },
];

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-4">
      {eyebrow ? (
        <p className="font-label text-xs font-bold uppercase tracking-[0.22em] text-tertiary">{eyebrow}</p>
      ) : null}
      <h2 className="font-headline text-4xl font-bold tracking-tight text-on-surface sm:text-5xl">{title}</h2>
      {description ? <p className="max-w-2xl text-lg text-on-surface-variant">{description}</p> : null}
    </div>
  );
}

const Index = () => {
  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <NavBar
        links={navLinks}
        secondaryAction={{ label: "Docs", href: "/docs", variant: "tertiary" }}
        primaryAction={{ label: "Get API Key", href: "/auth?mode=signup&returnTo=/developer" }}
      />

      <main className="pt-16">
        <section className="relative isolate overflow-hidden px-6 py-20 sm:py-28">
          <div className="hero-aura absolute inset-0 -z-20" />
          <div className="indigo-grid absolute inset-0 -z-10 opacity-30" />
          <div className="absolute left-[-8rem] top-24 -z-10 h-72 w-72 rounded-full bg-primary/10 blur-[120px]" />
          <div className="absolute bottom-10 right-[-6rem] -z-10 h-80 w-80 rounded-full bg-tertiary/10 blur-[120px]" />

          <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-12">
            <div className="space-y-8 lg:col-span-7">
              <StatusBadge status="ai">AI Ads Infrastructure</StatusBadge>

              <div className="space-y-6">
                <h1 className="font-headline text-5xl font-bold leading-[1.04] tracking-tight text-on-surface sm:text-6xl md:text-[4.25rem]">
                  Give your AI agent
                  <br />
                  <span className="bg-gradient-to-r from-primary to-tertiary bg-clip-text text-transparent">
                    Facebook Ads.
                  </span>
                </h1>
                <p className="max-w-xl text-lg leading-8 text-on-surface-variant sm:text-xl">
                  One API to create, launch, and autonomously manage Meta ad campaigns. Built for MCP agents,
                  growth teams, and anyone who would rather not touch Ads Manager.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <GradientButton asChild size="lg">
                  <Link to="/auth?mode=signup&returnTo=/developer">Get Free API Key</Link>
                </GradientButton>
                <GradientButton asChild size="lg" variant="secondary">
                  <a href="https://www.npmjs.com/package/zuckerbot-mcp" target="_blank" rel="noreferrer">
                    MCP Setup Guide
                  </a>
                </GradientButton>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-tertiary shadow-[0_0_12px_rgba(0,218,243,0.5)]" />
                  <span className="font-label text-xs uppercase tracking-[0.18em] text-outline">MCP-native runtime</span>
                </div>
                <span className="font-mono text-sm text-on-surface-variant">npx zuckerbot-mcp</span>
              </div>
            </div>

            <div className="space-y-4 lg:col-span-5">
              <CodeBlock title="claude_desktop_config.json">
                <span className="text-on-surface">{"{"}</span>
                {"\n  "}
                <span className="text-tertiary">"mcpServers"</span>: <span className="text-on-surface">{"{"}</span>
                {"\n    "}
                <span className="text-tertiary">"zuckerbot"</span>: <span className="text-on-surface">{"{"}</span>
                {"\n      "}
                <span className="text-tertiary">"command"</span>: <span className="text-primary">"npx"</span>,
                {"\n      "}
                <span className="text-tertiary">"args"</span>: [<span className="text-primary">"-y"</span>, <span className="text-primary">"zuckerbot-mcp"</span>],
                {"\n      "}
                <span className="text-tertiary">"env"</span>: <span className="text-on-surface">{"{"}</span>
                {"\n        "}
                <span className="text-tertiary">"ZUCKERBOT_API_KEY"</span>: <span className="text-primary">"your_key"</span>
                {"\n      "}
                <span className="text-on-surface">{"}"}</span>
                {"\n    "}
                <span className="text-on-surface">{"}"}</span>
                {"\n  "}
                <span className="text-on-surface">{"}"}</span>
                {"\n"}
                <span className="text-on-surface">{"}"}</span>
              </CodeBlock>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MetricCard label="MCP Tools" value="40+" trend="Chat-native access" tone="tertiary" icon={<Sparkles className="h-4 w-4" />} />
                <MetricCard label="API Endpoints" value="10" trend="Production-ready" tone="primary" icon={<Target className="h-4 w-4" />} />
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="bg-surface-container-low px-6 py-24">
          <div className="mx-auto max-w-6xl space-y-16">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <SectionTitle
                title="Three tools. Full funnel."
                description="Tell your agent what you sell. ZuckerBot handles strategy, creative, and campaign management."
              />
              <p className="font-label text-xs uppercase tracking-[0.22em] text-outline">The Loop</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {workflowSteps.map((step) => {
                const Icon = step.icon;
                const isTertiary = step.tone === "tertiary";

                return (
                  <div key={step.step} className="relative">
                    <div
                      className={`absolute -left-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full font-headline text-sm font-bold ${
                        isTertiary ? "bg-tertiary-container text-on-tertiary" : "bg-primary-container text-on-primary-container"
                      }`}
                    >
                      {step.step}
                    </div>
                    <div className="h-full rounded-[1.75rem] bg-surface p-8 shadow-elevation-low">
                      <Icon className={`mb-5 h-6 w-6 ${isTertiary ? "text-tertiary" : "text-primary"}`} />
                      <h3 className="font-headline text-xl font-semibold text-on-surface">{step.title}</h3>
                      <p className="mt-4 text-sm leading-7 text-on-surface-variant">{step.description}</p>
                      <div className="mt-6 rounded-2xl bg-surface-container-highest/80 p-4 font-mono text-xs leading-6 text-on-surface-variant">
                        {step.code.map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="features" className="px-6 py-24">
          <div className="mx-auto max-w-6xl space-y-16">
            <SectionTitle eyebrow="Under the Hood" title="Not another dashboard. An ads operating system." />

            <div className="grid gap-6 md:grid-cols-2">
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                const isTertiary = feature.accent === "tertiary";

                return (
                  <div key={feature.title} className="rounded-[1.75rem] bg-surface-container p-8 shadow-elevation-low">
                    <div className="mb-5 flex items-center gap-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                          isTertiary ? "bg-tertiary-container/20 text-tertiary" : "bg-primary-container/15 text-primary"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="font-headline text-xl font-semibold text-on-surface">{feature.title}</h3>
                    </div>
                    <p className="text-sm leading-7 text-on-surface-variant">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y border-outline-variant/10 px-6 py-16">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 md:grid-cols-4">
            {technicalStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-headline text-4xl font-bold tracking-tight text-on-surface">{stat.value}</div>
                <div className="mt-2 font-label text-[10px] uppercase tracking-[0.24em] text-outline">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 py-28">
          <div className="mx-auto max-w-4xl">
            <GlassCard className="relative overflow-hidden rounded-[2rem] p-12 text-center md:p-20">
              <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-[80px]" />
              <div className="absolute -bottom-20 -left-16 h-44 w-44 rounded-full bg-tertiary/10 blur-[80px]" />
              <div className="relative z-10 space-y-8">
                <h2 className="font-headline text-4xl font-bold tracking-tight text-on-surface md:text-5xl">
                  Your agent already knows
                  <br />
                  how to run ads.
                </h2>
                <p className="mx-auto max-w-xl text-lg leading-8 text-on-surface-variant">
                  Install the MCP server. Connect Meta. Let your AI handle the rest.
                </p>

                <div className="inline-flex rounded-2xl bg-surface-container-lowest px-6 py-3 font-mono text-sm text-tertiary shadow-elevation-low">
                  npx zuckerbot-mcp
                </div>

                <div className="flex flex-col justify-center gap-4 pt-4 sm:flex-row">
                  <GradientButton asChild size="lg">
                    <Link to="/auth?mode=signup&returnTo=/developer">Get Free API Key</Link>
                  </GradientButton>
                  <GradientButton asChild size="lg" variant="secondary">
                    <Link to="/docs">Read the Docs</Link>
                  </GradientButton>
                </div>
              </div>
            </GlassCard>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant/10 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="text-center md:text-left">
            <p className="font-headline text-lg font-bold text-on-surface">ZuckerBot</p>
            <p className="font-label text-xs text-outline">© 2026 ZuckerBot AI. Meta ads infrastructure for agents.</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 font-label text-xs text-outline">
            <Link className="transition-colors hover:text-on-surface-variant" to="/docs">
              API Docs
            </Link>
            <a
              className="inline-flex items-center gap-1 transition-colors hover:text-on-surface-variant"
              href="https://www.npmjs.com/package/zuckerbot-mcp"
              target="_blank"
              rel="noreferrer"
            >
              npm
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              className="inline-flex items-center gap-1 transition-colors hover:text-on-surface-variant"
              href="https://github.com/DatalisHQ/zuckerbot-d2fa8661"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <Link className="transition-colors hover:text-on-surface-variant" to="/privacy">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;

import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  CirclePause,
  Clock3,
  DollarSign,
  Download,
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Wand2,
} from "lucide-react";

import { NavBar } from "@/components/ui/NavBar";
import { SidebarShell } from "@/components/ui/SidebarShell";
import { MetricCard } from "@/components/ui/MetricCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { GradientButton } from "@/components/ui/GradientButton";
import { StatusBadge } from "@/components/ui/StatusBadge";

const automationNavItems = [
  { id: "overview", label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { id: "analytics", label: "Analytics", href: "/dashboard#performance", icon: BarChart3 },
  { id: "ad-sets", label: "Ad Sets", href: "/dashboard#campaigns", icon: Megaphone },
  { id: "execution-log", label: "Execution Log", href: "/execution-log", icon: Sparkles },
  { id: "creatives", label: "Creatives", href: "/dashboard#workspace", icon: Wand2 },
];

const executionRows = [
  {
    id: "1",
    timestamp: "2026-03-20T14:02:45Z",
    action: "Increased Budget",
    reasoning:
      "CPA dropped below $4.50. Historical conversion rate and current auction temperature support a controlled scale from $100 to $150/day.",
    status: "success",
    detail: "Scale cap respected",
    icon: TrendingUp,
    iconClassName: "bg-primary/10 text-primary",
  },
  {
    id: "2",
    timestamp: "2026-03-20T13:58:12Z",
    action: "Paused Ad Set",
    reasoning:
      "CPC spiked 42% above the rolling average and frequency crossed the fatigue threshold for Winter Catalog Prospecting.",
    status: "success",
    detail: "Safety rule executed",
    icon: CirclePause,
    iconClassName: "bg-error-container/20 text-error",
  },
  {
    id: "3",
    timestamp: "2026-03-20T13:45:01Z",
    action: "Changed Targeting",
    reasoning:
      "High overlap detected against returning purchasers. Proposed exclusion set is waiting for manual approval before activation.",
    status: "pending",
    detail: "Awaiting approval",
    icon: SlidersHorizontal,
    iconClassName: "bg-surface-container-high text-on-surface-variant",
  },
  {
    id: "4",
    timestamp: "2026-03-20T13:30:12Z",
    action: "API Sync Error",
    reasoning:
      "Meta sync timed out while updating bidding strategy on Flash Sale Q4. Retry has been scheduled for 300 seconds.",
    status: "failed",
    detail: "Retry queued",
    icon: AlertTriangle,
    iconClassName: "bg-error-container/20 text-error",
  },
  {
    id: "5",
    timestamp: "2026-03-20T12:15:33Z",
    action: "Rotated Creatives",
    reasoning:
      "Fatigue index reached 0.82 on the primary asset, so the system rotated in UGC Alternative 1 for top-of-funnel spend.",
    status: "success",
    detail: "Creative swap live",
    icon: Wand2,
    iconClassName: "bg-tertiary-container/20 text-tertiary",
  },
] as const;

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function badgeStatus(status: (typeof executionRows)[number]["status"]) {
  if (status === "success") return "active" as const;
  if (status === "failed") return "failed" as const;
  return "paused" as const;
}

function badgeLabel(status: (typeof executionRows)[number]["status"]) {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  return "Pending Approval";
}

export default function ExecutionLog() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <NavBar
        links={[
          { label: "Landing", href: "/" },
          { label: "Dashboard", href: "/dashboard" },
          { label: "Campaigns", href: "/dashboard#campaigns" },
          { label: "Automation", href: "/execution-log" },
        ]}
        secondaryAction={{ label: "Docs", href: "/docs", variant: "tertiary" }}
        primaryAction={{ label: "API Keys", href: "/developer" }}
      />

      <div className="pt-16">
        <div className="fixed left-0 top-16 hidden h-[calc(100vh-4rem)] w-[18rem] lg:block">
          <SidebarShell
            items={automationNavItems}
            activeItem="execution-log"
            ctaHref="/profile"
            ctaLabel="Threshold Settings"
            className="h-full"
          />
        </div>

        <main className="px-6 py-8 lg:ml-[18rem] lg:px-10">
          <div className="mx-auto max-w-7xl space-y-8">
            <section className="space-y-6">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl space-y-4">
                  <div className="flex items-center gap-3">
                    <StatusBadge status="ai">Realtime</StatusBadge>
                    <span className="h-2 w-2 rounded-full bg-tertiary shadow-[0_0_18px_rgba(0,218,243,0.65)]" />
                  </div>
                  <div>
                    <h1 className="font-headline text-4xl font-black tracking-tight text-on-surface lg:text-5xl">
                      Autonomous Execution Log
                    </h1>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-on-surface-variant">
                      Visualizing 24/7 AI decision-making across campaign controls, bid safety checks, and creative rotation.
                      This screen is frontend-only for now and uses placeholder execution events until the autonomous loop is wired in.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <GradientButton size="md" variant="secondary">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filter
                  </GradientButton>
                  <GradientButton size="md">
                    <Download className="h-4 w-4" />
                    Export Log
                  </GradientButton>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Total Actions (24H)"
                  value="1,284"
                  trend="+12% vs prior window"
                  tone="tertiary"
                  icon={<Sparkles className="h-4 w-4" />}
                />
                <MetricCard
                  label="Budget Saved"
                  value="$4,120.50"
                  trend="Waste prevented by AI rules"
                  tone="primary"
                  icon={<DollarSign className="h-4 w-4" />}
                />
                <MetricCard
                  label="AI Confidence"
                  value="98.2%"
                  trend="Model confidence across actions"
                  tone="tertiary"
                  icon={<ShieldCheck className="h-4 w-4" />}
                />
                <MetricCard
                  label="Avg Response Time"
                  value="140ms"
                  trend="Across live decision evaluations"
                  tone="neutral"
                  icon={<Clock3 className="h-4 w-4" />}
                />
              </div>
            </section>

            <GlassCard className="overflow-hidden">
              <div className="grid grid-cols-[1.2fr_1.3fr_2.2fr_1fr_0.8fr] gap-4 border-b border-outline-variant/15 bg-surface-container-high/50 px-6 py-4">
                <span className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-outline">Timestamp</span>
                <span className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-outline">Action</span>
                <span className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-outline">Reasoning Engine</span>
                <span className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-outline">Status</span>
                <span className="text-right font-label text-[10px] font-bold uppercase tracking-[0.22em] text-outline">Details</span>
              </div>

              <div className="divide-y divide-outline-variant/10">
                {executionRows.map((row) => {
                  const Icon = row.icon;

                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-1 gap-4 px-6 py-5 transition-colors hover:bg-surface-container-high/20 md:grid-cols-[1.2fr_1.3fr_2.2fr_1fr_0.8fr]"
                    >
                      <div className="space-y-1">
                        <p className="font-body text-sm font-semibold text-on-surface">{formatTimestamp(row.timestamp)}</p>
                        <p className="font-label text-[10px] uppercase tracking-[0.16em] text-outline">Event ID {row.id}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${row.iconClassName}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="font-body text-sm font-semibold text-on-surface">{row.action}</span>
                      </div>

                      <p className="text-sm leading-6 text-on-surface-variant">{row.reasoning}</p>

                      <div className="flex items-start md:items-center">
                        <StatusBadge status={badgeStatus(row.status)}>{badgeLabel(row.status)}</StatusBadge>
                      </div>

                      <div className="flex items-center justify-between gap-4 md:justify-end">
                        <span className="text-xs text-on-surface-variant">{row.detail}</span>
                        <button className="rounded-xl p-2 text-outline transition-colors hover:bg-surface-container-high hover:text-primary">
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            <GlassCard className="flex flex-col gap-4 border border-outline-variant/15 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-tertiary-container/20 text-tertiary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="text-sm leading-6 text-on-surface-variant">
                  ZuckerBot AI currently respects a <strong className="text-on-surface">$200/day</strong> safety cap,
                  a <strong className="text-on-surface">3.0x ROAS</strong> floor, and manual approval on audience edits.
                </p>
              </div>
              <GradientButton size="sm" variant="secondary" onClick={() => navigate("/profile")}>
                Edit Thresholds
              </GradientButton>
            </GlassCard>

            <div className="flex items-center justify-between border-t border-outline-variant/10 pt-2 text-xs text-outline">
              <span>Placeholder autonomous events until the production loop is wired in.</span>
              <Link to="/docs#mcp-server" className="transition-colors hover:text-on-surface">
                Read the MCP docs
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

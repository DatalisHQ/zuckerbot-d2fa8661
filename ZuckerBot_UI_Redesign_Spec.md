# ZuckerBot Full UI Redesign — Codex Build Spec

## CRITICAL: What NOT To Touch

This is a **frontend-only** reskin. The following must remain COMPLETELY UNTOUCHED:

- `api/v1-router.ts` — ALL API routes, Meta integration, CAPI, campaign logic
- `supabase/` — ALL migrations, edge functions, database schema
- `mcp-server/` — ALL MCP tools, types, client code
- Authentication logic (Supabase auth, Facebook OAuth flows)
- Any API calls, data fetching hooks, or state management
- Route paths (keep all existing URLs the same)

You are ONLY changing visual components: layouts, colours, typography, spacing, icons. All data binding, click handlers, API calls, and navigation must continue working exactly as before.

## Design System: Synthetix Indigo

Reference: `design-reference/synthetix_indigo/DESIGN.md` (copy from stitch folder)

### Core Tokens

**Surface Hierarchy (no borders — use tonal layering):**
- `surface`: #121318 (base background)
- `surface-container-low`: #1a1b21 (sidebars, secondary areas)
- `surface-container`: #1e1f25 (main content cards)
- `surface-container-high`: #292a2f (elevated sections)
- `surface-container-highest`: #34343a (inputs, focused states)

**Accent Colors:**
- `primary`: #b6c4ff (links, primary actions)
- `primary-container`: #1256f4 (CTA gradients, active states)
- `tertiary`: #00daf3 (AI activity, positive indicators)
- `tertiary-container`: #00717e (AI badges, status)
- `error`: #ffb4ab (negative indicators)
- `on-surface`: #e3e1e9 (primary text)
- `on-surface-variant`: #c3c5d9 (secondary text)
- `outline`: #8d90a2 (muted labels)
- `outline-variant`: #434656 (ghost borders at 15% opacity)

**Typography:**
- Headlines: `Space Grotesk` (600-700 weight)
- Body: `Inter` (400-500 weight)
- Labels: `Manrope` (500-700 weight)

**Key Rules:**
- NO 1px borders for sectioning — use background shifts and tonal transitions
- Glassmorphism for floating elements: `rgba(30,31,37,0.7)` + `backdrop-blur(12px)`
- Primary CTAs: gradient from `#b6c4ff` to `#1256f4` at 135deg
- Ghost borders: `outline-variant` at 15% opacity only when contrast is insufficient
- Tertiary (#00daf3) for AI-driven elements to distinguish from standard data
- Extreme typographic scale contrast (display-lg next to label-md)

### Tailwind Config

Add to `tailwind.config.ts`:

```typescript
extend: {
  colors: {
    "surface": "#121318",
    "surface-container-low": "#1a1b21",
    "surface-container": "#1e1f25",
    "surface-container-high": "#292a2f",
    "surface-container-highest": "#34343a",
    "on-surface": "#e3e1e9",
    "on-surface-variant": "#c3c5d9",
    "outline": "#8d90a2",
    "outline-variant": "#434656",
    "primary": "#b6c4ff",
    "primary-container": "#1256f4",
    "on-primary": "#002780",
    "on-primary-fixed": "#001550",
    "tertiary": "#00daf3",
    "tertiary-container": "#00717e",
    "on-tertiary": "#00363d",
    "error": "#ffb4ab",
    "error-container": "#93000a",
  },
  fontFamily: {
    headline: ["Space Grotesk", "sans-serif"],
    body: ["Inter", "sans-serif"],
    label: ["Manrope", "sans-serif"],
  },
}
```

Add Google Fonts import to the root layout:
```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet"/>
```

---

## Screen-by-Screen Mapping

Each screen below has a reference HTML file in `design-reference/` and a screenshot in the same folder. Use the HTML as the visual/structural reference and the screenshot to verify the result. Adapt to React components while preserving all existing data fetching and handlers.

### 1. Landing Page → `src/pages/Index.tsx`

**Reference:** `design-reference/landing_page_production.html` (the updated version with accurate content)

**Key changes:**
- Replace the current landing page entirely with the new Synthetix Indigo design
- Hero: "Give your AI agent Facebook Ads." with MCP config code preview
- How It Works: 3-step flow (create_campaign → request_creative → activate_campaign)
- Features: Campaign Intelligence, CAPI Pipeline, Autonomous Management, MCP Native
- Stats: 40+ MCP Tools, 4hr Optimisation Cycle, 5 min Strategy to Launch, $0 Platform Fee
- CTA: "Your agent already knows how to run ads." with `npx zuckerbot-mcp` code block
- Keep existing navigation links to /login, /docs, etc.

### 2. Authentication → `src/pages/Auth.tsx` (or Login.tsx)

**Reference:** `design-reference/authentication/code.html` + `screen.png`

**Key changes:**
- Dark background with split layout: left side hero text, right side login form
- Left: "Automate with AI-Powered Precision." headline + efficiency/AI iteration stats
- Right: Login form with email/password + Google/GitHub SSO buttons
- Keep ALL existing Supabase auth logic, OAuth flows, and redirect handling
- Just restyle the form inputs, buttons, and layout

### 3. Sign Up → `src/pages/SignUp.tsx` (or wherever registration lives)

**Reference:** `design-reference/sign_up/code.html` + `screen.png`

**Key changes:**
- Same split layout as auth
- Registration form with name, email, password, confirm password
- Keep existing Supabase createUser logic
- Restyle only

### 4. Dashboard Overview → `src/pages/Dashboard.tsx` (or similar)

**Reference:** `design-reference/dashboard_overview/code.html` + `screen.png`

**Key changes:**
- Left sidebar with: Overview, Analytics, Ad Sets, Creatives, AI Insights nav items
- "Core Engine / AI AUTOMATION ACTIVE" badge at top of sidebar
- "+ Create Campaign" button in sidebar
- Top metrics row: Total Spend, Conversions, ROAS, Active Campaigns
- Campaign Performance chart (Spend vs ROI bar chart by day)
- Active AI Agents panel: Targeting Bot, Creative Optimizer, Budget Guard with status badges
- Keep ALL existing data fetching — just reshape how it renders
- Surface hierarchy: sidebar = surface-container-low, main content = surface, cards = surface-container

### 5. Dashboard + System Health → Extension of Dashboard

**Reference:** `design-reference/dashboard_with_system_health/code.html` + `screen.png`

**Key changes:**
- Adds a system health panel below or alongside the main dashboard
- API status indicators, webhook health, CAPI delivery status
- Can be a tab or expandable section on the dashboard
- Wire to existing health/status endpoints if available

### 6. Campaign Management → `src/pages/Campaigns.tsx` (or similar)

**Reference:** `design-reference/campaign_management/code.html` + `screen.png`

**Key changes:**
- Header: "Campaign Management" with Active/Archived toggle and Filter button
- Summary cards: Live Campaigns, Avg ROAS, Daily Burn Rate, AI Efficiency
- Campaign table with columns: Campaign Name, Status, Current ROAS, Daily Budget, Actions
- Status badges: ACTIVE (green/tertiary), PAUSED (muted), COMPLETED (outline)
- "AI-Smart scaling enabled" / "Manual management" labels per campaign
- Pagination at bottom
- Keep existing campaign data fetching and CRUD operations

### 7. Autonomous Execution Log → New page or section

**Reference:** `design-reference/autonomous_execution_log/code.html` + `screen.png`

**Key changes:**
- "Autonomous Execution Log" with REALTIME badge
- Summary cards: Total Actions (24H), Budget Saved, AI Confidence, Avg Response Time
- Log table: Timestamp, Action, Reasoning Engine, Status, Details
- Action types: Increased Budget, Paused Ad Set, Changed Targeting, API Sync Error, Rotated Creatives
- Status badges: SUCCESS (green), FAILED (red), PENDING APPROVAL (outline)
- "Edit Thresholds" button at bottom
- This may need a new route if it doesn't exist yet. Add `/automation` or `/execution-log`

### 8. API Key Management → Part of settings or docs

**Reference:** `design-reference/api_key_management/code.html` + `screen.png`

**Key changes:**
- API key list with masked keys, creation date, last used date
- "Generate New Key" button
- Key permissions/scopes display
- Keep existing API key generation logic from Supabase

### 9. Documentation / MCP Integration → `src/pages/Docs.tsx`

**Reference:** `design-reference/documentation_mcp_integration/code.html` + `screen.png`

**Key changes:**
- Left sidebar: Getting Started, API Reference, MCP Integration, Authentication, Troubleshooting
- Main content: "MCP Server Integration" with Quick Start, Claude Desktop Config, Vercel Deployment
- Code blocks with syntax highlighting (dark theme matching surface-container-lowest)
- "Need help?" card with "ASK AI ASSISTANT" link
- Architecture Note and Critical Security Step callout boxes
- Keep ALL existing docs content — just restyle the layout and typography

---

## Shared Components to Create

### NavBar (Top)
- Fixed, full-width, `bg-background/80` with `backdrop-blur-md`
- ZuckerBot logo (Space Grotesk, primary color)
- Nav links: context-dependent (Landing vs Dashboard vs Docs)
- Right side: notifications bell, settings gear, user avatar

### Sidebar (Dashboard/App Pages)
- `bg-surface-container-low`, full height
- "Core Engine / AI AUTOMATION ACTIVE" status badge
- Navigation items with active state (primary color + left border accent)
- "+ Create Campaign" CTA button at bottom
- Help and Logout at very bottom

### MetricCard
- `bg-surface-container`, rounded-xl, no borders
- Label (Manrope, xs, uppercase, outline color)
- Value (Space Grotesk, display size, on-surface)
- Optional trend indicator (tertiary for positive, error for negative)

### StatusBadge
- Pill-shaped, full roundedness
- ACTIVE: tertiary-container bg, on-tertiary-container text
- PAUSED: surface-variant bg, on-surface-variant text
- COMPLETED: outline border, on-surface text
- FAILED: error-container bg, on-error-container text

### GlassCard
- `rgba(30,31,37,0.7)`, `backdrop-blur(12px)`
- Multi-layer shadow: `0 4px 24px rgba(0,0,0,0.4), 0 1px 2px rgba(182,196,255,0.05)`
- Ghost border: outline-variant at 15% opacity

### GradientButton (Primary CTA)
- `background: linear-gradient(135deg, #b6c4ff 0%, #1256f4 100%)`
- `text-on-primary-fixed`, bold, rounded-xl
- Hover: slightly lighter gradient
- Active: scale-95 transform

### CodeBlock
- `bg-surface-container-lowest` (#0d0e13)
- Monospace font (JetBrains Mono or SF Mono fallback)
- Syntax highlighting: keywords=#b6c4ff, strings=#00daf3, comments=#8d90a2

---

## Implementation Order

1. **Tailwind config + fonts + shared CSS** — foundation
2. **Shared components** (NavBar, Sidebar, MetricCard, StatusBadge, GlassCard, GradientButton, CodeBlock)
3. **Landing page** — highest visibility, standalone
4. **Auth + Sign Up** — gated pages, quick wins
5. **Dashboard Overview** — main app page
6. **Campaign Management** — core functionality page
7. **Autonomous Execution Log** — new page
8. **Docs / MCP Integration** — content page
9. **API Key Management** — settings page
10. **Dashboard System Health** — enhancement

## Testing Checklist

After each page is restyled:
- [ ] All existing functionality still works (data loads, forms submit, navigation works)
- [ ] No console errors
- [ ] Responsive on mobile (test at 375px, 768px, 1280px)
- [ ] Dark theme looks correct (no white backgrounds leaking through)
- [ ] Typography hierarchy is correct (Space Grotesk headlines, Inter body, Manrope labels)
- [ ] No 1px borders used for sectioning (only ghost borders where needed)
- [ ] Glassmorphism renders correctly on floating elements
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes

## Codex Prompt

```
Redesign the ZuckerBot web application UI using the Synthetix Indigo design 
system. Reference HTML files and screenshots are in the design-reference/ 
folder at the root of the repo.

CRITICAL: This is a frontend-only reskin. Do NOT modify:
- api/v1-router.ts (API routes)
- supabase/ (migrations, edge functions)
- mcp-server/ (MCP tools)
- Any API calls, auth logic, or data fetching

ONLY change visual components: layouts, colors, typography, spacing, icons.

Steps:
1. Update tailwind.config.ts with the Synthetix Indigo color tokens and 
   font families from design-reference/synthetix_indigo/DESIGN.md
2. Add Google Fonts import to the root layout
3. Create shared components: NavBar, Sidebar, MetricCard, StatusBadge, 
   GlassCard, GradientButton, CodeBlock
4. Restyle each page to match its reference HTML/screenshot:
   - Landing: design-reference/landing_page_production.html
   - Auth: design-reference/authentication/
   - Sign Up: design-reference/sign_up/
   - Dashboard: design-reference/dashboard_overview/
   - Campaigns: design-reference/campaign_management/
   - Execution Log: design-reference/autonomous_execution_log/
   - Docs: design-reference/documentation_mcp_integration/
   - API Keys: design-reference/api_key_management/
5. Keep all existing data fetching, state management, and event handlers
6. Ensure npm run build and npx tsc --noEmit both pass
```

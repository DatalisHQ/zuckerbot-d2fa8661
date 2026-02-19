import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { trackFunnelEvent, trackPageView } from "@/utils/analytics";

// ── Types ──────────────────────────────────────────────────────────────────

interface AdPreview {
  image_base64?: string;
  headline: string;
  copy: string;
}

interface BrandAnalysis {
  business_name?: string;
  business_type?: string;
  industry?: string;
  location?: string;
  target_area?: string;
  rating?: number;
  review_count?: number;
  reviews?: Array<{
    stars: number;
    text: string;
    author: string;
    date: string;
    highlight?: string;
  }>;
  competitors?: Array<{
    name: string;
    badge: string;
    description: string;
  }>;
  question?: {
    title: string;
    body: string;
    options: Array<{ emoji: string; label: string; sub: string }>;
  };
  strategy?: {
    monthly_budget?: string;
    platforms?: string;
    target_area?: string;
    projected_leads?: string;
    cost_per_lead?: string;
    expected_roi?: string;
  };
}

interface PreviewResult {
  business_name: string;
  description?: string;
  ads: AdPreview[];
  brand_analysis?: BrandAnalysis;
}

type Phase = "landing" | "thinking" | "presentation";

// ── Constants ──────────────────────────────────────────────────────────────

const ENHANCED_FUNCTION_URL =
  "https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/generate-preview-v2";

const THINKING_STEPS = [
  "Reading your website...",
  "Understanding your business...",
  "Studying your market...",
  "Researching your competitors...",
  "Designing your ads...",
  "Building your campaign...",
  "Preparing your strategy...",
];

// Fallback demo data used when API returns partial results
const FALLBACK: BrandAnalysis = {
  rating: 4.8,
  review_count: 127,
  reviews: [
    {
      stars: 5,
      text: "Incredible service. They understood exactly what we needed and delivered fast.",
      author: "Sarah M.",
      date: "3 months ago",
      highlight: "understood exactly what we needed",
    },
    {
      stars: 5,
      text: "Called on short notice and they still showed up the same day. Highly recommend.",
      author: "Mike T.",
      date: "1 month ago",
      highlight: "showed up the same day",
    },
    {
      stars: 5,
      text: "Most honest team I have worked with. Fair pricing, no pressure. Just great work.",
      author: "Jennifer L.",
      date: "2 weeks ago",
      highlight: "Most honest team",
    },
  ],
  competitors: [
    {
      name: "Competitor A",
      badge: "Running 120+ days",
      description:
        "Running engagement ads on Facebook and Instagram. Their creative has not been updated in 4 months, showing signs of creative fatigue. Opportunity to stand out with fresh messaging.",
    },
    {
      name: "Competitor B",
      badge: "Running 45 days",
      description:
        "Active lead generation campaign with carousel ads. Targeting a broad audience. Their copy focuses on price. You can differentiate on quality and trust.",
    },
    {
      name: "Competitor C",
      badge: "Running 12 days",
      description:
        "New entrant with video ads. Small budget, testing phase. They are going after the same audience. Move fast to establish presence first.",
    },
  ],
  question: {
    title: "One question before I build your campaign.",
    body: "Based on what I found, which outcome matters most for your business right now?",
    options: [
      { emoji: "📞", label: "More phone calls", sub: "High-intent leads, fast conversion" },
      { emoji: "📋", label: "More form fills", sub: "Build a pipeline of warm prospects" },
      { emoji: "⚡", label: "Both. Let AI optimize", sub: "I will split-test and find the winner" },
    ],
  },
  strategy: {
    monthly_budget: "$600 - $900",
    platforms: "Facebook + Instagram",
    target_area: "25km from your location",
    projected_leads: "40 - 65",
    cost_per_lead: "$9 - $15",
    expected_roi: "3.2x - 5.1x",
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function extractInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function extractDomain(url: string): string {
  return url
    .replace(/https?:\/\//, "")
    .replace(/\/$/, "")
    .split("/")[0];
}

// ── Component ──────────────────────────────────────────────────────────────

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // UX phases
  const [phase, setPhase] = useState<Phase>("landing");
  const [url, setUrl] = useState("");
  const [thinkingStep, setThinkingStep] = useState(0);

  // API result
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [brand, setBrand] = useState<BrandAnalysis>(FALLBACK);
  const [bizName, setBizName] = useState("");
  const [bizInitials, setBizInitials] = useState("ZB");
  const [bizDomain, setBizDomain] = useState("yourbusiness.com");
  const [bizIndustry, setBizIndustry] = useState("your space");
  const [error, setError] = useState<string | null>(null);

  // Presentation scroll
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  // Refs
  const thinkingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typewriterContainerRef = useRef<HTMLDivElement>(null);

  // ── Analytics & auth ──────────────────────────────────────────────────

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const source = urlParams.get("utm_source") || urlParams.get("source");
    const medium = urlParams.get("utm_medium") || urlParams.get("medium");
    trackFunnelEvent.viewLanding(source || undefined, medium || undefined);
    trackPageView("/", "ZuckerBot - AI Ad Manager", { source, medium });
  }, [location]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setAuthLoading(false);
      // Redirect logged-in users
      if (u) {
        navigate("/agency");
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      setAuthLoading(false);
      if (u) {
        navigate("/agency");
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // ── Scroll-card observer (landing below-fold) ────────────────────────

  useEffect(() => {
    if (phase !== "landing") return;
    const els = document.querySelectorAll("[data-scroll-card]");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("scroll-visible");
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -50px 0px" }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [phase]);

  // ── Presentation section observer ────────────────────────────────────

  useEffect(() => {
    if (phase !== "presentation") return;
    const timer = setTimeout(() => {
      const els = document.querySelectorAll("[data-pres]");
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("pres-visible");
              // Stagger child animations
              entry.target.querySelectorAll("[data-stagger]").forEach((child, i) => {
                setTimeout(() => child.classList.add("stagger-visible"), 200 + i * 200);
              });
            }
          });
        },
        { threshold: 0.2 }
      );
      els.forEach((el) => obs.observe(el));
      return () => obs.disconnect();
    }, 100);
    return () => clearTimeout(timer);
  }, [phase]);

  // ── Typewriter effect ────────────────────────────────────────────────

  const runTypewriter = useCallback(() => {
    const container = typewriterContainerRef.current;
    if (!container) return;
    container.innerHTML = "";

    const lines = [
      { tag: "h1", className: "tw-greeting", text: `Hey, ${bizName}.` },
      { tag: "p", className: "tw-body", text: `I'm ZuckerBot, your new account manager.` },
      {
        tag: "p",
        className: "tw-body",
        text: `I just spent 90 seconds studying ${bizDomain}, analyzing the ${bizIndustry} market, and researching what your competitors are running on Facebook.`,
      },
      {
        tag: "p",
        className: "tw-body",
        text: `I have already built your first ad campaign with custom creatives, targeted copy, and a full launch strategy, all tailored specifically to ${bizName}.`,
      },
      {
        tag: "p",
        className: "tw-body-hint",
        text: `Scroll down. Let me show you everything.`,
      },
    ];

    let lineIdx = 0;

    function typeLine() {
      if (lineIdx >= lines.length || !container) return;
      const line = lines[lineIdx];
      const el = document.createElement(line.tag);
      el.className = line.className;
      container.appendChild(el);

      // Remove any prior cursor
      container.querySelectorAll(".tw-cursor").forEach((c) => c.remove());

      const cursor = document.createElement("span");
      cursor.className = "tw-cursor";
      el.appendChild(cursor);

      const fullText = line.text;
      let charIdx = 0;
      const speed = lineIdx === 0 ? 30 : 18;

      function typeChar() {
        if (charIdx >= fullText.length) {
          el.textContent = fullText;
          el.appendChild(cursor);
          lineIdx++;
          setTimeout(typeLine, lineIdx === 1 ? 600 : 400);
          return;
        }
        el.textContent = fullText.slice(0, charIdx + 1);
        el.appendChild(cursor);
        charIdx++;
        setTimeout(typeChar, speed);
      }
      typeChar();
    }

    setTimeout(typeLine, 400);
  }, [bizName, bizDomain, bizIndustry]);

  useEffect(() => {
    if (phase === "presentation") {
      window.scrollTo(0, 0);
      runTypewriter();
    }
  }, [phase, runTypewriter]);

  // ── Thinking phase ───────────────────────────────────────────────────

  const startThinking = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Derive basics from URL immediately
    const domain = extractDomain(trimmed);
    const fallbackName = domain
      .replace(/\.(com|net|org|io|ai|co)$/i, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    setBizName(fallbackName);
    setBizInitials(extractInitials(fallbackName));
    setBizDomain(domain);
    setError(null);

    // Transition to thinking
    setPhase("thinking");
    setThinkingStep(0);

    // Animate through thinking steps
    let step = 0;
    thinkingIntervalRef.current = setInterval(() => {
      step++;
      if (step < THINKING_STEPS.length) {
        setThinkingStep(step);
      }
    }, 1200);

    // Fire API call
    try {
      const response = await fetch(ENHANCED_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || data.message || "Something went wrong. Please try again.");
        // Still show presentation with fallback data
      } else {
        setResult(data);

        // Extract brand info
        const ba = data.brand_analysis || {};
        const name = ba.business_name || data.business_name || fallbackName;
        setBizName(name);
        setBizInitials(extractInitials(name));
        setBizIndustry(ba.industry || ba.business_type || "your space");

        // Merge brand analysis with fallback
        setBrand((prev) => ({
          ...prev,
          ...ba,
          reviews: ba.reviews && ba.reviews.length > 0 ? ba.reviews : prev.reviews,
          competitors: ba.competitors && ba.competitors.length > 0 ? ba.competitors : prev.competitors,
          question: ba.question || prev.question,
          strategy: ba.strategy ? { ...prev.strategy, ...ba.strategy } : prev.strategy,
        }));
      }
    } catch {
      setError("Network error. Please check your connection.");
      // Still proceed to presentation with fallback data
    }

    // Clear the thinking interval and move to presentation
    if (thinkingIntervalRef.current) {
      clearInterval(thinkingIntervalRef.current);
      thinkingIntervalRef.current = null;
    }
    // Small pause before transition
    await new Promise((r) => setTimeout(r, 800));
    setPhase("presentation");
  }, [url]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (thinkingIntervalRef.current) clearInterval(thinkingIntervalRef.current);
    };
  }, []);

  // ── Question option handler ──────────────────────────────────────────

  const handleOptionSelect = (idx: number) => {
    setSelectedOption(idx);
    // Smooth scroll to next section after brief pause
    setTimeout(() => {
      const nextEl = document.getElementById("pres-ads");
      if (nextEl) nextEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 600);
  };

  // ── CTA handler ──────────────────────────────────────────────────────

  const handleCTA = () => {
    trackFunnelEvent.startSignup();
    navigate("/auth");
  };

  // ── Loading state ────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        /* ── Global resets for landing ──────────────────────── */
        .landing-root {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #111827;
          background: #fff;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
        }

        /* ── Scroll cards (landing below-fold) ─────────────── */
        [data-scroll-card] {
          opacity: 0;
          transform: translateY(80px);
          transition: opacity 1s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 1s cubic-bezier(0.16, 1, 0.3, 1);
        }
        [data-scroll-card].scroll-visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── Pulse ring (thinking) ─────────────────────────── */
        .pulse-ring {
          width: 80px; height: 80px;
          border-radius: 50%;
          border: 3px solid #2563eb;
          animation: pulse-ring 2s ease-in-out infinite;
          display: flex; align-items: center; justify-content: center;
        }
        .pulse-ring::after {
          content: '';
          width: 20px; height: 20px;
          border-radius: 50%;
          background: #2563eb;
          animation: pulse-dot 2s ease-in-out infinite;
        }
        @keyframes pulse-ring {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.7; }
        }
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(0.8); }
        }

        /* ── Presentation sections ─────────────────────────── */
        [data-pres] .pres-inner {
          opacity: 0;
          transform: translateY(60px);
          transition: opacity 1s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 1s cubic-bezier(0.16, 1, 0.3, 1);
        }
        [data-pres].pres-visible .pres-inner {
          opacity: 1;
          transform: translateY(0);
        }

        /* Stagger children */
        [data-stagger] {
          opacity: 0;
          transform: translateY(40px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        [data-stagger].stagger-visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* Ad card stagger variant */
        .ad-card-anim {
          opacity: 0;
          transform: translateY(60px) scale(0.92);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.8s cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 0.3s ease;
        }
        .ad-card-anim.stagger-visible {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .ad-card-anim:hover {
          box-shadow: 0 16px 48px rgba(0,0,0,0.1);
          transform: translateY(-4px) scale(1.01);
        }

        /* Review card stagger */
        .review-card-anim {
          opacity: 0;
          transform: translateY(40px) rotate(-1deg);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .review-card-anim:nth-child(even) {
          transform: translateY(40px) rotate(0.5deg);
        }
        .review-card-anim.stagger-visible {
          opacity: 1;
          transform: translateY(0) rotate(0);
        }
        .review-card-anim:hover {
          box-shadow: 0 8px 30px rgba(0,0,0,0.06);
        }

        /* Competitor card stagger */
        .comp-card-anim {
          opacity: 0;
          transform: translateX(-30px);
          transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .comp-card-anim.stagger-visible {
          opacity: 1;
          transform: translateX(0);
        }

        /* ── Typewriter ────────────────────────────────────── */
        .tw-cursor {
          display: inline-block;
          width: 2px;
          height: 1.1em;
          background: #2563eb;
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: cursor-blink 0.8s step-end infinite;
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .tw-greeting {
          font-size: clamp(32px, 6vw, 56px);
          font-weight: 800;
          letter-spacing: -2px;
          line-height: 1.1;
          margin-bottom: 24px;
          color: #111827;
        }
        .tw-body {
          font-size: 20px;
          line-height: 1.7;
          color: #4b5563;
          margin-bottom: 16px;
        }
        .tw-body-hint {
          font-size: 16px;
          line-height: 1.7;
          color: #9ca3af;
          margin-top: 24px;
        }

        /* ── Thinking text crossfade ───────────────────────── */
        .thinking-text-fade {
          transition: opacity 0.4s ease;
        }

        /* ── Question option ───────────────────────────────── */
        .q-option {
          padding: 14px 28px;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          background: #fff;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          color: #374151;
          text-align: center;
        }
        .q-option:hover {
          border-color: #2563eb;
          color: #2563eb;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
        }
        .q-option.q-selected {
          border-color: #2563eb;
          background: #2563eb;
          color: #fff;
          transform: scale(1.02);
        }

        /* ── CTA button ────────────────────────────────────── */
        .cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 56px;
          padding: 0 40px;
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 999px;
          font-size: 17px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s, box-shadow 0.2s;
          box-shadow: 0 4px 24px rgba(37, 99, 235, 0.3);
        }
        .cta-btn:hover {
          background: #3b82f6;
          box-shadow: 0 8px 32px rgba(37, 99, 235, 0.4);
        }
        .cta-btn:active { transform: scale(0.98); }

        /* ── Typewriter section: always visible inner ──────── */
        .tw-section .pres-inner {
          opacity: 1 !important;
          transform: none !important;
        }
      `}</style>

      <div className="landing-root">
        {/* ════════════════════════════════════════════════════════════════
            PHASE 1: LANDING
            ════════════════════════════════════════════════════════════ */}
        {phase === "landing" && (
          <div>
            {/* Above the fold: Google-simple */}
            <div className="min-h-screen flex flex-col items-center justify-center relative px-6">
              <div className="text-[28px] font-bold tracking-tight mb-12 text-gray-900">
                Zucker<span className="text-blue-600">Bot</span>
              </div>

              {/* URL Input */}
              <div className="relative w-full max-w-[560px]">
                <input
                  type="text"
                  placeholder="Enter your business website"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startThinking()}
                  className="w-full h-14 border-2 border-gray-200 rounded-full pl-6 pr-14 text-base font-[inherit] outline-none transition-all focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 bg-white placeholder:text-gray-400"
                />
                <button
                  onClick={() => startThinking()}
                  className="absolute right-1 top-1 h-12 w-12 border-none bg-blue-600 text-white rounded-full cursor-pointer flex items-center justify-center transition-all hover:bg-blue-500 active:scale-95"
                >
                  <svg
                    width="20"
                    height="20"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </button>
              </div>

              <p className="mt-4 text-gray-400 text-sm">
                No signup required · Free preview · 90 seconds
              </p>
            </div>

            {/* Below the fold: marketing scroll cards */}
            <div className="py-[120px] px-6 max-w-[800px] mx-auto">
              {/* Card 1 */}
              <div data-scroll-card className="mb-20">
                <h2 className="text-[clamp(28px,5vw,42px)] font-extrabold tracking-tight leading-[1.15] mb-4">
                  Stop paying agencies.
                  <br />
                  <span className="text-blue-600">Start outperforming them.</span>
                </h2>
                <p className="text-lg leading-relaxed text-gray-600">
                  The average small business pays $2,000 to $5,000 per month for an
                  agency that runs the same playbook for every client. ZuckerBot
                  replaces that with an AI that actually learns your business.
                </p>
              </div>

              {/* Card 2 */}
              <div data-scroll-card className="mb-20">
                <h2 className="text-[clamp(28px,5vw,42px)] font-extrabold tracking-tight leading-[1.15] mb-4">
                  Your own AI account manager.
                </h2>
                <p className="text-lg leading-relaxed text-gray-600">
                  Not a tool. Not a template. A dedicated AI that analyzes your
                  market, creates your ads, launches your campaigns, and optimizes
                  them while you sleep.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8">
                  {[
                    { number: "90s", label: "First campaign live" },
                    { number: "24/7", label: "Always monitoring" },
                    { number: "$99", label: "Per month" },
                  ].map((s, i) => (
                    <div
                      key={i}
                      className="text-center p-8 bg-gray-50 rounded-2xl border border-gray-100"
                    >
                      <div className="text-4xl font-extrabold text-blue-600">
                        {s.number}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 3 */}
              <div data-scroll-card className="mb-20">
                <h2 className="text-[clamp(28px,5vw,42px)] font-extrabold tracking-tight leading-[1.15] mb-4">
                  Trusted by businesses who
                  <br />
                  <span className="text-blue-600">refuse to overpay.</span>
                </h2>
                <p className="text-lg leading-relaxed text-gray-600">
                  Restaurants, gyms, salons, roofers, tutors, dentists. Any
                  business that needs customers but does not need a $5K agency
                  retainer.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            PHASE 2: THINKING
            ════════════════════════════════════════════════════════════ */}
        {phase === "thinking" && (
          <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50">
            <div className="pulse-ring mb-10" />
            <div className="text-[clamp(20px,4vw,32px)] font-semibold text-gray-800 text-center min-h-[44px] thinking-text-fade">
              {THINKING_STEPS[thinkingStep]}
            </div>
            <p className="mt-3 text-gray-400 text-sm">
              This takes about 90 seconds
            </p>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            PHASE 3: PRESENTATION (scroll-driven)
            ════════════════════════════════════════════════════════════ */}
        {phase === "presentation" && (
          <div>
            {/* ── Intro / Typewriter ─────────────────────────────────── */}
            <div
              data-pres
              className="tw-section min-h-screen flex flex-col items-center justify-center px-6 py-20"
            >
              <div className="pres-inner max-w-[720px] w-full">
                {/* Avatar */}
                <div className="w-16 h-16 rounded-[20px] bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-extrabold text-2xl mb-6 shadow-[0_8px_32px_rgba(37,99,235,0.3)]">
                  Z
                </div>
                <div ref={typewriterContainerRef} className="min-h-[300px]" />
              </div>
            </div>

            {/* ── Reviews ────────────────────────────────────────────── */}
            <div
              data-pres
              className="min-h-screen flex flex-col items-center justify-center px-6 py-20"
            >
              <div className="pres-inner max-w-[720px] w-full">
                <h2 className="text-[clamp(24px,4vw,36px)] font-extrabold tracking-tight mb-2">
                  I found what your customers love about you.
                </h2>
                <p className="text-gray-500 text-base">
                  I pulled your Google reviews. Here is what stands out:
                </p>

                {/* Rating summary */}
                <div
                  data-stagger
                  className="review-card-anim flex items-center gap-4 mt-8 p-5 bg-gray-50 rounded-2xl border border-gray-100"
                >
                  <div className="text-5xl font-extrabold text-gray-900 leading-none">
                    {brand.rating || 4.8}
                  </div>
                  <div className="text-sm text-gray-500">
                    <div className="text-amber-500 text-base tracking-widest">
                      {"★".repeat(Math.round(brand.rating || 4.8))}
                      {"☆".repeat(5 - Math.round(brand.rating || 4.8))}
                    </div>
                    <strong className="text-gray-900">
                      {brand.review_count || 127} reviews
                    </strong>{" "}
                    on Google
                  </div>
                </div>

                {/* Review cards */}
                <div className="grid gap-4 mt-8">
                  {(brand.reviews || FALLBACK.reviews!).map((rev, i) => (
                    <div
                      key={i}
                      data-stagger
                      className="review-card-anim bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    >
                      <div className="text-amber-500 text-base tracking-widest mb-3">
                        {"★".repeat(rev.stars)}
                        {"☆".repeat(5 - rev.stars)}
                      </div>
                      <div className="text-[15px] leading-relaxed text-gray-700 italic">
                        &quot;
                        {rev.highlight ? (
                          <>
                            {rev.text.split(rev.highlight)[0]}
                            <span className="not-italic font-medium text-blue-600 bg-blue-600/10 px-1.5 py-0.5 rounded">
                              {rev.highlight}
                            </span>
                            {rev.text.split(rev.highlight)[1]}
                          </>
                        ) : (
                          rev.text
                        )}
                        &quot;
                      </div>
                      <div className="mt-3 text-[13px] text-gray-400 font-medium">
                        {rev.author} · {rev.date}
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-gray-500 text-[15px] mt-6 text-center">
                  I will use these real customer stories in your ad copy.{" "}
                  <strong className="text-gray-900">
                    Social proof converts 2-3x better than generic messaging.
                  </strong>
                </p>
              </div>
            </div>

            {/* ── Smart Question ──────────────────────────────────────── */}
            <div
              data-pres
              className="min-h-screen flex flex-col items-center justify-center px-6 py-20"
            >
              <div className="pres-inner max-w-[720px] w-full">
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-600/15 rounded-2xl p-10 text-center">
                  <div className="text-[32px] mb-4">🤔</div>
                  <h3 className="text-[22px] font-bold mb-3 text-gray-900">
                    {brand.question?.title || FALLBACK.question!.title}
                  </h3>
                  <p className="text-base text-gray-600 mb-6 max-w-[500px] mx-auto">
                    {brand.question?.body || FALLBACK.question!.body}
                  </p>
                  <div className="flex gap-3 justify-center flex-wrap">
                    {(brand.question?.options || FALLBACK.question!.options).map(
                      (opt, i) => (
                        <button
                          key={i}
                          className={`q-option ${selectedOption === i ? "q-selected" : ""}`}
                          onClick={() => handleOptionSelect(i)}
                        >
                          {opt.emoji} {opt.label}
                          <br />
                          <span className={`text-xs ${selectedOption === i ? "text-white/70" : "text-gray-400"}`}>
                            {opt.sub}
                          </span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Ads ────────────────────────────────────────────────── */}
            <div
              id="pres-ads"
              data-pres
              className="min-h-screen flex flex-col items-center justify-center px-6 py-20"
            >
              <div className="pres-inner max-w-[720px] w-full">
                <h2 className="text-[clamp(24px,4vw,36px)] font-extrabold tracking-tight mb-2">
                  I made these for{" "}
                  <span className="text-blue-600">{bizName}</span>.
                </h2>
                <p className="text-gray-500 text-base mb-2">
                  Two ad concepts, ready to launch on Facebook and Instagram.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-10">
                  {result?.ads && result.ads.length > 0
                    ? result.ads.slice(0, 2).map((ad, i) => (
                        <div
                          key={i}
                          data-stagger
                          className="ad-card-anim bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                        >
                          {/* Header */}
                          <div className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
                              {bizInitials}
                            </div>
                            <div>
                              <div className="text-sm font-semibold">{bizName}</div>
                              <div className="text-xs text-gray-400">
                                Sponsored · 🌏
                              </div>
                            </div>
                          </div>
                          {/* Copy */}
                          <div className="px-4 pb-3 text-sm leading-relaxed text-gray-700">
                            {ad.copy}
                          </div>
                          {/* Image */}
                          {ad.image_base64 ? (
                            <img
                              src={`data:image/png;base64,${ad.image_base64}`}
                              alt="AI-generated ad creative"
                              className="w-full aspect-square object-cover"
                            />
                          ) : (
                            <div className="w-full aspect-square bg-gradient-to-br from-blue-50 via-purple-50 to-amber-50 flex items-center justify-center text-gray-400 text-sm">
                              [ AI-generated creative ]
                            </div>
                          )}
                          {/* Headline */}
                          <div className="p-3 px-4 border-t border-gray-100 bg-gray-50">
                            <div className="text-[11px] text-gray-400 uppercase">
                              {bizDomain}
                            </div>
                            <div className="text-sm font-semibold mt-0.5">
                              {ad.headline}
                            </div>
                          </div>
                          {/* Actions */}
                          <div className="flex justify-around py-2.5 px-4 border-t border-gray-100 text-[13px] text-gray-500">
                            <span>👍 Like</span>
                            <span>💬 Comment</span>
                            <span>↗️ Share</span>
                          </div>
                        </div>
                      ))
                    : // Placeholder ad cards
                      [0, 1].map((i) => (
                        <div
                          key={i}
                          data-stagger
                          className="ad-card-anim bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                        >
                          <div className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
                              {bizInitials}
                            </div>
                            <div>
                              <div className="text-sm font-semibold">{bizName}</div>
                              <div className="text-xs text-gray-400">
                                Sponsored · 🌏
                              </div>
                            </div>
                          </div>
                          <div className="px-4 pb-3 text-sm leading-relaxed text-gray-700">
                            {i === 0
                              ? `Transform your results with ${bizName}. Trusted by hundreds of local customers. Book your free consultation today.`
                              : `Why are locals switching to ${bizName}? Because we deliver results, not promises. See what our customers are saying.`}
                          </div>
                          <div className="w-full aspect-square bg-gradient-to-br from-blue-50 via-purple-50 to-amber-50 flex items-center justify-center text-gray-400 text-sm">
                            [ AI-generated creative ]
                          </div>
                          <div className="p-3 px-4 border-t border-gray-100 bg-gray-50">
                            <div className="text-[11px] text-gray-400 uppercase">
                              {bizDomain}
                            </div>
                            <div className="text-sm font-semibold mt-0.5">
                              {i === 0
                                ? `The Local Choice for Quality Service`
                                : `See Why Locals Love Us`}
                            </div>
                          </div>
                          <div className="flex justify-around py-2.5 px-4 border-t border-gray-100 text-[13px] text-gray-500">
                            <span>👍 Like</span>
                            <span>💬 Comment</span>
                            <span>↗️ Share</span>
                          </div>
                        </div>
                      ))}
                </div>
              </div>
            </div>

            {/* ── Strategy ───────────────────────────────────────────── */}
            <div
              data-pres
              className="min-h-screen flex flex-col items-center justify-center px-6 py-20"
            >
              <div className="pres-inner max-w-[720px] w-full">
                <h2 className="text-[clamp(24px,4vw,36px)] font-extrabold tracking-tight mb-2">
                  Here is your campaign plan.
                </h2>
                <p className="text-gray-500 text-base">
                  Built specifically for{" "}
                  <strong className="text-gray-900">{bizName}</strong> based on
                  your market and competitors.
                </p>

                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-8 mt-6">
                  <h4 className="text-[13px] uppercase tracking-widest text-gray-400 mb-3">
                    Campaign Overview
                  </h4>
                  {[
                    {
                      label: "Monthly Budget",
                      value: brand.strategy?.monthly_budget || "$600 - $900",
                    },
                    {
                      label: "Platforms",
                      value: brand.strategy?.platforms || "Facebook + Instagram",
                    },
                    {
                      label: "Target Area",
                      value: brand.strategy?.target_area || "25km from your location",
                    },
                    {
                      label: "Projected Leads/Month",
                      value: brand.strategy?.projected_leads || "40 - 65",
                      green: true,
                    },
                    {
                      label: "Estimated Cost Per Lead",
                      value: brand.strategy?.cost_per_lead || "$9 - $15",
                    },
                    {
                      label: "Expected ROI",
                      value: brand.strategy?.expected_roi || "3.2x - 5.1x",
                      green: true,
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex justify-between py-3 border-b border-gray-100 last:border-b-0 text-[15px]"
                    >
                      <span className="text-gray-500">{item.label}</span>
                      <span
                        className={`font-semibold ${item.green ? "text-emerald-500" : "text-gray-900"}`}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Competitors ────────────────────────────────────────── */}
            <div
              data-pres
              className="min-h-screen flex flex-col items-center justify-center px-6 py-20"
            >
              <div className="pres-inner max-w-[720px] w-full">
                <h2 className="text-[clamp(24px,4vw,36px)] font-extrabold tracking-tight mb-2">
                  {bizName}&apos;s competitors are not sleeping.
                </h2>
                <p className="text-gray-500 text-base mb-2">
                  I found active ad campaigns from businesses in{" "}
                  <span className="text-gray-700 font-medium">{bizIndustry}</span>.
                </p>

                <div className="space-y-4 mt-4">
                  {(brand.competitors || FALLBACK.competitors!).map((comp, i) => (
                    <div
                      key={i}
                      data-stagger
                      className="comp-card-anim bg-white border border-gray-200 rounded-2xl p-6"
                    >
                      <div className="font-semibold text-[15px] mb-2 flex items-center gap-2">
                        {comp.name}
                        <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                          {comp.badge}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 leading-relaxed">
                        {comp.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── CTA / Pricing ──────────────────────────────────────── */}
            <div
              data-pres
              className="min-h-screen flex flex-col items-center justify-center px-6 py-20"
            >
              <div className="pres-inner max-w-[720px] w-full text-center">
                <h2 className="text-[clamp(28px,5vw,44px)] font-extrabold tracking-tight mb-4">
                  Ready to launch?
                </h2>
                <p className="text-lg text-gray-500 mb-10 max-w-[480px] mx-auto">
                  Connect your Facebook page and your first campaign goes live
                  today. Everything I built is ready. You just approve it.
                </p>

                <button className="cta-btn" onClick={handleCTA}>
                  Get Started for $99/mo
                  <svg
                    width="20"
                    height="20"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </button>

                {/* Pricing cards */}
                <div className="flex justify-center gap-8 mt-12 flex-wrap">
                  {/* Standard */}
                  <div className="bg-gray-50 border-2 border-gray-100 rounded-2xl p-8 w-[260px] text-center transition-all">
                    <div className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-2">
                      Standard
                    </div>
                    <div className="text-5xl font-extrabold tracking-tight">
                      $99
                      <span className="text-lg font-normal text-gray-400">
                        /mo
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-2">
                      For single-location businesses
                    </div>
                    <ul className="mt-6 text-left text-sm text-gray-600 space-y-1.5">
                      {[
                        "1 active campaign",
                        "AI ad creatives",
                        "Competitor monitoring",
                        "Weekly performance reports",
                        "Chat with ZuckerBot 24/7",
                      ].map((f, i) => (
                        <li key={i} className="flex items-center gap-2 py-1">
                          <span className="text-emerald-500 font-bold text-sm">
                            ✓
                          </span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Growth (featured) */}
                  <div className="bg-gray-50 border-2 border-blue-600 rounded-2xl p-8 w-[260px] text-center relative shadow-[0_8px_32px_rgba(37,99,235,0.1)]">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-semibold px-4 py-1 rounded-full uppercase tracking-wider">
                      Most Popular
                    </div>
                    <div className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-2">
                      Growth
                    </div>
                    <div className="text-5xl font-extrabold tracking-tight">
                      $199
                      <span className="text-lg font-normal text-gray-400">
                        /mo
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-2">
                      For businesses ready to scale
                    </div>
                    <ul className="mt-6 text-left text-sm text-gray-600 space-y-1.5">
                      {[
                        "3 active campaigns",
                        "Multi-platform (FB + IG + Google)",
                        "Automatic creative refresh",
                        "Advanced audience targeting",
                        "Priority support",
                      ].map((f, i) => (
                        <li key={i} className="flex items-center gap-2 py-1">
                          <span className="text-emerald-500 font-bold text-sm">
                            ✓
                          </span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <p className="text-sm text-gray-400 mt-10">
                  7-day free trial · Cancel anytime · No setup fees
                </p>
              </div>
            </div>

            {/* ── Footer ─────────────────────────────────────────────── */}
            <footer className="border-t border-gray-200 py-10 px-6">
              <div className="max-w-[720px] mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-gray-400">
                <div className="font-semibold text-gray-900">
                  Zucker<span className="text-blue-600">Bot</span>
                </div>
                <p>&copy; {new Date().getFullYear()} ZuckerBot</p>
              </div>
            </footer>
          </div>
        )}

        {/* ── Error toast (non-blocking) ─────────────────────────────── */}
        {error && phase === "presentation" && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 px-6 py-3 rounded-xl text-sm shadow-lg z-50 max-w-[90vw]">
            {error}
          </div>
        )}
      </div>
    </>
  );
};

export default Index;

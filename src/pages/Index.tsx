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
  rationale?: string;
}

interface BrandAnalysis {
  business_name?: string;
  business_type?: string;
  industry?: string;
  location?: string;
  target_area?: string;
  rating?: number;
  review_count?: number;
  keywords?: string[];
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
  "https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/generate-preview";

const THINKING_STEPS = [
  "Reading your website...",
  "Scanning your Google reviews...",
  "Researching competitors...",
  "Analyzing what works...",
  "Designing informed ads...",
  "Almost ready...",
];

// Default question (always shown, not business-specific)
const DEFAULT_QUESTION = {
  title: "One question before I build your campaign.",
  body: "Which outcome matters most for your business right now?",
  options: [
    { emoji: "📞", label: "More phone calls", sub: "High-intent leads, fast conversion" },
    { emoji: "📋", label: "More form fills", sub: "Build a pipeline of warm prospects" },
    { emoji: "⚡", label: "Both. Let AI optimize", sub: "I will split-test and find the winner" },
  ],
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

/** Wraps a promise with a timeout. Resolves to null if the timeout fires first. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Quick industry inference from business name/domain. */
function inferIndustry(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("dental") || n.includes("dentist") || n.includes("teeth") || n.includes("orthodont") || n.includes("smile")) return "dental";
  if (n.includes("restaurant") || n.includes("food") || n.includes("kitchen") || n.includes("dining") || n.includes("cafe") || n.includes("pizza") || n.includes("sushi") || n.includes("grill")) return "restaurant";
  if (n.includes("gym") || n.includes("fitness") || n.includes("workout") || n.includes("crossfit") || n.includes("yoga") || n.includes("pilates")) return "fitness";
  if (n.includes("salon") || n.includes("hair") || n.includes("beauty") || n.includes("spa") || n.includes("nail") || n.includes("lash")) return "beauty";
  if (n.includes("roof") || n.includes("construction") || n.includes("build") || n.includes("contractor")) return "construction";
  if (n.includes("plumb") || n.includes("electric") || n.includes("hvac") || n.includes("air con")) return "trades";
  if (n.includes("law") || n.includes("legal") || n.includes("attorney") || n.includes("solicitor")) return "legal";
  if (n.includes("real estate") || n.includes("realty") || n.includes("property") || n.includes("homes")) return "real estate";
  if (n.includes("auto") || n.includes("mechanic") || n.includes("car") || n.includes("motor") || n.includes("tyre") || n.includes("tire")) return "automotive";
  if (n.includes("clean") || n.includes("maid")) return "cleaning";
  if (n.includes("vet") || n.includes("animal") || n.includes("pet")) return "veterinary";
  if (n.includes("physio") || n.includes("chiro") || n.includes("health") || n.includes("medical") || n.includes("clinic")) return "healthcare";
  if (n.includes("account") || n.includes("tax") || n.includes("bookkeep")) return "accounting";
  if (n.includes("photo") || n.includes("video") || n.includes("film")) return "photography";
  return "";
}

/** Scans competitor ad copy for common marketing hooks. */
function extractHooksFromCompetitors(data: Partial<BrandAnalysis>): string[] {
  const hooks: string[] = [];
  const patterns: Array<{ keyword: string; label: string }> = [
    { keyword: "free", label: "Free offer" },
    { keyword: "discount", label: "Discount" },
    { keyword: "% off", label: "Percentage off" },
    { keyword: "limited", label: "Scarcity / limited time" },
    { keyword: "hurry", label: "Urgency" },
    { keyword: "today only", label: "Urgency" },
    { keyword: "book now", label: "Urgency" },
    { keyword: "call now", label: "Direct CTA" },
    { keyword: "guarantee", label: "Guarantee" },
    { keyword: "trusted", label: "Trust signal" },
    { keyword: "rated", label: "Social proof" },
    { keyword: "review", label: "Social proof" },
    { keyword: "award", label: "Authority" },
    { keyword: "certified", label: "Authority" },
  ];

  const allCopy = (data.competitors || [])
    .map((c) => c.description)
    .join(" ")
    .toLowerCase();

  const seen = new Set<string>();
  for (const p of patterns) {
    if (allCopy.includes(p.keyword) && !seen.has(p.label)) {
      seen.add(p.label);
      hooks.push(p.label);
    }
  }
  return hooks;
}

/** Identifies strategic gaps competitors are NOT using. */
function identifyGaps(data: Partial<BrandAnalysis>): string[] {
  const gaps: string[] = [];
  const allCopy = (data.competitors || [])
    .map((c) => c.description)
    .join(" ")
    .toLowerCase();

  if (!allCopy.includes("review") && !allCopy.includes("rated") && !allCopy.includes("star")) {
    gaps.push("No competitors mention customer reviews or ratings");
  }
  if (!allCopy.includes("guarantee") && !allCopy.includes("money back")) {
    gaps.push("No competitors offer a guarantee");
  }
  if (!allCopy.includes("free")) {
    gaps.push("No competitors lead with a free offer");
  }
  if (!allCopy.includes("video") && !allCopy.includes("watch")) {
    gaps.push("No competitors use video-based CTAs");
  }
  if (allCopy.length > 0 && !allCopy.includes("local") && !allCopy.includes("near")) {
    gaps.push("Competitors use generic messaging without local targeting");
  }
  return gaps;
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
  const [brand, setBrand] = useState<BrandAnalysis>({});
  const [bizName, setBizName] = useState("");
  const [bizInitials, setBizInitials] = useState("ZB");
  const [bizDomain, setBizDomain] = useState("yourbusiness.com");
  const [bizIndustry, setBizIndustry] = useState("your space");
  const [error, setError] = useState<string | null>(null);

  // Two-phase orchestration state
  const [adsLoading, setAdsLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<any>(null);
  const [competitorResult, setCompetitorResult] = useState<any>(null);

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

  // Re-run observer whenever phase or brand data changes (picks up new sections)
  useEffect(() => {
    if (phase !== "presentation") return;
    const timer = setTimeout(() => {
      const els = document.querySelectorAll("[data-pres]:not(.pres-observed)");
      if (els.length === 0) return;
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
      els.forEach((el) => {
        el.classList.add("pres-observed");
        obs.observe(el);
      });
      return () => obs.disconnect();
    }, 100);
    return () => clearTimeout(timer);
  }, [phase, brand.reviews, brand.competitors, result]);

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
        text: `I just spent 90 seconds studying your website, analyzing the ${bizIndustry !== "your space" ? bizIndustry + " " : ""}market, and researching what your competitors are running on Facebook.`,
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

  // ── Thinking phase (Two-Phase Orchestration) ─────────────────────────

  const startThinking = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Derive basics from URL immediately
    const domain = extractDomain(trimmed);
    const fallbackName = domain
      .replace(/^www\./i, "")
      .replace(/\.(com\.au|co\.uk|co\.nz|com\.br|org\.au|net\.au|co\.in|com|net|org|io|ai|co|app|dev|xyz|me|info|biz|us|uk|au|nz|ca)$/i, "")
      .replace(/[-_.]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();

    setBizName(fallbackName);
    setBizInitials(extractInitials(fallbackName));
    setBizDomain(domain);
    const earlyIndustry = inferIndustry(fallbackName) || inferIndustry(domain);
    if (earlyIndustry) setBizIndustry(earlyIndustry);
    setError(null);
    setResult(null);
    setReviewResult(null);
    setCompetitorResult(null);
    setAdsLoading(false);

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

    // ── PHASE 1: Discovery (parallel) ──────────────────────────────────
    // Fire reviews + competitors in parallel, wait for both (or timeout at 30s)

    const reviewPromise = fetchReviewData(fallbackName, domain);
    const competitorPromise = fetchCompetitorData(fallbackName);

    const [reviewSettled, competitorSettled] = await Promise.allSettled([
      withTimeout(reviewPromise, 30000),
      withTimeout(competitorPromise, 30000),
    ]);

    // Extract Phase 1 results
    const rawReviews = reviewSettled.status === "fulfilled" ? reviewSettled.value : null;
    const rawCompetitors = competitorSettled.status === "fulfilled" ? competitorSettled.value : null;

    // Store raw results for Phase 2
    setReviewResult(rawReviews);
    setCompetitorResult(rawCompetitors);

    // Populate brand display data from Phase 1
    const updatedBrand: BrandAnalysis = {
      business_name: fallbackName,
    };

    if (rawReviews) {
      updatedBrand.rating = rawReviews.rating;
      updatedBrand.review_count = rawReviews.review_count;
      updatedBrand.reviews = rawReviews.reviews;
      updatedBrand.keywords = rawReviews.keywords;
    }

    if (rawCompetitors) {
      updatedBrand.competitors = rawCompetitors.competitors;
    }

    setBrand(updatedBrand);

    // Clear the thinking interval and transition to presentation
    if (thinkingIntervalRef.current) {
      clearInterval(thinkingIntervalRef.current);
      thinkingIntervalRef.current = null;
    }
    await new Promise((r) => setTimeout(r, 800));
    setPhase("presentation");

    // ── PHASE 2: Enriched Creative Generation ──────────────────────────
    // Fire ad generation WITH review/competitor enrichment data
    setAdsLoading(true);

    try {
      const creativePayload: Record<string, any> = { url: trimmed };

      if (rawReviews) {
        creativePayload.review_data = {
          rating: rawReviews.rating,
          review_count: rawReviews.review_count,
          themes: rawReviews.keywords || [],
          best_quotes: (rawReviews.reviews || []).map((r: any) => r.text).slice(0, 3),
        };
      }

      if (rawCompetitors) {
        creativePayload.competitor_data = {
          ad_count: rawCompetitors.competitors?.length || 0,
          competitors: (rawCompetitors.competitors || []).slice(0, 3).map((c: any) => ({
            page_name: c.name,
            ad_body_text: c.description,
          })),
          common_hooks: extractHooksFromCompetitors(rawCompetitors),
          gaps: identifyGaps(rawCompetitors),
        };
      }

      const response = await fetch(ENHANCED_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creativePayload),
      });

      const data = await response.json();

      if (data && !data.error) {
        setResult(data);

        // Update brand with any additional info from generate-preview
        const ba = data.brand_analysis || {};
        const name = ba.business_name || data.business_name || fallbackName;
        setBizName(name);
        setBizInitials(extractInitials(name));
        setBizIndustry(ba.industry || ba.business_type || "your space");

        setBrand((prev) => ({
          ...prev,
          ...ba,
          business_name: name,
          // Preserve Phase 1 data that may not be in generate-preview response
          rating: prev.rating || ba.rating,
          review_count: prev.review_count || ba.review_count,
          reviews: prev.reviews || ba.reviews,
          competitors: prev.competitors || ba.competitors,
        }));

        // If we got a better business name, re-fire reviews
        if (name !== fallbackName && !rawReviews) {
          fetchReviewData(name, domain).then((reviews) => {
            if (reviews) {
              setReviewResult(reviews);
              setBrand((prev) => ({ ...prev, ...reviews }));
            }
          });
        }
      } else {
        setError(data?.error || data?.message || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setAdsLoading(false);
    }
  }, [url]);

  // ── SSE helpers for parallel agent calls ─────────────────────────────

  async function fetchReviewData(businessName: string, domain: string): Promise<Partial<BrandAnalysis> | null> {
    try {
      // Derive a location guess from the domain
      const loc = "United States"; // default, could be smarter later
      const response = await fetch("/api/scrape-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_name: businessName, location: loc }),
      });

      if (!response.ok || !response.body) return null;

      // Parse SSE stream for the COMPLETE event
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "COMPLETE") {
              try { reader.cancel(); } catch {}
              const reviews = (event.reviews || []).slice(0, 3).map((r: any) => ({
                stars: r.rating || 5,
                text: r.text || "",
                author: r.author || "Customer",
                date: r.date || "Recently",
                highlight: extractHighlight(r.text || ""),
              }));
              if (reviews.length === 0) return null;
              return {
                rating: event.rating || 0,
                review_count: event.total_reviews || reviews.length,
                reviews,
                keywords: event.keywords || [],
              };
            }
          } catch {}
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async function fetchCompetitorData(businessName: string): Promise<Partial<BrandAnalysis> | null> {
    try {
      const response = await fetch("/api/analyze-competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: businessName,
          location: "United States",
          country: "US",
        }),
      });

      if (!response.ok || !response.body) return null;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "COMPLETE") {
              try { reader.cancel(); } catch {}
              const ads = event.competitor_ads || [];
              if (ads.length === 0) return null;
              const competitors = ads.slice(0, 3).map((ad: any) => ({
                name: ad.page_name || "Competitor",
                badge: ad.started_running_date
                  ? `Running since ${ad.started_running_date}`
                  : "Active",
                description: ad.ad_body_text
                  ? ad.ad_body_text.slice(0, 200) + (ad.ad_body_text.length > 200 ? "..." : "")
                  : "Running ads on Facebook.",
              }));
              return { competitors };
            }
          } catch {}
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  function extractHighlight(text: string): string | undefined {
    if (!text || text.length < 20) return undefined;
    // Find the most impactful phrase (simple heuristic: longest sentence fragment with positive words)
    const positiveWords = ["great", "excellent", "amazing", "love", "best", "fantastic", "recommend", "outstanding", "perfect", "wonderful", "incredible", "awesome", "professional", "fast", "friendly", "quality", "honest", "reliable", "trust"];
    const words = text.toLowerCase();
    for (const pw of positiveWords) {
      const idx = words.indexOf(pw);
      if (idx !== -1) {
        // Extract a phrase around the positive word (up to ~40 chars)
        const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, idx - 10)) + 1);
        const end = Math.min(text.length, text.indexOf(" ", Math.min(text.length, idx + pw.length + 15)));
        const phrase = text.slice(start, end === -1 ? undefined : end).trim();
        if (phrase.length >= 8 && phrase.length <= 50) return phrase;
      }
    }
    return undefined;
  }

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

        /* ── Ads loading shimmer ───────────────────────────── */
        .ads-loading-shimmer {
          background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* ── Ad fade-in when loaded ────────────────────────── */
        .ad-fade-in {
          animation: adFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes adFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
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

            {/* ── Reviews (only shown when real data exists) ─────────── */}
            {brand.reviews && brand.reviews.length > 0 && (
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
                {brand.rating && (
                <div
                  data-stagger
                  className="review-card-anim flex items-center gap-4 mt-8 p-5 bg-gray-50 rounded-2xl border border-gray-100"
                >
                  <div className="text-5xl font-extrabold text-gray-900 leading-none">
                    {brand.rating}
                  </div>
                  <div className="text-sm text-gray-500">
                    <div className="text-amber-500 text-base tracking-widest">
                      {"★".repeat(Math.round(brand.rating))}
                      {"☆".repeat(5 - Math.round(brand.rating))}
                    </div>
                    <strong className="text-gray-900">
                      {brand.review_count} reviews
                    </strong>{" "}
                    on Google
                  </div>
                </div>
                )}

                {/* Review cards */}
                <div className="grid gap-4 mt-8">
                  {brand.reviews.map((rev, i) => (
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
            )}

            {/* ── Smart Question ──────────────────────────────────────── */}
            <div
              data-pres
              className="min-h-screen flex flex-col items-center justify-center px-6 py-20"
            >
              <div className="pres-inner max-w-[720px] w-full">
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-600/15 rounded-2xl p-10 text-center">
                  <div className="text-[32px] mb-4">🤔</div>
                  <h3 className="text-[22px] font-bold mb-3 text-gray-900">
                    {brand.question?.title || DEFAULT_QUESTION.title}
                  </h3>
                  <p className="text-base text-gray-600 mb-6 max-w-[500px] mx-auto">
                    {brand.question?.body || DEFAULT_QUESTION.body}
                  </p>
                  <div className="flex gap-3 justify-center flex-wrap">
                    {(brand.question?.options || DEFAULT_QUESTION.options).map(
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

            {/* ── Competitors (shown before ads when real data exists) ── */}
            {brand.competitors && brand.competitors.length > 0 && (
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
                  <span className="text-gray-700 font-medium">{bizIndustry !== "your space" ? bizIndustry : "your industry"}</span>.
                </p>

                <div className="space-y-4 mt-4">
                  {brand.competitors.map((comp, i) => (
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
            )}

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

                {/* Ads loading state */}
                {adsLoading && !result && (
                  <div className="mt-10">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-gray-500">
                        I'm designing your ads based on what I found...
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {[0, 1].map((i) => (
                        <div
                          key={i}
                          className="bg-white border border-gray-200 rounded-2xl overflow-hidden"
                        >
                          <div className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full ads-loading-shimmer" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3 w-24 rounded ads-loading-shimmer" />
                              <div className="h-2 w-16 rounded ads-loading-shimmer" />
                            </div>
                          </div>
                          <div className="px-4 pb-3 space-y-2">
                            <div className="h-3 w-full rounded ads-loading-shimmer" />
                            <div className="h-3 w-3/4 rounded ads-loading-shimmer" />
                          </div>
                          <div className="w-full aspect-square ads-loading-shimmer" />
                          <div className="p-3 px-4 border-t border-gray-100 bg-gray-50 space-y-2">
                            <div className="h-2 w-20 rounded ads-loading-shimmer" />
                            <div className="h-3 w-40 rounded ads-loading-shimmer" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actual ad cards (fade in when Phase 2 completes) */}
                {result?.ads && result.ads.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-10">
                  {result.ads.slice(0, 2).map((ad, i) => (
                    <div
                      key={i}
                      data-stagger
                      className="ad-card-anim ad-fade-in bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
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
                      {/* Rationale */}
                      {ad.rationale && (
                        <div className="px-4 pb-4 pt-0">
                          <p className="text-xs text-gray-400 italic leading-relaxed">
                            💡 {ad.rationale}
                          </p>
                        </div>
                      )}
                      {/* Actions */}
                      <div className="flex justify-around py-2.5 px-4 border-t border-gray-100 text-[13px] text-gray-500">
                        <span>👍 Like</span>
                        <span>💬 Comment</span>
                        <span>↗️ Share</span>
                      </div>
                    </div>
                  ))}
                </div>
                )}

                {/* Fallback placeholder cards (no result yet and not loading) */}
                {!result && !adsLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-10">
                  {[0, 1].map((i) => (
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
                )}
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
                  Based on industry benchmarks for{" "}
                  <strong className="text-gray-900">{bizIndustry !== "your space" ? bizIndustry : "your"}</strong> businesses.
                  {brand.strategy ? "" : " I will refine this once your campaign is live."}
                </p>

                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-8 mt-6">
                  <h4 className="text-[13px] uppercase tracking-widest text-gray-400 mb-3">
                    Recommended Campaign Setup
                  </h4>
                  {[
                    {
                      label: "Recommended Budget",
                      value: brand.strategy?.monthly_budget || "$500 - $1,000/mo",
                    },
                    {
                      label: "Platforms",
                      value: brand.strategy?.platforms || "Facebook + Instagram",
                    },
                    {
                      label: "Target Area",
                      value: brand.strategy?.target_area || brand.target_area || "Your local area",
                    },
                    {
                      label: "Projected Leads/Month",
                      value: brand.strategy?.projected_leads || "Depends on budget",
                      green: !!brand.strategy?.projected_leads,
                    },
                    {
                      label: "Estimated Cost Per Lead",
                      value: brand.strategy?.cost_per_lead || "Varies by industry",
                    },
                    {
                      label: "Expected ROI",
                      value: brand.strategy?.expected_roi || "Optimized over time",
                      green: !!brand.strategy?.expected_roi,
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

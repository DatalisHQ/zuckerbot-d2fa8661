import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { trackFunnelEvent, trackPageView } from "@/utils/analytics";
import { mpSignIn, mpSignUp } from "@/lib/mixpanel";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { GlassCard } from "@/components/ui/GlassCard";
import { GradientButton } from "@/components/ui/GradientButton";
import { MetricCard } from "@/components/ui/MetricCard";
import { NavBar } from "@/components/ui/NavBar";
import { StatusBadge } from "@/components/ui/StatusBadge";

type AuthView = "signin" | "signup";

const viewContent = {
  signin: {
    badge: "Live Intelligence",
    title: (
      <>
        Automate with
        <br />
        <span className="bg-gradient-to-r from-primary to-tertiary bg-clip-text text-transparent">
          AI-Powered Precision.
        </span>
      </>
    ),
    description:
      "Harness ZuckerBot to run Meta marketing with editorial clarity, autonomous checks, and the tooling your agents actually need.",
    cardTitle: "Welcome back",
    cardDescription: "Please enter your details to sign in.",
    submitLabel: "Sign In",
    alternatePrompt: "Don't have an account?",
    alternateLabel: "Create an account",
    metrics: [
      {
        label: "Automation Status",
        value: "Live",
        trend: "Monitoring active",
        tone: "tertiary" as const,
        icon: <Workflow className="h-4 w-4" />,
      },
      {
        label: "Connected Surfaces",
        value: "Meta",
        trend: "Ads + CAPI ready",
        tone: "primary" as const,
        icon: <ShieldCheck className="h-4 w-4" />,
      },
    ],
    codeTitle: "claude_desktop_config.json",
    codeBlock: (
      <>
        <span className="text-on-surface">{"{"}</span>
        {"\n  "}
        <span className="text-tertiary">"mcpServers"</span>: <span className="text-on-surface">{"{"}</span>
        {"\n    "}
        <span className="text-tertiary">"zuckerbot"</span>: <span className="text-on-surface">{"{"}</span>
        {"\n      "}
        <span className="text-tertiary">"command"</span>: <span className="text-primary">"npx"</span>,
        {"\n      "}
        <span className="text-tertiary">"args"</span>: [<span className="text-primary">"-y"</span>, <span className="text-primary">"zuckerbot-mcp"</span>]
        {"\n    "}
        <span className="text-on-surface">{"}"}</span>
        {"\n  "}
        <span className="text-on-surface">{"}"}</span>
        {"\n"}
        <span className="text-on-surface">{"}"}</span>
      </>
    ),
  },
  signup: {
    badge: "Agent Launch Ready",
    title: (
      <>
        Build the ads engine
        <br />
        <span className="bg-gradient-to-r from-primary to-tertiary bg-clip-text text-transparent">
          behind your AI.
        </span>
      </>
    ),
    description:
      "Create a workspace for API keys, Meta connectivity, and autonomous execution loops without changing your existing application logic.",
    cardTitle: "Create your workspace",
    cardDescription: "Set up ZuckerBot in a few minutes and start launching campaigns from your agents.",
    submitLabel: "Create Account",
    alternatePrompt: "Already have an account?",
    alternateLabel: "Sign in",
    metrics: [
      {
        label: "MCP Tools",
        value: "40+",
        trend: "Agent-native actions",
        tone: "tertiary" as const,
        icon: <Sparkles className="h-4 w-4" />,
      },
      {
        label: "API Key Flow",
        value: "Instant",
        trend: "Developer access",
        tone: "primary" as const,
        icon: <KeyRound className="h-4 w-4" />,
      },
    ],
    codeTitle: "bootstrap.ts",
    codeBlock: (
      <>
        <span className="text-primary">agent</span>.<span className="text-tertiary">bootstrap</span>(
        {"\n  "}
        <span className="text-on-surface">{"{"}</span>
        {"\n    "}
        <span className="text-tertiary">platform</span>: <span className="text-primary">"meta"</span>,
        {"\n    "}
        <span className="text-tertiary">objective</span>: <span className="text-primary">"lead-gen"</span>,
        {"\n    "}
        <span className="text-tertiary">supervision</span>: <span className="text-primary">"human-in-the-loop"</span>
        {"\n  "}
        <span className="text-on-surface">{"}"}</span>
        {"\n"})
      </>
    ),
  },
} satisfies Record<
  AuthView,
  {
    badge: string;
    title: JSX.Element;
    description: string;
    cardTitle: string;
    cardDescription: string;
    submitLabel: string;
    alternatePrompt: string;
    alternateLabel: string;
    metrics: Array<{
      label: string;
      value: string;
      trend: string;
      tone: "primary" | "tertiary";
      icon: JSX.Element;
    }>;
    codeTitle: string;
    codeBlock: JSX.Element;
  }
>;

function getInitialView(searchParams: URLSearchParams): AuthView {
  return searchParams.get("mode") === "signup" ? "signup" : "signin";
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

const Auth = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeView, setActiveView] = useState<AuthView>(() => getInitialView(searchParams));
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const content = viewContent[activeView];

  useEffect(() => {
    trackPageView("/auth", "ZuckerBot — Sign In or Sign Up");

    const checkUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        navigate("/developer");
      }
    };

    checkUser();
  }, [navigate]);

  useEffect(() => {
    setActiveView(getInitialView(searchParams));
  }, [searchParams]);

  const updateView = (nextView: AuthView) => {
    setActiveView(nextView);

    const nextParams = new URLSearchParams(searchParams);
    if (nextView === "signup") {
      nextParams.set("mode", "signup");
    } else {
      nextParams.delete("mode");
    }

    setSearchParams(nextParams, { replace: true });
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?returnTo=/developer`,
        },
      });
      if (error) {
        throw error;
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setIsGoogleLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?returnTo=/developer`,
          data: { full_name: fullName },
        },
      });

      if (signUpError) {
        throw signUpError;
      }
      if (!signUpData.user) {
        throw new Error("Failed to create user");
      }

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", signUpData.user.id)
        .maybeSingle();

      if (!existingProfile) {
        await supabase.from("profiles").insert({
          user_id: signUpData.user.id,
          email: signUpData.user.email,
          full_name: fullName || null,
          onboarding_completed: false,
        });
      }

      toast({
        title: "Account created!",
        description: "Welcome to ZuckerBot!",
      });

      if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq("track", "CompleteRegistration");
      }

      trackFunnelEvent.completeSignup("email");

      mpSignUp({
        user_id: signUpData.user.id,
        email,
        signup_method: "email",
        utm_source: new URLSearchParams(window.location.search).get("utm_source") || undefined,
        utm_medium: new URLSearchParams(window.location.search).get("utm_medium") || undefined,
        utm_campaign: new URLSearchParams(window.location.search).get("utm_campaign") || undefined,
      });

      supabase.functions
        .invoke("welcome-email", {
          body: { user_email: email, user_name: fullName || undefined },
        })
        .catch((emailErr) => {
          console.warn("Welcome email failed (non-blocking):", emailErr);
        });

      navigate("/developer");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("No user found after sign in");
      }

      mpSignIn({
        user_id: user.id,
        login_method: "email",
        success: true,
      });

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile) {
        const { error: insertError } = await supabase.from("profiles").insert({
          user_id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          onboarding_completed: false,
        });

        if (insertError) {
          console.error("Failed to create fallback profile after email sign-in:", insertError);
        }
      }

      navigate("/developer");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isBusy = isLoading || isGoogleLoading;

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <NavBar className="border-transparent bg-transparent backdrop-blur-0" />

      <main className="relative isolate min-h-screen overflow-hidden px-6 pb-16 pt-24">
        <div className="hero-aura absolute inset-0 -z-20" />
        <div className="indigo-grid absolute inset-0 -z-10 opacity-25" />
        <div className="absolute left-[-8rem] top-20 -z-10 h-80 w-80 rounded-full bg-primary/12 blur-[140px]" />
        <div className="absolute bottom-0 right-[-8rem] -z-10 h-96 w-96 rounded-full bg-tertiary/10 blur-[140px]" />

        <div className="mx-auto grid min-h-[calc(100vh-10rem)] max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="hidden space-y-8 lg:block">
            <StatusBadge status="ai">{content.badge}</StatusBadge>
            <div className="space-y-5">
              <h1 className="font-headline text-5xl font-bold tracking-tight text-on-surface xl:text-6xl">
                {content.title}
              </h1>
              <p className="max-w-xl text-lg leading-8 text-on-surface-variant">{content.description}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {content.metrics.map((metric) => (
                <MetricCard
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  trend={metric.trend}
                  tone={metric.tone}
                  icon={metric.icon}
                  className="bg-surface-container/90"
                />
              ))}
            </div>

            <CodeBlock title={content.codeTitle}>{content.codeBlock}</CodeBlock>
          </section>

          <section className="flex flex-col justify-center">
            <div className="mb-8 space-y-4 lg:hidden">
              <StatusBadge status="ai">{content.badge}</StatusBadge>
              <h1 className="font-headline text-4xl font-bold tracking-tight text-on-surface">{content.title}</h1>
              <p className="text-base leading-7 text-on-surface-variant">{content.description}</p>
            </div>

            <GlassCard className="mx-auto w-full max-w-[34rem] p-6 sm:p-8">
              <div className="mb-8 flex items-center justify-between gap-4">
                <div>
                  <p className="zuckerbot-brand text-2xl font-black text-primary">ZuckerBot</p>
                  <p className="mt-2 text-sm text-on-surface-variant">Meta ads infrastructure for agent workflows.</p>
                </div>
                <StatusBadge status={activeView === "signup" ? "active" : "live"}>
                  {activeView === "signup" ? "New Workspace" : "Secure Sign In"}
                </StatusBadge>
              </div>

              <div className="mb-8 inline-flex rounded-full bg-surface-container-low p-1">
                <button
                  type="button"
                  onClick={() => updateView("signin")}
                  className={`rounded-full px-5 py-2 font-label text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    activeView === "signin" ? "bg-surface-container-high text-on-surface" : "text-outline hover:text-on-surface-variant"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => updateView("signup")}
                  className={`rounded-full px-5 py-2 font-label text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    activeView === "signup" ? "bg-surface-container-high text-on-surface" : "text-outline hover:text-on-surface-variant"
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <div className="space-y-2">
                <h2 className="font-headline text-3xl font-semibold tracking-tight text-on-surface">{content.cardTitle}</h2>
                <p className="text-sm leading-7 text-on-surface-variant">{content.cardDescription}</p>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
                className="mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-surface-container-highest text-on-surface transition-colors hover:bg-surface-bright disabled:opacity-60"
              >
                {isGoogleLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleIcon />}
                <span className="font-label text-sm font-semibold">{activeView === "signup" ? "Start with Google" : "Continue with Google"}</span>
              </button>

              <div className="relative py-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-outline-variant/15" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[rgba(30,31,37,0.7)] px-4 font-label text-[10px] uppercase tracking-[0.22em] text-outline">
                    or continue with email
                  </span>
                </div>
              </div>

              {activeView === "signin" ? (
                <form className="space-y-5" onSubmit={handleSignIn}>
                  <div className="space-y-2">
                    <label className="block font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-outline" htmlFor="signin-email">
                      Email address
                    </label>
                    <input
                      id="signin-email"
                      type="email"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isBusy}
                      className="h-14 w-full rounded-2xl border border-transparent bg-surface-container-highest px-4 text-on-surface placeholder:text-outline/60 focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <label className="block font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-outline" htmlFor="signin-password">
                        Password
                      </label>
                      <a
                        className="font-label text-[11px] font-semibold uppercase tracking-[0.16em] text-tertiary transition-colors hover:text-primary"
                        href="mailto:davis@datalis.app?subject=ZuckerBot%20password%20help"
                      >
                        Need help?
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        id="signin-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isBusy}
                        className="h-14 w-full rounded-2xl border border-transparent bg-surface-container-highest px-4 pr-12 text-on-surface placeholder:text-outline/60 focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/15"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-outline transition-colors hover:text-primary"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <GradientButton className="mt-2 w-full justify-center" size="lg" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {content.submitLabel}
                  </GradientButton>
                </form>
              ) : (
                <form className="space-y-5" onSubmit={handleSignUp}>
                  <div className="space-y-2">
                    <label className="block font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-outline" htmlFor="signup-name">
                      Full Name
                    </label>
                    <input
                      id="signup-name"
                      type="text"
                      placeholder="Alex Rivera"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      disabled={isBusy}
                      className="h-14 w-full rounded-2xl border border-transparent bg-surface-container-highest px-4 text-on-surface placeholder:text-outline/60 focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-outline" htmlFor="signup-email">
                      Email Address
                    </label>
                    <input
                      id="signup-email"
                      type="email"
                      placeholder="alex@company.ai"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isBusy}
                      className="h-14 w-full rounded-2xl border border-transparent bg-surface-container-highest px-4 text-on-surface placeholder:text-outline/60 focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-outline" htmlFor="signup-password">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        disabled={isBusy}
                        className="h-14 w-full rounded-2xl border border-transparent bg-surface-container-highest px-4 pr-12 text-on-surface placeholder:text-outline/60 focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/15"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-outline transition-colors hover:text-primary"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <GradientButton className="mt-2 w-full justify-center" size="lg" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {content.submitLabel}
                  </GradientButton>
                </form>
              )}

              <div className="mt-8 text-center">
                <p className="text-sm text-on-surface-variant">
                  {content.alternatePrompt}{" "}
                  <button
                    type="button"
                    onClick={() => updateView(activeView === "signin" ? "signup" : "signin")}
                    className="font-semibold text-primary transition-colors hover:text-tertiary"
                  >
                    {content.alternateLabel}
                  </button>
                </p>
              </div>

              <div className="mt-8 rounded-2xl border border-outline-variant/10 bg-surface-container/40 p-4">
                <p className="text-center font-label text-[10px] uppercase leading-6 tracking-[0.16em] text-outline">
                  By continuing, you agree to ZuckerBot&apos;s{" "}
                  <Link className="underline transition-colors hover:text-primary" to="/terms">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link className="underline transition-colors hover:text-primary" to="/privacy">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </GlassCard>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Auth;

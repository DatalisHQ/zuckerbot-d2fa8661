import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import {
  Zap,
  Phone,
  MessageSquare,
  MapPin,
  DollarSign,
  ChevronRight,
  Star,
  Clock,
  TrendingUp,
  Shield,
  Check,
  ArrowRight,
} from "lucide-react";

// ─── Trades for the rotating hero text ──────────────────────────────────────

const TRADES = [
  "Plumber",
  "Sparky",
  "Landscaper",
  "Cleaner",
  "Painter",
  "Roofer",
  "Concreter",
  "Chippy",
  "Fencer",
  "Tiler",
];

// ─── Component ──────────────────────────────────────────────────────────────

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tradeIndex, setTradeIndex] = useState(0);

  // Auth check
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Rotating trade text
  useEffect(() => {
    const interval = setInterval(() => {
      setTradeIndex((prev) => (prev + 1) % TRADES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleCTA = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.onboarding_completed) {
      navigate("/onboarding");
    } else {
      navigate("/dashboard");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">ZuckerBot</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Button onClick={() => navigate("/dashboard")}>
                Dashboard <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <>
                <Link to="/auth">
                  <Button variant="ghost">Sign In</Button>
                </Link>
                <Link to="/auth">
                  <Button>Get Started Free</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="container mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <Badge variant="secondary" className="text-sm px-4 py-1.5">
            🇦🇺 Built for Aussie tradies
          </Badge>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
            Facebook ads for your
            <br />
            <span className="text-primary inline-block min-w-[200px] transition-all duration-500">
              {TRADES[tradeIndex]}
            </span>{" "}
            business
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Tell us what you do and where you work. We'll create your Facebook ad,
            launch it, and send you the leads. Five minutes, no marketing degree required.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" className="text-lg px-8 py-6" onClick={handleCTA}>
              Get customers now
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-6"
              onClick={() => {
                document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              See how it works
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            No lock-in contracts. Cancel anytime. Starts at $49/mo.
          </p>
        </div>
      </section>

      {/* ── Social proof strip ──────────────────────────────────────────── */}
      <section className="border-y border-border/40 bg-muted/30 py-8">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-2xl font-bold">5 min</div>
              <div className="text-sm text-muted-foreground">Setup to live ad</div>
            </div>
            <div>
              <div className="text-2xl font-bold">&lt;$15</div>
              <div className="text-sm text-muted-foreground">Avg cost per lead</div>
            </div>
            <div>
              <div className="text-2xl font-bold">25km</div>
              <div className="text-sm text-muted-foreground">Local targeting radius</div>
            </div>
            <div>
              <div className="text-2xl font-bold">Auto</div>
              <div className="text-sm text-muted-foreground">SMS to every lead</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="container mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Three steps. Five minutes. Done.
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            No agencies, no jargon, no wasted hours learning Facebook Ads Manager.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Step 1 */}
          <Card className="relative overflow-hidden border-2 hover:border-primary/30 transition-colors">
            <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              1
            </div>
            <CardContent className="pt-8 pb-6 px-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Tell us your trade</h3>
              <p className="text-muted-foreground leading-relaxed">
                Pick your trade, enter your suburb, and upload a photo of your work.
                That's the hard part done.
              </p>
            </CardContent>
          </Card>

          {/* Step 2 */}
          <Card className="relative overflow-hidden border-2 hover:border-primary/30 transition-colors">
            <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              2
            </div>
            <CardContent className="pt-8 pb-6 px-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">AI writes your ad</h3>
              <p className="text-muted-foreground leading-relaxed">
                Our AI creates 3 ad options tailored to your trade and area.
                Pick one, tweak the budget, hit launch.
              </p>
            </CardContent>
          </Card>

          {/* Step 3 */}
          <Card className="relative overflow-hidden border-2 hover:border-primary/30 transition-colors">
            <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              3
            </div>
            <CardContent className="pt-8 pb-6 px-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Phone className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Leads hit your phone</h3>
              <p className="text-muted-foreground leading-relaxed">
                When someone fills in your ad, they get an instant SMS and you get a
                notification. Just call them back.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Why tradies love it ─────────────────────────────────────────── */}
      <section className="bg-muted/30 border-y border-border/40 py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Why tradies switch to ZuckerBot
            </h2>
            <p className="text-lg text-muted-foreground">
              We're not an agency. We're not a course. We're the tool that replaces both.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Clock,
                title: "5 minutes, not 5 hours",
                desc: "No learning curve. No Ads Manager. Just answer a few questions and you're live.",
              },
              {
                icon: DollarSign,
                title: "$49/mo, not $500/mo",
                desc: "Agencies charge $300–$500/mo for the same thing. Keep the difference.",
              },
              {
                icon: MessageSquare,
                title: "Auto-SMS to leads",
                desc: "Every lead gets an instant text: \"Thanks for reaching out, we'll call you within the hour.\"",
              },
              {
                icon: MapPin,
                title: "Local-only targeting",
                desc: "Your ad only shows to people in your area. No wasted spend on people 100km away.",
              },
              {
                icon: TrendingUp,
                title: "AI-written ad copy",
                desc: "Our AI knows what works for tradies. No more staring at a blank text box.",
              },
              {
                icon: Shield,
                title: "You stay in control",
                desc: "Set your own budget, pause anytime, see every lead. No lock-in contracts ever.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex gap-4 p-5 rounded-xl bg-background border border-border/50 hover:border-primary/20 transition-colors"
              >
                <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonial / quote ─────────────────────────────────────────── */}
      <section className="container mx-auto px-4 sm:px-6 py-20">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="flex justify-center gap-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-6 h-6 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <blockquote className="text-2xl sm:text-3xl font-medium leading-relaxed text-foreground">
            "I was paying a bloke $400 a month to run my Facebook ads. Set this up
            in my smoko break and got 3 leads the first day."
          </blockquote>
          <div className="text-muted-foreground">
            <span className="font-semibold text-foreground">Mick T.</span> · Plumber · Brisbane
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section className="border-y border-border/40 bg-muted/30 py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Simple pricing</h2>
            <p className="text-lg text-muted-foreground">
              No setup fees. No hidden costs. Just pick a plan.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Starter */}
            <Card className="border-2 relative">
              <CardContent className="pt-8 pb-6 px-6 space-y-6">
                <div>
                  <h3 className="text-xl font-semibold">Starter</h3>
                  <div className="mt-2">
                    <span className="text-4xl font-bold">$49</span>
                    <span className="text-muted-foreground">/mo</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">+ your Facebook ad spend</p>
                </div>
                <ul className="space-y-3">
                  {[
                    "1 active campaign",
                    "AI-generated ad copy",
                    "Lead inbox",
                    "Email notifications",
                    "25km targeting radius",
                  ].map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button className="w-full" variant="outline" onClick={handleCTA}>
                  Start free trial
                </Button>
              </CardContent>
            </Card>

            {/* Pro */}
            <Card className="border-2 border-primary relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground px-3">Most Popular</Badge>
              </div>
              <CardContent className="pt-8 pb-6 px-6 space-y-6">
                <div>
                  <h3 className="text-xl font-semibold">Pro</h3>
                  <div className="mt-2">
                    <span className="text-4xl font-bold">$99</span>
                    <span className="text-muted-foreground">/mo</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">+ your Facebook ad spend</p>
                </div>
                <ul className="space-y-3">
                  {[
                    "3 active campaigns",
                    "AI-generated ad copy",
                    "Lead inbox + analytics",
                    "Auto-SMS to leads",
                    "50km targeting radius",
                    "Priority support",
                  ].map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button className="w-full" onClick={handleCTA}>
                  Start free trial
                </Button>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8">
            Both plans include a 7-day free trial. No credit card required to start.
          </p>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="container mx-auto px-4 sm:px-6 py-24">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h2 className="text-3xl sm:text-4xl font-bold">
            Stop paying agencies. Start getting leads.
          </h2>
          <p className="text-xl text-muted-foreground">
            Set up your first ad in the time it takes to have a coffee.
          </p>
          <Button size="lg" className="text-lg px-8 py-6" onClick={handleCTA}>
            Get started — it's free
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 py-10">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">ZuckerBot</span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link to="/pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link to="/auth" className="hover:text-foreground transition-colors">
                Sign In
              </Link>
              <a href="mailto:support@zuckerbot.ai" className="hover:text-foreground transition-colors">
                Support
              </a>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} ZuckerBot. Made in Australia.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;

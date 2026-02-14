import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { trackFunnelEvent, trackPageView } from "@/utils/analytics";
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
import TryItNow from "@/components/TryItNow";

// ─── Business types for the rotating hero text ─────────────────────────────

const BUSINESSES = [
  "Restaurant",
  "Gym",
  "Salon",
  "Dentist",
  "Real Estate Agent",
  "Café",
  "Retailer",
  "Physio",
  "Accountant",
  "Small Business",
];

// ─── Component ──────────────────────────────────────────────────────────────

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [businessIndex, setBusinessIndex] = useState(0);

  // Track page view on load
  useEffect(() => {
    // Get URL parameters for source/medium tracking from ads
    const urlParams = new URLSearchParams(location.search);
    const source = urlParams.get('utm_source') || urlParams.get('source');
    const medium = urlParams.get('utm_medium') || urlParams.get('medium');
    
    // Track landing page view
    trackFunnelEvent.viewLanding(source || undefined, medium || undefined);
    trackPageView('/', 'ZuckerBot — Facebook Ads in 60 Seconds', {
      source,
      medium,
    });
  }, [location]);

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

  // Rotating business text
  useEffect(() => {
    const interval = setInterval(() => {
      setBusinessIndex((prev) => (prev + 1) % BUSINESSES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleCTA = async () => {
    // Track that user clicked get started
    if (!user) {
      trackFunnelEvent.startSignup();
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
                  <Button>Start Free Trial</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero + Try It Now (above the fold) ────────────────────────── */}
      <section className="container mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <Badge variant="secondary" className="text-sm px-4 py-1.5">
            🚀 The $49 AI agency alternative
          </Badge>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
            See what AI ads look like
            <br />
            <span className="text-primary">for YOUR business</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Enter your website URL and watch our AI generate real Facebook ad creatives in seconds.
            <strong className="text-foreground"> Free — no signup required.</strong>
          </p>
        </div>

        {/* Inline Try It Now */}
        <div className="max-w-4xl mx-auto mt-8">
          <TryItNow compact />
        </div>

        <div className="max-w-4xl mx-auto text-center mt-6">
          <p className="text-sm text-muted-foreground">
            While other <span className="text-foreground font-medium">{BUSINESSES[businessIndex]}s</span> pay agencies $2K/month, you could be live for <strong className="text-foreground">$49/mo</strong>. Cancel anytime.
          </p>
        </div>
      </section>

      {/* ── Social proof strip ──────────────────────────────────────────── */}
      <section className="border-y border-border/40 bg-muted/30 py-8">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-2xl font-bold">60 sec</div>
              <div className="text-sm text-muted-foreground">Setup to live ad</div>
            </div>
            <div>
              <div className="text-2xl font-bold">$49</div>
              <div className="text-sm text-muted-foreground">vs $2K agencies</div>
            </div>
            <div>
              <div className="text-2xl font-bold">Low cost</div>
              <div className="text-sm text-muted-foreground">Per lead</div>
            </div>
            <div>
              <div className="text-2xl font-bold">7-day</div>
              <div className="text-sm text-muted-foreground">Free trial</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="container mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Three steps. Sixty seconds. Done.
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            While agencies take weeks and charge $2K/month, you'll be live in 60 seconds.
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
              <h3 className="text-xl font-semibold">Tell us your business</h3>
              <p className="text-muted-foreground leading-relaxed">
                Pick your business type, enter your suburb, and upload a photo.
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
                Our AI creates 3 ad options tailored to your business and area.
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

      {/* ── Why small businesses love it ──────────────────────────────── */}
      <section className="bg-muted/30 border-y border-border/40 py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Why small businesses love it
            </h2>
            <p className="text-lg text-muted-foreground">
              Ditch the agencies. Skip the courses. Get leads in 60 seconds.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Clock,
                title: "60 seconds, not 60 days",
                desc: "60 seconds from signup to your ad being live on Facebook. That's it. No waiting, no back-and-forth.",
              },
              {
                icon: DollarSign,
                title: "$49/mo, not $2000/mo",
                desc: "Stop paying agencies $2K/month. Do it yourself for $49. Keep the difference.",
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
                desc: "Our AI knows what works for your business type. No more staring at a blank text box.",
              },
              {
                icon: Shield,
                title: "You stay in control",
                desc: "Set your own budget ($20/day minimum), pause anytime, see every lead. No lock-in contracts ever.",
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

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section className="container mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Simple pricing</h2>
          <p className="text-lg text-muted-foreground">
            No setup fees. No hidden costs. You control the ad spend.
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
                <p className="text-sm text-muted-foreground mt-1">+ $20/day minimum ad budget (you control this)</p>
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
              <Button className="w-full" onClick={handleCTA}>
                Start Free Trial
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
                <p className="text-sm text-muted-foreground mt-1">+ $20/day minimum ad budget (you control this)</p>
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
                Start Free Trial
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Both plans include a 7-day free trial. Cancel anytime. You pause/resume ad spend as needed.
        </p>
      </section>

      {/* ── Early Adopter CTA ────────────────────────────────────────────── */}
      <section className="bg-muted/30 border-y border-border/40 py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <Card className="p-8 border-2 border-primary/20 text-center">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-6">
                <Star className="w-4 h-4" />
                Early Adopter Offer
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Be one of our first success stories
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6 leading-relaxed">
                We're onboarding our first wave of businesses right now. 
                Early users get <strong className="text-foreground">white-glove setup support</strong> — 
                we'll personally help you launch your first campaign and optimize it for results.
              </p>
              <Button size="lg" className="text-lg px-8 py-6" onClick={handleCTA}>
                Claim Your Early Adopter Spot
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <p className="text-sm text-muted-foreground mt-4">
                7-day free trial • Personal onboarding support • Cancel anytime
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section className="container mx-auto px-4 sm:px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Common Questions
            </h2>
            <p className="text-lg text-muted-foreground">
              Everything you need to know about getting started
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold mb-3 text-primary">
                  How much will I spend on Facebook ads?
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  You control this completely. We recommend starting with $20/day minimum ($140/week). 
                  You can pause, reduce, or increase anytime through Facebook's interface. 
                  Most businesses spend $20-50/day and get 3-8 leads per week.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3 text-primary">
                  What if I don't get any leads?
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  We have a 7-day free trial and our AI is trained on thousands of successful local business ads. 
                  If you're not getting leads after the first week, we'll help you tweak your ad copy and targeting for free.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3 text-primary">
                  Do you lock me into contracts?
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Never. Cancel your ZuckerBot subscription anytime with one click. 
                  Your Facebook ad account stays yours forever. No setup fees, no cancellation fees.
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold mb-3 text-primary">
                  How is this different from hiring an agency?
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Agencies charge $2000+/month and often use your budget for multiple clients. 
                  With ZuckerBot, you pay $49-99/month, keep full control, and your ad budget goes 100% to your ads.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3 text-primary">
                  What happens after I get leads?
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Leads automatically get an SMS saying you'll call within the hour. 
                  You get instant notifications and can call them back. The faster you call, the higher your conversion rate.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3 text-primary">
                  Can I really set this up in 60 seconds?
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Yes - from signup to your ad being live takes about 60 seconds. You'll answer 3 questions, 
                  upload a photo, pick your AI-generated ad copy, set your budget, and launch. That's it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="container mx-auto px-4 sm:px-6 py-24">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h2 className="text-3xl sm:text-4xl font-bold">
            Ready to stop paying agencies $2K/month?
          </h2>
          <p className="text-xl text-muted-foreground">
            Get Facebook leads for $49/month instead of paying agencies $2000/month.
          </p>
          <Button size="lg" className="text-lg px-8 py-6" onClick={handleCTA}>
            Start Free Trial
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <p className="text-sm text-muted-foreground">
            7-day free trial • No setup fees • Cancel anytime
          </p>
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
            <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <Link to="/pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link to="/auth" className="hover:text-foreground transition-colors">
                Sign In
              </Link>
              <a href="mailto:support@zuckerbot.ai" className="hover:text-foreground transition-colors">
                Support
              </a>
              <Link to="/privacy" className="hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">
                Terms of Service
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} ZuckerBot. Made with ❤️
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getTierFromAmount(amount: number): string {
  if (amount >= 9900) return "pro";
  if (amount >= 4900) return "starter";
  return "free";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Use anon key client for JWT validation (service role client can't validate user JWTs)
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );
  // Use service role client for data queries
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      // No Stripe customer — ensure profile reflects free tier
      await supabase
        .from("profiles")
        .update({ subscription_tier: "free", subscription_end: null })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({
          subscribed: false,
          subscription_tier: "free",
          subscription_end: null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const customerId = customers.data[0].id;

    // Check active or trialing subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    // Also check trialing
    const trialingSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "trialing",
      limit: 1,
    });

    const allSubs = [...subscriptions.data, ...trialingSubs.data];
    const hasActiveSub = allSubs.length > 0;

    let subscriptionTier = "free";
    let subscriptionEnd: string | null = null;

    if (hasActiveSub) {
      const sub = allSubs[0];
      subscriptionEnd = new Date(sub.current_period_end * 1000).toISOString();
      const amount = sub.items.data[0]?.price?.unit_amount || 0;
      subscriptionTier = getTierFromAmount(amount);
    }

    // Sync profile
    await supabase
      .from("profiles")
      .update({
        subscription_tier: subscriptionTier,
        subscription_end: subscriptionEnd,
      })
      .eq("user_id", user.id);

    return new Response(
      JSON.stringify({
        subscribed: hasActiveSub,
        subscription_tier: subscriptionTier,
        subscription_end: subscriptionEnd,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CHECK-SUBSCRIPTION] ERROR:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getTierFromAmount(amount: number) {
  if (amount >= 8900) return "agency";
  if (amount >= 2000) return "pro";
  return "free";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2023-10-16",
  });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const sig = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  let event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret!);
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Handle event types
  if (
    event.type === "checkout.session.completed" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    let customerId = null;
    let userEmail = null;
    let subscriptionTier = "free";
    let subscriptionEnd = null;
    let hasActiveSub = false;
    let amount = 0;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      customerId = session.customer;
      userEmail = session.customer_email;
      // Get subscription
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        hasActiveSub = sub.status === "active" || sub.status === "trialing";
        subscriptionEnd = new Date(sub.current_period_end * 1000).toISOString();
        amount = sub.items.data[0].price.unit_amount || 0;
        subscriptionTier = getTierFromAmount(amount);
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      customerId = sub.customer;
      hasActiveSub = sub.status === "active" || sub.status === "trialing";
      subscriptionEnd = new Date(sub.current_period_end * 1000).toISOString();
      amount = sub.items.data[0].price.unit_amount || 0;
      subscriptionTier = hasActiveSub ? getTierFromAmount(amount) : "free";
      // Get user email from customer
      const customer = await stripe.customers.retrieve(customerId);
      userEmail = customer.email;
    }

    // Update Supabase
    if (userEmail) {
      // Update subscribers table
      await supabase.from("subscribers").upsert({
        email: userEmail,
        stripe_customer_id: customerId,
        subscribed: hasActiveSub,
        subscription_tier: subscriptionTier,
        subscription_end: subscriptionEnd,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' });
      // Update profiles table
      await supabase.from("profiles").update({
        subscription_tier: subscriptionTier,
        updated_at: new Date().toISOString(),
      }).eq('email', userEmail);

      // ENFORCE BUSINESS PROFILE LIMITS
      // 1. Get user_id from profiles
      const { data: profileRows } = await supabase.from("profiles").select("user_id").eq("email", userEmail).limit(1);
      const userId = profileRows && profileRows.length > 0 ? profileRows[0].user_id : null;
      if (userId) {
        // 2. Count active business profiles
        const { data: activeProfiles } = await supabase
          .from("brand_analysis")
          .select("id, created_at")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("created_at", { ascending: true });
        let allowed = 1;
        if (subscriptionTier === "pro") allowed = 3;
        if (subscriptionTier === "agency") allowed = 999999; // effectively unlimited
        if (activeProfiles && activeProfiles.length > allowed) {
          // 3. Deactivate oldest extra profiles
          const toDeactivate = activeProfiles.slice(0, activeProfiles.length - allowed);
          const ids = toDeactivate.map((p: any) => p.id);
          if (ids.length > 0) {
            await supabase.from("brand_analysis").update({ is_active: false }).in("id", ids);
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
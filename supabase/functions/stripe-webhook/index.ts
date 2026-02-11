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

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret!);
  } catch (err) {
    console.error("[WEBHOOK] Signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log("[WEBHOOK] Event:", event.type);

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "customer.subscription.updated"
    ) {
      let userEmail: string | null = null;
      let subscriptionTier = "free";
      let subscriptionEnd: string | null = null;

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        userEmail = session.customer_email || null;

        // If customer_email is null, fetch from Stripe customer
        if (!userEmail && session.customer) {
          const customer = await stripe.customers.retrieve(
            session.customer as string
          );
          if ("email" in customer) userEmail = customer.email;
        }

        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          const amount = sub.items.data[0]?.price?.unit_amount || 0;
          subscriptionTier = getTierFromAmount(amount);
          subscriptionEnd = new Date(
            sub.current_period_end * 1000
          ).toISOString();
        }
      } else {
        // customer.subscription.updated
        const sub = event.data.object as Stripe.Subscription;
        const isActive =
          sub.status === "active" || sub.status === "trialing";
        const amount = sub.items.data[0]?.price?.unit_amount || 0;
        subscriptionTier = isActive ? getTierFromAmount(amount) : "free";
        subscriptionEnd = isActive
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        // Get email from customer
        const customer = await stripe.customers.retrieve(
          sub.customer as string
        );
        if ("email" in customer) userEmail = customer.email;
      }

      if (userEmail) {
        console.log(
          "[WEBHOOK] Updating profile:",
          userEmail,
          "→",
          subscriptionTier
        );
        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_tier: subscriptionTier,
            subscription_end: subscriptionEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("email", userEmail);

        if (error) {
          console.error("[WEBHOOK] Profile update error:", error);
        }
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const customer = await stripe.customers.retrieve(
        sub.customer as string
      );
      const userEmail = "email" in customer ? customer.email : null;

      if (userEmail) {
        console.log("[WEBHOOK] Subscription deleted for:", userEmail);
        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_tier: "free",
            subscription_end: null,
            updated_at: new Date().toISOString(),
          })
          .eq("email", userEmail);

        if (error) {
          console.error("[WEBHOOK] Profile update error:", error);
        }
      }
    }
  } catch (err) {
    console.error("[WEBHOOK] Processing error:", err);
    // Still return 200 to avoid Stripe retries for processing errors
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});

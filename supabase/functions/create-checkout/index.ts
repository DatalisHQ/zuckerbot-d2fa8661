import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const prices: Record<string, { amount: number; interval: string; name: string }> = {
  starter_monthly: { amount: 4900, interval: "month", name: "ZuckerBot Starter" },
  pro_monthly: { amount: 9900, interval: "month", name: "ZuckerBot Pro" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const { priceId } = await req.json();
    console.log("[CHECKOUT] priceId:", priceId);

    const authHeader = req.headers.get("Authorization");
    const token = authHeader ? authHeader.replace("Bearer ", "") : null;
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    console.log("[CHECKOUT] User:", user.email);

    const selectedPrice = prices[priceId as keyof typeof prices];
    if (!selectedPrice) throw new Error(`Invalid price ID: ${priceId}`);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Check if customer already exists in Stripe
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const origin =
      req.headers.get("origin") ||
      Deno.env.get("PUBLIC_SITE_URL") ||
      "";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: { name: selectedPrice.name },
            unit_amount: selectedPrice.amount,
            recurring: {
              interval: selectedPrice.interval as "month",
            },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      payment_method_collection: "always", // Require card even during free trial
      subscription_data: {
        trial_period_days: 7,
      },
      success_url: `${origin}/dashboard?upgraded=true`,
      cancel_url: `${origin}/pricing`,
    });

    console.log("[CHECKOUT] Session created:", session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[CHECKOUT] ERROR:", error);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

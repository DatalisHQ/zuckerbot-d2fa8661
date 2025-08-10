import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log('[CHECKOUT] Function started');
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    console.log('[CHECKOUT] Function invoked');
    const { priceId, planType, successPath, cancelPath } = await req.json();
    console.log('[CHECKOUT] Received body:', { priceId, planType, successPath, cancelPath });
    
    const authHeader = req.headers.get("Authorization");
    console.log('[CHECKOUT] Auth header:', authHeader);
    const token = authHeader ? authHeader.replace("Bearer ", "") : null;
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    console.log('[CHECKOUT] User:', user?.email);
    if (!user?.email) throw new Error("User not authenticated");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });
    console.log('[CHECKOUT] Stripe initialized');

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }
    console.log('[CHECKOUT] Stripe customerId:', customerId);

    // Define pricing
    const prices = {
      pro_monthly: { amount: 2500, interval: "month" },
      pro_yearly: { amount: 20000, interval: "year" },
      agency_monthly: { amount: 8900, interval: "month" }
    };
    const selectedPrice = prices[priceId as keyof typeof prices];
    console.log('[CHECKOUT] Selected price:', selectedPrice);
    if (!selectedPrice) throw new Error("Invalid price ID");

    const origin = req.headers.get("origin") || Deno.env.get("PUBLIC_SITE_URL") || "";
    const successUrl = successPath ? `${origin}${successPath}` : `${origin}/dashboard?success=true`;
    const cancelUrl = cancelPath ? `${origin}${cancelPath}` : `${origin}/pricing`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { 
              name: planType === 'pro' ? 'ZuckerBot Pro' : 'ZuckerBot Agency'
            },
            unit_amount: selectedPrice.amount,
            recurring: { interval: selectedPrice.interval as "month" | "year" },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    console.log('[CHECKOUT] Stripe session created:', session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error('[CHECKOUT] ERROR:', error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
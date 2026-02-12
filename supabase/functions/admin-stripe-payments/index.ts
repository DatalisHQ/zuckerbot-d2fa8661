import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "davisgrainger@gmail.com";
const STRIPE_API = "https://api.stripe.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth: validate JWT via anon client ──────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    if (user.email !== ADMIN_EMAIL) {
      return new Response(
        JSON.stringify({ error: "Forbidden — admin only" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
      );
    }

    // ── Stripe API calls ────────────────────────────────────────────────
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe secret key not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    const stripeHeaders = {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // Fetch charges and subscriptions in parallel
    const [chargesRes, subsRes] = await Promise.all([
      fetch(`${STRIPE_API}/v1/charges?limit=20&expand[]=data.customer`, {
        headers: stripeHeaders,
      }),
      fetch(`${STRIPE_API}/v1/subscriptions?limit=50&status=active`, {
        headers: stripeHeaders,
      }),
    ]);

    if (!chargesRes.ok) {
      const err = await chargesRes.json();
      return new Response(
        JSON.stringify({ error: `Stripe charges error: ${err?.error?.message || chargesRes.statusText}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 },
      );
    }

    if (!subsRes.ok) {
      const err = await subsRes.json();
      return new Response(
        JSON.stringify({ error: `Stripe subscriptions error: ${err?.error?.message || subsRes.statusText}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 },
      );
    }

    const chargesData = await chargesRes.json();
    const subsData = await subsRes.json();

    // ── Transform charges ───────────────────────────────────────────────
    const payments = (chargesData.data || []).map((charge: any) => ({
      id: charge.id,
      amount_cents: charge.amount,
      currency: charge.currency,
      status: charge.status, // succeeded | pending | failed
      refunded: charge.refunded,
      customer_email:
        charge.billing_details?.email ||
        charge.customer?.email ||
        charge.receipt_email ||
        null,
      customer_name:
        charge.billing_details?.name ||
        charge.customer?.name ||
        null,
      description: charge.description || null,
      invoice_url: charge.receipt_url || null,
      created: charge.created, // unix timestamp
    }));

    // ── Transform subscriptions ─────────────────────────────────────────
    const subscriptions = (subsData.data || []).map((sub: any) => ({
      id: sub.id,
      status: sub.status,
      customer_id: sub.customer,
      plan_amount_cents: sub.items?.data?.[0]?.price?.unit_amount || 0,
      plan_currency: sub.items?.data?.[0]?.price?.currency || "aud",
      plan_interval: sub.items?.data?.[0]?.price?.recurring?.interval || "month",
      current_period_end: sub.current_period_end,
      cancel_at_period_end: sub.cancel_at_period_end,
      created: sub.created,
    }));

    // ── Summary stats ───────────────────────────────────────────────────
    const succeededPayments = payments.filter(
      (p: any) => p.status === "succeeded" && !p.refunded,
    );
    const totalRevenueCents = succeededPayments.reduce(
      (sum: number, p: any) => sum + p.amount_cents,
      0,
    );
    const failedCount = payments.filter(
      (p: any) => p.status === "failed",
    ).length;
    const refundedCount = payments.filter((p: any) => p.refunded).length;

    return new Response(
      JSON.stringify({
        payments,
        subscriptions,
        summary: {
          total_revenue_cents: totalRevenueCents,
          failed_count: failedCount,
          refunded_count: refundedCount,
          active_subscriptions: subscriptions.length,
        },
        fetched_at: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err: any) {
    console.error("[admin-stripe-payments] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});

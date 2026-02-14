import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

// ─── Email HTML builder ──────────────────────────────────────────────────────

interface EmailContext {
  name: string;
  email: string;
  hasOnboarded: boolean;
  hasFacebook: boolean;
  briefUrl: string | null;
}

function buildWelcomeHtml(ctx: EmailContext): string {
  const { name, hasOnboarded, hasFacebook, briefUrl } = ctx;

  let nextStepHtml: string;

  if (briefUrl && hasFacebook) {
    nextStepHtml = `
      <p>Your strategy brief is ready — I've already analysed your business and built a custom advertising plan:</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${briefUrl}" style="background-color:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">View Your Strategy Brief →</a>
      </p>
      <p>You've connected Facebook — great. When you're ready, I can generate ad creatives and launch your first campaign. Just log into your <a href="https://zuckerbot.ai/dashboard" style="color:#2563eb;">dashboard</a> and hit Create Campaign.</p>`;
  } else if (briefUrl) {
    nextStepHtml = `
      <p>Your strategy brief is ready — I've analysed your business and built a custom advertising plan:</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${briefUrl}" style="background-color:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">View Your Strategy Brief →</a>
      </p>
      <p><strong>Next step:</strong> Connect your Facebook Business Page so I can start running ads for you. Takes about 30 seconds — just head to your <a href="https://zuckerbot.ai/dashboard" style="color:#2563eb;">dashboard</a> and click "Connect Facebook".</p>`;
  } else if (hasOnboarded) {
    nextStepHtml = `
      <p>I'm generating your personalised strategy brief now. You'll see it on your <a href="https://zuckerbot.ai/dashboard" style="color:#2563eb;">dashboard</a> shortly.</p>
      <p><strong>Next step:</strong> Connect your Facebook Business Page so I can start running ads for you.</p>`;
  } else {
    nextStepHtml = `
      <p>Let's get you set up — it takes about 60 seconds:</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="https://zuckerbot.ai/onboarding" style="background-color:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Complete Setup →</a>
      </p>
      <p>Once you're in, I'll analyse your business and create a full ad strategy brief — the same quality you'd get from a $5,000/month agency.</p>`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1e293b;max-width:600px;margin:0 auto;padding:20px;">
  <div style="text-align:center;margin-bottom:32px;padding:20px 0;border-bottom:2px solid #e2e8f0;">
    <h1 style="margin:8px 0 0;font-size:22px;color:#0f172a;">ZuckerBot</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Your AI Advertising Agency</p>
  </div>

  <p>Hey ${name},</p>

  <p>I'm ZuckerBot — your new AI advertising agency. I'm fully autonomous, available 24/7, and I exist to get you customers through Facebook &amp; Instagram ads.</p>

  <p>No account managers to chase. No monthly retainer meetings. No waiting 3 days for creative approvals. I handle everything — strategy, ad copy, creative generation, campaign management, and optimisation.</p>

  ${nextStepHtml}

  <div style="margin:32px 0;padding:20px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
    <h3 style="margin:0 0 12px;font-size:15px;color:#0f172a;">What I do for you:</h3>
    <ul style="margin:0;padding-left:20px;color:#475569;">
      <li>Analyse your business &amp; competitors</li>
      <li>Build targeted audience personas</li>
      <li>Write high-converting ad copy</li>
      <li>Generate ad creatives with AI</li>
      <li>Launch &amp; manage your campaigns</li>
      <li>Optimise daily based on performance data</li>
    </ul>
  </div>

  <p>All of this for <strong>$49/month</strong> — not the $2,000–$5,000 agencies charge for the same work.</p>

  <p>If you have questions, just reply to this email. I'm here.</p>

  <p style="margin-top:32px;">
    — ZuckerBot<br/>
    <span style="color:#64748b;font-size:13px;">Your AI Ad Agency · <a href="https://zuckerbot.ai" style="color:#2563eb;">zuckerbot.ai</a></span>
  </p>

  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;">
      You're receiving this because you signed up at zuckerbot.ai.<br/>
      ZuckerBot · AI-Powered Advertising · <a href="https://zuckerbot.ai" style="color:#94a3b8;">zuckerbot.ai</a>
    </p>
  </div>
</body>
</html>`;
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const userId: string | undefined = body.user_id;
    const userEmail: string | undefined = body.user_email;
    const userName: string | undefined = body.user_name;

    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: "Missing user_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gather context about the user
    let hasOnboarded = false;
    let hasFacebook = false;
    let briefUrl: string | null = null;
    let businessName: string | null = null;

    if (userId) {
      // Check business
      const { data: biz } = await supabaseAdmin
        .from("businesses")
        .select("id, name, facebook_page_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (biz) {
        hasOnboarded = true;
        businessName = biz.name;
        hasFacebook = !!biz.facebook_page_id;

        // Check for strategy brief
        const { data: brief } = await supabaseAdmin
          .from("strategy_briefs")
          .select("id")
          .eq("business_id", biz.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (brief) {
          briefUrl = `https://zuckerbot.ai/brief/${brief.id}`;
        }
      }
    }

    // Determine display name
    const displayName = businessName || userName || userEmail.split("@")[0];

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[welcome-email] RESEND_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ADMIN_BCC = Deno.env.get("ADMIN_EMAIL") || "davisgrainger@gmail.com";

    const ctx: EmailContext = {
      name: displayName,
      email: userEmail,
      hasOnboarded,
      hasFacebook,
      briefUrl,
    };

    const html = buildWelcomeHtml(ctx);
    const subject = hasOnboarded
      ? "Welcome to ZuckerBot — Your AI Ad Agency is Ready"
      : "Your ZuckerBot account is waiting";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "ZuckerBot <hello@zuckerbot.ai>",
        to: [userEmail],
        bcc: [ADMIN_BCC],
        subject,
        html,
        reply_to: "hello@zuckerbot.ai",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[welcome-email] Resend error:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Failed to send", details: data }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[welcome-email] Sent to ${userEmail} (${displayName}) | ID: ${data.id}`);

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[welcome-email] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

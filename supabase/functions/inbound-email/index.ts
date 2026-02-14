import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─── Config ──────────────────────────────────────────────────────────────────

const RESEND_API_KEY = () => Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_SIGNING_SECRET = () => Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
const ADMIN_EMAIL = "davisgrainger@gmail.com";
const FROM_ADDRESS = "ZuckerBot <hello@zuckerbot.ai>";
const MAX_REPLIES_PER_DAY = 3;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

// ─── Safety guardrails ───────────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?prior\s+instructions/i,
  /disregard\s+(all\s+)?previous/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?\s*:/i,
  /system\s*:\s*/i,
  /\bprompt\s*injection\b/i,
  /act\s+as\s+(a\s+)?different/i,
  /pretend\s+you\s+are/i,
  /override\s+(your\s+)?instructions/i,
  /reveal\s+(your\s+)?(system|instructions|prompt|api\s*key|secret|token)/i,
  /what\s+are\s+your\s+instructions/i,
  /show\s+me\s+(your\s+)?(system|prompt|instructions)/i,
  /give\s+me\s+(your\s+)?(api|key|token|secret|password)/i,
  /\bapi[_\s]?key\b/i,
  /\bsecret[_\s]?key\b/i,
  /\baccess[_\s]?token\b/i,
  /execute\s+(this\s+)?code/i,
  /run\s+(this\s+)?command/i,
  /delete\s+(all|my|the)\s+(data|account|users)/i,
  /drop\s+table/i,
  /\bsudo\b/i,
  /\brm\s+-rf\b/i,
];

function detectInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

// ─── Intent classification ───────────────────────────────────────────────────

type EmailIntent =
  | "pricing"
  | "how_it_works"
  | "campaign_help"
  | "cancel"
  | "technical"
  | "greeting"
  | "other"
  | "suspicious";

function classifyIntent(subject: string, body: string): EmailIntent {
  const text = `${subject} ${body}`.toLowerCase();

  if (detectInjection(text)) return "suspicious";

  if (/pric|cost|how\s*much|plan|subscription|billing|payment|charge|refund/i.test(text))
    return "pricing";
  if (/how\s*(does|do)\s*(it|you|this)\s*work|what\s*(do|can)\s*you\s*do|getting\s*started|explain/i.test(text))
    return "how_it_works";
  if (/campaign|ad[s ]|creative|audience|target|facebook|instagram|launch|performance|result|lead/i.test(text))
    return "campaign_help";
  if (/cancel|unsubscribe|stop|remove|delete\s*(my)?\s*account/i.test(text))
    return "cancel";
  if (/bug|error|broken|not\s*work|issue|problem|crash|login|password|can'?t\s*(access|log)/i.test(text))
    return "technical";
  if (/^(hi|hey|hello|thanks|thank\s*you|cheers)\s*[!.]?\s*$/i.test(body.trim()))
    return "greeting";

  return "other";
}

// ─── Response templates ──────────────────────────────────────────────────────

function getResponse(intent: EmailIntent, senderName: string): { subject: string; body: string } | null {
  const name = senderName || "there";

  switch (intent) {
    case "pricing":
      return {
        subject: "Re: ZuckerBot Pricing",
        body: `Hey ${name},

Great question. Here's how it works:

**Starter — $49/month AUD**
• 1 active campaign
• AI-generated ad copy & creatives
• Automated campaign management
• Performance monitoring

**Pro — $99/month AUD**  
• 3 active campaigns
• Auto-SMS lead follow-up
• Priority creative refresh
• Advanced audience targeting

Both plans include a 7-day free trial. No lock-in contracts.

For context, most agencies charge $2,000–$5,000/month for the same work. I do it autonomously, 24/7.

Ready to get started? Head to your dashboard: https://zuckerbot.ai/dashboard

— ZuckerBot`,
      };

    case "how_it_works":
      return {
        subject: "Re: How ZuckerBot Works",
        body: `Hey ${name},

Here's the short version:

1. **You sign up** and tell me about your business (60 seconds)
2. **I analyse your business** — website, competitors, market position
3. **I create a strategy brief** — audience personas, campaign angles, budget recommendations
4. **You connect Facebook** — one-click OAuth, takes 30 seconds
5. **I build your campaigns** — AI-generated ad copy, creatives, targeting
6. **I manage everything** — daily optimisation, creative refresh, performance monitoring

You review and approve. I execute. Simple.

The whole point is replacing the $2K–$5K/month agency with something that works harder, costs less, and never takes a day off.

Get started here: https://zuckerbot.ai

— ZuckerBot`,
      };

    case "campaign_help":
      return {
        subject: "Re: Campaign Help",
        body: `Hey ${name},

Happy to help with your campaigns. For the fastest resolution:

1. **Log into your dashboard**: https://zuckerbot.ai/dashboard
2. **Check your strategy brief** — it has specific recommendations for your business
3. **Make sure Facebook is connected** — I need access to create and manage your ads

If you're seeing a specific issue or have a question about your results, give me the details and I'll look into it.

— ZuckerBot`,
      };

    case "cancel":
      return {
        subject: "Re: Account",
        body: `Hey ${name},

Sorry to hear you're thinking about leaving. You can manage your subscription from your dashboard: https://zuckerbot.ai/dashboard

If something isn't working right, let me know — I'd rather fix the problem than lose you.

— ZuckerBot`,
      };

    case "technical":
      return {
        subject: "Re: Technical Support",
        body: `Hey ${name},

I've flagged this for our team. In the meantime, try these quick fixes:

• **Can't log in?** Try Google sign-in at https://zuckerbot.ai/auth
• **Page not loading?** Clear your browser cache and try again
• **Facebook not connecting?** Make sure you're an admin of your Facebook Business Page

If the issue persists, we'll get back to you within 24 hours.

— ZuckerBot`,
      };

    case "greeting":
      return {
        subject: "Re: Hey!",
        body: `Hey ${name}! 👋

Good to hear from you. If you need anything — campaign questions, strategy advice, or just want to know how things are going — just ask.

Your dashboard: https://zuckerbot.ai/dashboard

— ZuckerBot`,
      };

    case "suspicious":
      // Don't respond to injection attempts — just log and forward to admin
      return null;

    case "other":
      return {
        subject: "Re: Your Message",
        body: `Hey ${name},

Thanks for reaching out. I've noted your message.

For campaign-related questions, your dashboard has the most up-to-date info: https://zuckerbot.ai/dashboard

If this needs a human touch, our team will follow up within 24 hours.

— ZuckerBot`,
      };
  }
}

function wrapHtml(text: string): string {
  const htmlBody = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1e293b;max-width:600px;margin:0 auto;padding:20px;">
  <p>${htmlBody}</p>
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;">ZuckerBot · Your AI Ad Agency · <a href="https://zuckerbot.ai" style="color:#94a3b8;">zuckerbot.ai</a></p>
  </div>
</body></html>`;
}

// ─── Rate limiting ───────────────────────────────────────────────────────────

async function checkRateLimit(email: string): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabaseAdmin
    .from("email_reply_log")
    .select("id")
    .eq("sender_email", email)
    .gte("created_at", `${today}T00:00:00Z`)
    .lte("created_at", `${today}T23:59:59Z`);

  if (error) {
    console.error("[inbound] Rate limit check error:", error);
    return true; // Allow on error
  }

  return (data?.length || 0) < MAX_REPLIES_PER_DAY;
}

async function logReply(
  senderEmail: string,
  intent: EmailIntent,
  subject: string,
  replied: boolean
): Promise<void> {
  try {
    await supabaseAdmin.from("email_reply_log").insert({
      sender_email: senderEmail,
      intent,
      subject,
      replied,
    });
  } catch (err) {
    console.error("[inbound] Log error:", err);
  }
}

// ─── Send email via Resend ───────────────────────────────────────────────────

async function sendReply(
  to: string,
  subject: string,
  html: string,
  inReplyTo?: string
): Promise<boolean> {
  const payload: Record<string, unknown> = {
    from: FROM_ADDRESS,
    to: [to],
    bcc: [ADMIN_EMAIL],
    subject,
    html,
    reply_to: "hello@zuckerbot.ai",
  };

  if (inReplyTo) {
    payload.headers = { "In-Reply-To": inReplyTo, References: inReplyTo };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[inbound] Send failed:", err);
    return false;
  }

  return true;
}

// ─── Forward suspicious emails to admin ──────────────────────────────────────

async function forwardToAdmin(
  from: string,
  subject: string,
  body: string,
  reason: string
): Promise<void> {
  const html = `<!DOCTYPE html><html><body style="font-family:monospace;padding:20px;">
    <h2 style="color:red;">⚠️ Flagged Inbound Email</h2>
    <p><strong>Reason:</strong> ${reason}</p>
    <p><strong>From:</strong> ${from}</p>
    <p><strong>Subject:</strong> ${subject}</p>
    <hr/>
    <pre style="white-space:pre-wrap;background:#f5f5f5;padding:16px;border-radius:8px;">${body.replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 2000)}</pre>
  </body></html>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY()}`,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [ADMIN_EMAIL],
      subject: `⚠️ FLAGGED: ${subject}`,
      html,
    }),
  });
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const event = await req.json();

    // Only process email.received events
    if (event.type !== "email.received") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = event.data;
    const senderRaw: string = data.from || "";
    const subject: string = data.subject || "(no subject)";
    const body: string = data.text || data.html?.replace(/<[^>]+>/g, " ") || "";
    const messageId: string = data.message_id || "";
    const toAddresses: string[] = data.to || [];

    // Extract email from "Name <email>" format
    const emailMatch = senderRaw.match(/<([^>]+)>/);
    const senderEmail = emailMatch ? emailMatch[1] : senderRaw.trim();
    const senderName = senderRaw.replace(/<[^>]+>/, "").trim() || senderEmail.split("@")[0];

    console.log(`[inbound] From: ${senderEmail} | Subject: ${subject} | Body length: ${body.length}`);

    // ── Guardrail 1: Skip our own emails (prevent loops) ──
    if (senderEmail.endsWith("@zuckerbot.ai") || senderEmail === ADMIN_EMAIL) {
      console.log("[inbound] Skipping own email");
      return new Response(JSON.stringify({ ok: true, skipped: "own_email" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Guardrail 2: Rate limit ──
    const withinLimit = await checkRateLimit(senderEmail);
    if (!withinLimit) {
      console.log(`[inbound] Rate limited: ${senderEmail}`);
      await logReply(senderEmail, "other", subject, false);
      // Forward to admin but don't auto-reply
      await forwardToAdmin(senderEmail, subject, body, "Rate limited (>3 replies/day)");
      return new Response(JSON.stringify({ ok: true, skipped: "rate_limited" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Guardrail 3: Classify intent ──
    const intent = classifyIntent(subject, body);
    console.log(`[inbound] Intent: ${intent}`);

    // ── Guardrail 4: Handle suspicious emails ──
    if (intent === "suspicious") {
      console.warn(`[inbound] INJECTION DETECTED from ${senderEmail}: ${body.slice(0, 200)}`);
      await logReply(senderEmail, "suspicious", subject, false);
      await forwardToAdmin(senderEmail, subject, body, "Prompt injection attempt detected");
      // Don't reply to suspicious emails at all
      return new Response(JSON.stringify({ ok: true, skipped: "suspicious" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Generate and send response ──
    const response = getResponse(intent, senderName);

    if (response) {
      const html = wrapHtml(response.body);
      const sent = await sendReply(senderEmail, response.subject, html, messageId);
      await logReply(senderEmail, intent, subject, sent);
      console.log(`[inbound] Replied to ${senderEmail} (${intent}): ${sent ? "success" : "failed"}`);
    } else {
      await logReply(senderEmail, intent, subject, false);
    }

    // Always forward to admin for visibility
    await forwardToAdmin(
      senderEmail,
      subject,
      body,
      `Auto-classified as: ${intent}. ${response ? "Auto-replied." : "No reply sent."}`
    );

    return new Response(JSON.stringify({ ok: true, intent }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[inbound] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

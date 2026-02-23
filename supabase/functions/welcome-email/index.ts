import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildWelcomeHtml(name: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#e2e8f0;max-width:600px;margin:0 auto;padding:20px;background-color:#09090b;">
  <div style="text-align:center;margin-bottom:32px;padding:20px 0;border-bottom:1px solid rgba(255,255,255,0.1);">
    <h1 style="margin:8px 0 0;font-size:22px;color:#fff;">Zucker<span style="color:#3b82f6;">Bot</span> <span style="font-size:12px;background:rgba(59,130,246,0.1);color:#60a5fa;padding:2px 8px;border-radius:4px;vertical-align:middle;">API</span></h1>
    <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Ads Infrastructure for AI Agents</p>
  </div>

  <p style="color:#e2e8f0;">Hey ${name},</p>

  <p style="color:#94a3b8;">Welcome to ZuckerBot. You now have access to the API that lets AI agents create and manage Facebook ad campaigns.</p>

  <p style="text-align:center;margin:28px 0;">
    <a href="https://zuckerbot.ai/developer" style="background-color:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Generate Your API Key</a>
  </p>

  <div style="margin:28px 0;padding:20px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.08);">
    <h3 style="margin:0 0 12px;font-size:15px;color:#fff;">What you can do:</h3>
    <ul style="margin:0;padding-left:20px;color:#94a3b8;">
      <li>Generate ad copy from any URL with one API call</li>
      <li>Build full Meta campaigns with targeting and budgets</li>
      <li>Generate ad creative images via Imagen 4.0</li>
      <li>Research competitors, markets, and reviews</li>
      <li>Launch and manage campaigns via Meta's API</li>
    </ul>
  </div>

  <div style="margin:28px 0;padding:16px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Quick start:</p>
    <code style="font-size:13px;color:#60a5fa;background:rgba(59,130,246,0.1);padding:8px 12px;border-radius:6px;display:block;">npx zuckerbot-mcp</code>
    <p style="margin:8px 0 0;font-size:12px;color:#64748b;">Works with Claude Desktop, Cursor, OpenClaw, and any MCP-compatible agent.</p>
  </div>

  <p style="color:#94a3b8;">Free tier: 25 campaign previews/month. No credit card required.</p>

  <p style="color:#94a3b8;">Questions or feedback? Just reply to this email.</p>

  <p style="margin-top:32px;color:#94a3b8;">
    Davis<br/>
    <span style="color:#64748b;font-size:13px;">ZuckerBot · <a href="https://zuckerbot.ai" style="color:#3b82f6;">zuckerbot.ai</a> · <a href="https://zuckerbot.ai/docs" style="color:#3b82f6;">Docs</a></span>
  </p>

  <div style="margin-top:40px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
    <p style="font-size:11px;color:#475569;">
      You signed up at zuckerbot.ai.<br/>
      ZuckerBot · Ads Infrastructure for AI Agents
    </p>
  </div>
</body>
</html>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const userEmail: string | undefined = body.user_email;
    const userName: string | undefined = body.user_name;

    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: "Missing user_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const displayName = userName || userEmail.split("@")[0];
    const html = buildWelcomeHtml(displayName);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[welcome-email] RESEND_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ADMIN_BCC = Deno.env.get("ADMIN_EMAIL") || "davisgrainger@gmail.com";

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
        subject: "Welcome to ZuckerBot API",
        html,
        reply_to: "davis@datalis.app",
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

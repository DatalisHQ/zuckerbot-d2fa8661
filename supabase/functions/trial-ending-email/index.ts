import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TrialEndingRequest {
  user_email: string;
  user_name?: string;
}

function buildTrialEndingHtml(name?: string): string {
  const firstName = name ? name.split(" ")[0] : "mate";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your free trial ends in 2 days</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#2563eb;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">🤖 ZuckerBot</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:600;">Hey ${firstName} — quick heads up ⏰</h2>
              <p style="margin:0 0 16px;color:#3f3f46;font-size:16px;line-height:1.6;">
                Your free trial wraps up in <strong>2 days</strong>. Just wanted to give you a nudge so nothing catches you off guard.
              </p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:16px;line-height:1.6;">
                If you've been getting leads and landing jobs through ZuckerBot, picking a plan means your campaigns keep running without any interruption. No leads lost.
              </p>

              <!-- Plans -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;background-color:#eff6ff;border-radius:8px;border:2px solid #bfdbfe;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="margin:0 0 4px;color:#2563eb;font-size:15px;font-weight:700;">Starter — $49/mo</p>
                          <p style="margin:0;color:#3f3f46;font-size:14px;line-height:1.5;">Perfect for businesses just getting started</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:16px 20px;background-color:#eff6ff;border-radius:8px;border:2px solid #bfdbfe;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="margin:0 0 4px;color:#2563eb;font-size:15px;font-weight:700;">Pro — $99/mo</p>
                          <p style="margin:0;color:#3f3f46;font-size:14px;line-height:1.5;">For growing businesses who want more</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 32px;color:#3f3f46;font-size:16px;line-height:1.6;">
                Either way, it's less than the cost of a single job — and most businesses land multiple customers a week through their ads. Pretty solid ROI if you ask me. 📈
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://zuckerbot.ai/billing" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.3px;">
                      Choose Your Plan →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;color:#71717a;font-size:14px;line-height:1.5;text-align:center;">
                Not ready? No worries — your data stays safe. You can upgrade any time.
              </p>
            </td>
          </tr>

          <!-- Sign-off -->
          <tr>
            <td style="padding:24px 40px 40px;">
              <p style="margin:0 0 4px;color:#3f3f46;font-size:16px;line-height:1.6;">
                Cheers,<br>
                <strong>Davis</strong> 🤙<br>
                <span style="color:#71717a;font-size:14px;">Founder, ZuckerBot</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#fafafa;padding:24px 40px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.5;text-align:center;">
                ZuckerBot — Facebook ads on autopilot for small businesses 🇦🇺<br>
                <a href="https://zuckerbot.ai/unsubscribe" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_email, user_name } =
      (await req.json()) as TrialEndingRequest;

    if (!user_email) {
      return new Response(
        JSON.stringify({ error: "Missing required field: user_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[trial-ending-email] RESEND_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = buildTrialEndingHtml(user_name);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Davis from ZuckerBot <davis@zuckerbot.ai>",
        to: [user_email],
        subject: "Your free trial ends in 2 days",
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[trial-ending-email] Resend API error:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Failed to send trial ending email", details: data }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[trial-ending-email] Sent to:", user_email, "| ID:", data.id);

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[trial-ending-email] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  user_email: string;
  user_name?: string;
}

function buildWelcomeHtml(name?: string): string {
  const firstName = name ? name.split(" ")[0] : "mate";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ZuckerBot</title>
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
              <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:600;">G'day ${firstName}! 👋</h2>
              <p style="margin:0 0 16px;color:#3f3f46;font-size:16px;line-height:1.6;">
                I'm Davis — I built ZuckerBot because I reckon every tradie deserves customers rolling in without the headache of figuring out Facebook ads.
              </p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:16px;line-height:1.6;">
                You've got a <strong>7-day free trial</strong> to give it a proper go. Here's how it works — dead simple:
              </p>

              <!-- Steps -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="padding:16px;background-color:#eff6ff;border-radius:8px;margin-bottom:12px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="48" valign="top" style="padding-right:12px;">
                          <div style="width:36px;height:36px;background-color:#2563eb;border-radius:50%;color:#ffffff;font-size:16px;font-weight:700;text-align:center;line-height:36px;">1</div>
                        </td>
                        <td valign="middle" style="color:#18181b;font-size:15px;font-weight:500;">Tell us about your trade</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:16px;background-color:#eff6ff;border-radius:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="48" valign="top" style="padding-right:12px;">
                          <div style="width:36px;height:36px;background-color:#2563eb;border-radius:50%;color:#ffffff;font-size:16px;font-weight:700;text-align:center;line-height:36px;">2</div>
                        </td>
                        <td valign="middle" style="color:#18181b;font-size:15px;font-weight:500;">AI creates your ad — copy, image, the lot</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:16px;background-color:#eff6ff;border-radius:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="48" valign="top" style="padding-right:12px;">
                          <div style="width:36px;height:36px;background-color:#2563eb;border-radius:50%;color:#ffffff;font-size:16px;font-weight:700;text-align:center;line-height:36px;">3</div>
                        </td>
                        <td valign="middle" style="color:#18181b;font-size:15px;font-weight:500;">One click to launch — you're live on Facebook</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 32px;color:#3f3f46;font-size:16px;line-height:1.6;">
                Most tradies have their first campaign running in under 5 minutes. No marketing degree needed. 💪
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://zuckerbot.ai/onboarding" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.3px;">
                      Set Up Your First Campaign →
                    </a>
                  </td>
                </tr>
              </table>
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
                ZuckerBot — Facebook ads on autopilot for tradies 🇦🇺<br>
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
      (await req.json()) as WelcomeEmailRequest;

    if (!user_email) {
      return new Response(
        JSON.stringify({ error: "Missing required field: user_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[welcome-email] RESEND_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = buildWelcomeHtml(user_name);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Davis from ZuckerBot <davis@zuckerbot.ai>",
        to: [user_email],
        subject: "Welcome to ZuckerBot 🤖",
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[welcome-email] Resend API error:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Failed to send welcome email", details: data }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[welcome-email] Sent to:", user_email, "| ID:", data.id);

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[welcome-email] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CampaignLaunchedRequest {
  user_email: string;
  user_name?: string;
  campaign_name: string;
  daily_budget_cents: number;
}

function formatBudget(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildCampaignLaunchedHtml(
  name: string | undefined,
  campaignName: string,
  dailyBudgetCents: number
): string {
  const firstName = name ? name.split(" ")[0] : "mate";
  const budget = formatBudget(dailyBudgetCents);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your campaign is live!</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#2563eb;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">🚀 You're Live!</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:600;">Nice one, ${firstName}! 🎉</h2>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:16px;line-height:1.6;">
                Your campaign is live on Facebook and already reaching potential customers. Here are the details:
              </p>

              <!-- Campaign Details -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background-color:#f4f4f5;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#71717a;font-size:14px;font-weight:500;">Campaign</td>
                        <td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:600;text-align:right;">${campaignName}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#71717a;font-size:14px;font-weight:500;">Daily Budget</td>
                        <td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:600;text-align:right;">${budget}/day</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#71717a;font-size:14px;font-weight:500;">Status</td>
                        <td style="padding:6px 0;text-align:right;">
                          <span style="display:inline-block;background-color:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:3px 10px;border-radius:12px;">● Active</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- What to expect -->
              <h3 style="margin:0 0 12px;color:#18181b;font-size:17px;font-weight:600;">⏱️ What happens now?</h3>
              <p style="margin:0 0 8px;color:#3f3f46;font-size:15px;line-height:1.6;">
                <strong>First 24–48 hours:</strong> Facebook's learning phase — the algorithm is figuring out who to show your ad to. Results might be a bit slow at first. That's totally normal.
              </p>
              <p style="margin:0 0 32px;color:#3f3f46;font-size:15px;line-height:1.6;">
                <strong>After that:</strong> Leads start rolling in. You'll get notified when someone enquires. Just pick up the phone and land the job. 🔧
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://zuckerbot.ai/dashboard" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.3px;">
                      View Your Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
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
    const { user_email, user_name, campaign_name, daily_budget_cents } =
      (await req.json()) as CampaignLaunchedRequest;

    if (!user_email || !campaign_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_email, campaign_name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[campaign-launched-email] RESEND_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = buildCampaignLaunchedHtml(
      user_name,
      campaign_name,
      daily_budget_cents || 1500
    );

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "ZuckerBot <noreply@zuckerbot.ai>",
        to: [user_email],
        subject: "Your campaign is live! 🚀",
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[campaign-launched-email] Resend API error:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Failed to send campaign launched email", details: data }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[campaign-launched-email] Sent to:", user_email, "| ID:", data.id);

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[campaign-launched-email] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

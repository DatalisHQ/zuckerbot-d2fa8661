import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { business_id } = await req.json();
    if (!business_id) {
      return new Response(
        JSON.stringify({ error: "business_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 1. Fetch business row ────────────────────────────────────────────────
    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("id, user_id, name, telegram_chat_id")
      .eq("id", business_id)
      .single();

    if (bizErr || !business) {
      return new Response(
        JSON.stringify({ error: "Business not found", detail: bizErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Resolve user email ────────────────────────────────────────────────
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(business.user_id);
    if (userErr || !userData?.user?.email) {
      return new Response(
        JSON.stringify({ error: "Could not resolve user email", detail: userErr?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userEmail = userData.user.email;

    // ── 3. Automation runs last 24 h ─────────────────────────────────────────
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentRuns } = await supabase
      .from("automation_runs")
      .select("id, agent_type, status, summary, requires_approval, created_at, output")
      .eq("business_id", business_id)
      .gte("created_at", since24h)
      .order("created_at", { ascending: false });

    const runs = recentRuns ?? [];

    // Pending approval actions
    const pendingActions = runs
      .filter((r) => r.requires_approval && r.status === "needs_approval")
      .map((r) => ({
        id: r.id,
        agent_type: r.agent_type,
        summary: r.summary ?? "",
        created_at: r.created_at,
      }));

    // Count auto-executed campaign actions from last 24 h
    let campaignsPausedAuto = 0;
    let campaignsScaledAuto = 0;
    for (const run of runs) {
      if (run.status === "completed" && run.output) {
        const out = typeof run.output === "string" ? JSON.parse(run.output) : run.output;
        if (out?.action === "paused") campaignsPausedAuto++;
        if (out?.action === "scaled") campaignsScaledAuto++;
      }
    }

    // ── 4. Active campaigns with metrics ────────────────────────────────────
    const { data: activeCampaigns } = await supabase
      .from("campaigns")
      .select("id, name, status, daily_budget_cents, spend_cents, leads_count")
      .eq("business_id", business_id)
      .eq("status", "active");

    const campaigns = activeCampaigns ?? [];
    const totalSpendCents = campaigns.reduce((sum, c) => sum + (c.spend_cents ?? 0), 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + (c.leads_count ?? 0), 0);
    const totalSpend = (totalSpendCents / 100).toFixed(2);
    const avgCpa =
      totalConversions > 0
        ? ((totalSpendCents / 100) / totalConversions).toFixed(2)
        : null;

    const campaignMetrics = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      daily_budget: (c.daily_budget_cents / 100).toFixed(2),
      spend: ((c.spend_cents ?? 0) / 100).toFixed(2),
      conversions: c.leads_count ?? 0,
    }));

    // ── 5. Autonomous mode enabled? ──────────────────────────────────────────
    const { data: policy } = await supabase
      .from("autonomous_policies")
      .select("enabled")
      .eq("business_id", business_id)
      .maybeSingle();

    const autonomousModeEnabled = policy?.enabled ?? false;

    // ── 6. Build digest object ───────────────────────────────────────────────
    const digest = {
      business_id,
      business_name: business.name,
      total_spend: totalSpend,
      total_conversions: totalConversions,
      avg_cpa: avgCpa,
      active_campaigns: campaigns.length,
      campaigns_paused_auto: campaignsPausedAuto,
      campaigns_scaled_auto: campaignsScaledAuto,
      autonomous_mode_enabled: autonomousModeEnabled,
      pending_actions: pendingActions,
      campaign_metrics: campaignMetrics,
    };

    // ── 7. Build email subject ───────────────────────────────────────────────
    const subject =
      pendingActions.length > 0
        ? `⚡ ${pendingActions.length} action${pendingActions.length === 1 ? "" : "s"} need approval — ZuckerBot`
        : `Your ZuckerBot brief: $${totalSpend} spent, ${totalConversions} conversions`;

    // ── 8. Build HTML email body ─────────────────────────────────────────────
    const pendingHtml =
      pendingActions.length > 0
        ? `
          <h2 style="color:#f59e0b;">⚡ ${pendingActions.length} Action${pendingActions.length === 1 ? "" : "s"} Need Approval</h2>
          <ul>
            ${pendingActions.map((a) => `<li><strong>${a.agent_type}</strong>: ${a.summary}</li>`).join("")}
          </ul>
          <p><a href="${Deno.env.get("SITE_URL") ?? "https://app.zuckerbot.com.au"}/dashboard" style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Review &amp; Approve</a></p>
        `
        : "";

    const campaignRows = campaignMetrics
      .map(
        (c) =>
          `<tr>
            <td style="padding:6px 12px;">${c.name}</td>
            <td style="padding:6px 12px;text-align:right;">$${c.spend}</td>
            <td style="padding:6px 12px;text-align:right;">${c.conversions}</td>
            <td style="padding:6px 12px;text-align:right;">$${c.daily_budget}/day</td>
          </tr>`
      )
      .join("");

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937;">
  <h1 style="font-size:22px;margin-bottom:4px;">Good morning, ${business.name} 👋</h1>
  <p style="color:#6b7280;margin-top:0;">Here's your ZuckerBot digest for the last 24 hours.</p>

  ${pendingHtml}

  <h2 style="font-size:16px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">📊 Performance</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr style="background:#f9fafb;">
      <td style="padding:6px 12px;">Total Spend</td>
      <td style="padding:6px 12px;text-align:right;font-weight:bold;">$${totalSpend}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px;">Total Conversions</td>
      <td style="padding:6px 12px;text-align:right;font-weight:bold;">${totalConversions}</td>
    </tr>
    <tr style="background:#f9fafb;">
      <td style="padding:6px 12px;">Avg CPA</td>
      <td style="padding:6px 12px;text-align:right;font-weight:bold;">${avgCpa ? `$${avgCpa}` : "—"}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px;">Active Campaigns</td>
      <td style="padding:6px 12px;text-align:right;font-weight:bold;">${campaigns.length}</td>
    </tr>
    ${
      campaignsScaledAuto > 0 || campaignsPausedAuto > 0
        ? `<tr style="background:#f9fafb;">
            <td style="padding:6px 12px;">Auto-Scaled / Auto-Paused</td>
            <td style="padding:6px 12px;text-align:right;font-weight:bold;">${campaignsScaledAuto} / ${campaignsPausedAuto}</td>
          </tr>`
        : ""
    }
  </table>

  ${
    campaignMetrics.length > 0
      ? `
        <h2 style="font-size:16px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-top:24px;">📢 Campaigns</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;text-align:left;">
              <th style="padding:6px 12px;">Campaign</th>
              <th style="padding:6px 12px;text-align:right;">Spend</th>
              <th style="padding:6px 12px;text-align:right;">Leads</th>
              <th style="padding:6px 12px;text-align:right;">Budget</th>
            </tr>
          </thead>
          <tbody>${campaignRows}</tbody>
        </table>
      `
      : "<p style='color:#6b7280;'>No active campaigns.</p>"
  }

  <p style="margin-top:32px;font-size:12px;color:#9ca3af;">
    Autonomous mode is <strong>${autonomousModeEnabled ? "ON" : "OFF"}</strong>.
    &nbsp;·&nbsp;
    <a href="${Deno.env.get("SITE_URL") ?? "https://app.zuckerbot.com.au"}/dashboard">Open ZuckerBot</a>
    &nbsp;·&nbsp;
    <a href="${Deno.env.get("SITE_URL") ?? "https://app.zuckerbot.com.au"}/settings">Manage digest settings</a>
  </p>
</body>
</html>`;

    // ── 9. Send email via Resend ─────────────────────────────────────────────
    const resendKey = Deno.env.get("RESEND_API_KEY");
    let emailResult = "skipped:no_resend_key";

    if (resendKey) {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "ZuckerBot <digest@zuckerbot.com.au>",
          to: [userEmail],
          subject,
          html: htmlBody,
        }),
      });
      emailResult = resendRes.ok ? "sent" : `error:${resendRes.status}`;
    }

    // ── 10. Send Telegram message (if chat_id configured) ───────────────────
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    let telegramResult = "skipped:no_chat_id";

    if (telegramToken && business.telegram_chat_id) {
      const pendingLine =
        pendingActions.length > 0
          ? `\n⚡ *${pendingActions.length} action${pendingActions.length === 1 ? "" : "s"} need approval*`
          : "";

      const telegramText =
        `*ZuckerBot Morning Brief — ${business.name}*\n` +
        `📊 Spend: $${totalSpend} | Leads: ${totalConversions} | CPA: ${avgCpa ? `$${avgCpa}` : "—"}\n` +
        `📢 Active campaigns: ${campaigns.length}` +
        (campaignsPausedAuto > 0 ? ` | Paused: ${campaignsPausedAuto}` : "") +
        (campaignsScaledAuto > 0 ? ` | Scaled: ${campaignsScaledAuto}` : "") +
        pendingLine;

      const tgRes = await fetch(
        `https://api.telegram.org/bot${telegramToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: business.telegram_chat_id,
            text: telegramText,
            parse_mode: "Markdown",
          }),
        }
      );
      telegramResult = tgRes.ok ? "sent" : `error:${tgRes.status}`;
    }

    // ── 11. Return ───────────────────────────────────────────────────────────
    const channels = [emailResult, telegramResult !== "skipped:no_chat_id" ? telegramResult : null]
      .filter(Boolean)
      .join(",");

    return new Response(
      JSON.stringify({
        ok: true,
        results: { [business_id]: channels || "no_channels" },
        digest,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("morning-digest error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

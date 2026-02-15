import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

// ─── Scrape website ──────────────────────────────────────────────────────────

async function scrapeWebsite(url: string): Promise<{ title: string; description: string; text: string }> {
  if (!url.startsWith("http")) url = "https://" + url;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ZuckerBot/1.0; +https://zuckerbot.ai)" },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.trim().replace(/\s*[-–|].*$/, "") || "";

  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const ogMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const description = metaMatch?.[1] || ogMatch?.[1] || "";

  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);

  return { title, description, text };
}

// ─── Generate brief via Claude ───────────────────────────────────────────────

async function generateBrief(businessName: string, url: string, scraped: { description: string; text: string }): Promise<{ markdown: string; briefId: string }> {
  const prompt = `You are a senior marketing strategist. Generate a comprehensive marketing strategy brief for this business.

Business: ${businessName}
Website: ${url}
Description: ${scraped.description}
Website content: ${scraped.text.slice(0, 3000)}

Write a detailed strategy brief in markdown format. Include:

# Marketing Strategy Brief: ${businessName}

## Executive Summary
(2-3 paragraphs about the business and the opportunity)

## Target Audiences
(3 detailed personas with demographics, interests, pain points)

## Campaign Strategy
(Recommended campaign structure, objectives, approach)

## Ad Creative Concepts
(3 ad concepts with headlines, copy angles, and visual direction)

## Budget & Timeline
(Recommended monthly budget, 90-day plan, expected ROI)

## Key Recommendations
(5-7 specific actionable recommendations)

Make it specific to this business. Be detailed and actionable.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.status}`);
  }

  const data = await res.json();
  const markdown = data.content?.[0]?.text || "";

  // Store in strategy_briefs table (no user_id or business_id for anonymous briefs)
  const { data: inserted, error } = await supabaseAdmin
    .from("strategy_briefs")
    .insert({
      brief_markdown: markdown,
      status: "generated",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[send-preview-brief] Insert error:", error);
    throw new Error("Failed to save brief");
  }

  return { markdown, briefId: inserted.id };
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, url, business_name } = await req.json();

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Valid email required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!url) {
      return new Response(
        JSON.stringify({ error: "Business URL required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-preview-brief] Processing: ${email} / ${url} / ${business_name}`);

    // Log the lead
    await supabaseAdmin.from("preview_leads").insert({
      email,
      url,
      business_name: business_name || "Unknown",
    }).catch((err) => console.error("[send-preview-brief] Lead log error:", err));

    // Send immediate confirmation email
    const confirmHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111;">Your strategy brief is being generated</h1>
        <p style="color: #444; font-size: 16px; line-height: 1.6;">
          We're building a detailed marketing strategy for <strong>${business_name || url}</strong>. You'll get a second email with the full brief in a few minutes.
        </p>
        <p style="color: #444; font-size: 16px; line-height: 1.6;">It includes:</p>
        <ul style="color: #444; font-size: 15px; line-height: 1.8;">
          <li>Target audience personas</li>
          <li>Campaign strategy and structure</li>
          <li>Ad creative concepts and copy</li>
          <li>Budget recommendations and ROI projections</li>
        </ul>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          <a href="https://zuckerbot.ai" style="color: #999;">zuckerbot.ai</a> — AI-powered ad campaigns
        </p>
      </div>
    `;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "ZuckerBot <hello@zuckerbot.ai>",
        to: [email],
        bcc: ["davisgrainger@gmail.com"],
        subject: `Generating your marketing strategy for ${business_name || "your business"}...`,
        html: confirmHtml,
      }),
    }).catch((err) => console.error("[send-preview-brief] Confirm email error:", err));

    // Scrape and generate brief
    let briefId: string | null = null;
    try {
      const scraped = await scrapeWebsite(url);
      const result = await generateBrief(business_name || scraped.title || url, url, scraped);
      briefId = result.briefId;
      console.log(`[send-preview-brief] Brief generated: ${briefId}`);
    } catch (err) {
      console.error("[send-preview-brief] Brief generation failed:", err);
    }

    // Send brief email if we got one
    if (briefId) {
      const briefLink = `https://zuckerbot.ai/brief/${briefId}`;

      const briefHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #111;">Your strategy brief is ready</h1>
          <p style="color: #444; font-size: 16px; line-height: 1.6;">
            The full marketing strategy for <strong>${business_name || url}</strong> has been generated.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${briefLink}" 
               style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              View Your Strategy Brief
            </a>
          </div>
          <p style="color: #444; font-size: 16px; line-height: 1.6;">
            Ready to put this into action?
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="https://zuckerbot.ai/auth" 
               style="display: inline-block; background: #111; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Start Free Trial — Launch Ads Now
            </a>
            <p style="color: #888; font-size: 13px; margin-top: 8px;">$49/mo after 7-day trial</p>
          </div>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            <a href="https://zuckerbot.ai" style="color: #999;">zuckerbot.ai</a> — AI-powered ad campaigns
          </p>
        </div>
      `;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "ZuckerBot <hello@zuckerbot.ai>",
          to: [email],
          bcc: ["davisgrainger@gmail.com"],
          subject: `Your marketing strategy for ${business_name || "your business"} is ready`,
          html: briefHtml,
        }),
      }).catch((err) => console.error("[send-preview-brief] Brief email error:", err));
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-preview-brief] Error:", error);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

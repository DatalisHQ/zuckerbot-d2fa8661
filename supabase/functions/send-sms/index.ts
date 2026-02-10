import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface SendSmsRequest {
  lead_id: string;
}

interface TwilioMessageResponse {
  sid?: string;
  status?: string;
  error_code?: number;
  error_message?: string;
}

// ─── Helper: Send SMS via Twilio REST API ────────────────────────────────────

async function sendTwilioSms(
  to: string,
  body: string,
  accountSid: string,
  authToken: string,
  fromPhone: string
): Promise<{ ok: boolean; data: TwilioMessageResponse }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  // Twilio uses HTTP Basic Auth
  const credentials = btoa(`${accountSid}:${authToken}`);

  const form = new URLSearchParams({
    To: to,
    From: fromPhone,
    Body: body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const data = (await res.json()) as TwilioMessageResponse;
  return { ok: res.ok, data };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth check ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Validate Twilio credentials ─────────────────────────────────────────
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      return new Response(
        JSON.stringify({ error: "Twilio credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Parse request body ──────────────────────────────────────────────────
    const { lead_id } = (await req.json()) as SendSmsRequest;

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "lead_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch lead ──────────────────────────────────────────────────────────
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, name, phone, email, suburb, business_id, sms_sent")
      .eq("id", lead_id)
      .single();

    if (leadErr || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch business ──────────────────────────────────────────────────────
    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("id, user_id, name, phone")
      .eq("id", lead.business_id)
      .single();

    if (bizErr || !business) {
      return new Response(
        JSON.stringify({ error: "Business not found for this lead" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify ownership — the authenticated user must own the business
    if (business.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "You do not own this lead's business" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[send-sms] Processing SMS for lead:", lead_id);
    console.log("[send-sms] Business:", business.name);

    const results: {
      lead_sms: { sent: boolean; error?: string; twilio_sid?: string };
      tradie_sms: { sent: boolean; error?: string; twilio_sid?: string };
    } = {
      lead_sms: { sent: false },
      tradie_sms: { sent: false },
    };

    // ── Step 1: Send SMS to lead ────────────────────────────────────────────
    if (lead.phone) {
      const leadMessage = `Thanks for reaching out to ${business.name}! We'll get back to you within the hour. Reply STOP to opt out.`;

      console.log("[send-sms] Sending SMS to lead:", lead.phone);

      const leadResult = await sendTwilioSms(
        lead.phone,
        leadMessage,
        twilioAccountSid,
        twilioAuthToken,
        twilioPhoneNumber
      );

      if (leadResult.ok && leadResult.data.sid) {
        results.lead_sms = { sent: true, twilio_sid: leadResult.data.sid };
        console.log("[send-sms] Lead SMS sent:", leadResult.data.sid);

        // Log to sms_log
        await supabase.from("sms_log").insert({
          lead_id: lead.id,
          to_phone: lead.phone,
          message: leadMessage,
          status: "sent",
          twilio_sid: leadResult.data.sid,
        });
      } else {
        const errMsg =
          leadResult.data.error_message || "Failed to send SMS to lead";
        results.lead_sms = { sent: false, error: errMsg };
        console.error("[send-sms] Lead SMS failed:", leadResult.data);

        // Log failure to sms_log
        await supabase.from("sms_log").insert({
          lead_id: lead.id,
          to_phone: lead.phone,
          message: leadMessage,
          status: "failed",
        });
      }
    } else {
      results.lead_sms = { sent: false, error: "Lead has no phone number" };
      console.warn("[send-sms] Lead has no phone number, skipping lead SMS");
    }

    // ── Step 2: Send notification SMS to tradie ─────────────────────────────
    if (business.phone) {
      const leadName = lead.name || "Unknown";
      const leadPhone = lead.phone || "N/A";
      const leadSuburb = lead.suburb || "unknown area";
      const tradieMessage = `New lead from Facebook! ${leadName} (${leadPhone}) in ${leadSuburb}. Reach out ASAP!`;

      console.log("[send-sms] Sending notification to tradie:", business.phone);

      const tradieResult = await sendTwilioSms(
        business.phone,
        tradieMessage,
        twilioAccountSid,
        twilioAuthToken,
        twilioPhoneNumber
      );

      if (tradieResult.ok && tradieResult.data.sid) {
        results.tradie_sms = { sent: true, twilio_sid: tradieResult.data.sid };
        console.log("[send-sms] Tradie SMS sent:", tradieResult.data.sid);

        // Log to sms_log
        await supabase.from("sms_log").insert({
          lead_id: lead.id,
          to_phone: business.phone,
          message: tradieMessage,
          status: "sent",
          twilio_sid: tradieResult.data.sid,
        });
      } else {
        const errMsg =
          tradieResult.data.error_message || "Failed to send SMS to tradie";
        results.tradie_sms = { sent: false, error: errMsg };
        console.error("[send-sms] Tradie SMS failed:", tradieResult.data);

        // Log failure to sms_log
        await supabase.from("sms_log").insert({
          lead_id: lead.id,
          to_phone: business.phone,
          message: tradieMessage,
          status: "failed",
        });
      }
    } else {
      results.tradie_sms = {
        sent: false,
        error: "Business has no phone number",
      };
      console.warn("[send-sms] Business has no phone number, skipping tradie SMS");
    }

    // ── Step 3: Mark lead as sms_sent ───────────────────────────────────────
    if (results.lead_sms.sent) {
      const { error: updateErr } = await supabase
        .from("leads")
        .update({ sms_sent: true })
        .eq("id", lead_id);

      if (updateErr) {
        console.warn("[send-sms] Failed to update lead sms_sent flag:", updateErr);
      }
    }

    console.log("[send-sms] Complete for lead:", lead_id);

    // ── Return response ─────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: results.lead_sms.sent || results.tradie_sms.sent,
        lead_sms: results.lead_sms,
        tradie_sms: results.tradie_sms,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[send-sms] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

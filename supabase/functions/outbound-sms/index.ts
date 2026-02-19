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
    const { to, body, prospect_id } = await req.json();

    if (!to || !body) {
      return new Response(
        JSON.stringify({ error: "to and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize AU phone to E.164 format (+61...)
    let normalizedTo = to.replace(/[\s\-()]/g, "");
    if (normalizedTo.startsWith("0")) {
      normalizedTo = "+61" + normalizedTo.slice(1);
    } else if (!normalizedTo.startsWith("+")) {
      normalizedTo = "+" + normalizedTo;
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const messagingServiceSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
    const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!accountSid || !authToken || (!messagingServiceSid && !fromPhone)) {
      return new Response(
        JSON.stringify({ error: "Twilio credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const form = new URLSearchParams({ To: normalizedTo, Body: body });
    if (messagingServiceSid) {
      form.set("MessagingServiceSid", messagingServiceSid);
    } else {
      form.set("From", fromPhone!);
    }

    const res = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[outbound-sms] Twilio error:", data);
      return new Response(
        JSON.stringify({ success: false, error: data.message || `Twilio error ${res.status}`, code: data.code }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update prospect if ID provided
    if (prospect_id) {
      const now = new Date().toISOString();
      const { data: prospect } = await supabase
        .from("outbound_prospects")
        .select("sms_count, first_sms_at")
        .eq("id", prospect_id)
        .single();

      await supabase
        .from("outbound_prospects")
        .update({
          status: "contacted",
          sms_count: (prospect?.sms_count || 0) + 1,
          last_sms_at: now,
          first_sms_at: prospect?.first_sms_at || now,
        })
        .eq("id", prospect_id);
    }

    console.log(`[outbound-sms] Sent to ${to}: ${data.sid}`);

    return new Response(
      JSON.stringify({ success: true, sid: data.sid, status: data.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[outbound-sms] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send SMS" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

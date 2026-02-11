// Auth Email Handler - Fast email delivery via Resend
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  type: 'signup' | 'signin' | 'recovery' | 'invite';
  email: string;
  token?: string;
  confirmation_url?: string;
  recovery_url?: string;
  invite_url?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { type, email, token, confirmation_url, recovery_url, invite_url }: EmailRequest = await req.json();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    let subject = "";
    let html = "";

    switch (type) {
      case 'signup':
      case 'signin':
        subject = "Sign in to ZuckerBot";
        html = `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Sign in to ZuckerBot</h2>
            <p>Click the button below to sign in to your account:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${confirmation_url}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Sign In Now
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">This link expires in 24 hours for security.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, ignore this email.</p>
          </div>
        `;
        break;

      case 'recovery':
        subject = "Reset your ZuckerBot password";
        html = `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Reset Your Password</h2>
            <p>Click the button below to reset your ZuckerBot password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${recovery_url}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">This link expires in 1 hour for security.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, ignore this email.</p>
          </div>
        `;
        break;

      default:
        throw new Error(`Unsupported email type: ${type}`);
    }

    // Send via Resend
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ZuckerBot <noreply@zuckerbot.ai>",
        to: [email],
        subject,
        html,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[auth-email] Resend error:", result);
      throw new Error(`Resend API error: ${result.message || 'Unknown error'}`);
    }

    console.log(`[auth-email] Sent ${type} email to ${email}, message ID: ${result.id}`);

    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("[auth-email] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
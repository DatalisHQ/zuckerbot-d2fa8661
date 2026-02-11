import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─── Meta OAuth Callback ─────────────────────────────────────────────────────
// Handles the redirect from Meta's OAuth dialog.
// URL: /functions/v1/facebook-oauth-callback?code=XXX&state=USER_JWT
//
// Flow:
// 1. User clicks "Connect Facebook" on Profile page
// 2. Redirected to facebook.com/dialog/oauth with our app ID
// 3. User grants permissions
// 4. Facebook redirects here with ?code=XXX&state=USER_JWT
// 5. We exchange the code for an access token
// 6. Fetch user's Pages and Ad Accounts
// 7. Store credentials on the businesses table
// 8. Redirect user back to /profile
// ─────────────────────────────────────────────────────────────────────────────

const META_APP_ID = "1119807469249263";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://zuckerbot.ai";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;

serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── Handle errors from Facebook ────────────────────────────────────────
  const fbError = url.searchParams.get("error");
  if (fbError) {
    const reason = url.searchParams.get("error_reason") || "unknown";
    console.error(`[fb-oauth] Facebook returned error: ${fbError} — ${reason}`);
    return Response.redirect(`${SITE_URL}/profile?fb_error=${encodeURIComponent(reason)}`, 302);
  }

  // ── Get code and state from query params ───────────────────────────────
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // This is the user's Supabase JWT

  if (!code || !state) {
    console.error("[fb-oauth] Missing code or state param");
    return Response.redirect(`${SITE_URL}/profile?fb_error=missing_params`, 302);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── Verify the user from the JWT in state ────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser(state);
    if (authError || !user) {
      console.error("[fb-oauth] Invalid user token:", authError?.message);
      return Response.redirect(`${SITE_URL}/profile?fb_error=auth_failed`, 302);
    }

    console.log(`[fb-oauth] Authenticated user: ${user.id} (${user.email})`);

    // ── Exchange code for access token ───────────────────────────────────
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?` +
      `client_id=${META_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&client_secret=${META_APP_SECRET}` +
      `&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("[fb-oauth] Token exchange failed:", tokenData);
      return Response.redirect(`${SITE_URL}/profile?fb_error=token_exchange_failed`, 302);
    }

    let accessToken = tokenData.access_token;
    console.log("[fb-oauth] Got short-lived token");

    // ── Exchange for long-lived token ────────────────────────────────────
    try {
      const llUrl = `https://graph.facebook.com/v21.0/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${META_APP_ID}` +
        `&client_secret=${META_APP_SECRET}` +
        `&fb_exchange_token=${accessToken}`;

      const llRes = await fetch(llUrl);
      const llData = await llRes.json();

      if (llRes.ok && llData.access_token) {
        accessToken = llData.access_token;
        const expiresInDays = Math.round((llData.expires_in || 0) / 86400);
        console.log(`[fb-oauth] Got long-lived token (expires in ~${expiresInDays} days)`);
      } else {
        console.warn("[fb-oauth] Long-lived exchange failed, using short-lived token");
      }
    } catch (e) {
      console.warn("[fb-oauth] Long-lived exchange error:", e.message);
    }

    // ── Fetch user's Facebook Pages ──────────────────────────────────────
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token`
    );
    const pagesData = await pagesRes.json();

    let pageId: string | null = null;
    let pageAccessToken: string | null = null;

    if (pagesData.data && pagesData.data.length > 0) {
      // Use the first page (most users only have one business page)
      pageId = pagesData.data[0].id;
      pageAccessToken = pagesData.data[0].access_token;
      console.log(`[fb-oauth] Found page: ${pagesData.data[0].name} (${pageId})`);
    } else {
      console.warn("[fb-oauth] No Facebook Pages found for this user");
    }

    // ── Fetch user's Ad Accounts ─────────────────────────────────────────
    const adAccountsRes = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?access_token=${accessToken}&fields=id,name,account_status`
    );
    const adAccountsData = await adAccountsRes.json();

    let adAccountId: string | null = null;

    if (adAccountsData.data && adAccountsData.data.length > 0) {
      // Find first active ad account
      const active = adAccountsData.data.find((a: any) => a.account_status === 1);
      adAccountId = (active || adAccountsData.data[0]).id;
      console.log(`[fb-oauth] Found ad account: ${adAccountId}`);
    } else {
      console.warn("[fb-oauth] No ad accounts found for this user");
    }

    // ── Update the business record ───────────────────────────────────────
    const updateData: Record<string, any> = {
      facebook_access_token: accessToken,
    };

    if (pageId) updateData.facebook_page_id = pageId;
    if (adAccountId) updateData.facebook_ad_account_id = adAccountId;

    const { error: updateError } = await supabase
      .from("businesses")
      .update(updateData)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[fb-oauth] Failed to update business:", updateError);
      return Response.redirect(`${SITE_URL}/profile?fb_error=save_failed`, 302);
    }

    // Also update profiles.facebook_connected flag
    await supabase
      .from("profiles")
      .update({ facebook_connected: true })
      .eq("user_id", user.id);

    console.log(`[fb-oauth] ✅ Facebook connected for user ${user.id}`);
    console.log(`[fb-oauth]   Page: ${pageId || "none"}`);
    console.log(`[fb-oauth]   Ad Account: ${adAccountId || "none"}`);

    // ── Redirect back to profile with success ────────────────────────────
    const successParams = new URLSearchParams({
      fb_connected: "true",
      ...(pageId ? { fb_page: pageId } : {}),
      ...(adAccountId ? { fb_ad_account: adAccountId } : {}),
      ...(!pageId && !adAccountId ? { fb_warning: "no_accounts" } : {}),
    });

    return Response.redirect(`${SITE_URL}/profile?${successParams.toString()}`, 302);

  } catch (error) {
    console.error("[fb-oauth] Unexpected error:", error);
    return Response.redirect(`${SITE_URL}/profile?fb_error=unexpected`, 302);
  }
});

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get all data to see what exists
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const { data: profiles } = await supabaseAdmin.from("profiles").select("*");
    const { data: businesses } = await supabaseAdmin.from("businesses").select("*");
    const { data: campaigns } = await supabaseAdmin.from("campaigns").select("*");
    const { data: leads } = await supabaseAdmin.from("leads").select("*");

    const response = {
      auth_users_count: authUsers?.users?.length || 0,
      auth_users: authUsers?.users || [],
      profiles_count: profiles?.length || 0,
      profiles: profiles || [],
      businesses_count: businesses?.length || 0,  
      businesses: businesses || [],
      campaigns_count: campaigns?.length || 0,
      campaigns: campaigns || [],
      leads_count: leads?.length || 0,
      leads: leads || [],
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[debug-data] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
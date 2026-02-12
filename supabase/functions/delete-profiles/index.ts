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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const emailsToDelete = ['davisgrainger@gmail.com', 'davis@datalis.app'];
    const results = [];
    
    for (const email of emailsToDelete) {
      console.log(`🔍 Looking for user: ${email}`);
      
      // Find the user in auth.users
      const { data: users, error: userError } = await supabase.auth.admin.listUsers();
      if (userError) {
        console.error('Error listing users:', userError);
        results.push({ email, status: 'error', message: userError.message });
        continue;
      }
      
      const user = users.users.find(u => u.email === email);
      if (!user) {
        console.log(`❌ User not found: ${email}`);
        results.push({ email, status: 'not_found', message: 'User not found' });
        continue;
      }
      
      console.log(`✅ Found user: ${user.id} (${email})`);
      
      const userId = user.id;
      
      // Delete campaigns first (cascade from businesses)
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', userId);
        
      if (businesses && businesses.length > 0) {
        const businessIds = businesses.map(b => b.id);
        
        // Delete campaigns
        const { error: campaignError } = await supabase
          .from('campaigns')
          .delete()
          .in('business_id', businessIds);
        
        if (campaignError) console.log('Campaign deletion error:', campaignError);
        
        // Delete leads
        const { error: leadsError } = await supabase
          .from('leads')
          .delete()
          .in('business_id', businessIds);
        
        if (leadsError) console.log('Leads deletion error:', leadsError);
        
        // Delete SMS logs
        const { error: smsError } = await supabase
          .from('sms_log')
          .delete()
          .in('business_id', businessIds);
        
        if (smsError) console.log('SMS deletion error:', smsError);
      }
      
      // Delete businesses
      const { error: businessError } = await supabase
        .from('businesses')
        .delete()
        .eq('user_id', userId);
      
      if (businessError) console.log('Business deletion error:', businessError);
      
      // Delete profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId);
      
      if (profileError) console.log('Profile deletion error:', profileError);
      
      // Delete the auth user
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
      
      if (authDeleteError) {
        console.error(`❌ Error deleting auth user ${email}:`, authDeleteError);
        results.push({ email, status: 'error', message: authDeleteError.message });
      } else {
        console.log(`✅ Successfully deleted user: ${email}`);
        results.push({ email, status: 'deleted', message: 'Successfully deleted' });
      }
    }
    
    return new Response(
      JSON.stringify({ success: true, results }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("Delete profiles error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
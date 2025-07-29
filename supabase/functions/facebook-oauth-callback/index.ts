import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's Facebook identity
    const facebookIdentity = user.identities?.find(identity => identity.provider === 'facebook');
    
    if (!facebookIdentity || !facebookIdentity.identity_data) {
      return new Response(
        JSON.stringify({ error: 'Facebook identity not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract Facebook access token from user metadata or session
    let accessToken = user.user_metadata?.provider_token;
    
    // Try alternative locations for the access token
    if (!accessToken) {
      accessToken = user.app_metadata?.provider_token;
    }
    
    // Try to get from the current session
    if (!accessToken) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      accessToken = session?.provider_token;
    }
    
    // Get token from Facebook identity data
    if (!accessToken && facebookIdentity.identity_data) {
      accessToken = facebookIdentity.identity_data.provider_token;
    }
    
    if (!accessToken) {
      console.error('Facebook access token not found in any location');
      console.log('User metadata:', JSON.stringify(user.user_metadata, null, 2));
      console.log('App metadata:', JSON.stringify(user.app_metadata, null, 2));
      console.log('Identity data:', JSON.stringify(facebookIdentity.identity_data, null, 2));
      
      return new Response(
        JSON.stringify({ error: 'Facebook access token not available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Facebook access token found, fetching business info...');

    // Get user's business accounts to find business ID
    const businessResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/businesses?access_token=${accessToken}`
    );

    let businessId = null;
    if (businessResponse.ok) {
      const businessData = await businessResponse.json();
      if (businessData.data && businessData.data.length > 0) {
        businessId = businessData.data[0].id;
      }
    }

    // Update user profile with Facebook tokens
    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({
        facebook_connected: true,
        facebook_access_token: accessToken,
        facebook_business_id: businessId
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully stored Facebook tokens for user:', user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Facebook tokens stored successfully',
        hasBusinessId: !!businessId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in facebook-oauth-callback:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
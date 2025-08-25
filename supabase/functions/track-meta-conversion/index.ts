import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConversionEventData {
  event_name: string;
  event_id: string;
  user_data?: {
    email?: string;
    phone?: string;
    external_id?: string;
    client_ip_address?: string;
    client_user_agent?: string;
  };
  custom_data?: Record<string, any>;
  source_url: string;
  test_code?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== META CONVERSIONS API TRACKING START ===');
    console.log('Request timestamp:', new Date().toISOString());

    // Get environment variables
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const META_PIXEL_ID = Deno.env.get('META_PIXEL_ID');
    const META_CAPI_TOKEN = Deno.env.get('META_CAPI_TOKEN');
    const STAPE_ENDPOINT = Deno.env.get('STAPE_ENDPOINT');
    const STAPE_AUTH = Deno.env.get('STAPE_AUTH');
    const META_TRANSPORT = Deno.env.get('META_TRANSPORT') || 'stape';
    const META_TEST_EVENT_CODE = Deno.env.get('META_TEST_EVENT_CODE');

    console.log('🔧 Transport configuration:');
    console.log('- Meta Pixel ID available:', !!META_PIXEL_ID);
    console.log('- CAPI token available:', !!META_CAPI_TOKEN);
    console.log('- Stape endpoint available:', !!STAPE_ENDPOINT);
    console.log('- Transport mode:', META_TRANSPORT);

    // Validate required configuration
    if (!META_PIXEL_ID) {
      console.error('❌ META_PIXEL_ID not configured');
      return new Response(
        JSON.stringify({ 
          error: 'Meta Pixel ID not configured',
          success: false 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const eventData: ConversionEventData = await req.json();
    console.log('📊 Event data received:', {
      event_name: eventData.event_name,
      event_id: eventData.event_id?.slice(0, 8) + '****',
      has_user_data: !!eventData.user_data,
      source_url: eventData.source_url
    });

    // Skip tracking if transport is disabled
    if (META_TRANSPORT === 'off') {
      console.log('🚫 Meta tracking disabled via META_TRANSPORT=off');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Tracking disabled',
          transport: META_TRANSPORT 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let success = false;
    let details: any = {};

    // Route to appropriate transport
    if (META_TRANSPORT === 'stape' && STAPE_ENDPOINT) {
      success = await sendViaStape(eventData, STAPE_ENDPOINT, STAPE_AUTH, META_PIXEL_ID, META_TEST_EVENT_CODE);
      details.transport = 'stape';
    } else if (META_TRANSPORT === 'direct' && META_CAPI_TOKEN) {
      success = await sendDirectCAPI(eventData, META_PIXEL_ID, META_CAPI_TOKEN, META_TEST_EVENT_CODE);
      details.transport = 'direct';
    } else {
      console.error('❌ Invalid transport configuration');
      return new Response(
        JSON.stringify({ 
          error: 'Invalid transport configuration',
          transport: META_TRANSPORT,
          success: false 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (success) {
      console.log('✅ Conversion event sent successfully');
      return new Response(
        JSON.stringify({ 
          success: true,
          event_id: eventData.event_id,
          ...details
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.error('❌ Failed to send conversion event');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to send conversion event',
          ...details
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('❌ Meta conversion tracking error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: String(error),
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Send via Stape (Server-side GTM)
async function sendViaStape(
  eventData: ConversionEventData,
  stapeEndpoint: string,
  stapeAuth: string | undefined,
  pixelId: string,
  testCode?: string
): Promise<boolean> {
  try {
    console.log('📡 Sending via Stape to:', stapeEndpoint.slice(0, 30) + '***');

    const stapePayload = {
      pixel_id: pixelId,
      event_name: eventData.event_name,
      event_id: eventData.event_id,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: eventData.source_url,
      user_data: eventData.user_data || {},
      custom_data: eventData.custom_data || {},
      test_event_code: testCode || eventData.test_code,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add auth header if provided
    if (stapeAuth) {
      headers['Authorization'] = `Bearer ${stapeAuth}`;
    }

    const response = await fetch(stapeEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(stapePayload)
    });

    const responseText = await response.text();
    
    if (response.ok) {
      console.log('✅ Stape response successful');
      return true;
    } else {
      console.error('❌ Stape error:', response.status, responseText);
      return false;
    }

  } catch (error) {
    console.error('❌ Stape transport error:', error);
    return false;
  }
}

// Send directly to Meta CAPI
async function sendDirectCAPI(
  eventData: ConversionEventData,
  pixelId: string,
  capiToken: string,
  testCode?: string
): Promise<boolean> {
  try {
    console.log('📡 Sending direct to Meta CAPI for pixel:', pixelId.slice(0, 4) + '****');

    const capiPayload = {
      data: [{
        event_name: eventData.event_name,
        event_id: eventData.event_id,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: eventData.source_url,
        user_data: eventData.user_data || {},
        custom_data: eventData.custom_data || {},
      }],
      test_event_code: testCode || eventData.test_code,
    };

    const url = `https://graph.facebook.com/v22.0/${pixelId}/events?access_token=${capiToken}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(capiPayload)
    });

    const responseData = await response.json();
    
    if (response.ok && !responseData.error) {
      console.log('✅ Direct CAPI response successful');
      console.log('- Events received:', responseData.events_received || 0);
      return true;
    } else {
      console.error('❌ Direct CAPI error:', responseData);
      return false;
    }

  } catch (error) {
    console.error('❌ Direct CAPI transport error:', error);
    return false;
  }
}
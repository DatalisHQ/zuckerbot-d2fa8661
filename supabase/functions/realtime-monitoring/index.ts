import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import FirecrawlApp from 'https://esm.sh/@mendable/firecrawl-js@1.7.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (action) {
      case 'create_monitoring':
        return await createMonitoring(supabase, params);
      case 'run_monitoring_checks':
        return await runMonitoringChecks(supabase);
      case 'get_alerts':
        return await getAlerts(supabase, params);
      case 'mark_alert_read':
        return await markAlertRead(supabase, params);
      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    console.error('Error in realtime-monitoring function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function createMonitoring(supabase: any, params: any) {
  const { userId, competitorName, competitorUrl, monitoringType, checkFrequency } = params;

  console.log(`Creating monitoring for: ${competitorName}`);

  const { data, error } = await supabase
    .from('monitoring_config')
    .insert({
      user_id: userId,
      competitor_name: competitorName,
      competitor_url: competitorUrl,
      monitoring_type: monitoringType,
      check_frequency_hours: checkFrequency,
      alert_threshold: {
        pricing_change: true,
        content_change: true,
        social_activity: true
      }
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating monitoring config:', error);
    throw error;
  }

  // Run initial check
  await performMonitoringCheck(supabase, data);

  return new Response(
    JSON.stringify({
      success: true,
      monitoringId: data.id,
      message: 'Monitoring setup complete'
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function runMonitoringChecks(supabase: any) {
  console.log('Running scheduled monitoring checks...');

  // Get all active monitoring configurations
  const { data: configs, error } = await supabase
    .from('monitoring_config')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching monitoring configs:', error);
    throw error;
  }

  const results = [];
  for (const config of configs) {
    try {
      const result = await performMonitoringCheck(supabase, config);
      results.push(result);
    } catch (error) {
      console.error(`Error monitoring ${config.competitor_name}:`, error);
      results.push({ error: error.message, config: config.id });
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      checksCompleted: results.length,
      results
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function performMonitoringCheck(supabase: any, config: any) {
  console.log(`Performing monitoring check for: ${config.competitor_name}`);

  const currentData: any = {
    timestamp: new Date().toISOString(),
    competitor_name: config.competitor_name,
    competitor_url: config.competitor_url
  };

  try {
    // Scrape current website state
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (firecrawlApiKey) {
      const firecrawlApp = new FirecrawlApp({ apiKey: firecrawlApiKey });
      
      const scrapeResult = await firecrawlApp.scrapeUrl(config.competitor_url, {
        formats: ['markdown'],
        includeTags: ['h1', 'h2', 'h3', 'p', 'div', 'nav'],
        excludeTags: ['script', 'style'],
      });

      if (scrapeResult.success) {
        const content = scrapeResult.data?.markdown || '';
        currentData.content = content.slice(0, 5000); // Store first 5k chars
        currentData.content_hash = await hashString(content);
        
        // Extract pricing information (simple pattern matching)
        const pricingMatches = content.match(/\$\d+(?:\.\d{2})?(?:\/month|\/year)?/g) || [];
        currentData.pricing_mentions = pricingMatches.slice(0, 10); // Store up to 10 pricing mentions
      }
    }

    // Get previous monitoring data for comparison
    const { data: previousHistory } = await supabase
      .from('monitoring_history')
      .select('monitoring_data')
      .eq('monitoring_config_id', config.id)
      .eq('status', 'success')
      .order('check_timestamp', { ascending: false })
      .limit(1);

    let detectedChanges: any = {};
    let alertsToCreate = [];

    if (previousHistory && previousHistory.length > 0) {
      const previousData = previousHistory[0].monitoring_data;
      
      // Compare content hash
      if (currentData.content_hash && previousData.content_hash) {
        if (currentData.content_hash !== previousData.content_hash) {
          detectedChanges.content_changed = true;
          alertsToCreate.push({
            alert_type: 'content_change',
            severity: 'medium',
            title: `Content update detected on ${config.competitor_name}`,
            description: 'Website content has been modified since last check'
          });
        }
      }

      // Compare pricing mentions
      if (currentData.pricing_mentions && previousData.pricing_mentions) {
        const currentPricing = new Set(currentData.pricing_mentions);
        const previousPricing = new Set(previousData.pricing_mentions);
        
        const newPricing = [...currentPricing].filter(p => !previousPricing.has(p));
        const removedPricing = [...previousPricing].filter(p => !currentPricing.has(p));
        
        if (newPricing.length > 0 || removedPricing.length > 0) {
          detectedChanges.pricing_changed = true;
          detectedChanges.new_pricing = newPricing;
          detectedChanges.removed_pricing = removedPricing;
          
          alertsToCreate.push({
            alert_type: 'pricing_change',
            severity: 'high',
            title: `Pricing changes detected on ${config.competitor_name}`,
            description: `New pricing: ${newPricing.join(', ')} | Removed: ${removedPricing.join(', ')}`
          });
        }
      }
    }

    // Store monitoring history
    await supabase
      .from('monitoring_history')
      .insert({
        monitoring_config_id: config.id,
        monitoring_data: currentData,
        changes_detected: detectedChanges,
        status: 'success'
      });

    // Create alerts if changes detected
    for (const alert of alertsToCreate) {
      await supabase
        .from('monitoring_alerts')
        .insert({
          user_id: config.user_id,
          monitoring_config_id: config.id,
          ...alert,
          detected_changes: detectedChanges,
          previous_state: previousHistory?.[0]?.monitoring_data || {},
          current_state: currentData
        });
    }

    return {
      success: true,
      config_id: config.id,
      changes_detected: Object.keys(detectedChanges).length > 0,
      alerts_created: alertsToCreate.length
    };

  } catch (error) {
    console.error(`Error in monitoring check for ${config.competitor_name}:`, error);
    
    // Store failed monitoring attempt
    await supabase
      .from('monitoring_history')
      .insert({
        monitoring_config_id: config.id,
        monitoring_data: currentData,
        status: 'error',
        error_message: error.message
      });

    throw error;
  }
}

async function getAlerts(supabase: any, params: any) {
  const { userId, limit = 50 } = params;

  const { data, error } = await supabase
    .from('monitoring_alerts')
    .select(`
      *,
      monitoring_config:monitoring_config_id (
        competitor_name,
        competitor_url
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching alerts:', error);
    throw error;
  }

  return new Response(
    JSON.stringify({
      success: true,
      alerts: data,
      total: data.length
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function markAlertRead(supabase: any, params: any) {
  const { alertId, userId } = params;

  const { error } = await supabase
    .from('monitoring_alerts')
    .update({ is_read: true })
    .eq('id', alertId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error marking alert as read:', error);
    throw error;
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Alert marked as read'
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// Simple hash function for content comparison
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
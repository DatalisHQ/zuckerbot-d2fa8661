import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
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

    // Get the current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Get user's Facebook access token from profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('facebook_access_token, facebook_business_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile?.facebook_access_token) {
      throw new Error('Facebook account not connected');
    }

    const accessToken = profile.facebook_access_token;
    const businessId = profile.facebook_business_id;

    console.log('Starting Facebook Ads data sync for user:', user.id);

    // Fetch campaigns from Facebook Marketing API
    const campaignFields = 'id,name,objective,status,daily_budget,lifetime_budget,start_time,end_time,created_time,updated_time';
    const campaignsResponse = await fetch(
      `https://graph.facebook.com/v18.0/act_${businessId}/campaigns?fields=${campaignFields}&access_token=${accessToken}`
    );

    if (!campaignsResponse.ok) {
      throw new Error(`Facebook API error: ${campaignsResponse.statusText}`);
    }

    const campaignsData = await campaignsResponse.json();
    
    if (campaignsData.error) {
      throw new Error(`Facebook API error: ${campaignsData.error.message}`);
    }

    // Store campaigns in database
    const campaigns = campaignsData.data || [];
    for (const campaign of campaigns) {
      const { error: campaignError } = await supabaseClient
        .from('facebook_campaigns')
        .upsert({
          user_id: user.id,
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          objective: campaign.objective,
          status: campaign.status,
          daily_budget: campaign.daily_budget ? parseFloat(campaign.daily_budget) : null,
          lifetime_budget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) : null,
          start_time: campaign.start_time,
          end_time: campaign.end_time,
          created_time: campaign.created_time,
          updated_time: campaign.updated_time,
          raw_data: campaign
        }, {
          onConflict: 'user_id,campaign_id'
        });

      if (campaignError) {
        console.error('Error storing campaign:', campaignError);
      }
    }

    // Function to calculate aggregated metrics for different time windows
    const calculateAggregates = (metricsArray: any[], windowDays: number) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - windowDays);
      
      const filtered = metricsArray.filter(m => new Date(m.date_start) >= cutoffDate);
      if (filtered.length === 0) return null;
      
      const totals = filtered.reduce((acc, m) => ({
        impressions: acc.impressions + (parseInt(m.impressions) || 0),
        clicks: acc.clicks + (parseInt(m.clicks) || 0),
        spend: acc.spend + (parseFloat(m.spend) || 0),
        reach: acc.reach + (parseInt(m.reach) || 0),
        conversions: acc.conversions + (parseInt(m.conversions) || 0)
      }), { impressions: 0, clicks: 0, spend: 0, reach: 0, conversions: 0 });
      
      return {
        ...totals,
        ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
        cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
        cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
        roas: totals.spend > 0 ? totals.conversions * 50 / totals.spend : 0, // Assuming $50 avg order value
        frequency: totals.reach > 0 ? totals.impressions / totals.reach : 0
      };
    };

    // Fetch insights/metrics for the last 90 days to support multiple windows
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStart = ninetyDaysAgo.toISOString().split('T')[0];
    const dateEnd = new Date().toISOString().split('T')[0];

    const metricsFields = 'impressions,clicks,spend,reach,frequency,ctr,cpc,cpm,cpp,conversions';
    
    // Collect all metrics for aggregation
    const allMetrics = [];
    
    for (const campaign of campaigns) {
      try {
        const insightsResponse = await fetch(
          `https://graph.facebook.com/v18.0/${campaign.id}/insights?fields=${metricsFields}&time_range={"since":"${dateStart}","until":"${dateEnd}"}&access_token=${accessToken}`
        );

        if (insightsResponse.ok) {
          const insightsData = await insightsResponse.json();
          const insights = insightsData.data || [];

          for (const insight of insights) {
            allMetrics.push({ ...insight, campaign_id: campaign.id });
            
            const { error: metricsError } = await supabaseClient
              .from('facebook_ad_metrics')
              .upsert({
                user_id: user.id,
                campaign_id: campaign.id,
                date_start: insight.date_start,
                date_stop: insight.date_stop,
                impressions: parseInt(insight.impressions) || 0,
                clicks: parseInt(insight.clicks) || 0,
                spend: parseFloat(insight.spend) || 0,
                reach: parseInt(insight.reach) || 0,
                frequency: parseFloat(insight.frequency) || 0,
                ctr: parseFloat(insight.ctr) || 0,
                cpc: parseFloat(insight.cpc) || 0,
                cpm: parseFloat(insight.cpm) || 0,
                cpp: parseFloat(insight.cpp) || 0,
                conversions: parseInt(insight.conversions) || 0,
                raw_data: insight
              }, {
                onConflict: 'user_id,campaign_id,adset_id,ad_id,date_start,date_stop'
              });

            if (metricsError) {
              console.error('Error storing metrics:', metricsError);
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching insights for campaign ${campaign.id}:`, error);
      }
    }

    // Store aggregated metrics for different time windows
    const windows = [
      { days: 7, key: '7d' },
      { days: 30, key: '30d' },
      { days: 90, key: '90d' }
    ];

    for (const window of windows) {
      const aggregates = calculateAggregates(allMetrics, window.days);
      
      if (aggregates) {
        // Store account-level summary
        await supabaseClient
          .from('fb_metrics_cache')
          .upsert({
            user_id: user.id,
            ad_account_id: `act_${businessId}`,
            cache_key: 'summary',
            time_window: window.key,
            metrics_data: aggregates,
            entity_metrics: { campaigns: campaigns.length, total_spend: aggregates.spend },
            cached_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
          });
      }
    }

    // Fetch audiences (saved audiences)
    try {
      const audiencesResponse = await fetch(
        `https://graph.facebook.com/v18.0/act_${businessId}/saved_audiences?fields=id,name,description,audience_size,targeting&access_token=${accessToken}`
      );

      if (audiencesResponse.ok) {
        const audiencesData = await audiencesResponse.json();
        const audiences = audiencesData.data || [];

        for (const audience of audiences) {
          const { error: audienceError } = await supabaseClient
            .from('facebook_audiences')
            .upsert({
              user_id: user.id,
              audience_id: audience.id,
              audience_name: audience.name,
              audience_type: 'saved',
              audience_size: audience.audience_size,
              description: audience.description,
              demographics: audience.targeting?.age_max || audience.targeting?.age_min ? {
                age_min: audience.targeting.age_min,
                age_max: audience.targeting.age_max,
                genders: audience.targeting.genders
              } : null,
              interests: audience.targeting?.interests,
              behaviors: audience.targeting?.behaviors,
              raw_data: audience
            }, {
              onConflict: 'user_id,audience_id'
            });

          if (audienceError) {
            console.error('Error storing audience:', audienceError);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching audiences:', error);
    }

    console.log('Facebook Ads sync completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        campaigns_synced: campaigns.length,
        message: 'Facebook Ads data synced successfully' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-facebook-ads function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
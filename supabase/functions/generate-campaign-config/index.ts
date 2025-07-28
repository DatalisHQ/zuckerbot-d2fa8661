import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AudienceSegment {
  segment: string;
  criteria: string;
}

interface CampaignSettings {
  brandUrl: string;
  competitorProfiles: { name: string; valueProps: string[]; toneProfile: string }[];
  selectedSegments: AudienceSegment[];
  campaignGoal: string;
  budget: { amount: number; type: 'DAILY' | 'LIFETIME' };
  audienceType: 'NEW' | 'RETARGET';
  geos: string[];
  lookbackDays?: number;
  placements: string[];
}

interface CampaignConfigJSON {
  campaign: {
    name: string;
    objective: string;
    status: string;
    special_ad_categories?: string[];
  };
  adSets: Array<{
    name: string;
    campaign_id: string;
    optimization_goal: string;
    billing_event: string;
    bid_amount?: number;
    daily_budget?: number;
    lifetime_budget?: number;
    targeting: {
      geo_locations?: {
        countries: string[];
      };
      custom_audiences?: string[];
      interests?: Array<{
        id: string;
        name: string;
      }>;
      age_min?: number;
      age_max?: number;
      genders?: number[];
    };
    publisher_platforms: string[];
    facebook_positions?: string[];
    instagram_positions?: string[];
    status: string;
  }>;
  ads: Array<{
    name: string;
    adset_id: string;
    creative: {
      name: string;
      object_story_spec: {
        page_id: string;
        link_data?: {
          link: string;
          message: string;
          name?: string;
          description?: string;
          call_to_action?: {
            type: string;
          };
        };
      };
    };
    status: string;
  }>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const settings: CampaignSettings = await req.json();
    console.log('Generating campaign config for:', settings);

    // Extract brand name from URL for naming
    const brandName = settings.brandUrl.replace(/^https?:\/\//, '').replace(/\..+$/, '');
    const timestamp = new Date().toISOString().slice(0, 10);

    // Map placement IDs to Facebook API format
    const placementMapping: Record<string, { platform: string; position?: string }> = {
      'facebook_feeds': { platform: 'facebook', position: 'feed' },
      'facebook_right_hand_column': { platform: 'facebook', position: 'right_hand_column' },
      'facebook_marketplace': { platform: 'facebook', position: 'marketplace' },
      'facebook_video_feeds': { platform: 'facebook', position: 'video_feeds' },
      'facebook_stories': { platform: 'facebook', position: 'story' },
      'instagram_feed': { platform: 'instagram', position: 'stream' },
      'instagram_stories': { platform: 'instagram', position: 'story' },
      'instagram_reels': { platform: 'instagram', position: 'reels' },
      'audience_network': { platform: 'audience_network' }
    };

    // Group placements by platform
    const platforms = new Set<string>();
    const facebookPositions: string[] = [];
    const instagramPositions: string[] = [];

    settings.placements.forEach(placementId => {
      const mapping = placementMapping[placementId];
      if (mapping) {
        platforms.add(mapping.platform);
        if (mapping.platform === 'facebook' && mapping.position) {
          facebookPositions.push(mapping.position);
        } else if (mapping.platform === 'instagram' && mapping.position) {
          instagramPositions.push(mapping.position);
        }
      }
    });

    // Map country names to Facebook country codes (simplified mapping)
    const countryMapping: Record<string, string> = {
      'United States': 'US',
      'Canada': 'CA',
      'United Kingdom': 'GB',
      'Australia': 'AU',
      'Germany': 'DE',
      'France': 'FR',
      'Spain': 'ES',
      'Italy': 'IT',
      'Netherlands': 'NL',
      'Japan': 'JP',
      'South Korea': 'KR',
      'Brazil': 'BR'
    };

    const countryCodes = settings.geos.map(geo => countryMapping[geo] || geo);

    // Build campaign config
    const campaignConfig: CampaignConfigJSON = {
      campaign: {
        name: `${brandName} - ${settings.campaignGoal} Campaign - ${timestamp}`,
        objective: settings.campaignGoal,
        status: 'PAUSED' // Start paused for review
      },
      adSets: [],
      ads: []
    };

    // Create ad sets based on audience type
    if (settings.audienceType === 'NEW') {
      // Create one ad set for new users with geographic targeting
      const adSet = {
        name: `${brandName} - New Users - ${countryCodes.join(', ')}`,
        campaign_id: 'CAMPAIGN_ID_PLACEHOLDER',
        optimization_goal: getOptimizationGoal(settings.campaignGoal),
        billing_event: getBillingEvent(settings.campaignGoal),
        ...(settings.budget.type === 'DAILY' 
          ? { daily_budget: settings.budget.amount * 100 } // Facebook expects cents
          : { lifetime_budget: settings.budget.amount * 100 }
        ),
        targeting: {
          geo_locations: {
            countries: countryCodes
          },
          age_min: 18,
          age_max: 65,
          genders: [1, 2] // All genders
        },
        publisher_platforms: Array.from(platforms),
        ...(facebookPositions.length > 0 && { facebook_positions: facebookPositions }),
        ...(instagramPositions.length > 0 && { instagram_positions: instagramPositions }),
        status: 'PAUSED'
      };

      campaignConfig.adSets.push(adSet);
    } else {
      // Create ad set for retargeting website visitors
      const adSet = {
        name: `${brandName} - Website Retarget - ${settings.lookbackDays}d`,
        campaign_id: 'CAMPAIGN_ID_PLACEHOLDER',
        optimization_goal: getOptimizationGoal(settings.campaignGoal),
        billing_event: getBillingEvent(settings.campaignGoal),
        ...(settings.budget.type === 'DAILY' 
          ? { daily_budget: settings.budget.amount * 100 }
          : { lifetime_budget: settings.budget.amount * 100 }
        ),
        targeting: {
          custom_audiences: [`website_visitors_${settings.lookbackDays}_days`],
          age_min: 18,
          age_max: 65,
          genders: [1, 2]
        },
        publisher_platforms: Array.from(platforms),
        ...(facebookPositions.length > 0 && { facebook_positions: facebookPositions }),
        ...(instagramPositions.length > 0 && { instagram_positions: instagramPositions }),
        status: 'PAUSED'
      };

      campaignConfig.adSets.push(adSet);
    }

    // Create placeholder ads for each ad set
    campaignConfig.adSets.forEach((adSet, index) => {
      const ad = {
        name: `${brandName} - Ad ${index + 1}`,
        adset_id: 'ADSET_ID_PLACEHOLDER',
        creative: {
          name: `${brandName} - Creative ${index + 1}`,
          object_story_spec: {
            page_id: 'PAGE_ID_PLACEHOLDER',
            link_data: {
              link: settings.brandUrl,
              message: 'Generated ad copy will go here',
              name: 'Ad Headline',
              description: 'Ad description will be generated',
              call_to_action: {
                type: getCallToActionType(settings.campaignGoal)
              }
            }
          }
        },
        status: 'PAUSED'
      };

      campaignConfig.ads.push(ad);
    });

    console.log('Generated campaign config:', JSON.stringify(campaignConfig, null, 2));

    return new Response(JSON.stringify(campaignConfig), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-campaign-config function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getOptimizationGoal(campaignGoal: string): string {
  const mapping: Record<string, string> = {
    'CONVERSIONS': 'CONVERSIONS',
    'LEAD_GENERATION': 'LEAD_GENERATION',
    'APP_INSTALLS': 'APP_INSTALLS',
    'PAGE_LIKES': 'PAGE_LIKES'
  };
  return mapping[campaignGoal] || 'LINK_CLICKS';
}

function getBillingEvent(campaignGoal: string): string {
  const mapping: Record<string, string> = {
    'CONVERSIONS': 'IMPRESSIONS',
    'LEAD_GENERATION': 'IMPRESSIONS',
    'APP_INSTALLS': 'IMPRESSIONS',
    'PAGE_LIKES': 'IMPRESSIONS'
  };
  return mapping[campaignGoal] || 'LINK_CLICKS';
}

function getCallToActionType(campaignGoal: string): string {
  const mapping: Record<string, string> = {
    'CONVERSIONS': 'SHOP_NOW',
    'LEAD_GENERATION': 'SIGN_UP',
    'APP_INSTALLS': 'INSTALL_NOW',
    'PAGE_LIKES': 'LIKE_PAGE'
  };
  return mapping[campaignGoal] || 'LEARN_MORE';
}
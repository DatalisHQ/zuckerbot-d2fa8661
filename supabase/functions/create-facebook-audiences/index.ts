import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audienceSegments, adAccountId } = await req.json();

    console.log('Creating Facebook audiences for segments:', audienceSegments?.length);

    if (!audienceSegments || !Array.isArray(audienceSegments) || !adAccountId) {
      return new Response(
        JSON.stringify({ error: 'Missing audienceSegments array or adAccountId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the user from the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's Facebook access token
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('facebook_access_token')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile?.facebook_access_token) {
      console.error('Profile error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Facebook access token not found. Please reconnect to Facebook.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = profile.facebook_access_token;
    const createdAudiences = [];
    const errors = [];

    // Process each audience segment
    for (const segment of audienceSegments) {
      try {
        console.log(`Processing segment: ${segment.segment}`);

        // Parse targeting criteria from the segment description
        const targeting = parseTargetingCriteria(segment.criteria);
        
        // Check if audience already exists
        const existingAudience = await checkExistingAudience(segment.segment, accessToken, adAccountId);
        
        if (existingAudience) {
          console.log(`Audience "${segment.segment}" already exists with ID: ${existingAudience.id}`);
          
          // Store the existing audience ID in Supabase
          await supabaseClient
            .from('facebook_audiences')
            .upsert({
              user_id: user.id,
              audience_id: existingAudience.id,
              audience_name: existingAudience.name,
              audience_type: 'saved',
              audience_size: existingAudience.audience_size,
              description: segment.criteria,
              demographics: targeting.demographics,
              interests: targeting.interests,
              behaviors: targeting.behaviors,
              raw_data: existingAudience
            });

          createdAudiences.push({
            segmentName: segment.segment,
            audienceId: existingAudience.id,
            status: 'existing'
          });
          continue;
        }

        // Create new saved audience
        const audienceData = {
          name: segment.segment,
          description: segment.criteria,
          targeting: targeting.facebookTargeting
        };

        console.log('Creating audience with data:', JSON.stringify(audienceData, null, 2));

        const response = await fetch(
          `https://graph.facebook.com/v19.0/act_${adAccountId}/saved_audiences`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              access_token: accessToken,
              ...audienceData
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error(`Failed to create audience "${segment.segment}":`, errorData);
          errors.push({
            segmentName: segment.segment,
            error: errorData.error?.message || 'Unknown error'
          });
          continue;
        }

        const createdAudience = await response.json();
        console.log(`Successfully created audience: ${createdAudience.id}`);

        // Store the created audience in Supabase
        await supabaseClient
          .from('facebook_audiences')
          .upsert({
            user_id: user.id,
            audience_id: createdAudience.id,
            audience_name: segment.segment,
            audience_type: 'saved',
            description: segment.criteria,
            demographics: targeting.demographics,
            interests: targeting.interests,
            behaviors: targeting.behaviors,
            raw_data: createdAudience
          });

        createdAudiences.push({
          segmentName: segment.segment,
          audienceId: createdAudience.id,
          status: 'created'
        });

      } catch (error) {
        console.error(`Error processing segment "${segment.segment}":`, error);
        errors.push({
          segmentName: segment.segment,
          error: error.message
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        createdAudiences,
        errors,
        summary: {
          total: audienceSegments.length,
          created: createdAudiences.filter(a => a.status === 'created').length,
          existing: createdAudiences.filter(a => a.status === 'existing').length,
          failed: errors.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-facebook-audiences function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to check if audience already exists
async function checkExistingAudience(audienceName: string, accessToken: string, adAccountId: string) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/act_${adAccountId}/saved_audiences?fields=id,name,audience_size&access_token=${accessToken}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.data?.find((audience: any) => 
      audience.name.toLowerCase() === audienceName.toLowerCase()
    );
  } catch (error) {
    console.error('Error checking existing audiences:', error);
    return null;
  }
}

// Helper function to parse targeting criteria from segment description
function parseTargetingCriteria(criteria: string) {
  const demographics: any = {};
  const interests: string[] = [];
  const behaviors: string[] = [];

  // Extract age range
  const ageMatch = criteria.match(/Age (\d+)-(\d+)/i);
  if (ageMatch) {
    demographics.age_min = parseInt(ageMatch[1]);
    demographics.age_max = parseInt(ageMatch[2]);
  }

  // Extract gender
  if (criteria.toLowerCase().includes('female')) {
    demographics.genders = [2]; // Facebook's female gender code
  } else if (criteria.toLowerCase().includes('male')) {
    demographics.genders = [1]; // Facebook's male gender code
  }

  // Extract interests
  const interestsMatch = criteria.match(/Interests?:([^,]+(?:,[^,]+)*)/i);
  if (interestsMatch) {
    const interestList = interestsMatch[1].split(',').map(i => i.trim());
    interests.push(...interestList);
  }

  // Extract behaviors
  const behaviorsMatch = criteria.match(/Behaviors?:([^,]+(?:,[^,]+)*)/i);
  if (behaviorsMatch) {
    const behaviorList = behaviorsMatch[1].split(',').map(b => b.trim());
    behaviors.push(...behaviorList);
  }

  // Create Facebook-compatible targeting object
  const facebookTargeting: any = {};
  
  if (demographics.age_min) facebookTargeting.age_min = demographics.age_min;
  if (demographics.age_max) facebookTargeting.age_max = demographics.age_max;
  if (demographics.genders) facebookTargeting.genders = demographics.genders;
  
  // Default to US targeting if no location specified
  facebookTargeting.geo_locations = {
    countries: ['US']
  };

  // Note: Facebook requires interest/behavior IDs, not names
  // For MVP, we'll create basic demographics-only audiences
  // In production, you'd need to map interest/behavior names to Facebook IDs

  return {
    demographics,
    interests,
    behaviors,
    facebookTargeting
  };
}
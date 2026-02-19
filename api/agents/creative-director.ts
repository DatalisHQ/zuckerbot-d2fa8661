import {
  supabaseAdmin,
  handleCors,
  createAutomationRun,
  completeAutomationRun,
  failAutomationRun,
  getLastRunForAgent,
  getBusinessWithConfig,
} from './_utils';

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (handleCors(req, res)) return;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceRoleKey) return res.status(500).json({ error: 'Service role key not configured' });

  const { business_id, user_id, trigger_type, inspiration_source } = req.body || {};
  if (!business_id || !user_id) {
    return res.status(400).json({ error: 'business_id and user_id required' });
  }

  let runId: string | null = null;
  const startTime = Date.now();

  try {
    const { business } = await getBusinessWithConfig(business_id);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    runId = await createAutomationRun(
      business_id,
      user_id,
      'creative_director',
      trigger_type || 'manual',
      `Generating new ad creatives for ${business.business_name || business.name || 'business'}`,
      { inspiration_source: inspiration_source || 'auto' }
    );

    // Step 1: Fetch brand data from the most recent agent_runs row for this business
    const { data: brandRun } = await supabaseAdmin
      .from('agent_runs')
      .select('*')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const brandData = brandRun?.output || brandRun?.result || {};

    // Step 2: Fetch latest competitor analysis from automation_runs
    const competitorRun = await getLastRunForAgent(business_id, 'competitor_analyst');
    const competitorAds = competitorRun?.output?.ads || [];
    const competitorInsights = competitorRun?.output?.insights || {};

    // Step 3: Fetch latest review data from automation_runs
    const reviewRun = await getLastRunForAgent(business_id, 'review_scout');
    const reviewData = reviewRun?.output || {};
    const adAngles = reviewData.ad_angles || [];
    const reviewKeywords = reviewData.keywords || [];
    const bestQuotes = (reviewData.reviews || [])
      .filter((r: any) => r.rating >= 4 && r.text?.length > 20)
      .map((r: any) => r.text)
      .slice(0, 3);

    // Step 4: Call the generate-preview Supabase Edge Function
    const websiteUrl = business.website || business.url || '';
    let generatedCreatives: any = null;

    if (websiteUrl) {
      try {
        const previewResponse = await fetch(
          'https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/generate-preview',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: websiteUrl }),
          }
        );

        if (previewResponse.ok) {
          generatedCreatives = await previewResponse.json();
        }
      } catch {
        // Edge function call failed, we will still produce output from other data
      }
    }

    // Step 5: Build creative recommendations by combining all sources
    const creatives = buildCreativeRecommendations({
      brandData,
      competitorAds,
      competitorInsights,
      adAngles,
      reviewKeywords,
      bestQuotes,
      generatedCreatives,
      businessName: business.business_name || business.name || '',
      industry: business.trade || business.industry || '',
    });

    const output = {
      creatives,
      creative_count: creatives.length,
      sources: {
        has_brand_data: !!brandRun,
        has_competitor_data: !!competitorRun,
        has_review_data: !!reviewRun,
        has_generated_preview: !!generatedCreatives,
      },
      generated_at: new Date().toISOString(),
    };

    const durationMs = Date.now() - startTime;

    const summary = `Generated ${creatives.length} ad creative variations using ${Object.values(output.sources).filter(Boolean).length} data sources.`;

    const firstPersonSummary = `I designed ${creatives.length} new ad variations for you. They're inspired by what's working for your competitors and your best customer reviews. Take a look and approve your favorites.`;

    await completeAutomationRun(runId, output, summary, firstPersonSummary, {
      requiresApproval: true,
      durationMs,
    });

    return res.status(200).json({ run_id: runId, status: 'needs_approval', output });
  } catch (error: any) {
    if (runId) {
      await failAutomationRun(runId, error.message || 'Unknown error');
    }
    return res.status(500).json({ error: error.message || 'Creative generation failed' });
  }
}

interface CreativeInput {
  brandData: Record<string, any>;
  competitorAds: any[];
  competitorInsights: Record<string, any>;
  adAngles: string[];
  reviewKeywords: string[];
  bestQuotes: string[];
  generatedCreatives: any;
  businessName: string;
  industry: string;
}

interface AdCreative {
  variation: number;
  headline: string;
  primary_text: string;
  description: string;
  cta: string;
  inspiration: string;
  format_suggestion: string;
}

function buildCreativeRecommendations(input: CreativeInput): AdCreative[] {
  const creatives: AdCreative[] = [];
  const {
    brandData,
    competitorAds,
    competitorInsights,
    adAngles,
    reviewKeywords,
    bestQuotes,
    generatedCreatives,
    businessName,
    industry,
  } = input;

  const brandColors = brandData.colors || brandData.brand_colors || [];
  const brandTone = brandData.tone || brandData.brand_tone || 'professional';

  // Variation 1: Social proof (review-driven)
  if (bestQuotes.length > 0) {
    const quote = bestQuotes[0].length > 100 ? bestQuotes[0].slice(0, 97) + '...' : bestQuotes[0];
    creatives.push({
      variation: 1,
      headline: `See Why Customers Love ${businessName}`,
      primary_text: `"${quote}"\n\nJoin hundreds of happy customers. Book today.`,
      description: reviewKeywords.length > 0
        ? `Known for ${reviewKeywords.slice(0, 3).join(', ')}`
        : `Trusted local ${industry}`,
      cta: 'Book Now',
      inspiration: 'Customer review quote',
      format_suggestion: 'Single image with quote overlay on brand color background',
    });
  }

  // Variation 2: Competitor gap (differentiation)
  if (competitorAds.length > 0) {
    const avgCompetitorCopyLen = Math.round(
      competitorAds.reduce((s: number, a: any) => s + (a.ad_body_text?.length || 0), 0) / competitorAds.length
    );
    const goShorter = avgCompetitorCopyLen > 150;
    const opportunityNote = competitorInsights.opportunity || 'Stand out from the competition.';

    creatives.push({
      variation: creatives.length + 1,
      headline: industry
        ? `The ${industry} Experts Near You`
        : `${businessName} - Different By Design`,
      primary_text: goShorter
        ? `Skip the noise. ${businessName} delivers results, not just promises. See the difference today.`
        : `While others run the same ads month after month, ${businessName} keeps innovating. ${opportunityNote} Ready to see why we're different?`,
      description: `${competitorAds.length} competitors are advertising right now. Stand out.`,
      cta: 'Learn More',
      inspiration: `Competitor gap analysis. ${competitorAds.length} active competitor ads found.`,
      format_suggestion: goShorter
        ? 'Short-form video (15s) or carousel showing unique selling points'
        : 'Single image with bold, contrasting design to competitor styles',
    });
  }

  // Variation 3: Generated preview (if available from edge function)
  if (generatedCreatives) {
    const preview = generatedCreatives.preview || generatedCreatives;
    const headlines = preview.headlines || preview.ad_headlines || [];
    const descriptions = preview.descriptions || preview.ad_descriptions || [];

    creatives.push({
      variation: creatives.length + 1,
      headline: headlines[0] || `Discover ${businessName}`,
      primary_text: descriptions[0] || `Visit ${businessName} and experience ${industry || 'excellence'} like never before.`,
      description: descriptions[1] || `Your local ${industry || 'business'} of choice`,
      cta: 'Get Started',
      inspiration: 'AI-generated from website content',
      format_suggestion: 'Single image using brand imagery from website',
    });
  }

  // Variation 4: Keyword-driven (from reviews)
  if (reviewKeywords.length >= 2) {
    creatives.push({
      variation: creatives.length + 1,
      headline: `${capitalizeFirst(reviewKeywords[0])} & ${capitalizeFirst(reviewKeywords[1])}`,
      primary_text: `That's what our customers say about ${businessName}. Don't take our word for it, see for yourself.`,
      description: `Rated by real customers in ${industry || 'your area'}`,
      cta: 'See Reviews',
      inspiration: `Top review keywords: ${reviewKeywords.slice(0, 4).join(', ')}`,
      format_suggestion: 'Carousel with each slide highlighting a different customer keyword',
    });
  }

  // Ensure at least 3 variations
  if (creatives.length < 3) {
    creatives.push({
      variation: creatives.length + 1,
      headline: `${businessName} - Your Local ${capitalizeFirst(industry || 'Expert')}`,
      primary_text: `Looking for a trusted ${industry || 'local business'}? ${businessName} has been serving the community with dedication. See what makes us the local favorite.`,
      description: `Trusted. Local. ${capitalizeFirst(industry || 'Professional')}.`,
      cta: 'Contact Us',
      inspiration: 'Brand awareness template',
      format_suggestion: 'Single image with business photo and clean typography',
    });
  }

  if (creatives.length < 3) {
    creatives.push({
      variation: creatives.length + 1,
      headline: `Limited Time Offer from ${businessName}`,
      primary_text: `Now is the perfect time to try ${businessName}. New customers get a special welcome. Don't miss out.`,
      description: `Special offer for new customers`,
      cta: 'Claim Offer',
      inspiration: 'Urgency/offer template',
      format_suggestion: 'Bold graphic with offer details and countdown element',
    });
  }

  return creatives;
}

function capitalizeFirst(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

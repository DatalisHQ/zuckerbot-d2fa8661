import {
  handleCors,
  createAutomationRun,
  completeAutomationRun,
  failAutomationRun,
  getLastRunForAgent,
  getBusinessWithConfig,
} from './_utils';

export const config = { maxDuration: 45 };

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

export default async function handler(req: any, res: any) {
  try { return await _handler(req, res); } catch (e: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ fatal: e.message, stack: e.stack?.split('\n').slice(0, 5) });
  }
}

async function _handler(req: any, res: any) {
  if (handleCors(req, res)) return;

  const { business_id, user_id, trigger_type, business_name, location } = req.body || {};
  if (!business_id || !user_id) {
    return res.status(400).json({ error: 'business_id and user_id required' });
  }

  let runId: string | null = null;
  const startTime = Date.now();

  try {
    const { business } = await getBusinessWithConfig(business_id);
    const resolvedName = business_name || business?.name || '';
    const resolvedLocation = location || business?.suburb || business?.country || '';

    if (!resolvedName) {
      return res.status(400).json({ error: 'Could not determine business name' });
    }

    runId = await createAutomationRun(
      business_id,
      user_id,
      'review_scout',
      trigger_type || 'manual',
      `Scanning reviews for ${resolvedName} in ${resolvedLocation}`,
      { business_name: resolvedName, location: resolvedLocation }
    );

    // Search Brave for reviews
    const reviewQuery = `"${resolvedName}" ${resolvedLocation} reviews`;
    const ratingQuery = `${resolvedName} ${resolvedLocation} Google reviews rating`;

    const [braveRes1, braveRes2] = await Promise.all([
      fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(reviewQuery)}&count=10`, {
        headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' },
      }),
      fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(ratingQuery)}&count=5`, {
        headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' },
      }),
    ]);

    const results1 = braveRes1.ok ? ((await braveRes1.json()).web?.results || []) : [];
    const results2 = braveRes2.ok ? ((await braveRes2.json()).web?.results || []) : [];

    const seenUrls = new Set<string>();
    const results: any[] = [];
    for (const r of [...results1, ...results2]) {
      if (!seenUrls.has(r.url)) { seenUrls.add(r.url); results.push(r); }
    }

    const searchContext = results.slice(0, 10).map((r: any) => `${r.title}: ${r.description || ''}`).join('\n');

    // Use Claude to extract review data
    let reviewData: any = { rating: null, total_reviews: null, reviews: [], keywords: [] };

    if (ANTHROPIC_API_KEY && searchContext.length > 50) {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: 'You analyze search results to extract business reputation data. Respond ONLY with valid JSON.',
          messages: [{
            role: 'user',
            content: `Analyze search results for "${resolvedName}" in ${resolvedLocation} and extract reputation data:

${searchContext}

Return JSON:
{
  "rating": number or null,
  "total_reviews": number or null,
  "reviews": [{ "text": "string", "author": "string", "stars": number, "date": "string" }],
  "keywords": ["positive attributes"],
  "reputation_summary": "one sentence summary"
}

For reviews: use actual quotes if found, otherwise synthesize 2-3 customer-style testimonials grounded in specific qualities mentioned in search results. Every review must reflect something real from the data. If search results have NO useful info, return empty reviews.`
          }],
        }),
      });

      if (claudeRes.ok) {
        const claudeData = await claudeRes.json();
        try {
          reviewData = JSON.parse(claudeData.content?.[0]?.text || '{}');
        } catch {}
      }
    }

    const reviews = (reviewData.reviews || []).slice(0, 5);
    const rating = reviewData.rating || null;
    const totalReviews = reviewData.total_reviews || null;
    const keywords = (reviewData.keywords || []).slice(0, 10);

    // Generate ad angles from review themes
    const adAngles: string[] = [];
    if (rating && rating >= 4.5) {
      adAngles.push(`Lead with your ${rating}-star rating. Social proof converts.`);
    }
    if (reviews.length > 0) {
      const bestQuote = reviews.find((r: any) => r.stars >= 4 && r.text?.length > 30);
      if (bestQuote) adAngles.push(`Use customer voice: "${bestQuote.text.slice(0, 80)}..."`);
    }
    if (keywords.length >= 2) {
      adAngles.push(`Highlight "${keywords[0]}" and "${keywords[1]}" in your headlines.`);
    }

    // Compare with last run
    const lastRun = await getLastRunForAgent(business_id, 'review_scout');
    const previousTotal = lastRun?.output?.total_reviews || 0;
    const newReviewCount = totalReviews && totalReviews > previousTotal ? totalReviews - previousTotal : 0;

    const output = {
      business_name: resolvedName,
      rating,
      total_reviews: totalReviews,
      reviews,
      keywords,
      ad_angles: adAngles,
      new_reviews_since_last_scan: newReviewCount,
      reputation_summary: reviewData.reputation_summary || null,
      scanned_at: new Date().toISOString(),
    };

    const durationMs = Date.now() - startTime;
    const summary = `${resolvedName}: ${rating || '?'} stars, ${totalReviews || '?'} reviews. ${adAngles.length} ad angles.`;

    let firstPersonSummary: string;
    if (reviews.length > 0 && rating) {
      firstPersonSummary = `I scanned your online reputation. ${rating} stars from ${totalReviews || 'multiple'} reviews. Your customers highlight ${keywords.slice(0, 2).join(' and ') || 'your service'}. I have ${adAngles.length} ad angle suggestions ready.`;
    } else if (reviews.length > 0) {
      firstPersonSummary = `I found customer feedback for ${resolvedName}. ${reviews.length} review insights extracted. Keywords: ${keywords.slice(0, 3).join(', ') || 'none found'}.`;
    } else {
      firstPersonSummary = `I searched for reviews of ${resolvedName} but found limited data. Make sure your Google Business Profile is set up and actively collecting reviews.`;
    }

    await completeAutomationRun(runId, output, summary, firstPersonSummary, { durationMs });

    return res.status(200).json({ run_id: runId, status: 'completed', output });
  } catch (error: any) {
    if (runId) await failAutomationRun(runId, error.message || 'Unknown error');
    return res.status(500).json({ error: error.message || 'Review scout failed' });
  }
}

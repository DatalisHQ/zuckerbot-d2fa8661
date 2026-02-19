import {
  handleCors,
  createAutomationRun,
  completeAutomationRun,
  failAutomationRun,
  getLastRunForAgent,
  getBusinessWithConfig,
  parseTinyfishSSE,
} from './_utils';

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (handleCors(req, res)) return;

  const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY;
  if (!TINYFISH_API_KEY) return res.status(500).json({ error: 'TinyFish API key not configured' });

  const { business_id, user_id, trigger_type, business_name, location } = req.body || {};
  if (!business_id || !user_id) {
    return res.status(400).json({ error: 'business_id and user_id required' });
  }

  let runId: string | null = null;
  const startTime = Date.now();

  try {
    // Resolve business name and location from DB if not provided
    const { business } = await getBusinessWithConfig(business_id);
    const resolvedName = business_name || business?.business_name || business?.name || '';
    const resolvedLocation = location || business?.suburb || business?.location || '';

    if (!resolvedName || !resolvedLocation) {
      return res.status(400).json({ error: 'Could not determine business name or location' });
    }

    runId = await createAutomationRun(
      business_id,
      user_id,
      'review_scout',
      trigger_type || 'manual',
      `Scraping Google reviews for ${resolvedName} in ${resolvedLocation}`,
      { business_name: resolvedName, location: resolvedLocation }
    );

    // Build the Google Maps search URL
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(resolvedName + ' ' + resolvedLocation)}`;

    // Call TinyFish
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch('https://agent.tinyfish.ai/v1/automation/run-sse', {
      method: 'POST',
      headers: {
        'X-API-Key': TINYFISH_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: mapsUrl,
        goal: `Find this business on Google Maps. Click on it. Go to the reviews section. Extract: {"business_name": str, "rating": number, "total_reviews": number, "category": str, "reviews": [{"author": str, "rating": number, "text": str, "date": str}]}. Get the top 5 most helpful/recent reviews. Also extract the business category and any service keywords mentioned in reviews. Dismiss any popups quickly.`,
        browser_profile: 'stealth',
        proxy_config: { enabled: true, country_code: 'US' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`TinyFish API returned ${response.status}`);
    }

    // Parse the full SSE stream internally
    const { replayUrl, resultJson, status } = await parseTinyfishSSE(response);

    if (status !== 'COMPLETED' || !resultJson) {
      throw new Error(`TinyFish automation did not complete successfully. Status: ${status}`);
    }

    // Extract review data from result
    const reviewData = extractReviewData(resultJson, resolvedName);

    // Generate ad angle suggestions from review themes
    const adAngles = generateAdAngles(reviewData.reviews, reviewData.keywords, reviewData.category);

    // Compare with last run to detect new reviews
    const lastRun = await getLastRunForAgent(business_id, 'review_scout');
    const previousTotal = lastRun?.output?.total_reviews || 0;
    const newReviewCount = reviewData.total_reviews > previousTotal
      ? reviewData.total_reviews - previousTotal
      : 0;

    const output = {
      business_name: reviewData.business_name,
      rating: reviewData.rating,
      total_reviews: reviewData.total_reviews,
      category: reviewData.category,
      reviews: reviewData.reviews,
      keywords: reviewData.keywords,
      ad_angles: adAngles,
      new_reviews_since_last_scan: newReviewCount,
      scanned_at: new Date().toISOString(),
    };

    const durationMs = Date.now() - startTime;

    // Build summaries
    const summary = `${reviewData.business_name}: ${reviewData.rating} stars from ${reviewData.total_reviews} reviews. ${adAngles.length} ad angle suggestions generated.`;

    let firstPersonSummary: string;
    if (newReviewCount > 0) {
      const sentiment = reviewData.reviews.every((r: any) => r.rating >= 4) ? 'All positive.' : 'Mixed sentiment.';
      firstPersonSummary = `I found ${newReviewCount} new review${newReviewCount === 1 ? '' : 's'} since last week. ${sentiment} Highlighted some quotes we can use in your next ad.`;
    } else if (reviewData.total_reviews > 0) {
      const topKeyword = reviewData.keywords[0] || 'quality';
      firstPersonSummary = `I checked your Google reviews. ${reviewData.rating} stars from ${reviewData.total_reviews} reviews. Your customers love your ${topKeyword}, that's great ad material.`;
    } else {
      firstPersonSummary = `I searched Google Maps for ${resolvedName} in ${resolvedLocation} but could not find reviews. Make sure your Google Business Profile is set up and collecting reviews.`;
    }

    await completeAutomationRun(runId, output, summary, firstPersonSummary, {
      replayUrl: replayUrl || undefined,
      durationMs,
    });

    return res.status(200).json({ run_id: runId, status: 'completed', output });
  } catch (error: any) {
    if (runId) {
      await failAutomationRun(runId, error.message || 'Unknown error');
    }
    return res.status(500).json({ error: error.message || 'Review scraping failed' });
  }
}

function extractReviewData(rj: any, fallbackName: string) {
  // Normalize. TinyFish may return data nested in various shapes.
  let data = rj;
  if (rj.data) data = rj.data;
  if (rj.result) data = rj.result;

  const businessName = data.business_name || data.name || fallbackName;
  const rating = parseFloat(data.rating) || 0;
  const totalReviews = parseInt(data.total_reviews || data.review_count || data.totalReviews, 10) || 0;
  const category = data.category || data.business_category || '';

  // Extract reviews array
  let reviews: any[] = [];
  if (Array.isArray(data.reviews)) {
    reviews = data.reviews;
  } else if (Array.isArray(data)) {
    reviews = data;
  } else {
    for (const val of Object.values(data)) {
      if (Array.isArray(val) && (val as any[]).length > 0 && (val as any[])[0]?.author) {
        reviews = val as any[];
        break;
      }
    }
  }

  // Normalize and limit to top 5
  reviews = reviews.slice(0, 5).map((r: any) => ({
    author: r.author || r.reviewer || r.name || 'Anonymous',
    rating: parseFloat(r.rating) || 0,
    text: r.text || r.review_text || r.content || r.comment || '',
    date: r.date || r.review_date || r.time || '',
  }));

  // Extract keywords from review texts and category
  const keywords = extractKeywords(reviews, category);

  return { business_name: businessName, rating, total_reviews: totalReviews, category, reviews, keywords };
}

function extractKeywords(reviews: any[], category: string): string[] {
  const text = reviews.map((r: any) => r.text).join(' ').toLowerCase();
  if (!text.trim()) return [];

  const keywordPatterns = [
    'friendly', 'professional', 'fast', 'quick', 'clean', 'affordable',
    'helpful', 'knowledgeable', 'reliable', 'excellent', 'amazing',
    'great service', 'good food', 'fresh', 'delicious', 'cozy',
    'comfortable', 'spacious', 'convenient', 'efficient', 'thorough',
    'courteous', 'prompt', 'quality', 'value', 'recommend',
    'atmosphere', 'staff', 'customer service', 'experience', 'location',
    'parking', 'wait time', 'delivery', 'selection', 'variety',
    'pricing', 'appointment', 'communication', 'responsive', 'trustworthy',
  ];

  const found: string[] = [];
  for (const kw of keywordPatterns) {
    if (text.includes(kw)) {
      found.push(kw);
    }
  }

  if (category && !found.includes(category.toLowerCase())) {
    found.unshift(category.toLowerCase());
  }

  return found.slice(0, 10);
}

function generateAdAngles(reviews: any[], keywords: string[], category: string): string[] {
  const angles: string[] = [];

  // Find best quotes (4+ star reviews with substantial text)
  const bestQuotes = reviews
    .filter((r: any) => r.rating >= 4 && r.text.length > 30)
    .map((r: any) => r.text);

  // Angle 1: Social proof from star rating
  if (reviews.length > 0) {
    const avgRating = reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length;
    if (avgRating >= 4.5) {
      angles.push(`Social proof: Lead with your ${avgRating.toFixed(1)}-star rating. Customers trust reviews more than ads.`);
    } else if (avgRating >= 4.0) {
      angles.push(`Trust builder: Mention your strong rating and let a customer quote do the selling.`);
    }
  }

  // Angle 2: Quote-based ad
  if (bestQuotes.length > 0) {
    const shortQuote = bestQuotes[0].length > 80 ? bestQuotes[0].slice(0, 77) + '...' : bestQuotes[0];
    angles.push(`Customer voice: Use the quote "${shortQuote}" as your primary ad copy.`);
  }

  // Angle 3: Keyword-driven angle
  if (keywords.length >= 2) {
    angles.push(`Highlight strengths: Your customers keep mentioning "${keywords[0]}" and "${keywords[1]}". Build your headline around these.`);
  }

  // Angle 4: Category-specific
  if (category) {
    angles.push(`Category authority: Position yourself as the go-to ${category} in your area. Use review count as proof.`);
  }

  // Angle 5: Urgency or seasonal
  if (keywords.includes('recommend') || keywords.includes('amazing')) {
    angles.push(`Word-of-mouth: "Recommended by X customers" creates social urgency. Pair with a limited-time offer.`);
  }

  return angles.slice(0, 5);
}

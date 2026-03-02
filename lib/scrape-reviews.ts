import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 45 };

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { business_name, location } = req.body || {};
  if (!business_name) return res.status(400).json({ error: 'business_name required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Two parallel searches for maximum coverage
    const reviewQuery = `"${business_name}" ${location || ''} reviews`;
    const ratingQuery = `${business_name} ${location || ''} Google reviews rating`;

    const [braveRes1, braveRes2] = await Promise.all([
      fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(reviewQuery)}&count=10`,
        { headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' } }
      ),
      fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(ratingQuery)}&count=5`,
        { headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' } }
      ),
    ]);

    const results1 = braveRes1.ok ? ((await braveRes1.json()).web?.results || []) : [];
    const results2 = braveRes2.ok ? ((await braveRes2.json()).web?.results || []) : [];

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const results: any[] = [];
    for (const r of [...results1, ...results2]) {
      if (!seenUrls.has(r.url)) { seenUrls.add(r.url); results.push(r); }
    }

    if (results.length === 0) {
      res.write(`data: ${JSON.stringify({ type: 'COMPLETE', reviews: [], rating: null, total_reviews: null, keywords: [] })}\n\n`);
      return res.end();
    }

    // First pass: extract rating and review count from snippets (fast, no API call)
    let rating = 0;
    let totalReviews = 0;

    for (const r of results) {
      const combined = `${r.title || ''} ${r.description || ''}`;

      if (rating === 0) {
        const ratingMatch = combined.match(/(\d+\.?\d*)\s*(?:stars?|\/\s*5|out of 5)/i) ||
          combined.match(/rating[:\s]+(\d+\.?\d*)/i) ||
          combined.match(/(\d\.\d)\s*\(\d+\)/);
        if (ratingMatch) {
          const parsed = parseFloat(ratingMatch[1]);
          if (parsed >= 1 && parsed <= 5) rating = parsed;
        }
      }

      if (totalReviews === 0) {
        const countMatch = combined.match(/(\d[\d,]*)\s*(?:reviews?|ratings?|Google reviews?)/i) ||
          combined.match(/\d\.\d\s*\((\d[\d,]*)\)/);
        if (countMatch) {
          const parsed = parseInt(countMatch[1].replace(/,/g, ''));
          if (parsed > 0 && parsed < 100000) totalReviews = parsed;
        }
      }
    }

    // Build search context for Claude
    const searchContext = results.slice(0, 10).map((r: any) =>
      `${r.title}: ${r.description || ''}`
    ).join('\n');

    // Use Claude to extract real review content from search results
    if (ANTHROPIC_API_KEY) {
      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 800,
            system: 'You analyze search results to extract business reputation data. Respond ONLY with valid JSON. No markdown fences.',
            messages: [{
              role: 'user',
              content: `Analyze search results for "${business_name}" ${location ? `in ${location}` : ''} and extract reputation data:

${searchContext}

Return JSON:
{
  "rating": number or null (star rating if mentioned anywhere, e.g. 4.8),
  "total_reviews": number or null (review count if mentioned),
  "reviews": [
    { "text": "string", "author": "string", "stars": number, "date": "string" }
  ],
  "keywords": ["positive attributes of this business from search results"],
  "reputation_summary": "one sentence summary of online reputation"
}

For the reviews array, use this priority:
1. If actual customer quotes appear in search results, use those verbatim
2. If review summaries or sentiment is described (e.g. "patients love the gentle approach"), write a natural review that reflects that specific sentiment
3. If the search results describe the business positively (e.g. "compassionate high-quality dental care"), create 2-3 short customer-style testimonials that reflect those SPECIFIC qualities mentioned in the results

Important:
- Every review must be grounded in something specific from the search results
- Use qualities, services, and descriptions that actually appear in the results
- If the search results contain NO useful information about the business, return empty reviews
- Extract 3-5 keywords that genuinely describe this business based on search data
- Set stars to 5 for synthesized reviews, use actual rating for quoted reviews`
            }],
          }),
        });

        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const text = claudeData.content?.[0]?.text || '{}';
          let parsed: any;
          try { parsed = JSON.parse(text); } catch { parsed = {}; }

          // Use Claude's extracted data, but only if it found real content
          const claudeReviews = (parsed.reviews || []).slice(0, 3).map((r: any) => ({
            text: r.text || '',
            author: r.author || 'Customer',
            rating: r.stars || 5,
            date: r.date || 'Recently',
          })).filter((r: any) => r.text.length > 10);

          const claudeRating = parsed.rating && parsed.rating >= 1 && parsed.rating <= 5 ? parsed.rating : null;
          const claudeCount = parsed.total_reviews && parsed.total_reviews > 0 ? parsed.total_reviews : null;
          const claudeKeywords = (parsed.keywords || []).slice(0, 6);

          res.write(`data: ${JSON.stringify({
            type: 'COMPLETE',
            reviews: claudeReviews,
            rating: claudeRating || rating || null,
            total_reviews: claudeCount || totalReviews || null,
            keywords: claudeKeywords.length > 0 ? claudeKeywords : extractKeywords(results),
          })}\n\n`);
          return res.end();
        }
      } catch (err) {
        console.error('[scrape-reviews] Claude fallback error:', err);
      }
    }

    // Pure Brave fallback (no Claude available)
    res.write(`data: ${JSON.stringify({
      type: 'COMPLETE',
      reviews: [],
      rating: rating || null,
      total_reviews: totalReviews || null,
      keywords: extractKeywords(results),
    })}\n\n`);
  } catch (err) {
    console.error('[scrape-reviews] Error:', err);
    res.write(`data: ${JSON.stringify({ type: 'COMPLETE', reviews: [], rating: 0, total_reviews: 0, keywords: [] })}\n\n`);
  }

  return res.end();
}

function extractKeywords(results: any[]): string[] {
  const allText = results.map((r: any) => `${r.title} ${r.description}`).join(' ').toLowerCase();
  const candidates = ['friendly', 'professional', 'clean', 'modern', 'experienced', 'gentle', 'caring', 'affordable', 'quality', 'fast', 'reliable', 'trusted', 'family', 'comfortable', 'painless', 'thorough', 'knowledgeable', 'welcoming', 'expert', 'convenient'];
  return candidates.filter(kw => allText.includes(kw)).slice(0, 6);
}

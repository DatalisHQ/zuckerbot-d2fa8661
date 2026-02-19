import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 30 };

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || 'BSA3NLr2aVETRurlr8KaqHN-pBcOEqP';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { business_name, location } = req.body || {};
  if (!business_name) return res.status(400).json({ error: 'business_name required' });

  // SSE headers to match what the frontend expects
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const query = `"${business_name}" ${location || ''} reviews`;
    const braveRes = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
      { headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' } }
    );

    if (!braveRes.ok) {
      res.write(`data: ${JSON.stringify({ type: 'COMPLETE', reviews: [], rating: 0, total_reviews: 0, keywords: [] })}\n\n`);
      return res.end();
    }

    const braveData = await braveRes.json();
    const results = braveData.web?.results || [];

    // Extract rating info from snippets
    let rating = 0;
    let totalReviews = 0;
    const reviews: Array<{ text: string; author: string; rating: number; date: string }> = [];
    const keywords: string[] = [];

    for (const r of results) {
      const snippet = r.description || '';
      const title = r.title || '';
      const combined = `${title} ${snippet}`;

      // Try to extract star rating (e.g., "4.8 stars", "Rating: 4.5/5", "4.7 out of 5")
      if (rating === 0) {
        const ratingMatch = combined.match(/(\d+\.?\d*)\s*(?:stars?|\/\s*5|out of 5)/i);
        if (ratingMatch) {
          const parsed = parseFloat(ratingMatch[1]);
          if (parsed >= 1 && parsed <= 5) rating = parsed;
        }
      }

      // Try to extract review count (e.g., "127 reviews", "Based on 45 reviews")
      if (totalReviews === 0) {
        const countMatch = combined.match(/(\d+)\s*(?:reviews?|ratings?|Google reviews?)/i);
        if (countMatch) {
          const parsed = parseInt(countMatch[1]);
          if (parsed > 0 && parsed < 100000) totalReviews = parsed;
        }
      }

      // Extract review-like snippets (quotes or descriptive text about the business)
      if (snippet.length > 40 && reviews.length < 5) {
        // Look for quoted text or review-like content
        const quoteMatch = snippet.match(/"([^"]{20,200})"/);
        if (quoteMatch) {
          reviews.push({ text: quoteMatch[1], author: 'Customer', rating: 5, date: 'Recently' });
        } else if (
          snippet.toLowerCase().includes('great') ||
          snippet.toLowerCase().includes('excellent') ||
          snippet.toLowerCase().includes('friendly') ||
          snippet.toLowerCase().includes('recommend') ||
          snippet.toLowerCase().includes('best') ||
          snippet.toLowerCase().includes('love') ||
          snippet.toLowerCase().includes('amazing')
        ) {
          // Clean up snippet to be review-like
          const cleaned = snippet.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          if (cleaned.length > 30 && cleaned.length < 300) {
            reviews.push({ text: cleaned, author: 'Customer', rating: 5, date: 'Recently' });
          }
        }
      }
    }

    // Extract keywords from all snippets
    const allText = results.map((r: any) => `${r.title} ${r.description}`).join(' ').toLowerCase();
    const keywordCandidates = ['friendly', 'professional', 'clean', 'modern', 'experienced', 'gentle', 'caring', 'affordable', 'quality', 'fast', 'reliable', 'trusted', 'family', 'comfortable', 'painless', 'thorough', 'knowledgeable', 'welcoming', 'expert', 'convenient'];
    for (const kw of keywordCandidates) {
      if (allText.includes(kw)) keywords.push(kw);
    }

    res.write(`data: ${JSON.stringify({
      type: 'COMPLETE',
      reviews: reviews.slice(0, 3),
      rating: rating || null,
      total_reviews: totalReviews || null,
      keywords: keywords.slice(0, 6),
    })}\n\n`);
  } catch (err) {
    console.error('[scrape-reviews] Error:', err);
    res.write(`data: ${JSON.stringify({ type: 'COMPLETE', reviews: [], rating: 0, total_reviews: 0, keywords: [] })}\n\n`);
  }

  return res.end();
}

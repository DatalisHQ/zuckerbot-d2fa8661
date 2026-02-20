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
    // Run two searches in parallel for better coverage
    const reviewQuery = `"${business_name}" ${location || ''} reviews`;
    const googleQuery = `${business_name} ${location || ''} Google reviews site:google.com`;

    const [braveRes1, braveRes2] = await Promise.all([
      fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(reviewQuery)}&count=10`,
        { headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' } }
      ),
      fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(googleQuery)}&count=5`,
        { headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' } }
      ),
    ]);

    if (!braveRes1.ok && !braveRes2.ok) {
      res.write(`data: ${JSON.stringify({ type: 'COMPLETE', reviews: [], rating: 0, total_reviews: 0, keywords: [] })}\n\n`);
      return res.end();
    }

    const results1 = braveRes1.ok ? ((await braveRes1.json()).web?.results || []) : [];
    const results2 = braveRes2.ok ? ((await braveRes2.json()).web?.results || []) : [];
    
    // Deduplicate by URL
    const seen = new Set<string>();
    const results: any[] = [];
    for (const r of [...results1, ...results2]) {
      if (!seen.has(r.url)) { seen.add(r.url); results.push(r); }
    }

    // Extract rating info from snippets
    let rating = 0;
    let totalReviews = 0;
    const reviews: Array<{ text: string; author: string; rating: number; date: string }> = [];
    const keywords: string[] = [];

    for (const r of results) {
      const snippet = r.description || '';
      const title = r.title || '';
      const combined = `${title} ${snippet}`;

      // Try to extract star rating (e.g., "4.8 stars", "Rating: 4.5/5", "4.7 out of 5", "4.8(127)")
      if (rating === 0) {
        const ratingMatch = combined.match(/(\d+\.?\d*)\s*(?:stars?|\/\s*5|out of 5)/i) ||
          combined.match(/rating[:\s]+(\d+\.?\d*)/i) ||
          combined.match(/(\d\.\d)\s*\(\d+\)/);
        if (ratingMatch) {
          const parsed = parseFloat(ratingMatch[1]);
          if (parsed >= 1 && parsed <= 5) rating = parsed;
        }
      }

      // Try to extract review count
      if (totalReviews === 0) {
        const countMatch = combined.match(/(\d[\d,]*)\s*(?:reviews?|ratings?|Google reviews?)/i) ||
          combined.match(/\d\.\d\s*\((\d[\d,]*)\)/);
        if (countMatch) {
          const parsed = parseInt(countMatch[1].replace(/,/g, ''));
          if (parsed > 0 && parsed < 100000) totalReviews = parsed;
        }
      }

      // Extract review-like snippets
      if (snippet.length > 30 && reviews.length < 5) {
        // Quoted text is highest confidence
        const quoteMatches = snippet.match(/"([^"]{15,200})"/g);
        if (quoteMatches) {
          for (const qm of quoteMatches) {
            const cleaned = qm.replace(/"/g, '').trim();
            if (cleaned.length >= 15 && reviews.length < 5) {
              reviews.push({ text: cleaned, author: 'Customer', rating: 5, date: 'Recently' });
            }
          }
        }

        // Also look for review-like language
        if (reviews.length < 5) {
          const lower = snippet.toLowerCase();
          const reviewSignals = ['great', 'excellent', 'friendly', 'recommend', 'best', 'love', 'amazing', 'fantastic', 'wonderful', 'professional', 'helpful', 'outstanding', 'highly recommend', 'so happy', 'thank you'];
          const hasSignal = reviewSignals.some(s => lower.includes(s));
          // Avoid snippets that are clearly not reviews (contain URLs, meta descriptions etc)
          const isMetaLike = lower.includes('read reviews') || lower.includes('write a review') || lower.includes('see all reviews') || lower.includes('click here');

          if (hasSignal && !isMetaLike) {
            const cleaned = snippet.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            // Only add if it reads like a review (not too short, not a directory listing)
            if (cleaned.length > 30 && cleaned.length < 300 && !reviews.some(rv => rv.text === cleaned)) {
              reviews.push({ text: cleaned, author: 'Customer', rating: 5, date: 'Recently' });
            }
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

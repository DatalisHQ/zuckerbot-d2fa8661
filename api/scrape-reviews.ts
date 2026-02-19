export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY;
  if (!TINYFISH_API_KEY) return res.status(500).json({ error: "TinyFish API key not configured" });

  try {
    const { business_name, location } = req.body;
    if (!business_name || !location) return res.status(400).json({ error: "business_name and location required" });

    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(business_name + " " + location)}`;

    // Set up SSE streaming to client
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial progress
    res.write(`data: ${JSON.stringify({ type: "PROGRESS", message: "Searching Google Maps for business..." })}\n\n`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 58000);

    const response = await fetch("https://agent.tinyfish.ai/v1/automation/run-sse", {
      method: "POST",
      headers: {
        "X-API-Key": TINYFISH_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: mapsUrl,
        goal: `Find this business on Google Maps. Click on it. Go to the reviews section. Extract: {"business_name": str, "rating": number, "total_reviews": number, "category": str, "reviews": [{"author": str, "rating": number, "text": str, "date": str}]}. Get the top 5 most helpful/recent reviews. Also extract the business category and any service keywords mentioned in reviews. Dismiss any popups quickly.`,
        browser_profile: "stealth",
        proxy_config: { enabled: true, country_code: "US" },
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      clearTimeout(timeout);
      res.write(`data: ${JSON.stringify({ type: "ERROR", message: "TinyFish API error" })}\n\n`);
      return res.end();
    }

    // Stream TinyFish SSE events through to client
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));

          // Forward progress events
          if (event.type === "PROGRESS") {
            res.write(`data: ${JSON.stringify({ type: "PROGRESS", message: event.purpose || "Working..." })}\n\n`);
          }

          // Forward streaming URL
          if (event.type === "STREAMING_URL") {
            res.write(`data: ${JSON.stringify({ type: "STREAMING_URL", url: event.streamingUrl })}\n\n`);
          }

          // Handle completion
          if (event.type === "COMPLETE" && event.status === "COMPLETED") {
            clearTimeout(timeout);
            try { reader.cancel(); } catch {}

            const rj = event.resultJson || {};
            const result = extractReviewData(rj, business_name);

            res.write(`data: ${JSON.stringify({
              type: "COMPLETE",
              business_name: result.business_name,
              rating: result.rating,
              total_reviews: result.total_reviews,
              category: result.category,
              reviews: result.reviews,
              keywords: result.keywords,
            })}\n\n`);
            return res.end();
          }
        } catch {}
      }
    }

    clearTimeout(timeout);
    res.write(`data: ${JSON.stringify({
      type: "COMPLETE",
      business_name: business_name,
      rating: 0,
      total_reviews: 0,
      category: "",
      reviews: [],
      keywords: [],
    })}\n\n`);
    res.end();
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: "ERROR", message: error.message || "Failed to scrape reviews" })}\n\n`);
    res.end();
  }
}

function extractReviewData(rj: any, fallbackName: string) {
  // Normalize — TinyFish may return data nested in various shapes
  let data = rj;
  if (rj.data) data = rj.data;
  if (rj.result) data = rj.result;

  const businessName = data.business_name || data.name || fallbackName;
  const rating = parseFloat(data.rating) || 0;
  const totalReviews = parseInt(data.total_reviews || data.review_count || data.totalReviews, 10) || 0;
  const category = data.category || data.business_category || "";

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
    author: r.author || r.reviewer || r.name || "Anonymous",
    rating: parseFloat(r.rating) || 0,
    text: r.text || r.review_text || r.content || r.comment || "",
    date: r.date || r.review_date || r.time || "",
  }));

  // Extract keywords from review texts and category
  const keywords = extractKeywords(reviews, category);

  return { business_name: businessName, rating, total_reviews: totalReviews, category, reviews, keywords };
}

function extractKeywords(reviews: any[], category: string): string[] {
  const text = reviews.map((r: any) => r.text).join(" ").toLowerCase();
  if (!text.trim()) return [];

  // Common service/quality keywords to look for in reviews
  const keywordPatterns = [
    "friendly", "professional", "fast", "quick", "clean", "affordable",
    "helpful", "knowledgeable", "reliable", "excellent", "amazing",
    "great service", "good food", "fresh", "delicious", "cozy",
    "comfortable", "spacious", "convenient", "efficient", "thorough",
    "courteous", "prompt", "quality", "value", "recommend",
    "atmosphere", "staff", "customer service", "experience", "location",
    "parking", "wait time", "delivery", "selection", "variety",
    "pricing", "appointment", "communication", "responsive", "trustworthy",
  ];

  const found: string[] = [];
  for (const kw of keywordPatterns) {
    if (text.includes(kw)) {
      found.push(kw);
    }
  }

  // Add category as a keyword if present
  if (category && !found.includes(category.toLowerCase())) {
    found.unshift(category.toLowerCase());
  }

  return found.slice(0, 10);
}

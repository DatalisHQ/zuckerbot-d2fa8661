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
    const { industry, location, country } = req.body;
    if (!industry || !location) return res.status(400).json({ error: "industry and location required" });

    const searchQuery = encodeURIComponent(industry);
    const countryCode = country === "AU" ? "AU" : "US";
    const adLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${countryCode}&q=${searchQuery}`;

    // Set up SSE streaming to client
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial progress
    res.write(`data: ${JSON.stringify({ type: "PROGRESS", message: "Navigating to Facebook Ad Library..." })}\n\n`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 58000);

    const response = await fetch("https://agent.tinyfish.ai/v1/automation/run-sse", {
      method: "POST",
      headers: {
        "X-API-Key": TINYFISH_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: adLibraryUrl,
        goal: `Extract the first 3 active ads. Return JSON: {"data": [{"page_name": str, "ad_body_text": str, "started_running_date": str, "platforms": str}]}. Dismiss any popups quickly.`,
        browser_profile: "stealth",
        proxy_config: { enabled: true, country_code: countryCode },
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
            let ads: any[] = [];
            if (Array.isArray(rj)) ads = rj;
            else if (Array.isArray(rj.data)) ads = rj.data;
            else if (Array.isArray(rj.ads)) ads = rj.ads;
            else {
              for (const val of Object.values(rj)) {
                if (Array.isArray(val)) { ads = val as any[]; break; }
              }
            }

            // Generate insights
            const insights = generateInsights(ads, industry);

            res.write(`data: ${JSON.stringify({ type: "COMPLETE", competitor_ads: ads, insights, ad_count: ads.length })}\n\n`);
            return res.end();
          }
        } catch {}
      }
    }

    clearTimeout(timeout);
    res.write(`data: ${JSON.stringify({ type: "COMPLETE", competitor_ads: [], insights: { summary: "No ads found" }, ad_count: 0 })}\n\n`);
    res.end();
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: "ERROR", message: error.message || "Failed" })}\n\n`);
    res.end();
  }
}

function generateInsights(ads: any[], industry: string): Record<string, string> {
  if (!ads.length) return { summary: "No active competitor ads found." };

  const avgLen = Math.round(ads.reduce((s: number, a: any) => s + (a.ad_body_text?.length || 0), 0) / ads.length);
  const multi = ads.filter((a: any) => a.platforms?.includes(",")).length;
  const longRun = ads.filter((a: any) => {
    try { return (Date.now() - new Date(a.started_running_date).getTime()) / 86400000 > 90; }
    catch { return false; }
  }).length;

  return {
    summary: `Found ${ads.length} active competitor ads in ${industry}.`,
    avg_copy_length: `${avgLen} chars avg copy length`,
    multi_platform: `${multi}/${ads.length} ads on multiple platforms`,
    long_running: `${longRun}/${ads.length} running 90+ days`,
    opportunity: longRun > ads.length / 2
      ? "Competitors rely on evergreen ads. Fresh creative could stand out."
      : "Active market. Strong differentiation needed.",
  };
}

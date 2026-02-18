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
    const { business_name, industry } = req.body;
    if (!business_name) return res.status(400).json({ error: "business_name required" });

    const adLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=${encodeURIComponent(business_name)}`;

    // Set up SSE streaming to client
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial progress
    res.write(`data: ${JSON.stringify({ type: "PROGRESS", message: "Connecting to Facebook Ads Manager..." })}\n\n`);

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
        goal: `Find all active ads for this business. For each ad extract: {"data": [{"page_name": str, "ad_status": str, "started_running_date": str, "platforms": str, "ad_format": str, "ad_body_text": str}]}. Also note: total active ad count, longest running ad duration, most common platform, any signs of creative fatigue (same ad running 90+ days). Dismiss any popups quickly.`,
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

    res.write(`data: ${JSON.stringify({ type: "PROGRESS", message: `Scanning active campaigns for ${business_name}...` })}\n\n`);

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
            res.write(`data: ${JSON.stringify({ type: "PROGRESS", message: event.purpose || "Analyzing campaigns..." })}\n\n`);
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

            // Generate monitoring report
            const report = generateMonitoringReport(ads, business_name, industry || "business");

            res.write(`data: ${JSON.stringify({ type: "PROGRESS", message: "Analyzing ad health metrics..." })}\n\n`);

            res.write(`data: ${JSON.stringify({
              type: "COMPLETE",
              ads,
              monitoring_report: report,
            })}\n\n`);
            return res.end();
          }
        } catch {}
      }
    }

    clearTimeout(timeout);
    const emptyReport = generateMonitoringReport([], business_name, industry || "business");
    res.write(`data: ${JSON.stringify({
      type: "COMPLETE",
      ads: [],
      monitoring_report: emptyReport,
    })}\n\n`);
    res.end();
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: "ERROR", message: error.message || "Campaign monitoring failed" })}\n\n`);
    res.end();
  }
}

function generateMonitoringReport(
  ads: any[],
  businessName: string,
  industry: string
): {
  total_active: number;
  longest_running_days: number;
  fatigue_risk: string[];
  recommendations: string[];
} {
  const now = Date.now();
  const total_active = ads.length;

  // Calculate running days for each ad
  const adDurations = ads.map((ad) => {
    try {
      const start = new Date(ad.started_running_date).getTime();
      return Math.round((now - start) / 86400000);
    } catch {
      return 0;
    }
  }).filter((d) => d > 0);

  const longest_running_days = adDurations.length > 0 ? Math.max(...adDurations) : 0;

  // Fatigue risk: ads running 90+ days
  const fatigueRisk: string[] = [];
  ads.forEach((ad) => {
    try {
      const start = new Date(ad.started_running_date).getTime();
      const days = Math.round((now - start) / 86400000);
      if (days >= 90) {
        fatigueRisk.push(
          `"${(ad.page_name || ad.ad_body_text || "Unknown ad").slice(0, 50)}" — running ${days} days`
        );
      }
    } catch {}
  });

  // Check platform diversity
  const platforms = ads.map((a) => a.platforms?.toLowerCase() || "unknown");
  const uniquePlatforms = new Set(platforms);
  const singlePlatform = uniquePlatforms.size <= 1 && total_active > 0;

  // Generate recommendations
  const recommendations: string[] = [];

  if (total_active === 0) {
    recommendations.push(
      `No active ads found for ${businessName}. Launch test campaigns to establish baseline performance.`
    );
    recommendations.push(
      "Start with 3-5 ad variations across Facebook and Instagram to find winning creatives."
    );
  } else {
    if (total_active < 3) {
      recommendations.push(
        `Only ${total_active} active ad${total_active === 1 ? "" : "s"} detected. Increase to 5+ variations for proper A/B testing.`
      );
    }

    if (fatigueRisk.length > 0) {
      recommendations.push(
        `${fatigueRisk.length} ad${fatigueRisk.length === 1 ? "" : "s"} showing creative fatigue (90+ days). Refresh creatives to prevent audience ad blindness.`
      );
    }

    if (singlePlatform) {
      recommendations.push(
        "All ads running on a single platform. Expand to multi-platform (Facebook, Instagram, Audience Network) for broader reach."
      );
    }

    if (total_active >= 3 && fatigueRisk.length === 0) {
      recommendations.push(
        "Campaign health looks good. Continue monitoring weekly and scale top performers by 20% increments."
      );
    }

    if (longest_running_days > 60 && longest_running_days < 90) {
      recommendations.push(
        `Longest ad running ${longest_running_days} days — approaching fatigue threshold. Prepare fresh creatives.`
      );
    }
  }

  // Ensure at least 2 recommendations
  if (recommendations.length < 2) {
    recommendations.push(
      `Monitor ${businessName} ads weekly for performance changes and competitor movements in ${industry}.`
    );
  }

  return {
    total_active,
    longest_running_days,
    fatigue_risk: fatigueRisk,
    recommendations: recommendations.slice(0, 3),
  };
}

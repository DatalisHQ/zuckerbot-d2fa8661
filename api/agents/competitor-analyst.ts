import {
  supabaseAdmin,
  handleCors,
  createAutomationRun,
  completeAutomationRun,
  failAutomationRun,
  getLastRunForAgent,
  getBusinessWithConfig,
  parseTinyfishSSE,
  extractArrayFromResult,
} from './_utils';

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (handleCors(req, res)) return;

  const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY;
  if (!TINYFISH_API_KEY) return res.status(500).json({ error: 'TinyFish API key not configured' });

  const { business_id, user_id, trigger_type, industry, location, country } = req.body || {};
  if (!business_id || !user_id) {
    return res.status(400).json({ error: 'business_id and user_id required' });
  }

  let runId: string | null = null;
  const startTime = Date.now();

  try {
    // Resolve industry and location from business record if not provided
    const { business } = await getBusinessWithConfig(business_id);
    const resolvedIndustry = industry || business?.trade || business?.industry || '';
    const resolvedLocation = location || business?.suburb || business?.location || '';
    const resolvedCountry = country || business?.country || 'AU';

    if (!resolvedIndustry || !resolvedLocation) {
      return res.status(400).json({ error: 'Could not determine industry or location for this business' });
    }

    runId = await createAutomationRun(
      business_id,
      user_id,
      'competitor_analyst',
      trigger_type || 'manual',
      `Scanning Facebook Ad Library for ${resolvedIndustry} in ${resolvedLocation}`,
      { industry: resolvedIndustry, location: resolvedLocation, country: resolvedCountry }
    );

    // Build the Facebook Ad Library URL
    const searchQuery = encodeURIComponent(resolvedIndustry);
    const countryCode = resolvedCountry === 'AU' ? 'AU' : 'US';
    const adLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${countryCode}&q=${searchQuery}`;

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
        url: adLibraryUrl,
        goal: `Extract the first 5 active ads. Return JSON: {"data": [{"page_name": str, "ad_body_text": str, "started_running_date": str, "platforms": str}]}. Dismiss any popups quickly.`,
        browser_profile: 'stealth',
        proxy_config: { enabled: true, country_code: countryCode },
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

    // Extract ads from the result
    const ads = extractArrayFromResult(resultJson);

    // Generate insights
    const insights = generateInsights(ads, resolvedIndustry);

    // Compare against last run to detect new/stopped ads
    const lastRun = await getLastRunForAgent(business_id, 'competitor_analyst');
    const diff = compareWithLastRun(ads, lastRun?.output?.ads || []);

    const output = {
      ads,
      insights,
      diff,
      ad_count: ads.length,
      scanned_at: new Date().toISOString(),
    };

    const durationMs = Date.now() - startTime;

    // Build summaries
    const summary = `Found ${ads.length} active competitor ads for ${resolvedIndustry} in ${resolvedLocation}. ${diff.new_ads.length} new, ${diff.stopped_ads.length} stopped since last scan.`;

    let firstPersonSummary: string;
    if (ads.length === 0) {
      firstPersonSummary = `I checked the Facebook Ad Library for ${resolvedIndustry} businesses near ${resolvedLocation}. No active competitor ads found right now. That could mean less competition, or competitors may be using other channels.`;
    } else if (diff.new_ads.length > 0) {
      firstPersonSummary = `I scanned your competitors on Facebook. Found ${ads.length} active ads, ${diff.new_ads.length} are new since last time. ${insights.opportunity || ''}`.trim();
    } else {
      firstPersonSummary = `I checked the Facebook Ad Library for ${resolvedIndustry} businesses near ${resolvedLocation}. ${ads.length} competitors are running ads right now. ${insights.opportunity || ''}`.trim();
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
    return res.status(500).json({ error: error.message || 'Competitor analysis failed' });
  }
}

function generateInsights(ads: any[], industry: string): Record<string, string> {
  if (!ads.length) return { summary: 'No active competitor ads found.' };

  const avgLen = Math.round(
    ads.reduce((s: number, a: any) => s + (a.ad_body_text?.length || 0), 0) / ads.length
  );
  const multi = ads.filter((a: any) => a.platforms?.includes(',')).length;
  const longRun = ads.filter((a: any) => {
    try {
      return (Date.now() - new Date(a.started_running_date).getTime()) / 86400000 > 90;
    } catch {
      return false;
    }
  }).length;

  return {
    summary: `Found ${ads.length} active competitor ads in ${industry}.`,
    avg_copy_length: `${avgLen} chars avg copy length`,
    multi_platform: `${multi}/${ads.length} ads on multiple platforms`,
    long_running: `${longRun}/${ads.length} running 90+ days`,
    opportunity:
      longRun > ads.length / 2
        ? 'Competitors rely on evergreen ads. Fresh creative could stand out.'
        : 'Active market. Strong differentiation needed.',
  };
}

function compareWithLastRun(
  currentAds: any[],
  previousAds: any[]
): { new_ads: string[]; stopped_ads: string[]; unchanged: number } {
  const currentNames = new Set(currentAds.map((a: any) => a.page_name?.toLowerCase()).filter(Boolean));
  const previousNames = new Set(previousAds.map((a: any) => a.page_name?.toLowerCase()).filter(Boolean));

  const newAds: string[] = [];
  for (const name of currentNames) {
    if (!previousNames.has(name)) newAds.push(name);
  }

  const stoppedAds: string[] = [];
  for (const name of previousNames) {
    if (!currentNames.has(name)) stoppedAds.push(name);
  }

  const unchanged = currentAds.length - newAds.length;

  return { new_ads: newAds, stopped_ads: stoppedAds, unchanged: Math.max(0, unchanged) };
}

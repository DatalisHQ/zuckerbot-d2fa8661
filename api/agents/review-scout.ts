import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 45 };

const supabaseUrl = process.env.SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { business_id, user_id, trigger_type } = req.body || {};
  if (!business_id || !user_id) {
    return res.status(400).json({ error: 'business_id and user_id required' });
  }

  let runId: string | null = null;
  const startTime = Date.now();

  try {
    const { data: business } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', business_id)
      .single();

    const resolvedName = business?.name || '';
    const resolvedLocation = business?.suburb || business?.country || '';

    if (!resolvedName) {
      return res.status(400).json({ error: 'Could not determine business name' });
    }

    // Create run
    const { data: run, error: runErr } = await supabase
      .from('automation_runs')
      .insert({
        business_id,
        user_id,
        agent_type: 'review_scout',
        status: 'running',
        trigger_type: trigger_type || 'manual',
        trigger_reason: `Scanning reviews for ${resolvedName}`,
        input: { business_name: resolvedName, location: resolvedLocation },
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (runErr) throw new Error(`Failed to create run: ${runErr.message}`);
    runId = run.id;

    // Search Brave
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

    // Claude extraction
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
            content: `Analyze search results for "${resolvedName}" in ${resolvedLocation}:\n\n${searchContext}\n\nReturn JSON:\n{"rating":number|null,"total_reviews":number|null,"reviews":[{"text":"str","author":"str","stars":number,"date":"str"}],"keywords":["positive attributes"],"reputation_summary":"one sentence"}\n\nUse actual quotes if found, otherwise synthesize 2-3 testimonials grounded in specific qualities from search results. If no useful info, return empty reviews.`
          }],
        }),
      });

      if (claudeRes.ok) {
        const cd = await claudeRes.json();
        try { reviewData = JSON.parse(cd.content?.[0]?.text || '{}'); } catch {}
      }
    }

    const reviews = (reviewData.reviews || []).slice(0, 5);
    const keywords = (reviewData.keywords || []).slice(0, 10);
    const durationMs = Date.now() - startTime;

    const firstPersonSummary = reviews.length > 0
      ? `I scanned your online reputation. ${reviewData.rating || '?'} stars from ${reviewData.total_reviews || 'multiple'} reviews. Customers highlight ${keywords.slice(0, 2).join(' and ') || 'your service'}.`
      : `I searched for reviews of ${resolvedName} but found limited data. Make sure your Google Business Profile is active.`;

    await supabase
      .from('automation_runs')
      .update({
        status: 'completed',
        output: {
          business_name: resolvedName,
          rating: reviewData.rating || null,
          total_reviews: reviewData.total_reviews || null,
          reviews,
          keywords,
          reputation_summary: reviewData.reputation_summary || null,
          scanned_at: new Date().toISOString(),
        },
        summary: `${resolvedName}: ${reviewData.rating || '?'} stars, ${reviews.length} reviews extracted`,
        first_person_summary: firstPersonSummary,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    return res.status(200).json({ run_id: runId, status: 'completed' });
  } catch (error: any) {
    if (runId) {
      await supabase.from('automation_runs').update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }
    return res.status(500).json({ error: error.message });
  }
}

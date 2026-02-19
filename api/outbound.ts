import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 120 };

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY || 'sk-tinyfish-yhJdYawm4o3hJWazXIll7OKnx4ksAeIQ';
const TINYFISH_URL = 'https://agent.tinyfish.ai/v1/automation/run-sse';

const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'QUIT', 'CANCEL', 'END', 'OPTOUT'];

// ── Router ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Route by query param: ?action=scrape|send|track|webhook|summary
  const action = (req.query.action as string) || '';

  switch (action) {
    case 'track':
      return handleTrackClick(req, res);
    case 'webhook':
      return handleSmsWebhook(req, res);
    case 'scrape':
      return requireAdmin(req, res) || handleScrape(req, res);
    case 'send':
      return requireAdmin(req, res) || handleSendSms(req, res);
    case 'summary':
      return requireAdmin(req, res) || handleSummary(req, res);
    default:
      return res.status(400).json({ error: 'Unknown action. Use ?action=scrape|send|track|webhook|summary' });
  }
}

function requireAdmin(req: VercelRequest, res: VercelResponse): void | null {
  const adminKey = req.headers['x-admin-key'] as string;
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  return null;
}

// ── Track Click ────────────────────────────────────────────────────────────

async function handleTrackClick(req: VercelRequest, res: VercelResponse) {
  const ref = req.query.ref as string;
  if (!ref) return res.redirect(302, 'https://zuckerbot.ai');

  const { data: prospect } = await supabase
    .from('outbound_prospects')
    .select('id, website, business_name, link_clicks, status')
    .eq('tracking_id', ref)
    .single();

  if (!prospect) return res.redirect(302, 'https://zuckerbot.ai');

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    link_clicks: prospect.link_clicks + 1,
    last_clicked_at: now,
    updated_at: now,
  };
  if (prospect.status === 'contacted') updateData.status = 'clicked';

  await supabase.from('outbound_prospects').update(updateData).eq('id', prospect.id);

  const redirectUrl = prospect.website
    ? `https://zuckerbot.ai/?url=${encodeURIComponent(prospect.website)}&utm_source=sms&utm_medium=outbound`
    : `https://zuckerbot.ai/?biz=${encodeURIComponent(prospect.business_name)}&utm_source=sms&utm_medium=outbound`;

  return res.redirect(302, redirectUrl);
}

// ── SMS Webhook ────────────────────────────────────────────────────────────

async function handleSmsWebhook(req: VercelRequest, res: VercelResponse) {
  let from = '', body = '';
  if (typeof req.body === 'string') {
    const params = new URLSearchParams(req.body);
    from = params.get('From') || '';
    body = params.get('Body') || '';
  } else {
    from = req.body?.From || '';
    body = req.body?.Body || '';
  }

  if (!from) {
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }

  // Normalize AU phone
  let cleaned = from.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+61')) cleaned = '0' + cleaned.slice(3);
  else if (cleaned.startsWith('61') && cleaned.length === 11) cleaned = '0' + cleaned.slice(2);

  const lastNine = cleaned.replace(/^0/, '').slice(-9);

  // Find prospect by phone
  let prospect: { id: string; status: string } | null = null;
  for (const variant of [from, cleaned, '+61' + cleaned.replace(/^0/, '')]) {
    const { data } = await supabase.from('outbound_prospects').select('id, status').eq('phone', variant).single();
    if (data) { prospect = data; break; }
  }
  if (!prospect && lastNine.length === 9) {
    const { data } = await supabase.from('outbound_prospects').select('id, status').ilike('phone', `%${lastNine}`).limit(1).single();
    if (data) prospect = data;
  }

  if (prospect) {
    const now = new Date().toISOString();
    const isOptOut = OPT_OUT_KEYWORDS.some(kw => body.trim().toUpperCase() === kw || body.trim().toUpperCase().includes(kw));
    if (isOptOut) {
      await supabase.from('outbound_prospects').update({ status: 'opted_out', reply_text: body, replied_at: now, updated_at: now }).eq('id', prospect.id);
    } else {
      const updateData: Record<string, unknown> = { reply_text: body, replied_at: now, updated_at: now };
      if (['new', 'contacted', 'clicked'].includes(prospect.status)) updateData.status = 'replied';
      await supabase.from('outbound_prospects').update(updateData).eq('id', prospect.id);
    }
  }

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
}

// ── Scrape Prospects ───────────────────────────────────────────────────────

interface ScrapedBusiness {
  name: string;
  phone: string;
  website?: string;
  rating?: number;
  review_count?: number;
  address?: string;
}

async function scrapeSuburb(suburb: string, industry: string): Promise<ScrapedBusiness[]> {
  const searchTerm = industry === 'dental' ? 'dentist' : industry;
  const url = `https://www.google.com/maps/search/${encodeURIComponent(searchTerm + ' near ' + suburb)}`;

  const response = await fetch(TINYFISH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': TINYFISH_API_KEY },
    body: JSON.stringify({
      url,
      goal: `Find all dental practices visible on the map. For each one, extract: {"businesses": [{"name": str, "phone": str, "website": str, "rating": number, "review_count": number, "address": str}]}. Get as many as possible, scroll down the results list. Extract phone numbers and websites from the business details.`,
      browser_profile: 'stealth',
      proxy_config: { enabled: true, country_code: 'AU' },
    }),
  });

  if (!response.ok) throw new Error(`TinyFish error ${response.status}`);

  const text = await response.text();
  let resultData: { businesses?: ScrapedBusiness[] } | null = null;

  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      const parsed = JSON.parse(line.slice(6));
      if (parsed.type === 'COMPLETE' || parsed.status === 'COMPLETED') {
        const rj = parsed.resultJson || parsed.data?.resultJson;
        resultData = typeof rj === 'string' ? JSON.parse(rj) : rj;
      }
    } catch {}
  }

  if (!resultData?.businesses) return [];
  return resultData.businesses.filter((b: ScrapedBusiness) => b.name && b.phone);
}

async function handleScrape(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { suburbs, industry = 'dental' } = req.body || {};
  if (!Array.isArray(suburbs) || suburbs.length === 0) {
    return res.status(400).json({ error: 'suburbs must be a non-empty array' });
  }

  const results: { suburb: string; scraped: number; inserted: number; errors: string[] }[] = [];
  let totalInserted = 0, totalScraped = 0;

  for (const suburb of suburbs) {
    const r = { suburb, scraped: 0, inserted: 0, errors: [] as string[] };
    try {
      const businesses = await scrapeSuburb(suburb, industry);
      r.scraped = businesses.length;
      totalScraped += businesses.length;

      for (const biz of businesses) {
        const phone = biz.phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
        if (!phone) continue;

        // Extract suburb/state from address
        const auStates = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
        let state: string | null = null;
        if (biz.address) {
          for (const s of auStates) {
            if (biz.address.toUpperCase().includes(s)) { state = s; break; }
          }
        }

        const { error } = await supabase.from('outbound_prospects').insert({
          business_name: biz.name, phone, website: biz.website || null,
          suburb: suburb, state, rating: biz.rating || null,
          review_count: biz.review_count || null, industry,
          source: 'google_maps', scraped_data: biz,
        });

        if (error && error.code !== '23505') {
          r.errors.push(`${biz.name}: ${error.message}`);
        } else if (!error) {
          r.inserted++;
          totalInserted++;
        }
      }
    } catch (err: unknown) {
      r.errors.push(`Scrape failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    results.push(r);
  }

  return res.status(200).json({ total_scraped: totalScraped, total_inserted: totalInserted, by_suburb: results });
}

// ── Send SMS ───────────────────────────────────────────────────────────────

interface Prospect {
  id: string;
  business_name: string;
  phone: string;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  tracking_id: string;
  sms_count: number;
  first_sms_at: string | null;
}

function buildSmsBody(p: Prospect): string {
  const trackUrl = `https://zuckerbot.ai/api/outbound?action=track&ref=${p.tracking_id}`;
  const hasRating = p.rating && p.review_count;

  if (hasRating) {
    return `Hey! I found ${p.business_name} on Google Maps. ${p.rating} stars from ${p.review_count} reviews, that's great. But I noticed you're not running Facebook ads. I built an AI that creates ad campaigns specifically for dental practices. Want to see what yours would look like? Free preview, takes 60 seconds: ${trackUrl}\n\nReply STOP to opt out.`;
  }
  return `Hey! I found ${p.business_name} on Google Maps but noticed you're not running Facebook ads. I built an AI that creates ad campaigns specifically for dental practices. Want to see what yours would look like? Free preview, takes 60 seconds: ${trackUrl}\n\nReply STOP to opt out.`;
}

async function handleSendSms(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { prospect_id, batch_size = 10, dry_run = false } = req.body || {};
  let prospects: Prospect[];

  if (prospect_id) {
    const { data, error } = await supabase.from('outbound_prospects')
      .select('id, business_name, phone, website, rating, review_count, tracking_id, sms_count, first_sms_at')
      .eq('id', prospect_id).single();
    if (error || !data) return res.status(404).json({ error: 'Prospect not found' });
    prospects = [data as Prospect];
  } else {
    const { data } = await supabase.from('outbound_prospects')
      .select('id, business_name, phone, website, rating, review_count, tracking_id, sms_count, first_sms_at')
      .eq('status', 'new').order('created_at', { ascending: true }).limit(Math.min(batch_size, 100));
    prospects = (data || []) as Prospect[];
  }

  if (prospects.length === 0) return res.status(200).json({ sent: 0, failed: 0, message: 'No prospects to send to' });

  const messages = prospects.map(p => ({ prospect: p, body: buildSmsBody(p) }));

  if (dry_run) {
    return res.status(200).json({
      dry_run: true, count: messages.length,
      previews: messages.map(m => ({ id: m.prospect.id, business: m.prospect.business_name, phone: m.prospect.phone, message: m.body, chars: m.body.length })),
    });
  }

  const results: Array<{ id: string; business: string; success: boolean; error?: string }> = [];

  for (const msg of messages) {
    try {
      const smsRes = await fetch(`${SUPABASE_URL}/functions/v1/outbound-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ to: msg.prospect.phone, body: msg.body, prospect_id: msg.prospect.id }),
      });
      const data = await smsRes.json();
      results.push({ id: msg.prospect.id, business: msg.prospect.business_name, success: data.success || false, error: data.error });
    } catch (err: any) {
      results.push({ id: msg.prospect.id, business: msg.prospect.business_name, success: false, error: err.message });
    }
    if (messages.length > 1) await new Promise(r => setTimeout(r, 500));
  }

  return res.status(200).json({ sent: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, total: results.length, results });
}

// ── Summary ────────────────────────────────────────────────────────────────

async function handleSummary(req: VercelRequest, res: VercelResponse) {
  const { count: total } = await supabase.from('outbound_prospects').select('*', { count: 'exact', head: true });

  const statuses = ['new', 'contacted', 'clicked', 'replied', 'interested', 'booked', 'closed', 'opted_out', 'dead'];
  const byStatus: Record<string, number> = {};
  for (const s of statuses) {
    const { count } = await supabase.from('outbound_prospects').select('*', { count: 'exact', head: true }).eq('status', s);
    byStatus[s] = count || 0;
  }

  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const { count: todaySent } = await supabase.from('outbound_prospects').select('*', { count: 'exact', head: true }).gte('last_sms_at', todayISO);
  const { count: todayClicked } = await supabase.from('outbound_prospects').select('*', { count: 'exact', head: true }).gte('last_clicked_at', todayISO);
  const { count: todayReplied } = await supabase.from('outbound_prospects').select('*', { count: 'exact', head: true }).not('replied_at', 'is', null).gte('replied_at', todayISO);

  const { data: topReplies } = await supabase.from('outbound_prospects').select('id, business_name, phone, reply_text, replied_at, status').not('reply_text', 'is', null).order('replied_at', { ascending: false }).limit(5);

  const { count: readyToSend } = await supabase.from('outbound_prospects').select('*', { count: 'exact', head: true }).eq('status', 'new');

  return res.status(200).json({ total_prospects: total || 0, by_status: byStatus, today: { sent: todaySent || 0, clicked: todayClicked || 0, replied: todayReplied || 0 }, top_replies: topReplies || [], ready_to_send: readyToSend || 0 });
}

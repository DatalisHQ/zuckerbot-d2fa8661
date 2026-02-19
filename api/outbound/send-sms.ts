import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

function buildSmsBody(prospect: Prospect): string {
  const hasRating = prospect.rating && prospect.review_count;

  // Use click tracker URL so we can track opens
  const trackUrl = `https://zuckerbot.ai/api/outbound/track-click?ref=${prospect.tracking_id}`;

  let body: string;
  if (hasRating) {
    body =
      `Hey! I found ${prospect.business_name} on Google Maps. ` +
      `${prospect.rating} stars from ${prospect.review_count} reviews, that's great. ` +
      `But I noticed you're not running Facebook ads. ` +
      `I built an AI that creates ad campaigns specifically for dental practices. ` +
      `Want to see what yours would look like? Free preview, takes 60 seconds: ${trackUrl}` +
      `\n\nReply STOP to opt out.`;
  } else {
    body =
      `Hey! I found ${prospect.business_name} on Google Maps but noticed you're not running Facebook ads. ` +
      `I built an AI that creates ad campaigns specifically for dental practices. ` +
      `Want to see what yours would look like? Free preview, takes 60 seconds: ${trackUrl}` +
      `\n\nReply STOP to opt out.`;
  }

  return body;
}

async function sendViaSupa(to: string, body: string, prospectId: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/outbound-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ to, body, prospect_id: prospectId }),
    });

    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to call outbound-sms function' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth check
  const adminKey = req.headers['x-admin-key'] as string;
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { prospect_id, batch_size = 10, dry_run = false } = req.body || {};

  try {
    let prospects: Prospect[];

    if (prospect_id) {
      // Single prospect
      const { data, error } = await supabase
        .from('outbound_prospects')
        .select('id, business_name, phone, website, rating, review_count, tracking_id, sms_count, first_sms_at')
        .eq('id', prospect_id)
        .single();

      if (error || !data) return res.status(404).json({ error: 'Prospect not found' });
      prospects = [data as Prospect];
    } else {
      // Batch: get next N with status='new'
      const { data, error } = await supabase
        .from('outbound_prospects')
        .select('id, business_name, phone, website, rating, review_count, tracking_id, sms_count, first_sms_at')
        .eq('status', 'new')
        .order('created_at', { ascending: true })
        .limit(Math.min(batch_size, 100));

      if (error) return res.status(500).json({ error: error.message });
      prospects = (data || []) as Prospect[];
    }

    if (prospects.length === 0) {
      return res.status(200).json({ sent: 0, failed: 0, message: 'No prospects to send to' });
    }

    // Build messages
    const messages = prospects.map(p => ({
      prospect: p,
      body: buildSmsBody(p),
    }));

    if (dry_run) {
      return res.status(200).json({
        dry_run: true,
        count: messages.length,
        previews: messages.map(m => ({
          id: m.prospect.id,
          business: m.prospect.business_name,
          phone: m.prospect.phone,
          message: m.body,
          chars: m.body.length,
        })),
      });
    }

    // Send
    const results: Array<{ id: string; business: string; success: boolean; error?: string }> = [];

    for (const msg of messages) {
      const result = await sendViaSupa(msg.prospect.phone, msg.body, msg.prospect.id);
      results.push({
        id: msg.prospect.id,
        business: msg.prospect.business_name,
        success: result.success || false,
        error: result.error,
      });

      // Small delay between sends to avoid rate limiting
      if (messages.length > 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return res.status(200).json({ sent, failed, total: results.length, results });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'QUIT', 'CANCEL', 'END', 'OPTOUT'];

function normalizePhone(phone: string): string {
  // Strip all non-digit/plus chars
  let cleaned = phone.replace(/[^\d+]/g, '');

  // Convert +61 to 0 prefix for matching (Australian numbers)
  if (cleaned.startsWith('+61')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('61') && cleaned.length === 11) {
    cleaned = '0' + cleaned.slice(2);
  }

  return cleaned;
}

function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  // Parse the incoming Twilio webhook (form-encoded or JSON)
  let from: string;
  let body: string;

  if (typeof req.body === 'string') {
    const parsed = parseFormBody(req.body);
    from = parsed.From || '';
    body = parsed.Body || '';
  } else {
    from = req.body?.From || '';
    body = req.body?.Body || '';
  }

  if (!from) {
    // Return valid TwiML even on bad request
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }

  const normalizedFrom = normalizePhone(from);
  const bodyUpper = body.trim().toUpperCase();

  // Try to find the prospect by phone (try multiple formats)
  const phonesToTry = [from, normalizedFrom];

  // Also try without leading zero (raw digits)
  if (normalizedFrom.startsWith('0')) {
    phonesToTry.push(normalizedFrom.slice(1));
    phonesToTry.push('+61' + normalizedFrom.slice(1));
  }

  let prospect: { id: string; status: string } | null = null;

  for (const phoneVariant of phonesToTry) {
    const { data } = await supabase
      .from('outbound_prospects')
      .select('id, status')
      .eq('phone', phoneVariant)
      .single();

    if (data) {
      prospect = data;
      break;
    }
  }

  // Also try partial match with ilike if exact match fails
  if (!prospect) {
    const lastNine = normalizedFrom.replace(/^0/, '').slice(-9);
    if (lastNine.length === 9) {
      const { data } = await supabase
        .from('outbound_prospects')
        .select('id, status')
        .ilike('phone', `%${lastNine}`)
        .limit(1)
        .single();

      if (data) {
        prospect = data;
      }
    }
  }

  if (prospect) {
    const now = new Date().toISOString();
    const isOptOut = OPT_OUT_KEYWORDS.some((kw) => bodyUpper === kw || bodyUpper.includes(kw));

    if (isOptOut) {
      await supabase
        .from('outbound_prospects')
        .update({
          status: 'opted_out',
          reply_text: body,
          replied_at: now,
          updated_at: now,
        })
        .eq('id', prospect.id);
    } else {
      // Only update status if it makes sense (don't overwrite booked/closed)
      const upgradableStatuses = ['new', 'contacted', 'clicked'];
      const updateData: Record<string, unknown> = {
        reply_text: body,
        replied_at: now,
        updated_at: now,
      };

      if (upgradableStatuses.includes(prospect.status)) {
        updateData.status = 'replied';
      }

      await supabase
        .from('outbound_prospects')
        .update(updateData)
        .eq('id', prospect.id);
    }
  }

  // Return empty TwiML response
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
}

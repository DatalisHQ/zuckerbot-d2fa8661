import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ref = req.query.ref as string;

  if (!ref) {
    return res.redirect(302, 'https://zuckerbot.ai');
  }

  // Look up the prospect by tracking_id
  const { data: prospect, error } = await supabase
    .from('outbound_prospects')
    .select('id, website, business_name, link_clicks, status')
    .eq('tracking_id', ref)
    .single();

  if (error || !prospect) {
    // Unknown ref, just redirect to homepage
    return res.redirect(302, 'https://zuckerbot.ai');
  }

  // Update click tracking
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    link_clicks: prospect.link_clicks + 1,
    last_clicked_at: now,
    updated_at: now,
  };

  // Only upgrade status if currently 'contacted' (don't downgrade 'replied' etc.)
  if (prospect.status === 'contacted') {
    updateData.status = 'clicked';
  }

  await supabase
    .from('outbound_prospects')
    .update(updateData)
    .eq('id', prospect.id);

  // Build redirect URL
  let redirectUrl: string;
  if (prospect.website) {
    redirectUrl = `https://zuckerbot.ai/?url=${encodeURIComponent(prospect.website)}&utm_source=sms&utm_medium=outbound`;
  } else {
    redirectUrl = `https://zuckerbot.ai/?biz=${encodeURIComponent(prospect.business_name)}&utm_source=sms&utm_medium=outbound`;
  }

  return res.redirect(302, redirectUrl);
}

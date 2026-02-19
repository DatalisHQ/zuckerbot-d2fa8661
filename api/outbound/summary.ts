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

  const adminKey = req.headers['x-admin-key'] as string;
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Total prospects
  const { count: totalProspects } = await supabase
    .from('outbound_prospects')
    .select('*', { count: 'exact', head: true });

  // Count by status
  const statuses = ['new', 'contacted', 'clicked', 'replied', 'interested', 'booked', 'closed', 'opted_out', 'dead'];
  const byStatus: Record<string, number> = {};

  for (const status of statuses) {
    const { count } = await supabase
      .from('outbound_prospects')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);
    byStatus[status] = count || 0;
  }

  // Today's activity
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const { count: todaySent } = await supabase
    .from('outbound_prospects')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'contacted')
    .gte('last_sms_at', todayISO);

  // For "today clicked" we check last_clicked_at
  const { count: todayClicked } = await supabase
    .from('outbound_prospects')
    .select('*', { count: 'exact', head: true })
    .gte('last_clicked_at', todayISO);

  // For "today replied" we check replied_at
  const { count: todayReplied } = await supabase
    .from('outbound_prospects')
    .select('*', { count: 'exact', head: true })
    .not('replied_at', 'is', null)
    .gte('replied_at', todayISO);

  // Top 5 recent replies
  const { data: topReplies } = await supabase
    .from('outbound_prospects')
    .select('id, business_name, phone, reply_text, replied_at, status')
    .not('reply_text', 'is', null)
    .order('replied_at', { ascending: false })
    .limit(5);

  // Ready to send count
  const { count: readyToSend } = await supabase
    .from('outbound_prospects')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'new');

  return res.status(200).json({
    total_prospects: totalProspects || 0,
    by_status: byStatus,
    today: {
      sent: todaySent || 0,
      clicked: todayClicked || 0,
      replied: todayReplied || 0,
    },
    top_replies: topReplies || [],
    ready_to_send: readyToSend || 0,
  });
}

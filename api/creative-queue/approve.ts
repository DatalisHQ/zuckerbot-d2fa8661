import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../agents/_utils.js';
import { launchCreativeQueueVariant } from '../../lib/creative-queue.js';
import { sendSlackApprovalDecision } from '../../lib/slack.js';

export const config = { maxDuration: 60 };

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { queue_id, action, pause_existing_ad = false } = req.body || {};
  if (!queue_id || !action) {
    return res.status(400).json({ error: 'queue_id and action are required' });
  }
  if (action !== 'approve' && action !== 'deny') {
    return res.status(400).json({ error: 'action must be "approve" or "deny"' });
  }

  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: authError } = await supabaseAnon.auth.getUser(token);
  if (authError || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userId = userData.user.id;

  const { data: queueRow, error: queueError } = await supabaseAdmin
    .from('creative_queue')
    .select('id, campaign_id, status, variant_data')
    .eq('id', queue_id)
    .single();

  if (queueError || !queueRow) {
    return res.status(404).json({ error: 'Creative queue row not found' });
  }

  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from('campaigns')
    .select('id, name, business_id')
    .eq('id', queueRow.campaign_id)
    .single();

  if (campaignError || !campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const { data: businessAccess } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('id', campaign.business_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!businessAccess) {
    return res.status(403).json({ error: 'You do not have access to this business' });
  }

  if (queueRow.status === 'launched') {
    return res.status(400).json({ error: 'This creative has already been launched' });
  }

  if (action === 'deny') {
    await supabaseAdmin
      .from('creative_queue')
      .update({
        status: 'denied',
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', queue_id);

    await sendSlackApprovalDecision({
      runId: queue_id,
      campaignName: campaign.name,
      actionType: 'refresh_creative',
      decision: 'denied',
      summary: 'Creative variant was denied and not launched.',
    });

    return res.status(200).json({
      queue_id,
      status: 'denied',
      message: 'Creative variant denied.',
    });
  }

  await supabaseAdmin
    .from('creative_queue')
    .update({
      status: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', queue_id);

  const result = await launchCreativeQueueVariant({
    queueId: queue_id,
    userId,
    pauseExistingAd: !!pause_existing_ad,
  });

  if (!result.ok) {
    await sendSlackApprovalDecision({
      runId: queue_id,
      campaignName: campaign.name,
      actionType: 'refresh_creative',
      decision: 'failed',
      summary: result.error || 'Creative launch failed.',
    });
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
}

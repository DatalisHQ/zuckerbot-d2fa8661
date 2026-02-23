import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin, handleCors } from './_utils.js';

export const config = { maxDuration: 60 };

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export default async function handler(req: any, res: any) {
  if (handleCors(req, res)) return;

  const { run_id, action } = req.body || {};
  if (!run_id || !action) {
    return res.status(400).json({ error: 'run_id and action required' });
  }

  if (action !== 'approve' && action !== 'dismiss') {
    return res.status(400).json({ error: 'action must be "approve" or "dismiss"' });
  }

  // Authenticate the user via the Authorization header using the anon client
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

  try {
    // Fetch the automation run to verify it exists and requires approval
    const { data: run, error: fetchError } = await supabaseAdmin
      .from('automation_runs')
      .select('*')
      .eq('id', run_id)
      .single();

    if (fetchError || !run) {
      return res.status(404).json({ error: 'Automation run not found' });
    }

    // Verify the user owns this business
    const { data: businessAccess } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('id', run.business_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!businessAccess) {
      return res.status(403).json({ error: 'You do not have access to this business' });
    }

    if (!run.requires_approval) {
      return res.status(400).json({ error: 'This run does not require approval' });
    }

    if (run.status !== 'needs_approval') {
      return res.status(400).json({ error: `Run is in "${run.status}" status, not awaiting approval` });
    }

    // Update the run with the approval action
    const now = new Date().toISOString();
    const newStatus = action === 'approve' ? 'approved' : 'dismissed';

    const { error: updateError } = await supabaseAdmin
      .from('automation_runs')
      .update({
        status: newStatus,
        approved_at: now,
        approved_action: action,
        approved_by: userId,
      })
      .eq('id', run_id);

    if (updateError) {
      throw new Error(`Failed to update run: ${updateError.message}`);
    }

    // For Phase 2: If action is 'approve', we would execute the actual changes here.
    // For example, calling Meta API to adjust budgets, pause campaigns, etc.
    // For now, we just mark the approval and return.

    return res.status(200).json({
      run_id,
      action,
      status: newStatus,
      message: action === 'approve'
        ? 'Approved. Changes will be executed in Phase 2.'
        : 'Dismissed. No action taken.',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Approval processing failed' });
  }
}

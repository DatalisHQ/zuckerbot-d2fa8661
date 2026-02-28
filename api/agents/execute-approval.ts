import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin, handleCors, getLastRunForAgent, getBusinessWithConfig } from './_utils.js';
import { pauseMetaCampaign, updateAdsetDailyBudget } from './meta.js';
import type { OptimizationAction } from './campaign-optimizer.js';

export const config = { maxDuration: 60 };

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Budget safety constants
const MIN_DAILY_BUDGET_CENTS = 500;   // $5
const DEFAULT_MAX_DAILY_BUDGET_CENTS = 10_000; // $100, overridden by automation_config if present

interface ExecutionResult {
  action_type: string;
  campaign_id: string;
  campaign_name: string;
  ok: boolean;
  status: string;
  error?: string;
  detail?: Record<string, any>;
}

/**
 * Resolve the list of OptimizationAction objects for a run.
 * Prefers run.output.actions (structured). Falls back to run.output.recommendations (legacy).
 * If neither, loads the latest campaign_optimizer run for the business.
 */
async function resolveActions(run: any): Promise<OptimizationAction[]> {
  // Structured actions from this run (new format)
  if (Array.isArray(run.output?.actions) && run.output.actions.length > 0) {
    return run.output.actions as OptimizationAction[];
  }

  // Legacy: map recommendations to OptimizationAction shape
  if (Array.isArray(run.output?.recommendations) && run.output.recommendations.length > 0) {
    return mapLegacyRecommendations(run.output.recommendations);
  }

  // Fallback: fetch the latest campaign_optimizer run for this business
  if (run.agent_type !== 'campaign_optimizer') {
    const lastOptimizerRun = await getLastRunForAgent(run.business_id, 'campaign_optimizer');
    if (lastOptimizerRun) {
      if (Array.isArray(lastOptimizerRun.output?.actions) && lastOptimizerRun.output.actions.length > 0) {
        return lastOptimizerRun.output.actions as OptimizationAction[];
      }
      if (Array.isArray(lastOptimizerRun.output?.recommendations) && lastOptimizerRun.output.recommendations.length > 0) {
        return mapLegacyRecommendations(lastOptimizerRun.output.recommendations);
      }
    }
  }

  return [];
}

/** Map the legacy Recommendation shape to OptimizationAction. */
function mapLegacyRecommendations(recommendations: any[]): OptimizationAction[] {
  return recommendations.map((r: any): OptimizationAction => {
    switch (r.action) {
      case 'pause':
        return { type: 'pause_campaign', campaign_id: r.campaign_id, campaign_name: r.campaign_name, reason: r.reason || '', executable: true, requires_approval: true };
      case 'reduce_budget':
        return { type: 'reduce_budget', campaign_id: r.campaign_id, campaign_name: r.campaign_name, reason: r.reason || '', pct_change: r.pct_change ?? -0.30, executable: true, requires_approval: true };
      case 'increase_budget':
        return { type: 'increase_budget', campaign_id: r.campaign_id, campaign_name: r.campaign_name, reason: r.reason || '', pct_change: r.pct_change ?? 0.20, executable: true, requires_approval: true };
      case 'shift_budget':
        return { type: 'shift_budget', campaign_id: r.campaign_id, campaign_name: r.campaign_name, reason: r.reason || '', pct_change: r.pct_change ?? 0.30, executable: true, requires_approval: true };
      default:
        return { type: r.action || 'monitor', campaign_id: r.campaign_id, campaign_name: r.campaign_name, reason: r.reason || '', executable: false, requires_approval: false };
    }
  });
}

/** Execute a single OptimizationAction. Never throws — returns a result object. */
async function executeAction(
  action: OptimizationAction,
  accessToken: string,
  maxBudgetCents: number,
): Promise<ExecutionResult> {
  const base = {
    action_type: action.type,
    campaign_id: action.campaign_id,
    campaign_name: action.campaign_name,
  };

  // Non-executable actions (creative refresh, monitor) — skip gracefully
  if (!action.executable) {
    return { ...base, ok: false, status: 'unsupported', error: `"${action.type}" requires human action and cannot be automated` };
  }

  try {
    // Look up Meta IDs and current budget from campaigns table using the internal campaign UUID
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('id, meta_campaign_id, meta_adset_id, daily_budget_cents, status')
      .eq('id', action.campaign_id)
      .maybeSingle();

    if (!campaign) {
      return { ...base, ok: false, status: 'not_found', error: `Campaign ${action.campaign_id} not found in DB` };
    }

    // ── PAUSE ────────────────────────────────────────────────────────────────
    if (action.type === 'pause_campaign') {
      if (!campaign.meta_campaign_id) {
        return { ...base, ok: false, status: 'not_launched', error: 'Campaign has no meta_campaign_id; not launched on Meta yet' };
      }
      const result = await pauseMetaCampaign(accessToken, campaign.meta_campaign_id);
      if (result.ok) {
        supabaseAdmin.from('campaigns').update({ status: 'paused' }).eq('id', campaign.id).then(() => {});
      }
      return {
        ...base,
        ok: result.ok,
        status: result.ok ? 'paused' : 'meta_error',
        error: result.error,
        detail: result.ok ? { meta_campaign_id: campaign.meta_campaign_id } : result.data,
      };
    }

    // ── BUDGET UPDATE (reduce / increase / shift) ────────────────────────────
    if (action.type === 'reduce_budget' || action.type === 'increase_budget' || action.type === 'shift_budget') {
      if (!campaign.meta_adset_id) {
        return {
          ...base,
          ok: false,
          status: 'not_supported',
          error: 'Campaign has no meta_adset_id stored. Budget update requires the ad set ID to be saved at launch time.',
        };
      }
      const currentCents = campaign.daily_budget_cents ?? 0;
      if (currentCents === 0) {
        return { ...base, ok: false, status: 'skipped', error: 'Current daily_budget_cents is 0; cannot compute new budget' };
      }
      const pctChange = action.pct_change ?? (action.type === 'reduce_budget' ? -0.30 : 0.20);
      const rawNewCents = Math.round(currentCents * (1 + pctChange));
      const newBudgetCents = Math.max(MIN_DAILY_BUDGET_CENTS, Math.min(rawNewCents, maxBudgetCents));

      const result = await updateAdsetDailyBudget(accessToken, campaign.meta_adset_id, newBudgetCents);
      if (result.ok) {
        supabaseAdmin.from('campaigns').update({ daily_budget_cents: newBudgetCents }).eq('id', campaign.id).then(() => {});
      }
      return {
        ...base,
        ok: result.ok,
        status: result.ok ? 'budget_updated' : 'meta_error',
        error: result.error,
        detail: result.ok
          ? { previous_budget_cents: currentCents, new_budget_cents: newBudgetCents, pct_change: pctChange }
          : result.data,
      };
    }

    return { ...base, ok: false, status: 'unsupported', error: `Unsupported action type: ${action.type}` };

  } catch (err: any) {
    return { ...base, ok: false, status: 'error', error: err.message || 'Unexpected error during action execution' };
  }
}

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
    // Fetch the automation run
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

    const now = new Date().toISOString();
    const newStatus = action === 'approve' ? 'approved' : 'dismissed';

    // Record the approval/dismissal immediately; execution follows below
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

    // ── DISMISS: nothing to execute ──────────────────────────────────────────
    if (action === 'dismiss') {
      return res.status(200).json({ run_id, action, status: 'dismissed', message: 'Dismissed. No action taken.' });
    }

    // ── APPROVE: resolve and execute actions ─────────────────────────────────
    const actionsToExecute = await resolveActions(run);

    if (actionsToExecute.length === 0) {
      await supabaseAdmin.from('automation_runs').update({
        output: { ...(run.output || {}), execution_note: 'No executable actions found in this run', executed_at: now },
      }).eq('id', run_id);

      return res.status(200).json({
        run_id,
        action: 'approve',
        status: 'approved',
        message: 'Approved, but no executable actions were found.',
        execution_results: [],
      });
    }

    // Resolve Meta access token from the business record
    const { business, config } = await getBusinessWithConfig(run.business_id);
    const accessToken = (business as any)?.facebook_access_token || process.env.META_SYSTEM_USER_TOKEN;

    if (!accessToken) {
      await supabaseAdmin.from('automation_runs').update({
        output: {
          ...(run.output || {}),
          execution_note: 'No Meta access token found on business record; actions not executed',
          executed_at: now,
        },
      }).eq('id', run_id);

      return res.status(200).json({
        run_id,
        action: 'approve',
        status: 'approved',
        warning: 'Approved, but no Meta access token is configured. Set `facebook_access_token` on the business record to enable execution.',
        execution_results: [],
      });
    }

    // Budget cap: prefer config field when present, otherwise use default $100
    const maxBudgetCents = (config as any)?.max_daily_budget_cents ?? DEFAULT_MAX_DAILY_BUDGET_CENTS;

    // Execute each action serially; a single failure does not stop the rest
    const executionResults: ExecutionResult[] = [];
    for (const act of actionsToExecute) {
      const result = await executeAction(act, accessToken, maxBudgetCents);
      executionResults.push(result);
    }

    const successCount = executionResults.filter((r) => r.ok).length;
    const errorCount = executionResults.filter((r) => !r.ok).length;
    const execSummary = `${successCount}/${actionsToExecute.length} actions succeeded, ${errorCount} failed/skipped`;

    // Write execution results back into the run record
    await supabaseAdmin.from('automation_runs').update({
      status: 'completed',
      output: {
        ...(run.output || {}),
        executed_actions: actionsToExecute,
        execution_results: executionResults,
        execution_summary: execSummary,
        executed_at: now,
        executed_by: userId,
      },
    }).eq('id', run_id);

    return res.status(200).json({
      run_id,
      action: 'approve',
      status: 'completed',
      execution_summary: execSummary,
      execution_results: executionResults,
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Approval processing failed' });
  }
}

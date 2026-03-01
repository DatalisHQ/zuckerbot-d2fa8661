import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin, handleCors, getBusinessWithConfig } from './_utils.js';
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
 * Only uses actions attached to this specific run — no cross-run fallback.
 * Preferred: run.output.actions (structured new format).
 * Legacy fallback: run.output.recommendations mapped to OptimizationAction shape.
 * If neither exists or is empty, returns an empty array (caller returns 400).
 */
function resolveActions(run: any): OptimizationAction[] {
  // Structured actions from this run (new format)
  if (Array.isArray(run.output?.actions) && run.output.actions.length > 0) {
    return run.output.actions as OptimizationAction[];
  }

  // Legacy: map recommendations to OptimizationAction shape
  if (Array.isArray(run.output?.recommendations) && run.output.recommendations.length > 0) {
    return mapLegacyRecommendations(run.output.recommendations);
  }

  // No actions found on this run. Do NOT fall back to other runs — approving
  // run A must only execute actions belonging to run A.
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

    // ── DISMISS: record and return immediately — nothing to execute ───────────
    if (action === 'dismiss') {
      const { error: dismissError } = await supabaseAdmin
        .from('automation_runs')
        .update({ status: 'dismissed', approved_at: now, approved_action: 'dismiss', approved_by: userId })
        .eq('id', run_id);

      if (dismissError) throw new Error(`Failed to dismiss run: ${dismissError.message}`);
      return res.status(200).json({ run_id, action, status: 'dismissed', message: 'Dismissed. No action taken.' });
    }

    // ── APPROVE: set executing status before touching Meta ───────────────────
    // We set 'executing' (not 'approved') immediately so that a crash mid-execution
    // leaves the run in a clear failed/executing state rather than stuck in 'approved'.
    const { error: execStartError } = await supabaseAdmin
      .from('automation_runs')
      .update({
        status: 'executing',
        approved_at: now,
        approved_action: 'approve',
        approved_by: userId,
        executing_started_at: now,
      })
      .eq('id', run_id);

    if (execStartError) throw new Error(`Failed to update run to executing: ${execStartError.message}`);

    // ── Resolve actions — only from THIS run, no cross-run fallback (Patch A) ─
    const actionsToExecute = resolveActions(run);

    if (actionsToExecute.length === 0) {
      // No actions attached to this run_id. Fail clearly rather than silently no-op.
      await supabaseAdmin.from('automation_runs').update({
        status: 'failed',
        error_message: 'no_actions_on_run',
        output: { ...(run.output || {}), execution_error: 'no_actions_on_run', failed_at: now },
      }).eq('id', run_id);

      return res.status(400).json({
        error: {
          code: 'no_actions_on_run',
          message: 'No executable actions attached to this run_id',
        },
      });
    }

    // ── Resolve Meta access token — business token required (Patch C) ─────────
    // System token fallback is gated behind ALLOW_SYSTEM_TOKEN_EXECUTION=true AND
    // an explicit per-business allowlist to prevent accidental wide access.
    const { business, config } = await getBusinessWithConfig(run.business_id);
    const businessToken = (business as any)?.facebook_access_token as string | undefined;
    const allowSystemToken = process.env.ALLOW_SYSTEM_TOKEN_EXECUTION === 'true';
    // TODO: add specific business UUIDs here to permit system token execution
    const SYSTEM_TOKEN_ALLOWLIST: string[] = [];
    const accessToken = businessToken
      || (allowSystemToken && SYSTEM_TOKEN_ALLOWLIST.includes(run.business_id)
          ? process.env.META_SYSTEM_USER_TOKEN : undefined);

    if (!accessToken) {
      // Mark as failed — run is not retryable until the business token is configured.
      await supabaseAdmin.from('automation_runs').update({
        status: 'failed',
        error_message: 'missing_meta_token',
        output: {
          ...(run.output || {}),
          execution_error: 'missing_meta_token: businesses.facebook_access_token is required for Meta mutations',
          failed_at: now,
        },
      }).eq('id', run_id);

      return res.status(200).json({
        run_id,
        action: 'approve',
        status: 'failed',
        error_code: 'missing_meta_token',
        warning: 'Execution failed: no Meta access token configured on business record. Set `facebook_access_token` on the business to enable execution.',
        execution_results: [],
      });
    }

    // Budget cap: prefer config field when present, otherwise use default $100 (10000 cents)
    const maxBudgetCents = (config as any)?.max_daily_budget_cents ?? DEFAULT_MAX_DAILY_BUDGET_CENTS;

    // Execute each action serially; a single action failure does not stop the rest.
    // Track partial results so they can be persisted even if an unexpected error occurs.
    const executionResults: ExecutionResult[] = [];
    try {
      for (const act of actionsToExecute) {
        const result = await executeAction(act, accessToken, maxBudgetCents);
        executionResults.push(result);
      }
    } catch (execError: any) {
      // Unexpected error mid-loop — persist partial results and mark as failed.
      await supabaseAdmin.from('automation_runs').update({
        status: 'failed',
        error_message: execError.message || 'Unexpected error during action execution',
        output: {
          ...(run.output || {}),
          executed_actions: actionsToExecute,
          execution_results: executionResults,
          execution_error: execError.message || 'Unexpected error during action execution',
          failed_at: new Date().toISOString(),
          executed_by: userId,
        },
      }).eq('id', run_id);

      return res.status(500).json({ error: execError.message || 'Execution failed unexpectedly' });
    }

    const successCount = executionResults.filter((r) => r.ok).length;
    const errorCount = executionResults.filter((r) => !r.ok).length;
    const execSummary = `${successCount}/${actionsToExecute.length} actions succeeded, ${errorCount} failed/skipped`;

    // Write execution results back into the run record and mark completed.
    await supabaseAdmin.from('automation_runs').update({
      status: 'completed',
      output: {
        ...(run.output || {}),
        executed_actions: actionsToExecute,
        execution_results: executionResults,
        execution_summary: execSummary,
        executed_at: new Date().toISOString(),
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

import {
  handleCors,
  createAutomationRun,
  completeAutomationRun,
  failAutomationRun,
  getLastRunForAgent,
  getBusinessWithConfig,
} from './_utils.js';

export const config = { maxDuration: 60 };

interface Anomaly {
  type: 'cpa_spike' | 'ctr_drop' | 'overspend';
  campaign_id: string;
  campaign_name: string;
  metric: string;
  current_value: number;
  previous_value: number;
  change_pct: number;
  severity: 'warning' | 'critical';
  description: string;
}

interface CampaignMetrics {
  campaign_id: string;
  campaign_name: string;
  status: string;
  daily_budget: number;
  spend_today: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number;
  ctr: number;
  cpc: number;
}

interface Recommendation {
  action: 'pause' | 'reduce_budget' | 'increase_budget' | 'refresh_creative' | 'shift_budget' | 'monitor';
  campaign_id: string;
  campaign_name: string;
  reason: string;
  details: string;
  priority: 'high' | 'medium' | 'low';
  estimated_impact: string;
  pct_change?: number; // fractional budget change, e.g. -0.30 means reduce 30%
}

/**
 * Structured action for execution by execute-approval.ts.
 * Built deterministically from Recommendation[]; no LLM involved.
 */
export interface OptimizationAction {
  type: 'pause_campaign' | 'reduce_budget' | 'increase_budget' | 'refresh_creative' | 'shift_budget' | 'monitor';
  campaign_id: string;       // internal DB UUID — executor looks up meta IDs
  campaign_name: string;
  reason: string;
  pct_change?: number;       // for budget actions: e.g. -0.30 or +0.30
  executable: boolean;       // false = human action required, true = can be automated
  requires_approval: boolean;
}

export default async function handler(req: any, res: any) {
  if (handleCors(req, res)) return;

  const { business_id, user_id, trigger_type, anomalies, campaign_metrics } = req.body || {};
  if (!business_id || !user_id) {
    return res.status(400).json({ error: 'business_id and user_id required' });
  }

  let runId: string | null = null;
  const startTime = Date.now();

  try {
    const { business } = await getBusinessWithConfig(business_id);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // If anomalies/metrics not passed directly, fetch from last performance monitor run
    let resolvedAnomalies: Anomaly[] = anomalies || [];
    let resolvedMetrics: CampaignMetrics[] = campaign_metrics || [];

    if (resolvedAnomalies.length === 0 && resolvedMetrics.length === 0) {
      const lastPerfRun = await getLastRunForAgent(business_id, 'performance_monitor');
      if (lastPerfRun?.output) {
        resolvedAnomalies = lastPerfRun.output.anomalies || [];
        resolvedMetrics = lastPerfRun.output.metrics || [];
      }
    }

    runId = await createAutomationRun(
      business_id,
      user_id,
      'campaign_optimizer',
      trigger_type || 'manual',
      `Generating optimization recommendations. ${resolvedAnomalies.length} anomalies to analyze.`,
      { anomaly_count: resolvedAnomalies.length, campaign_count: resolvedMetrics.length }
    );

    // Generate deterministic recommendations based on anomalies and metrics
    const recommendations = generateRecommendations(resolvedAnomalies, resolvedMetrics);

    // Build structured actions array for execution (backward-compat: recommendations still present)
    const actions = buildActions(recommendations);

    const output = {
      recommendations,
      actions,              // structured list for execute-approval.ts actuator
      recommendation_count: recommendations.length,
      anomalies_analyzed: resolvedAnomalies.length,
      campaigns_analyzed: resolvedMetrics.length,
      generated_at: new Date().toISOString(),
    };

    const durationMs = Date.now() - startTime;

    // Build summaries
    const highPriority = recommendations.filter((r) => r.priority === 'high');
    const summary = `${recommendations.length} optimization recommendations generated. ${highPriority.length} high priority.`;

    let firstPersonSummary: string;
    if (highPriority.length > 0) {
      const top = highPriority[0];
      if (top.action === 'pause') {
        // Check if there is a good campaign to shift budget to
        const shiftRec = recommendations.find((r) => r.action === 'increase_budget' || r.action === 'shift_budget');
        if (shiftRec) {
          firstPersonSummary = `I have a recommendation: pause ${top.campaign_name} (${top.reason}) and shift that budget to ${shiftRec.campaign_name} which is performing better.`;
        } else {
          firstPersonSummary = `Your ${top.campaign_name} needs attention. I recommend pausing it and refreshing the creatives. ${top.reason}.`;
        }
      } else if (top.action === 'reduce_budget') {
        firstPersonSummary = `I recommend reducing budget on ${top.campaign_name}. ${top.reason}. This should save you money while we figure out what changed.`;
      } else {
        firstPersonSummary = `I have ${recommendations.length} optimization suggestion${recommendations.length === 1 ? '' : 's'} for your campaigns. The most urgent: ${top.details}`;
      }
    } else if (recommendations.length > 0) {
      firstPersonSummary = `I reviewed your campaign performance and have ${recommendations.length} suggestion${recommendations.length === 1 ? '' : 's'} to improve results. Nothing urgent, but small tweaks that could help.`;
    } else {
      firstPersonSummary = `I reviewed your campaigns and everything looks good. No changes needed right now. I will keep monitoring.`;
    }

    await completeAutomationRun(runId, output, summary, firstPersonSummary, {
      requiresApproval: recommendations.length > 0,
      durationMs,
    });

    return res.status(200).json({ run_id: runId, status: recommendations.length > 0 ? 'needs_approval' : 'completed', output });
  } catch (error: any) {
    if (runId) {
      await failAutomationRun(runId, error.message || 'Unknown error');
    }
    return res.status(500).json({ error: error.message || 'Campaign optimization failed' });
  }
}

function generateRecommendations(anomalies: Anomaly[], metrics: CampaignMetrics[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const metricsMap = new Map<string, CampaignMetrics>();
  for (const m of metrics) {
    metricsMap.set(m.campaign_id, m);
  }

  // Find the best performing campaign (lowest CPA with at least some conversions)
  const campaignsWithConversions = metrics.filter((m) => m.conversions > 0);
  const bestCampaign = campaignsWithConversions.length > 0
    ? campaignsWithConversions.reduce((best, m) => (m.cpa < best.cpa ? m : best))
    : null;

  // Process each anomaly
  for (const anomaly of anomalies) {
    const campaignMetrics = metricsMap.get(anomaly.campaign_id);

    if (anomaly.type === 'cpa_spike') {
      if (anomaly.severity === 'critical' || anomaly.change_pct > 100) {
        // Critical CPA spike: recommend pausing
        recommendations.push({
          action: 'pause',
          campaign_id: anomaly.campaign_id,
          campaign_name: anomaly.campaign_name,
          reason: `CPA spiked ${anomaly.change_pct.toFixed(0)}%`,
          details: `Cost per lead went from $${anomaly.previous_value.toFixed(2)} to $${anomaly.current_value.toFixed(2)}. Pausing prevents further waste while we investigate.`,
          priority: 'high',
          estimated_impact: `Save ~$${((campaignMetrics?.daily_budget || 0) * 0.5).toFixed(2)}/day in wasted spend`,
        });

        // If there is a better campaign, suggest shifting budget
        if (bestCampaign && bestCampaign.campaign_id !== anomaly.campaign_id) {
          recommendations.push({
            action: 'shift_budget',
            campaign_id: bestCampaign.campaign_id,
            campaign_name: bestCampaign.campaign_name,
            reason: `This campaign has ${((bestCampaign.cpa / anomaly.current_value) * 100).toFixed(0)}% lower CPA`,
            details: `Shift budget from ${anomaly.campaign_name} to ${bestCampaign.campaign_name} ($${bestCampaign.cpa.toFixed(2)} CPA vs $${anomaly.current_value.toFixed(2)}).`,
            priority: 'high',
            estimated_impact: `Could generate ${Math.round((campaignMetrics?.daily_budget || 0) / bestCampaign.cpa)} extra leads/day at current CPA`,
            pct_change: 0.30, // increase winner's budget 30% to absorb shifted spend
          });
        }
      } else {
        // Warning CPA spike: recommend reducing budget
        recommendations.push({
          action: 'reduce_budget',
          campaign_id: anomaly.campaign_id,
          campaign_name: anomaly.campaign_name,
          reason: `CPA increased ${anomaly.change_pct.toFixed(0)}%`,
          details: `Reduce daily budget by 30% and monitor for 24 hours. If CPA does not improve, consider pausing.`,
          priority: 'medium',
          estimated_impact: `Limit exposure while testing if performance recovers`,
          pct_change: -0.30,
        });
      }
    }

    if (anomaly.type === 'ctr_drop') {
      // CTR drop usually means creative fatigue
      recommendations.push({
        action: 'refresh_creative',
        campaign_id: anomaly.campaign_id,
        campaign_name: anomaly.campaign_name,
        reason: `CTR dropped ${Math.abs(anomaly.change_pct).toFixed(0)}%`,
        details: `Click-through rate fell from ${anomaly.previous_value.toFixed(2)}% to ${anomaly.current_value.toFixed(2)}%. This usually signals creative fatigue. Swap in fresh ad creatives.`,
        priority: anomaly.severity === 'critical' ? 'high' : 'medium',
        estimated_impact: `Fresh creatives typically recover CTR within 3-5 days`,
      });
    }

    if (anomaly.type === 'overspend') {
      recommendations.push({
        action: 'reduce_budget',
        campaign_id: anomaly.campaign_id,
        campaign_name: anomaly.campaign_name,
        reason: `Spending ${anomaly.change_pct.toFixed(0)}% over daily budget`,
        details: `Campaign spent $${anomaly.current_value.toFixed(2)} against a $${anomaly.previous_value.toFixed(2)} budget. Check if Meta accelerated delivery is enabled and consider switching to standard delivery.`,
        priority: anomaly.severity === 'critical' ? 'high' : 'medium',
        estimated_impact: `Prevent budget overrun of ~$${(anomaly.current_value - anomaly.previous_value).toFixed(2)}/day`,
        pct_change: -0.20, // reduce 20% to bring spend back within budget
      });
    }
  }

  // Check for campaigns with zero conversions but positive spend
  for (const m of metrics) {
    const alreadyHasRec = recommendations.some((r) => r.campaign_id === m.campaign_id);
    if (!alreadyHasRec && m.spend_today > 10 && m.conversions === 0 && m.clicks > 5) {
      recommendations.push({
        action: 'monitor',
        campaign_id: m.campaign_id,
        campaign_name: m.campaign_name,
        reason: `$${m.spend_today.toFixed(2)} spent with 0 conversions`,
        details: `Getting clicks (${m.clicks}) but no conversions. Landing page or targeting may need adjustment. Monitor for another cycle before pausing.`,
        priority: 'low',
        estimated_impact: `Early detection prevents wasted spend`,
      });
    }
  }

  // Sort by priority
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations;
}

/**
 * Map Recommendation[] → OptimizationAction[] (structured, executable).
 * Used by execute-approval.ts to perform real Meta API calls on approval.
 * Pure function — no I/O.
 */
function buildActions(recommendations: Recommendation[]): OptimizationAction[] {
  return recommendations.map((r): OptimizationAction => {
    switch (r.action) {
      case 'pause':
        return {
          type: 'pause_campaign',
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          reason: r.reason,
          executable: true,
          requires_approval: true,
        };
      case 'reduce_budget':
        return {
          type: 'reduce_budget',
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          reason: r.reason,
          pct_change: r.pct_change ?? -0.30,
          executable: true,
          requires_approval: true,
        };
      case 'increase_budget':
        return {
          type: 'increase_budget',
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          reason: r.reason,
          pct_change: r.pct_change ?? 0.20,
          executable: true,
          requires_approval: true,
        };
      case 'shift_budget':
        // shift_budget increases the winner's budget; the loser is paused via a separate pause action
        return {
          type: 'shift_budget',
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          reason: r.reason,
          pct_change: r.pct_change ?? 0.30,
          executable: true,
          requires_approval: true,
        };
      case 'refresh_creative':
        return {
          type: 'refresh_creative',
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          reason: r.reason,
          executable: false, // requires human or separate creative agent
          requires_approval: false,
        };
      case 'monitor':
      default:
        return {
          type: 'monitor',
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          reason: r.reason,
          executable: false,
          requires_approval: false,
        };
    }
  });
}

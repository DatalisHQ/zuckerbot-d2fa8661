import {
  supabaseAdmin,
  handleCors,
  createAutomationRun,
  completeAutomationRun,
  failAutomationRun,
  getLastRunForAgent,
  getBusinessWithConfig,
} from './_utils.js';

export const config = { maxDuration: 60 };

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

export default async function handler(req: any, res: any) {
  if (handleCors(req, res)) return;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceRoleKey) return res.status(500).json({ error: 'Service role key not configured' });

  const { business_id, user_id, trigger_type } = req.body || {};
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

    // Step 1: Check if there are active campaigns
    const { data: activeCampaigns } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('business_id', business_id)
      .in('status', ['active', 'ACTIVE', 'running']);

    if (!activeCampaigns || activeCampaigns.length === 0) {
      // Create a run just to log that there is nothing to monitor
      runId = await createAutomationRun(
        business_id,
        user_id,
        'performance_monitor',
        trigger_type || 'manual',
        'No active campaigns to monitor',
        {}
      );

      await completeAutomationRun(
        runId,
        { campaigns: [], anomalies: [], message: 'No active campaigns' },
        'No active campaigns to monitor.',
        'No active campaigns to check right now. Once you launch a campaign, I will keep an eye on it for you.',
        { durationMs: Date.now() - startTime }
      );

      return res.status(200).json({ run_id: runId, status: 'completed', output: { message: 'No active campaigns' } });
    }

    runId = await createAutomationRun(
      business_id,
      user_id,
      'performance_monitor',
      trigger_type || 'manual',
      `Monitoring ${activeCampaigns.length} active campaign(s)`,
      { campaign_count: activeCampaigns.length }
    );

    // Step 2: Call sync-performance edge function to refresh metrics
    try {
      await fetch(
        'https://bqqmkiocynvlaianwisd.supabase.co/functions/v1/sync-performance',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sync_all: true }),
        }
      );
    } catch {
      // Sync may fail but we can still read existing data
    }

    // Step 3: Re-fetch campaign data with updated metrics
    const { data: updatedCampaigns } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('business_id', business_id)
      .in('status', ['active', 'ACTIVE', 'running']);

    const campaigns = updatedCampaigns || activeCampaigns;

    // Build metrics snapshot for each campaign
    const metricsSnapshot: CampaignMetrics[] = campaigns.map((c: any) => {
      const spend = parseFloat(c.spend_today || c.spend || c.amount_spent || 0);
      const impressions = parseInt(c.impressions || 0, 10);
      const clicks = parseInt(c.clicks || c.link_clicks || 0, 10);
      const conversions = parseInt(c.conversions || c.leads || c.results || 0, 10);
      const dailyBudget = parseFloat(c.daily_budget || c.budget || 0);

      return {
        campaign_id: c.id || c.campaign_id,
        campaign_name: c.name || c.campaign_name || 'Unnamed Campaign',
        status: c.status,
        daily_budget: dailyBudget,
        spend_today: spend,
        impressions,
        clicks,
        conversions,
        cpa: conversions > 0 ? spend / conversions : 0,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
      };
    });

    // Step 4: Compare against previous run for anomaly detection
    const lastRun = await getLastRunForAgent(business_id, 'performance_monitor');
    const previousMetrics: CampaignMetrics[] = lastRun?.output?.metrics || [];
    const anomalies = detectAnomalies(metricsSnapshot, previousMetrics);

    // Aggregate stats
    const totalSpend = metricsSnapshot.reduce((s, m) => s + m.spend_today, 0);
    const totalConversions = metricsSnapshot.reduce((s, m) => s + m.conversions, 0);
    const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

    const output = {
      metrics: metricsSnapshot,
      anomalies,
      totals: {
        campaigns: metricsSnapshot.length,
        total_spend: totalSpend,
        total_conversions: totalConversions,
        avg_cpa: avgCpa,
      },
      checked_at: new Date().toISOString(),
    };

    const durationMs = Date.now() - startTime;

    // Build summaries
    let summary: string;
    let firstPersonSummary: string;

    if (anomalies.length > 0) {
      const criticalCount = anomalies.filter((a) => a.severity === 'critical').length;
      summary = `${anomalies.length} anomalies detected across ${metricsSnapshot.length} campaigns. ${criticalCount} critical.`;

      const topAnomaly = anomalies[0];
      firstPersonSummary = `I noticed your ${topAnomaly.metric} ${topAnomaly.type === 'cpa_spike' ? 'jumped' : 'dropped'} ${Math.abs(topAnomaly.change_pct).toFixed(0)}% ${topAnomaly.type === 'overspend' ? 'over budget' : 'in the last check'}. I'm preparing recommendations.`;
    } else {
      summary = `All ${metricsSnapshot.length} campaigns running normally. $${totalSpend.toFixed(2)} spent, ${totalConversions} conversions.`;
      firstPersonSummary = `Your campaigns are running smoothly. $${totalSpend.toFixed(0)} spent today, ${totalConversions} lead${totalConversions === 1 ? '' : 's'} at $${avgCpa.toFixed(2)} each.`;
    }

    await completeAutomationRun(runId, output, summary, firstPersonSummary, { durationMs });

    // Step 5: If anomalies detected, trigger campaign-optimizer internally
    if (anomalies.length > 0) {
      try {
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        await fetch(`${baseUrl}/api/agents/campaign-optimizer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id,
            user_id,
            trigger_type: 'event',
            anomalies,
            campaign_metrics: metricsSnapshot,
          }),
        });
      } catch {
        // Optimizer trigger failed, but monitoring itself succeeded
      }
    }

    return res.status(200).json({ run_id: runId, status: 'completed', output });
  } catch (error: any) {
    if (runId) {
      await failAutomationRun(runId, error.message || 'Unknown error');
    }
    return res.status(500).json({ error: error.message || 'Performance monitoring failed' });
  }
}

function detectAnomalies(
  current: CampaignMetrics[],
  previous: CampaignMetrics[]
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (previous.length === 0) return anomalies;

  // Build a lookup by campaign_id for previous metrics
  const prevMap = new Map<string, CampaignMetrics>();
  for (const p of previous) {
    prevMap.set(p.campaign_id, p);
  }

  for (const curr of current) {
    const prev = prevMap.get(curr.campaign_id);
    if (!prev) continue;

    // Check 1: CPA spike > 50%
    if (prev.cpa > 0 && curr.cpa > 0) {
      const cpaChange = ((curr.cpa - prev.cpa) / prev.cpa) * 100;
      if (cpaChange > 50) {
        anomalies.push({
          type: 'cpa_spike',
          campaign_id: curr.campaign_id,
          campaign_name: curr.campaign_name,
          metric: 'cost per lead',
          current_value: curr.cpa,
          previous_value: prev.cpa,
          change_pct: cpaChange,
          severity: cpaChange > 100 ? 'critical' : 'warning',
          description: `CPA spiked ${cpaChange.toFixed(0)}% from $${prev.cpa.toFixed(2)} to $${curr.cpa.toFixed(2)}`,
        });
      }
    }

    // Check 2: CTR drop > 30%
    if (prev.ctr > 0 && curr.ctr > 0) {
      const ctrChange = ((curr.ctr - prev.ctr) / prev.ctr) * 100;
      if (ctrChange < -30) {
        anomalies.push({
          type: 'ctr_drop',
          campaign_id: curr.campaign_id,
          campaign_name: curr.campaign_name,
          metric: 'click-through rate',
          current_value: curr.ctr,
          previous_value: prev.ctr,
          change_pct: ctrChange,
          severity: ctrChange < -50 ? 'critical' : 'warning',
          description: `CTR dropped ${Math.abs(ctrChange).toFixed(0)}% from ${prev.ctr.toFixed(2)}% to ${curr.ctr.toFixed(2)}%`,
        });
      }
    }

    // Check 3: Spend pacing > 120% of daily budget
    if (curr.daily_budget > 0) {
      const spendPct = (curr.spend_today / curr.daily_budget) * 100;
      if (spendPct > 120) {
        anomalies.push({
          type: 'overspend',
          campaign_id: curr.campaign_id,
          campaign_name: curr.campaign_name,
          metric: 'spend pacing',
          current_value: curr.spend_today,
          previous_value: curr.daily_budget,
          change_pct: spendPct - 100,
          severity: spendPct > 150 ? 'critical' : 'warning',
          description: `Spending at ${spendPct.toFixed(0)}% of daily budget ($${curr.spend_today.toFixed(2)} / $${curr.daily_budget.toFixed(2)})`,
        });
      }
    }
  }

  // Sort by severity (critical first), then by change magnitude
  anomalies.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return Math.abs(b.change_pct) - Math.abs(a.change_pct);
  });

  return anomalies;
}

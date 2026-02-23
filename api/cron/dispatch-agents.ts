import { supabaseAdmin, shouldRunAgent } from '../agents/_utils.js';
import type { AgentType } from '../agents/_utils.js';

export const config = { maxDuration: 300 };

interface DispatchResult {
  business_id: string;
  business_name: string;
  agent: AgentType;
  status: 'dispatched' | 'skipped' | 'error';
  reason?: string;
}

// Default frequency in hours for each agent type
const AGENT_FREQUENCIES: Record<AgentType, number> = {
  competitor_analyst: 168, // weekly
  review_scout: 168,      // weekly
  creative_director: 336, // bi-weekly
  performance_monitor: 4, // every 4 hours
  campaign_optimizer: 24, // daily (but usually triggered by performance_monitor)
};

export default async function handler(req: any, res: any) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'] || '';
  const providedSecret = authHeader.replace('Bearer ', '').trim();

  if (!cronSecret || providedSecret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized. Invalid CRON_SECRET.' });
  }

  const results: DispatchResult[] = [];

  try {
    // Fetch all businesses that have an automation_config
    const { data: configs, error: configError } = await supabaseAdmin
      .from('automation_config')
      .select('*, businesses(id, business_name, name, user_id)')
      .eq('enabled', true);

    if (configError) {
      return res.status(500).json({ error: `Failed to fetch configs: ${configError.message}` });
    }

    if (!configs || configs.length === 0) {
      return res.status(200).json({ message: 'No businesses with automation enabled', results: [] });
    }

    // Determine the base URL for internal API calls
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Process each business
    for (const configRow of configs) {
      const business = configRow.businesses as any;
      if (!business) continue;

      const businessId = business.id || configRow.business_id;
      const userId = business.user_id;
      const businessName = business.business_name || business.name || businessId;

      if (!businessId || !userId) continue;

      // Check which agents need custom frequencies from config
      const customFrequencies: Partial<Record<AgentType, number>> = {};
      if (configRow.competitor_frequency_hours) {
        customFrequencies.competitor_analyst = configRow.competitor_frequency_hours;
      }
      if (configRow.review_frequency_hours) {
        customFrequencies.review_scout = configRow.review_frequency_hours;
      }
      if (configRow.creative_frequency_hours) {
        customFrequencies.creative_director = configRow.creative_frequency_hours;
      }
      if (configRow.performance_frequency_hours) {
        customFrequencies.performance_monitor = configRow.performance_frequency_hours;
      }

      // Check if this business has active campaigns (needed for perf monitor + optimizer)
      const { data: activeCampaigns } = await supabaseAdmin
        .from('campaigns')
        .select('id')
        .eq('business_id', businessId)
        .in('status', ['active', 'ACTIVE', 'running'])
        .limit(1);

      const hasActiveCampaigns = activeCampaigns && activeCampaigns.length > 0;

      // Determine which agents to run
      const agentsToCheck: AgentType[] = [
        'competitor_analyst',
        'review_scout',
        'creative_director',
      ];

      // Only check performance-related agents if there are active campaigns
      if (hasActiveCampaigns) {
        agentsToCheck.push('performance_monitor');
        // campaign_optimizer is typically triggered by performance_monitor, not cron.
        // But include it as a fallback in case the event trigger was missed.
        agentsToCheck.push('campaign_optimizer');
      }

      for (const agentType of agentsToCheck) {
        const frequency = customFrequencies[agentType] || AGENT_FREQUENCIES[agentType];

        try {
          const shouldRun = await shouldRunAgent(businessId, agentType, frequency);

          if (!shouldRun) {
            results.push({
              business_id: businessId,
              business_name: businessName,
              agent: agentType,
              status: 'skipped',
              reason: `Last run within ${frequency}h window`,
            });
            continue;
          }

          // Dispatch the agent via internal fetch
          const endpoint = agentTypeToEndpoint(agentType);
          const dispatchBody: Record<string, any> = {
            business_id: businessId,
            user_id: userId,
            trigger_type: 'scheduled',
          };

          // Fire and forget. We do not await the full response because agents
          // can take up to 60s each and we do not want to block the dispatcher.
          fetch(`${baseUrl}/api/agents/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dispatchBody),
          }).catch(() => {
            // Swallow errors from individual dispatches
          });

          results.push({
            business_id: businessId,
            business_name: businessName,
            agent: agentType,
            status: 'dispatched',
          });
        } catch (err: any) {
          results.push({
            business_id: businessId,
            business_name: businessName,
            agent: agentType,
            status: 'error',
            reason: err.message || 'Unknown error',
          });
        }
      }
    }

    const dispatched = results.filter((r) => r.status === 'dispatched').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const errors = results.filter((r) => r.status === 'error').length;

    return res.status(200).json({
      message: `Dispatch complete. ${dispatched} dispatched, ${skipped} skipped, ${errors} errors.`,
      dispatched,
      skipped,
      errors,
      results,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Dispatch failed' });
  }
}

function agentTypeToEndpoint(agentType: AgentType): string {
  const map: Record<AgentType, string> = {
    competitor_analyst: 'competitor-analyst',
    review_scout: 'review-scout',
    creative_director: 'creative-director',
    performance_monitor: 'performance-monitor',
    campaign_optimizer: 'campaign-optimizer',
  };
  return map[agentType];
}

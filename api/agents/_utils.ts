import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export type AgentType = 'creative_director' | 'competitor_analyst' | 'review_scout' | 'performance_monitor' | 'campaign_optimizer';

export interface AutomationRun {
  id: string;
  business_id: string;
  user_id: string;
  agent_type: AgentType;
  status: string;
  trigger_type: string;
  trigger_reason?: string;
  input: Record<string, any>;
  output?: Record<string, any>;
  summary?: string;
  first_person_summary?: string;
  error_message?: string;
  tinyfish_replay_url?: string;
  duration_ms?: number;
  requires_approval: boolean;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export async function createAutomationRun(
  businessId: string,
  userId: string,
  agentType: AgentType,
  triggerType: 'scheduled' | 'manual' | 'event',
  triggerReason: string,
  input: Record<string, any>
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('automation_runs')
    .insert({
      business_id: businessId,
      user_id: userId,
      agent_type: agentType,
      status: 'running',
      trigger_type: triggerType,
      trigger_reason: triggerReason,
      input,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create automation run: ${error.message}`);
  return data.id;
}

export async function completeAutomationRun(
  runId: string,
  output: Record<string, any>,
  summary: string,
  firstPersonSummary: string,
  opts?: { replayUrl?: string; requiresApproval?: boolean; durationMs?: number }
) {
  const { error } = await supabaseAdmin
    .from('automation_runs')
    .update({
      status: opts?.requiresApproval ? 'needs_approval' : 'completed',
      output,
      summary,
      first_person_summary: firstPersonSummary,
      tinyfish_replay_url: opts?.replayUrl || null,
      requires_approval: opts?.requiresApproval || false,
      duration_ms: opts?.durationMs || null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) throw new Error(`Failed to complete automation run: ${error.message}`);
}

export async function failAutomationRun(runId: string, errorMessage: string) {
  await supabaseAdmin
    .from('automation_runs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

export async function getLastRunForAgent(businessId: string, agentType: AgentType) {
  const { data } = await supabaseAdmin
    .from('automation_runs')
    .select('*')
    .eq('business_id', businessId)
    .eq('agent_type', agentType)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

export async function shouldRunAgent(businessId: string, agentType: AgentType, frequencyHours: number): Promise<boolean> {
  const lastRun = await getLastRunForAgent(businessId, agentType);
  if (!lastRun) return true;

  const lastRunTime = new Date(lastRun.completed_at).getTime();
  const now = Date.now();
  const hoursSinceLastRun = (now - lastRunTime) / (1000 * 60 * 60);

  return hoursSinceLastRun >= frequencyHours;
}

export async function getBusinessWithConfig(businessId: string) {
  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .single();

  const { data: config } = await supabaseAdmin
    .from('automation_config')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle();

  return { business, config };
}

// CORS + method check helper
export function handleCors(req: any, res: any): boolean {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return true; }
  return false;
}

/**
 * Parse a TinyFish SSE stream internally (background job, not streaming to client).
 * Returns the final result including replay URL and parsed result JSON.
 */
export async function parseTinyfishSSE(response: Response): Promise<{
  replayUrl: string | null;
  resultJson: any;
  status: string;
}> {
  if (!response.body) {
    return { replayUrl: null, resultJson: null, status: 'NO_BODY' };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let replayUrl: string | null = null;
  let resultJson: any = null;
  let status = 'UNKNOWN';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));

          if (event.type === 'STREAMING_URL') {
            replayUrl = event.streamingUrl || null;
          }

          if (event.type === 'COMPLETE') {
            status = event.status || 'COMPLETED';
            resultJson = event.resultJson || null;
            try { reader.cancel(); } catch {}
            return { replayUrl, resultJson, status };
          }
        } catch {}
      }
    }
  } catch {
    // Stream ended or was aborted
  }

  return { replayUrl, resultJson, status };
}

/**
 * Extract an array from a TinyFish resultJson that may be nested in various shapes.
 */
export function extractArrayFromResult(rj: any): any[] {
  if (!rj) return [];
  if (Array.isArray(rj)) return rj;
  if (Array.isArray(rj.data)) return rj.data;
  if (Array.isArray(rj.ads)) return rj.ads;
  if (Array.isArray(rj.reviews)) return rj.reviews;
  if (Array.isArray(rj.results)) return rj.results;

  for (const val of Object.values(rj)) {
    if (Array.isArray(val)) return val as any[];
  }
  return [];
}

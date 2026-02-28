/**
 * Shared Meta Graph API helpers for agent execution.
 * Mirrors the call pattern from api/v1-router.ts (form-encoded POST, same GRAPH_BASE).
 * All functions return { ok, data, error? } — never throw.
 */

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface MetaResult {
  ok: boolean;
  data: any;
  error?: string;
}

async function metaGraphPost(
  resourceId: string,
  params: Record<string, string | number>,
  accessToken: string,
): Promise<MetaResult> {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) form.append(k, String(v));
  form.append('access_token', accessToken);

  try {
    const r = await fetch(`${GRAPH_BASE}/${resourceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await r.json();
    if (!r.ok || data.error) {
      return { ok: false, data, error: data.error?.message || `Meta returned ${r.status}` };
    }
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, data: null, error: e.message || 'Network error' };
  }
}

/** Pause a Meta campaign. Sets status → PAUSED. */
export function pauseMetaCampaign(accessToken: string, metaCampaignId: string): Promise<MetaResult> {
  return metaGraphPost(metaCampaignId, { status: 'PAUSED' }, accessToken);
}

/** Resume a Meta campaign. Sets status → ACTIVE. */
export function resumeMetaCampaign(accessToken: string, metaCampaignId: string): Promise<MetaResult> {
  return metaGraphPost(metaCampaignId, { status: 'ACTIVE' }, accessToken);
}

/**
 * Update an ad set's daily budget.
 * Meta expects the budget in the account's smallest currency unit (e.g. cents for USD).
 * Pass an integer — this function rounds automatically.
 */
export function updateAdsetDailyBudget(
  accessToken: string,
  metaAdsetId: string,
  dailyBudgetMinorUnits: number,
): Promise<MetaResult> {
  return metaGraphPost(metaAdsetId, { daily_budget: Math.round(dailyBudgetMinorUnits) }, accessToken);
}

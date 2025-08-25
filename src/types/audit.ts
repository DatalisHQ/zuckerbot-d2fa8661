export type AuditStatus = 
  | "no_active_campaigns" 
  | "no_historical_data" 
  | "learning_phase" 
  | "healthy" 
  | "needs_action";

export type AuditHealth = 
  | "unknown" 
  | "healthy" 
  | "degraded" 
  | "critical";

export interface ActionCard {
  id: string;
  type: 'increase_budget' | 'decrease_budget' | 'reallocate_budget' | 'pause' | 'swap_creative' | 'change_placements';
  entity: {
    type: 'campaign' | 'adset' | 'ad';
    id: string;
  };
  title: string;
  why: string;
  impact_score: number;
  payload: Record<string, any>;
  creative_suggestions?: {
    headlines: string[];
    primary_texts: string[];
  };
  comparison?: {
    window_primary: string;
    window_baseline: string | null;
    deltas: {
      roas: number;
      cpa: number;
      ctr: number;
    };
  };
}

export interface AuditResponse {
  status: AuditStatus;
  health: AuditHealth;
  actions: ActionCard[];
  meta: {
    connected: boolean;
    hasCampaigns: boolean;
    activeCampaigns: number;
    lastSyncAt: string | null;
  };
}
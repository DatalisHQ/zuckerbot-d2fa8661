// ── Campaign Objective Mapping ─────────────────────────────────────────
// Single source of truth for ZuckerBot → Meta objective translation.
// Used by handleLaunch, launchCampaignInternal, and handleCreate.

export type ZuckerObjective = 'leads' | 'traffic' | 'conversions' | 'awareness';

export const VALID_OBJECTIVES: readonly ZuckerObjective[] = ['leads', 'traffic', 'conversions', 'awareness'];

export function isValidObjective(value: unknown): value is ZuckerObjective {
  return typeof value === 'string' && VALID_OBJECTIVES.includes(value as ZuckerObjective);
}

export function getMetaCampaignObjective(objective: ZuckerObjective): string {
  switch (objective) {
    case 'leads': return 'OUTCOME_LEADS';
    case 'traffic': return 'OUTCOME_TRAFFIC';
    case 'conversions': return 'OUTCOME_SALES';
    case 'awareness': return 'OUTCOME_AWARENESS';
    default: return 'OUTCOME_TRAFFIC';
  }
}

export function getAdsetParams(objective: ZuckerObjective): {
  optimization_goal: string;
  destination_type: string | undefined;
} {
  switch (objective) {
    case 'leads':
      return {
        optimization_goal: 'LEAD_GENERATION',
        destination_type: 'ON_AD',
      };

    case 'traffic':
      return {
        optimization_goal: 'LINK_CLICKS',
        destination_type: 'WEBSITE',
      };

    case 'conversions':
      return {
        optimization_goal: 'OFFSITE_CONVERSIONS',
        destination_type: 'WEBSITE',
      };

    case 'awareness':
      return {
        optimization_goal: 'REACH',
        destination_type: undefined,
      };

    default:
      return {
        optimization_goal: 'LINK_CLICKS',
        destination_type: 'WEBSITE',
      };
  }
}

export function getPromotedObject(
  objective: ZuckerObjective,
  meta_page_id: string,
  pixel_id?: string | null,
): Record<string, string> {
  const base: Record<string, string> = { page_id: meta_page_id };

  if (objective === 'conversions' && pixel_id) {
    base.pixel_id = pixel_id;
  }

  return base;
}

export function needsLeadForm(objective: ZuckerObjective): boolean {
  return objective === 'leads';
}

export function needsUrl(objective: ZuckerObjective): boolean {
  return objective === 'traffic' || objective === 'conversions';
}

export function needsPixel(objective: ZuckerObjective): boolean {
  return objective === 'conversions';
}

/**
 * Build the link_data for ad creative based on objective.
 */
export function buildCreativeLinkData(
  objective: ZuckerObjective,
  opts: {
    headline: string;
    body: string;
    ctaType: string;
    imageUrl: string | null;
    imageHash?: string | null;
    leadFormId?: string;
    campaignUrl?: string;
  },
): Record<string, any> {
  const linkData: Record<string, any> = {
    message: opts.body,
    name: opts.headline,
    ...(opts.imageHash ? { image_hash: opts.imageHash } : {}),
    ...(!opts.imageHash && opts.imageUrl ? { picture: opts.imageUrl } : {}),
  };

  if (objective === 'leads' && opts.leadFormId) {
    linkData.link = 'https://zuckerbot.ai/';
    linkData.call_to_action = {
      type: opts.ctaType,
      value: { lead_gen_form_id: opts.leadFormId },
    };
  } else if (objective === 'traffic' || objective === 'conversions') {
    const link = opts.campaignUrl || 'https://zuckerbot.ai/';
    linkData.link = link;
    linkData.call_to_action = {
      type: opts.ctaType,
      value: { link },
    };
  } else if (objective === 'awareness') {
    if (opts.campaignUrl) {
      linkData.link = opts.campaignUrl;
      linkData.call_to_action = {
        type: opts.ctaType,
        value: { link: opts.campaignUrl },
      };
    }
    // If no URL, omit link and CTA value for awareness
  }

  return linkData;
}

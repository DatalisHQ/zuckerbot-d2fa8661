import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      campaignId,
      audienceSegmentId,
      businessContext,
      campaignObjective,
      targetAudience,
      competitorInsights,
      selectedAngle,
      styleHints // { archetype?: string; placement?: 'feed'|'stories'|'reels'; length?: 'short'|'medium'; tone?: string }
    } = await req.json();

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Optionally fetch real context by campaignId if not fully provided by caller
    let brand = businessContext;
    let competitors = competitorInsights;
    let audience = targetAudience;
    let angle = selectedAngle;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
    if (campaignId && supabaseUrl && supabaseKey) {
      try {
        const sb = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: req.headers.get('Authorization') || '' } }
        });
        const { data: campaignRow, error: campaignErr } = await sb
          .from('ad_campaigns')
          .select('brand_data, competitor_data, audience_data, angles_data')
          .eq('id', campaignId)
          .single();
        if (!campaignErr && campaignRow) {
          brand = brand || campaignRow.brand_data;
          competitors = competitors || campaignRow.competitor_data?.insights || campaignRow.competitor_data;
          // Prefer a single selected angle if present
          angle = angle || campaignRow.angles_data?.angle || campaignRow.angles_data;
          // Use a specific audience segment if provided, otherwise the first
          const segments = campaignRow.audience_data?.segments || [];
          const targetSeg = audienceSegmentId
            ? segments.find((s: any) => s.id === audienceSegmentId || s.id === String(audienceSegmentId))
            : segments[0];
          audience = audience || (targetSeg ? {
            segment: targetSeg.segment,
            insights: targetSeg.criteria,
            targeting_data: targetSeg.targeting_data
          } : undefined);
      }
      } catch (ctxErr) {
        console.warn('Context fetch failed, proceeding with provided inputs:', ctxErr);
      }
    }

    // Validate required context and report missing pieces
    const missing: string[] = [];
    if (!brand) missing.push('brand analysis');
    if (!angle) missing.push('selected angle/strategy');
    if (!audience) missing.push('audience targeting');
    if (missing.length > 0) {
      return new Response(JSON.stringify({
        error: 'Missing required context',
        details: `Please complete: ${missing.join(', ')}`
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build a best-practice, structured prompt for high-converting Meta ads
    const brandName: string | undefined = (brand as any)?.brandName || (brand as any)?.business_name;
    const placement = (styleHints?.placement || 'feed') as 'feed'|'stories'|'reels';
    const archetype = (styleHints?.archetype || 'offer') as string;
    const lengthPref = styleHints?.length || 'short';
    const tonePref = styleHints?.tone || '';

    const prompt = `You are an elite Meta/Facebook ads copywriter. Generate multiple high-converting ad variants tailored to the provided brand, audience, angle, and competitors. Use the latest Meta best practices and optimize for hook quality, clarity, and action.

CONTEXT (JSON):
${JSON.stringify({
  brand: {
    name: (brand as any)?.brandName || (brand as any)?.business_name,
    category: (brand as any)?.businessCategory || (brand as any)?.business_type,
    value_props: (brand as any)?.brandStrengths || (brand as any)?.valuePropositions,
    niche: (brand as any)?.niche,
    products: (brand as any)?.mainProducts || (brand as any)?.products
  },
  objective: campaignObjective || 'LEADS',
  selected_angle: angle,
  audience: {
    segment: (audience as any)?.segment,
    insights: (audience as any)?.insights,
    targeting: (audience as any)?.targeting_data
  },
  competitors: competitors || [],
  preferences: {}
}, null, 2)}

REQUIREMENTS:
- Write concise, punchy copy that speaks directly to the target audience (age/gender/interests/pain points) and clearly differentiates from competitors.
- Include: a strong HOOK, a specific VALUE PROPOSITION from brand analysis, and a compelling CTA.
- Adapt tone/structure to the selected ANGLE (e.g., offer, social proof, FOMO, education).
- If relevant, vary by placement (feed, stories, reels) keeping each under typical UI limits (primary_text ~125 chars, headline ~40 chars).
- Use only these CTAs: LEARN_MORE, SHOP_NOW, SIGN_UP, GET_QUOTE, CONTACT_US, DOWNLOAD, BOOK_NOW.
- Each VARIANT MUST MENTION THE BRAND NAME "${brandName || '[[BRAND_NAME]]'}" explicitly in either the primary_text or headline (no generic "our"/"we" without the brand).
- Generate for placement: ${placement}. Keep lengths appropriate and style adapted.
- Preferred angle/archetype: ${archetype}. ${tonePref ? `Tone guidance: ${tonePref}.` : ''}
- Target length: ${lengthPref}.
- Return ONLY valid JSON matching this schema:
{
  "variants": [
    {
      "placement": "feed|stories|reels",
      "primary_text": "string",
      "headline": "string",
      "cta": "LEARN_MORE|SHOP_NOW|SIGN_UP|GET_QUOTE|CONTACT_US|DOWNLOAD|BOOK_NOW"
    }
  ]
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: 'You are an expert Facebook ads copywriter. Create compelling, conversion-focused ad copy that follows Facebook best practices. Keep headlines punchy and primary text engaging but concise.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return new Response(JSON.stringify({
        error: 'OpenAI API error',
        details: error,
        status: response.status
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const generatedContent = data.choices?.[0]?.message?.content || '';
    let result;
    try {
      result = JSON.parse(generatedContent);
    } catch (e) {
      return new Response(JSON.stringify({
        error: 'Model did not return valid JSON',
        details: generatedContent?.slice(0, 400)
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Guardrails, normalization, dedupe, and scoring
    const toTokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const jaccard = (a: string, b: string) => {
      const A = new Set(toTokens(a));
      const B = new Set(toTokens(b));
      const inter = new Set([...A].filter(x => B.has(x))).size;
      const uni = new Set([...A, ...B]).size || 1;
      return inter / uni;
    };

    const limits: Record<string, { primary: number; headline: number }> = {
      feed: { primary: 125, headline: 40 },
      stories: { primary: 90, headline: 36 },
      reels: { primary: 90, headline: 36 },
    };

    const nameLower = (brandName || '').toLowerCase();
    let rawVariants: any[] = Array.isArray(result?.variants) ? result.variants : [];
    // Fallback for models that still return "versions" instead of "variants"
    if ((!rawVariants || rawVariants.length === 0) && Array.isArray((result as any)?.versions)) {
      rawVariants = (result as any).versions.map((v: any) => ({
        placement: v.placement || 'feed',
        primary_text: v.primary_text || v.primaryText || '',
        headline: v.headline || '',
        cta: v.cta || v.callToAction || 'LEARN_MORE',
      }));
    }
    const normalized: any[] = [];
    for (const v of rawVariants) {
      const plc = (v?.placement || placement) as 'feed'|'stories'|'reels';
      const maxP = limits[plc]?.primary ?? 125;
      const maxH = limits[plc]?.headline ?? 40;
      let primary = String(v?.primary_text || v?.primaryText || '').trim();
      let headline = String(v?.headline || '').trim();
      const cta = (v?.cta || 'LEARN_MORE').toString().toUpperCase().replace(' ', '_');
      const hasBrand = nameLower && (primary.toLowerCase().includes(nameLower) || headline.toLowerCase().includes(nameLower));
      if (!hasBrand) {
        if (headline) headline = `${brandName ? brandName + ': ' : ''}${headline}`;
        else primary = `${brandName || ''} ${primary}`.trim();
      }
      // Trim to limits
      if (headline.length > maxH) headline = headline.slice(0, maxH - 1).trim();
      if (primary.length > maxP) primary = primary.slice(0, maxP - 1).trim();

      normalized.push({ placement: plc, primary_text: primary, headline, cta });
    }

    // Dedupe by Jaccard similarity on primary+headline
    const unique: any[] = [];
    for (const v of normalized) {
      const key = `${v.headline} ${v.primary_text}`;
      const isDup = unique.some(u => jaccard(key, `${u.headline} ${u.primary_text}`) > 0.9);
      if (!isDup) unique.push(v);
    }
    // Ensure we always return at least 2 items when possible
    const pool = unique.length > 0 ? unique : normalized;
    let limited = pool.slice(0, Math.max(2, Math.min(3, pool.length)));

    // Deterministic fallback if the content still looks generic or lacks brand anchoring
    const buildDeterministicVariants = (): any[] => {
      const brandDisplay = brandName || 'Your Brand';
      const vp = ((brand as any)?.brandStrengths || (brand as any)?.valuePropositions || []).slice(0, 3);
      const seg = (audience as any)?.segment || 'your ideal customers';
      const hookByAngle: Record<string, string[]> = {
        offer: [
          `Limited time: ${brandDisplay} ${vp[0] ? '— ' + vp[0] : 'exclusive offer'}`,
          `${brandDisplay} is here: ${vp[1] || 'get more for less'}`,
        ],
        proof: [
          `${brandDisplay}: real results for ${seg}`,
          `Why ${seg} switch to ${brandDisplay}`,
        ],
        fomo: [
          `Don’t miss ${brandDisplay} — ${vp[0] || 'top-rated'} is going fast`,
          `Only today: ${brandDisplay} ${vp[1] || 'special savings'}`,
        ],
        education: [
          `How ${brandDisplay} helps ${seg} ${vp[0] ? vp[0].toLowerCase() : 'win'}`,
          `${seg}: simplify with ${brandDisplay}`,
        ],
      };
      const angleKey = (typeof angle === 'string' ? angle : (angle?.type || 'offer')).toLowerCase();
      const hooks = hookByAngle[angleKey] || hookByAngle.offer;
      const pick = (arr: string[], i: number) => arr[i % arr.length];
      const ctas = ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP'];
      const make = (h: string, i: number) => ({
        placement: placement,
        headline: h.slice(0, 40),
        primary_text: `${brandDisplay} ${vp[i] || 'delivers value'} for ${seg}. ${angleKey === 'offer' ? 'Act now.' : 'See how.'}`.slice(0, 125),
        cta: ctas[i % ctas.length],
      });
      return [make(pick(hooks, 0), 0), make(pick(hooks, 1), 1), make(pick(hooks, 2), 2)];
    };

    const looksGeneric = (arr: any[]) => {
      if (!arr || arr.length === 0) return true;
      const brandLower = (brandName || '').toLowerCase();
      const brandMissing = arr.every(v => !(v.primary_text || '').toLowerCase().includes(brandLower) && !(v.headline || '').toLowerCase().includes(brandLower));
      const tooShort = arr.every(v => (v.primary_text || '').length < 25 && (v.headline || '').length < 10);
      return brandMissing || tooShort;
    };

    if (limited.length < 2 || looksGeneric(limited)) {
      const deterministic = buildDeterministicVariants();
      // Merge and dedupe with existing results
      const merged = [...deterministic, ...limited];
      const mergedUnique: any[] = [];
      for (const v of merged) {
        const key = `${v.headline} ${v.primary_text}`.toLowerCase();
        if (!mergedUnique.some(u => jaccard(key, `${u.headline} ${u.primary_text}`.toLowerCase()) > 0.9)) {
          mergedUnique.push(v);
        }
      }
      limited = mergedUnique.slice(0, 3);
    }

    // Score variants
    const brandPropsText = ((brand as any)?.brandStrengths || (brand as any)?.valuePropositions || '').toString().toLowerCase();
    const hookWords = ['unlock', 'discover', 'finally', 'tired of', 'introducing', 'new', 'limited', 'save', 'boost'];
    const scoreOne = (v: any) => {
      let score = 0;
      const t = `${v.headline} ${v.primary_text}`.toLowerCase();
      if (t.includes((brandName || '').toLowerCase())) score += 20;
      if (hookWords.some(h => t.startsWith(h) || t.includes(h))) score += 20;
      if (brandPropsText && jaccard(t, brandPropsText) > 0.2) score += 15;
      if (['SHOP_NOW', 'SIGN_UP', 'GET_QUOTE', 'DOWNLOAD', 'BOOK_NOW'].includes(v.cta)) score += 10;
      const lim = limits[v.placement] || limits.feed;
      if (v.primary_text.length <= lim.primary && v.headline.length <= lim.headline) score += 15;
      return score;
    };
    const scored = limited.map(v => ({ ...v, score: scoreOne(v), flags: [] as string[] }));
    scored.sort((a, b) => b.score - a.score);

    return new Response(JSON.stringify({
      variants: scored,
      // Include a compact echo of context used for verification in tests/logs
      _contextEcho: {
        campaignObjective,
        selectedAngle: angle,
        targetAudience: audience?.segment,
        audienceInsights: audience?.insights,
        hasCompetitorData: !!competitors,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-ad-copy function:', error);
    const message = (error as any)?.message || 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
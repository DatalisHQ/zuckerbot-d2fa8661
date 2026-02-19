import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 120 };

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY || 'sk-tinyfish-yhJdYawm4o3hJWazXIll7OKnx4ksAeIQ';
const TINYFISH_URL = 'https://agent.tinyfish.ai/v1/automation/run-sse';

interface ScrapedBusiness {
  name: string;
  phone: string;
  website?: string;
  rating?: number;
  review_count?: number;
  address?: string;
}

async function scrapeSuburb(suburb: string, industry: string): Promise<ScrapedBusiness[]> {
  const searchTerm = industry === 'dental' ? 'dentist' : industry;
  const url = `https://www.google.com/maps/search/${encodeURIComponent(searchTerm + ' near ' + suburb)}`;

  const goal = `Find all dental practices visible on the map. For each one, extract: {"businesses": [{"name": str, "phone": str, "website": str, "rating": number, "review_count": number, "address": str}]}. Get as many as possible, scroll down the results list. Extract phone numbers and websites from the business details.`;

  const response = await fetch(TINYFISH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': TINYFISH_API_KEY,
    },
    body: JSON.stringify({
      url,
      goal,
      browser_profile: 'stealth',
      proxy_config: {
        enabled: true,
        country_code: 'AU',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`TinyFish API error (${response.status}): ${errText}`);
  }

  const text = await response.text();
  const lines = text.split('\n');

  let resultData: { businesses?: ScrapedBusiness[] } | null = null;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.type === 'COMPLETE' || parsed.status === 'COMPLETED') {
          if (parsed.resultJson) {
            resultData = typeof parsed.resultJson === 'string'
              ? JSON.parse(parsed.resultJson)
              : parsed.resultJson;
          } else if (parsed.data?.resultJson) {
            resultData = typeof parsed.data.resultJson === 'string'
              ? JSON.parse(parsed.data.resultJson)
              : parsed.data.resultJson;
          }
        }
      } catch {
        // skip unparseable SSE lines
      }
    }
  }

  if (!resultData || !Array.isArray(resultData.businesses)) {
    return [];
  }

  return resultData.businesses.filter(
    (b: ScrapedBusiness) => b.name && b.phone
  );
}

function extractSuburbAndState(address: string): { suburb: string | null; state: string | null } {
  const auStates = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
  const parts = address.split(',').map((p: string) => p.trim());

  let state: string | null = null;
  let suburb: string | null = null;

  for (const part of parts) {
    for (const s of auStates) {
      if (part.toUpperCase().includes(s)) {
        state = s;
        break;
      }
    }
  }

  if (parts.length >= 2) {
    suburb = parts[parts.length - 2] || null;
  }

  return { suburb, state };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminKey = req.headers['x-admin-key'] as string;
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { suburbs, industry = 'dental' } = req.body || {};

  if (!Array.isArray(suburbs) || suburbs.length === 0) {
    return res.status(400).json({ error: 'suburbs must be a non-empty array' });
  }

  const results: {
    suburb: string;
    scraped: number;
    inserted: number;
    errors: string[];
  }[] = [];

  let totalInserted = 0;
  let totalScraped = 0;

  for (const suburb of suburbs) {
    const suburbResult = { suburb, scraped: 0, inserted: 0, errors: [] as string[] };

    try {
      const businesses = await scrapeSuburb(suburb, industry);
      suburbResult.scraped = businesses.length;
      totalScraped += businesses.length;

      for (const biz of businesses) {
        const phone = biz.phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
        if (!phone) continue;

        const locationInfo = biz.address
          ? extractSuburbAndState(biz.address)
          : { suburb: suburb, state: null };

        const { error } = await supabase.from('outbound_prospects').insert({
          business_name: biz.name,
          phone,
          website: biz.website || null,
          suburb: locationInfo.suburb || suburb,
          state: locationInfo.state,
          rating: biz.rating || null,
          review_count: biz.review_count || null,
          industry,
          source: 'google_maps',
          scraped_data: biz,
        });

        if (error) {
          if (error.code === '23505') {
            // duplicate phone, skip
          } else {
            suburbResult.errors.push(`Insert failed for ${biz.name}: ${error.message}`);
          }
        } else {
          suburbResult.inserted++;
          totalInserted++;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      suburbResult.errors.push(`Scrape failed: ${message}`);
    }

    results.push(suburbResult);
  }

  return res.status(200).json({
    total_scraped: totalScraped,
    total_inserted: totalInserted,
    by_suburb: results,
  });
}

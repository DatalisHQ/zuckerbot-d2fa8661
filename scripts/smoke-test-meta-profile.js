#!/usr/bin/env node
/**
 * Smoke tests for Meta Profile + Launch Flow
 *
 * S1 (fresh user, conversions):
 *   connect → select ad account → select page → launch conversions
 *   → META_NEEDS_PIXEL_ID
 *   set pixel → launch conversions
 *   → success
 *
 * S2 (returning user):
 *   launch conversions with only objective
 *   → success (uses profile)
 *
 * Usage:
 *   ZUCKERBOT_API_KEY=<key> \
 *   ZUCKERBOT_API_URL=http://localhost:3000/api/v1 \
 *   META_TOKEN=<token> \
 *   META_AD_ACCOUNT=act_123 \
 *   META_PAGE_ID=456 \
 *   META_PIXEL_ID=789 \
 *   CAMPAIGN_ID=<id> \
 *   node scripts/smoke-test-meta-profile.js
 */

const BASE_URL = (process.env.ZUCKERBOT_API_URL || 'http://localhost:3000/api/v1').replace(/\/+$/, '');
const API_KEY  = process.env.ZUCKERBOT_API_KEY || '';
const META_TOKEN      = process.env.META_TOKEN || '';
const META_AD_ACCOUNT = process.env.META_AD_ACCOUNT || 'act_000000000';
const META_PAGE_ID    = process.env.META_PAGE_ID || '111111111';
const META_PIXEL_ID   = process.env.META_PIXEL_ID || '222222222';
const CAMPAIGN_ID     = process.env.CAMPAIGN_ID || '';

if (!API_KEY) { console.error('ERROR: ZUCKERBOT_API_KEY is required'); process.exit(1); }

let passed = 0;
let failed = 0;

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE_URL}${path}`, opts);
  let data;
  try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, data };
}

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function run() {
  console.log(`\n=== Meta Profile Smoke Tests ===`);
  console.log(`Base URL: ${BASE_URL}\n`);

  // ── S1: fresh user, conversions ──────────────────────────────────────────
  console.log('── S1: Fresh user (conversions) ──');

  // 1. Connect
  console.log('\n[1] POST /meta/connect');
  if (!META_TOKEN) {
    console.log('  ⚠  META_TOKEN not set, skipping live connect — verifying schema only');
    const r = await req('POST', '/meta/connect', {});
    assert('returns 400 when token missing', r.status === 400);
    assert('error code META_AUTH_INVALID', r.data?.error?.code === 'META_AUTH_INVALID');
  } else {
    const r = await req('POST', '/meta/connect', { meta_access_token: META_TOKEN });
    assert('returns 200', r.status === 200);
    assert('success: true', r.data?.success === true);
    assert('meta_user_id present', !!r.data?.meta_user_id);
  }

  // 2. List ad accounts
  console.log('\n[2] GET /meta/ad-accounts');
  if (!META_TOKEN) {
    console.log('  ⚠  META_TOKEN not set, skipping');
  } else {
    const r = await req('GET', '/meta/ad-accounts');
    assert('returns 200', r.status === 200);
    assert('accounts is array', Array.isArray(r.data?.accounts));
  }

  // 3. Select ad account
  console.log('\n[3] POST /meta/select-ad-account');
  {
    const r = await req('POST', '/meta/select-ad-account', { ad_account_id: META_AD_ACCOUNT });
    assert('returns 200', r.status === 200);
    assert('success: true', r.data?.success === true);
  }

  // 4. List pages
  console.log('\n[4] GET /meta/pages');
  if (!META_TOKEN) {
    console.log('  ⚠  META_TOKEN not set, skipping');
  } else {
    const r = await req('GET', '/meta/pages');
    assert('returns 200', r.status === 200);
    assert('pages is array', Array.isArray(r.data?.pages));
  }

  // 5. Select page
  console.log('\n[5] POST /meta/select-page');
  {
    const r = await req('POST', '/meta/select-page', { page_id: META_PAGE_ID });
    assert('returns 200', r.status === 200);
    assert('success: true', r.data?.success === true);
  }

  // 6. Launch conversions WITHOUT pixel → must fail META_NEEDS_PIXEL_ID
  console.log('\n[6] Launch conversions without pixel → expect META_NEEDS_PIXEL_ID');
  if (!CAMPAIGN_ID) {
    console.log('  ⚠  CAMPAIGN_ID not set, skipping live launch tests');
  } else {
    const r = await req('POST', `/campaigns/${CAMPAIGN_ID}/launch`, {});
    assert('returns 400', r.status === 400);
    assert('error code META_NEEDS_PIXEL_ID', r.data?.error?.code === 'META_NEEDS_PIXEL_ID', JSON.stringify(r.data?.error));
  }

  // 7. Set pixel
  console.log('\n[7] POST /meta/set-pixel');
  {
    const r = await req('POST', '/meta/set-pixel', { pixel_id: META_PIXEL_ID });
    assert('returns 200', r.status === 200);
    assert('success: true', r.data?.success === true);
  }

  // 8. Launch conversions WITH pixel → success
  console.log('\n[8] Launch conversions with pixel → expect success');
  if (!CAMPAIGN_ID) {
    console.log('  ⚠  CAMPAIGN_ID not set, skipping');
  } else {
    const r = await req('POST', `/campaigns/${CAMPAIGN_ID}/launch`, {});
    assert('returns 200', r.status === 200, JSON.stringify(r.data?.error));
    assert('status: active', r.data?.status === 'active');
    assert('resolved.ad_account_id present', !!r.data?.resolved?.ad_account_id);
    assert('resolved.page_id present', !!r.data?.resolved?.page_id);
    assert('resolved.pixel_id present', !!r.data?.resolved?.pixel_id);
  }

  // ── S2: returning user ───────────────────────────────────────────────────
  console.log('\n── S2: Returning user (uses profile) ──');

  console.log('\n[9] Launch conversions with no body overrides → success');
  if (!CAMPAIGN_ID) {
    console.log('  ⚠  CAMPAIGN_ID not set, skipping');
  } else {
    const r = await req('POST', `/campaigns/${CAMPAIGN_ID}/launch`, {});
    assert('returns 200', r.status === 200, JSON.stringify(r.data?.error));
    assert('resolved values echoed', !!(r.data?.resolved?.ad_account_id && r.data?.resolved?.page_id));
  }

  // ── Validation: missing pixel error schema ───────────────────────────────
  console.log('\n── Schema validation ──');
  console.log('\n[10] POST /meta/set-pixel with no body → expect structured error');
  {
    const r = await req('POST', '/meta/set-pixel', {});
    assert('returns 400', r.status === 400);
    assert('error.code is string', typeof r.data?.error?.code === 'string');
    assert('error.message is string', typeof r.data?.error?.message === 'string');
    assert('error.details present', !!r.data?.error?.details);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });

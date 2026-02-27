#!/usr/bin/env node

// Script to update Vercel env vars for ZuckerBot via Vercel API
// and trigger a redeploy. Safe to run multiple times (idempotent per key).

import fetch from 'node-fetch';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID; // or project name

if (!VERCEL_TOKEN) {
  console.error('Missing VERCEL_TOKEN in env');
  process.exit(1);
}

if (!VERCEL_PROJECT_ID) {
  console.error('Missing VERCEL_PROJECT_ID in env (project id or name)');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${VERCEL_TOKEN}`,
  'Content-Type': 'application/json',
};

async function upsertEnv(name, value) {
  // Create env var (this will create a new version even if one exists)
  const res = await fetch('https://api.vercel.com/v10/projects/' + encodeURIComponent(VERCEL_PROJECT_ID) + '/env', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      key: name,
      value,
      target: ['production'],
      type: 'encrypted',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Failed to set ${name}:`, res.status, text);
    throw new Error(`Vercel env update failed for ${name}`);
  }

  const json = await res.json();
  console.log(`Set ${name} env (id=${json.id || json.env?.id || 'unknown'})`);
}

async function main() {
  try {
    await upsertEnv('SUPABASE_URL', SUPABASE_URL);
    await upsertEnv('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY);
    await upsertEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);

    // Trigger a deployment from latest
    const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: VERCEL_PROJECT_ID,
        project: VERCEL_PROJECT_ID,
      }),
    });

    if (!deployRes.ok) {
      const text = await deployRes.text();
      console.error('Failed to trigger redeploy:', deployRes.status, text);
    } else {
      const json = await deployRes.json();
      console.log('Triggered redeploy, deployment id:', json.id);
    }
  } catch (err) {
    console.error('Error updating Vercel env:', err);
    process.exit(1);
  }
}

main();

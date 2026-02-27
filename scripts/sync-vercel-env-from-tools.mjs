#!/usr/bin/env node

// Sync Vercel env vars for ZuckerBot using secrets stored in TOOLS.md
// - Reads Vercel token + Supabase keys from ../../TOOLS.md (not logged)
// - Finds the ZuckerBot project via Vercel API
// - Sets SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY for production
// - Triggers a redeploy

import fs from 'fs';
import path from 'path';
// Using global fetch available in Node 18+ (no node-fetch dependency needed)

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../..');
const toolsPath = path.join(rootDir, 'TOOLS.md');

function extractSecret(label, text) {
  const re = new RegExp(label + '\\s*[:=]\\s*(.+)');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function extractSection(header, text) {
  const re = new RegExp('###\\s+' + header + '[\\s\\S]*?(?=###|$)', 'i');
  const m = text.match(re);
  return m ? m[0] : '';
}

async function main() {
  const tools = fs.readFileSync(toolsPath, 'utf8');

  const vercelSection = extractSection('Vercel', tools);
  const supabaseSection = extractSection('Supabase', tools);

  const vercelToken = extractSecret('Token', vercelSection);
  if (!vercelToken) {
    console.error('Could not find Vercel token in TOOLS.md');
    process.exit(1);
  }

  const supabaseUrl = extractSecret('Project URL', supabaseSection);
  const supabaseAnon = extractSecret('Anon Key', supabaseSection);
  const supabaseService = extractSecret('Service Role Key', supabaseSection);

  if (!supabaseUrl || !supabaseAnon || !supabaseService) {
    console.error('Could not find Supabase keys in TOOLS.md');
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${vercelToken}`,
    'Content-Type': 'application/json',
  };

  // 1) Find ZuckerBot project
  const projectsRes = await fetch('https://api.vercel.com/v9/projects', { headers });
  if (!projectsRes.ok) {
    const text = await projectsRes.text();
    console.error('Failed to list Vercel projects:', projectsRes.status, text);
    process.exit(1);
  }
  const projectsJson = await projectsRes.json();
  const projects = projectsJson.projects || projectsJson; // handle both shapes

  const project = projects.find(p =>
    typeof p.name === 'string' &&
    (p.name.toLowerCase().includes('zuckerbot') || p.name.toLowerCase().includes('zucker'))
  );

  if (!project) {
    console.error('Could not find ZuckerBot project in Vercel projects list');
    process.exit(1);
  }

  const projectId = project.id;
  const projectName = project.name;
  console.log('Using Vercel project:', projectName, `(${projectId})`);

  async function upsertEnv(key, value) {
    const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key,
        value,
        target: ['production'],
        type: 'encrypted',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      // If the env var already exists, treat as success and move on.
      try {
        const json = JSON.parse(text);
        if (json.error && json.error.code === 'ENV_CONFLICT') {
          console.log(`Env ${key} already exists, skipping create.`);
          return;
        }
      } catch {}
      console.error(`Failed to set ${key}:`, res.status, text);
      throw new Error(`env update failed for ${key}`);
    }
    const json = await res.json();
    console.log(`Set ${key} (env id ${json.id || json.env?.id || 'unknown'})`);
  }

  await upsertEnv('SUPABASE_URL', supabaseUrl);
  await upsertEnv('SUPABASE_ANON_KEY', supabaseAnon);
  await upsertEnv('SUPABASE_SERVICE_ROLE_KEY', supabaseService);

  // Trigger redeploy of latest deployment
  const latestRes = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`, {
    headers,
  });
  if (!latestRes.ok) {
    const text = await latestRes.text();
    console.error('Failed to fetch latest deployment:', latestRes.status, text);
    return;
  }
  const latestJson = await latestRes.json();
  const latest = (latestJson.deployments && latestJson.deployments[0]) || latestJson[0];
  if (!latest) {
    console.error('No deployments found to redeploy');
    return;
  }

  const deployId = latest.uid || latest.id;
  const redeployRes = await fetch(`https://api.vercel.com/v13/deployments/${deployId}/redeploy`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  if (!redeployRes.ok) {
    const text = await redeployRes.text();
    console.error('Failed to trigger redeploy:', redeployRes.status, text);
  } else {
    const json = await redeployRes.json();
    console.log('Triggered redeploy, deployment id:', json.id || json.deploymentId || 'unknown');
  }
}

main().catch(err => {
  console.error('sync-vercel-env-from-tools error:', err);
  process.exit(1);
});

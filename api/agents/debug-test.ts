export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || 'missing';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'missing';
    const brave = process.env.BRAVE_SEARCH_API_KEY ? 'set' : 'missing';
    const anthropic = process.env.ANTHROPIC_API_KEY ? 'set' : 'missing';
    
    // Try creating client
    const client = createClient(
      process.env.SUPABASE_URL || 'https://bqqmkiocynvlaianwisd.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    
    // Try a query
    const { data, error } = await client.from('businesses').select('id').limit(1);
    
    return res.status(200).json({
      env: { url, key, brave, anthropic },
      supabase_query: error ? { error: error.message } : { ok: true, count: data?.length },
    });
  } catch (err: any) {
    return res.status(200).json({ error: err.message, stack: err.stack?.split('\n').slice(0, 5) });
  }
}

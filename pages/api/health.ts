import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Lightweight health probe for uptime monitoring. Pings PostgREST/DB with a short
// timeout via a short-lived anon client. Ping returns no rows; we only care it succeeds.
// 200 = healthy, 503 = degraded. No auth, no data leakage.
// Ping = org_branding RPC (anon-executable, returns no rows for an unknown slug).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = createClient(url, anon, { db: { schema: 'snrpmo' }, auth: { persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const started = Date.now();
  let db: 'up' | 'down' = 'down';
  let error: string | undefined;
  try {
    const ping = sb.rpc('org_branding', { p_slug: '__healthcheck__' });
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('db timeout')), 4000));
    const { error: e } = (await Promise.race([ping, timeout])) as { error: unknown };
    if (e) throw e;
    db = 'up';
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : 'db error';
  }
  const healthy = db === 'up' && !!url && !!anon;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    db,
    latency_ms: Date.now() - started,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    time: new Date().toISOString(),
    ...(error ? { error } : {}),
  });
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { sb } from '@/lib/supabase';

// 1x1 transparent GIF open-tracking pixel embedded in campaign emails.
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const c = typeof req.query.c === 'string' ? req.query.c : '';
  const o = typeof req.query.o === 'string' ? req.query.o : null;
  if (c) { try { await sb.rpc('track_campaign_event', { p_campaign: c, p_org: o, p_kind: 'open' }); } catch { /* ignore */ } }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.status(200).send(GIF);
}

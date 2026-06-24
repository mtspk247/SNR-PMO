import type { NextApiRequest, NextApiResponse } from 'next';
import { sb } from '@/lib/supabase';

// Click-tracking redirector: records the click, then 302s to the campaign's link.
const BASE = 'https://snr-pmo.vercel.app';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const c = typeof req.query.c === 'string' ? req.query.c : '';
  const o = typeof req.query.o === 'string' ? req.query.o : null;
  const xff = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(xff) ? xff[0] : (xff || '')).split(',')[0].trim() || (req.socket?.remoteAddress || '');
  let dest = BASE;
  if (c) {
    try {
      const { data } = await sb.rpc('track_campaign_event', { p_campaign: c, p_org: o, p_kind: 'click', p_ip: ip });
      if (typeof data === 'string' && /^https?:\/\//i.test(data)) dest = data;
    } catch { /* ignore */ }
  }
  res.redirect(302, dest);
}

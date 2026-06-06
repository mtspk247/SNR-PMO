import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { todayISO } from '@/lib/util';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get('key') === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = db();
  const date = todayISO();
  const { data: open } = await sb.from('attendance').select('*').eq('work_date', date).eq('status', 'OPEN');
  let count = 0;
  for (const a of open || []) {
    const now = new Date();
    const hours = Math.round(((now.getTime() - new Date(a.check_in).getTime()) / 3600000) * 100) / 100;
    await sb.from('attendance').update({ check_out: now.toISOString(), hours, status: 'AUTO_CHECKOUT' }).eq('id', a.id);
    await audit({ user_id: a.user_id, action: 'CHECK_OUT', entity_type: 'attendance', entity_id: date, new_value: { hours, auto: true } });
    count++;
  }
  return NextResponse.json({ ok: true, auto_checked_out: count });
}

import { NextResponse } from 'next/server';
import { clearSessionCookie, getSession } from '@/lib/session';
import { audit } from '@/lib/audit';

export async function POST() {
  const s = await getSession();
  if (s) await audit({ user_id: s.uid, username: s.username, action: 'LOGOUT' });
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

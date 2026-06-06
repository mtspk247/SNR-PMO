import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { verifyPassword } from '@/lib/auth';
import { createToken, setSessionCookie } from '@/lib/session';
import { audit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (!username || !password) return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });

  const { data: user } = await db().from('users').select('*').eq('username', username).maybeSingle();
  if (!user || user.status !== 'active' || !verifyPassword(password, user.salt, user.password_hash)) {
    await audit({ username, action: 'LOGIN', new_value: { result: 'FAILED' }, ip });
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const token = createToken({ uid: user.id, username: user.username, role: user.role, full_name: user.full_name });
  await setSessionCookie(token);
  await db().from('users').update({ last_login: new Date().toISOString() }).eq('id', user.id);
  await audit({ user_id: user.id, username: user.username, action: 'LOGIN', new_value: { result: 'OK' }, ip });
  return NextResponse.json({ ok: true });
}

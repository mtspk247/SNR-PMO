import crypto from 'crypto';
import { cookies } from 'next/headers';

const SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret-change-me';
const COOKIE = 'snr_session';
const MAX_AGE = 8 * 60 * 60; // 8h

export type Session = {
  uid: string; username: string; role: string; full_name: string; exp: number;
};

function b64(s: string) { return Buffer.from(s).toString('base64url'); }
function unb64(s: string) { return Buffer.from(s, 'base64url').toString('utf8'); }
function sign(payload: string) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

export function createToken(s: Omit<Session, 'exp'>): string {
  const full: Session = { ...s, exp: Math.floor(Date.now() / 1000) + MAX_AGE };
  const body = b64(JSON.stringify(full));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token?: string): Session | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (sign(body) !== sig) return null;
  try {
    const s = JSON.parse(unb64(body)) as Session;
    if (s.exp < Math.floor(Date.now() / 1000)) return null;
    return s;
  } catch { return null; }
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  });
}
export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}
export async function getSession(): Promise<Session | null> {
  const c = (await cookies()).get(COOKIE)?.value;
  return verifyToken(c);
}
export const COOKIE_NAME = COOKIE;

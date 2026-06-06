import crypto from 'crypto';

export function makeSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}
export function hashPassword(password: string, salt: string): string {
  return crypto.createHash('sha256').update(salt + password).digest('hex');
}
export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const h = hashPassword(password, salt);
  try { return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash)); }
  catch { return false; }
}

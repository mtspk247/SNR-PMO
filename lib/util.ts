export const TZ = 'America/New_York';

export function fmtDate(d?: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d as string; }
}
export function fmtTime(d?: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: TZ }); }
  catch { return d as string; }
}
export function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-US', { dateStr: undefined as any, timeZone: TZ, month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
  catch { return d as string; }
}
export function todayISO() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date()); // YYYY-MM-DD in EST
}
export function daysBetween(a: string, b: string) {
  const d1 = new Date(a + 'T00:00:00'); const d2 = new Date(b + 'T00:00:00');
  return Math.floor((d2.getTime() - d1.getTime()) / 86400000) + 1;
}
export function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
}

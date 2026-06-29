// Shared key-rotation date logic. Single source for the /keys table badge AND the
// admin dashboard nudge so the 30-day threshold never drifts between the two.

const DAY = 86400000;

function daysUntil(d?: string): number | null {
  if (!d) return null;
  const t = new Date(d + 'T00:00:00').getTime();
  if (isNaN(t)) return null;
  return Math.round((t - Date.now()) / DAY);
}

export type RotState = 'overdue' | 'soon' | 'ok';

export function rotState(d?: string): RotState | null {
  const days = daysUntil(d);
  if (days === null) return null;
  if (days < 0) return 'overdue';
  if (days <= 30) return 'soon';
  return 'ok';
}

// Presentation for the /keys table row (behaviour unchanged from the original inline fn).
export function rotInfo(d?: string): { text: string; cls: string } | null {
  const days = daysUntil(d);
  if (days === null) return null;
  if (days < 0) return { text: 'Overdue', cls: 'text-rose-600' };
  if (days <= 30) return { text: 'due in ' + days + 'd', cls: 'text-amber-600' };
  return { text: '', cls: 'text-muted2' };
}

export const KEY_LABELS: Record<string, string> = {
  ai: 'AI Assistant',
  email: 'Email',
  sms: 'SMS / Messaging',
  billing: 'Billing (Stripe)',
};

export type DueKey = { key: string; label: string; state: RotState; days: number };

// Keys whose rotation date is overdue or within 30 days, worst (most overdue) first.
export function keysNeedingRotation(reminders?: Record<string, string> | null): DueKey[] {
  const map = reminders || {};
  const out: DueKey[] = [];
  for (const k of Object.keys(map)) {
    const st = rotState(map[k]);
    if (st === 'overdue' || st === 'soon') {
      out.push({ key: k, label: KEY_LABELS[k] || k, state: st, days: daysUntil(map[k]) as number });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { keysNeedingRotation } from '@/lib/keyRotation';

// Admin-only dashboard nudge: surfaces API keys whose rotation date (set on /keys) is
// overdue or due within 30 days. Read-only — reads org.key_rotation_reminders already
// loaded with the org; the secret value itself never reaches the client. Mirrors the
// Install-app banner. Dismissal is keyed to the current due-set so a new/worsened key
// always re-surfaces (an overdue key is never permanently hidden).
export default function KeyRotationNudge() {
  const org = useActiveOrg();
  const [dismissedSig, setDismissedSig] = useState<string | null>(null);
  useEffect(() => {
    try { setDismissedSig(window.localStorage.getItem('snr_keyrot_dismissed')); } catch (_e) {}
  }, []);

  if (!org || !can.manageOrg(org)) return null;
  const due = keysNeedingRotation(org.key_rotation_reminders as Record<string, string> | undefined);
  if (!due.length) return null;

  const sig = due.map((d) => d.key + ':' + d.state).join('|');
  if (dismissedSig === sig) return null;

  const overdue = due.filter((d) => d.state === 'overdue');
  const soon = due.filter((d) => d.state === 'soon');
  const isOverdue = overdue.length > 0;
  const list = (xs: typeof due) => xs.map((d) => d.label).join(', ');

  const dismiss = () => {
    try { window.localStorage.setItem('snr_keyrot_dismissed', sig); } catch (_e) {}
    setDismissedSig(sig);
  };

  return (
    <div className={'card p-3 mb-5 flex items-center gap-3 border flex-wrap ' + (isOverdue ? 'border-rose-500/30 bg-rose-500/5' : 'border-amber-500/30 bg-amber-500/5')}>
      <span className={'w-9 h-9 rounded-lg grid place-items-center shrink-0 ' + (isOverdue ? 'bg-rose-500/15 text-rose-600' : 'bg-amber-500/15 text-amber-600')}><Icon name="ti-rotate" className="text-lg" /></span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-content">{isOverdue ? 'API key rotation overdue' : 'API keys due for rotation'}</p>
        <p className="text-2xs text-muted">
          {isOverdue
            ? `${list(overdue)} ${overdue.length === 1 ? 'is' : 'are'} past the set rotation date${soon.length ? ` · ${list(soon)} due soon` : ''}. Rotate to keep access secure.`
            : `${list(soon)} ${soon.length === 1 ? 'is' : 'are'} due for rotation within 30 days. Rotate to keep access secure.`}
        </p>
      </div>
      <Link href="/keys" className="btn btn-primary shrink-0"><Icon name="ti-key" />Review keys</Link>
      <button onClick={dismiss} aria-label="Dismiss" className="h-7 w-7 grid place-items-center rounded-md text-muted2 hover:text-content hover:bg-surface2 shrink-0"><Icon name="ti-x" className="text-sm" /></button>
    </div>
  );
}

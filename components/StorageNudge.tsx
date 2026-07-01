import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Icon } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { getDriveUsage, tenantLimit } from '@/lib/db';
import { can } from '@/lib/authz';

// Global storage upgrade-nudge. Self-gates to null unless usage >= 80%. Amber at 80/90%
// (dismissible per session), red + non-dismissible at 100% (uploads are blocked server-side).
// Usage % is cached in sessionStorage (5 min) so navigation doesn't re-hit the RPC each page.
export default function StorageNudge() {
  const org = useActiveOrg();
  const router = useRouter();
  const [pct, setPct] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!org?.id) { setPct(null); return; }
    const ckey = `snr_storage_pct_${org.id}`;
    try {
      const raw = sessionStorage.getItem(ckey);
      if (raw) { const c = JSON.parse(raw); if (c && Date.now() - c.ts < 300000 && typeof c.pct === 'number') { setPct(c.pct); return; } }
    } catch { /* ignore */ }
    Promise.all([getDriveUsage(org.id), tenantLimit(org.id, 'storage_mb')])
      .then(([used, limitMb]) => {
        if (!alive) return;
        if (!limitMb || limitMb <= 0) { setPct(null); return; }
        const p = Math.round((used / 1048576 / limitMb) * 100);
        setPct(p);
        try { sessionStorage.setItem(ckey, JSON.stringify({ pct: p, ts: Date.now() })); } catch { /* ignore */ }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [org?.id]);

  if (pct == null || pct < 80) return null;
  if (router.pathname === '/billing') return null;
  const full = pct >= 100;
  const bucket = full ? 100 : pct >= 90 ? 90 : 80;
  const dkey = `snr_storage_nudge_${org?.id}_${bucket}`;
  const hidden = !full && (dismissed || (typeof window !== 'undefined' && sessionStorage.getItem(dkey) === '1'));
  if (hidden) return null;
  const canBill = can.manageBilling(org);
  const tone = full ? 'bg-rose-500/10 border-rose-500/30 text-rose-700' : 'bg-amber-500/10 border-amber-500/30 text-amber-700';
  return (
    <div className={`mb-4 rounded-lg border px-4 py-2.5 flex items-center gap-3 ${tone}`}>
      <Icon name={full ? 'ti-database-off' : 'ti-database'} className="text-base shrink-0" />
      <p className="text-sm flex-1 min-w-0">
        {full ? 'Your workspace storage is full — new uploads are blocked until you free space or upgrade.' : `You've used ${pct}% of your workspace storage.`}
        {!canBill && ' Ask an admin to upgrade.'}
      </p>
      {canBill && <Link href="/billing" className="btn btn-sm btn-primary shrink-0"><Icon name="ti-arrow-up" className="text-sm" />Upgrade</Link>}
      {!full && <button onClick={() => { setDismissed(true); try { sessionStorage.setItem(dkey, '1'); } catch { /* ignore */ } }} className="shrink-0 opacity-70 hover:opacity-100" title="Dismiss"><Icon name="ti-x" className="text-sm" /></button>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Icon } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { upsellPromptsFor, getDriveUsage, tenantLimit, UpsellPrompt } from '@/lib/db';
import { can } from '@/lib/authz';

// Config-driven upgrade nudges (replaces the hardcoded storage nudge). Renders banner-placement
// prompts resolved for the org (platform defaults + reseller overrides). Triggers evaluated
// client-side: 'manual' = always; 'usage_threshold'+storage = when usage% >= threshold.
// Results cached in sessionStorage (5 min) so navigation doesn't re-hit the RPCs.
async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  try { const raw = sessionStorage.getItem(key); if (raw) { const c = JSON.parse(raw); if (c && Date.now() - c.ts < ttl) return c.v as T; } } catch { /* */ }
  const v = await fn();
  try { sessionStorage.setItem(key, JSON.stringify({ v, ts: Date.now() })); } catch { /* */ }
  return v;
}

export default function UpsellPrompts() {
  const org = useActiveOrg();
  const router = useRouter();
  const [prompts, setPrompts] = useState<UpsellPrompt[]>([]);
  const [pct, setPct] = useState<number | null>(null);
  const [tick, setTick] = useState(0); // re-render after dismiss

  useEffect(() => {
    let alive = true;
    if (!org?.id) { setPrompts([]); setPct(null); return; }
    cached(`snr_upsell_${org.id}`, 300000, () => upsellPromptsFor(org.id))
      .then((p) => { if (alive) setPrompts(p || []); }).catch(() => {});
    cached(`snr_storage_pct_${org.id}`, 300000, async () => {
      const [used, limitMb] = await Promise.all([getDriveUsage(org.id), tenantLimit(org.id, 'storage_mb')]);
      return (!limitMb || limitMb <= 0) ? -1 : Math.round((used / 1048576 / limitMb) * 100);
    }).then((v) => { if (alive) setPct(v >= 0 ? v : null); }).catch(() => {});
    return () => { alive = false; };
  }, [org?.id]);

  if (!org || router.pathname === '/billing') return null;
  const isAdmin = ['owner', 'admin'].includes(org.member_role || '');
  const canBill = can.manageBilling(org);

  const eligible = prompts.filter((p) => {
    if (p.placement !== 'banner' || p.status !== 'active') return false;
    if (p.audience === 'admins' && !isAdmin) return false;
    if (p.trigger_type === 'manual') return true;
    if (p.trigger_type === 'usage_threshold' && p.metric === 'storage') return pct != null && pct >= (p.threshold_pct ?? 80);
    return false;
  });
  if (!eligible.length) return null;

  const dkey = (p: UpsellPrompt) => `snr_upsell_dismiss_${org.id}_${p.id}_${p.trigger_type === 'usage_threshold' && pct != null && pct >= 100 ? 'full' : 'warn'}`;
  const shown = eligible.filter((p) => {
    const hardBlock = p.trigger_type === 'usage_threshold' && pct != null && pct >= 100; // storage full = non-dismissible
    if (hardBlock) return true;
    try { return sessionStorage.getItem(dkey(p)) !== '1'; } catch { return true; }
  });
  if (!shown.length) return null;

  return (
    <div className="space-y-2 mb-4">
      {shown.map((p) => {
        const full = p.trigger_type === 'usage_threshold' && pct != null && pct >= 100;
        const tone = full ? 'bg-rose-500/10 border-rose-500/30 text-rose-700' : 'bg-amber-500/10 border-amber-500/30 text-amber-700';
        const icon = (p.style && p.style.icon) || (full ? 'ti-database-off' : 'ti-rocket');
        const body = p.trigger_type === 'usage_threshold' && pct != null
          ? (full ? (p.body || 'Your workspace storage is full — new uploads are blocked until you free space or upgrade.') : `You've used ${pct}% of your workspace storage.`)
          : p.body;
        return (
          <div key={p.id} className={`rounded-lg border px-4 py-2.5 flex items-center gap-3 ${tone}`}>
            <Icon name={icon} className="text-base shrink-0" />
            <div className="flex-1 min-w-0">
              {p.title && <span className="text-sm font-medium">{p.title}. </span>}
              <span className="text-sm">{body}{!canBill && p.cta_href === '/billing' ? ' Ask an admin to upgrade.' : ''}</span>
            </div>
            {(canBill || p.cta_href !== '/billing') && p.cta_label && <Link href={p.cta_href || '/billing'} className="btn btn-sm btn-primary shrink-0"><Icon name="ti-arrow-up" className="text-sm" />{p.cta_label}</Link>}
            {!full && <button onClick={() => { try { sessionStorage.setItem(dkey(p), '1'); } catch { /* */ } setTick(tick + 1); }} className="shrink-0 opacity-70 hover:opacity-100" title="Dismiss"><Icon name="ti-x" className="text-sm" /></button>}
          </div>
        );
      })}
    </div>
  );
}

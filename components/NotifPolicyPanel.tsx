import { useEffect, useState } from 'react';
import Select from '@/components/Select';
import { Spinner, EmptyState, Icon } from '@/components/ui';
import { listOrgNotifPolicies, setOrgNotifPolicy, NotifPolicyRow } from '@/lib/db';

const POLICY_OPTS: { value: string; label: string; hint: string }[] = [
  { value: 'mandatory', label: 'Required', hint: 'Always sent — users cannot turn it off' },
  { value: 'optional_on', label: 'Optional · on by default', hint: 'Sent unless a user opts out' },
  { value: 'optional_off', label: 'Optional · off by default', hint: 'Only sent if a user opts in' },
  { value: 'disabled', label: 'Disabled', hint: 'Never sent to anyone in this org' },
];
const POLICY_PILL: Record<string, string> = { mandatory: 'pill-amber', optional_on: 'pill-green', optional_off: 'pill-gray', disabled: 'pill-red' };

/** Org-wide notification policy editor (admin). Extracted so Settings → Notifications and /admin/notifications share one source. */
export default function NotifPolicyPanel({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<NotifPolicyRow[] | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = () => { listOrgNotifPolicies(orgId).then(setRows).catch((e) => { setErr(e?.message || 'Failed to load'); setRows([]); }); };
  useEffect(() => { if (orgId) load(); /* eslint-disable-next-line */ }, [orgId]);

  const change = async (key: string, policy: string) => {
    setSavingKey(key); setErr('');
    try { await setOrgNotifPolicy(orgId, key, policy); setRows((rs) => (rs || []).map((r) => (r.key === key ? { ...r, policy } : r))); }
    catch (e: any) { setErr(e?.message || 'Could not save'); load(); }
    finally { setSavingKey(null); }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="ti-bell-cog" className="text-muted" />
        <p className="text-sm font-semibold">Organization notification policy</p>
      </div>
      <p className="text-2xs text-muted mb-3">Decide which notifications are required and which your members can manage themselves.</p>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="card overflow-hidden">
        {rows === null ? <div className="p-8"><Spinner /></div> : rows.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-bell" text="No notification types." /></div>
        ) : (
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center gap-4 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-content">{r.label}</span>
                    <span className="pill pill-gray text-2xs">{r.category}</span>
                    <span className={`pill ${POLICY_PILL[r.policy] || 'pill-gray'} text-2xs`}>{POLICY_OPTS.find((o) => o.value === r.policy)?.label || r.policy}</span>
                  </span>
                  <span className="block text-2xs text-muted mt-0.5">{r.description}</span>
                </span>
                <span className="shrink-0 flex items-center gap-2">
                  {savingKey === r.key && <Icon name="ti-loader-2" className="text-muted animate-spin text-sm" />}
                  <div className="w-56"><Select value={r.policy} onChange={(v) => change(r.key, v)} disabled={savingKey === r.key} options={[...POLICY_OPTS.map((o) => ({ value: o.value, label: o.label }))]} /></div>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-2xs text-muted2 mt-3">Required notifications are always delivered and appear locked in each member’s settings. New notification types added as the platform grows appear here automatically.</p>
    </div>
  );
}

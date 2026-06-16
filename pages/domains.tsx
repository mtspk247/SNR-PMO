import { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listDomains, createDomain, updateDomain, deleteDomain, getOrgUsers, Domain } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';

const STATUS_PILL: Record<string, string> = {
  active: 'pill-green',
  expired: 'pill-red',
  transferred: 'pill-gray',
  for_sale: 'pill-violet',
};
const STATUSES: Domain['status'][] = ['active', 'expired', 'transferred', 'for_sale'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'PKR'];

const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const daysTo = (d: string | null) =>
  d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;

type Draft = Partial<Domain>;
const emptyDraft = (): Draft => ({
  domain: '',
  registrar: '',
  owner_id: undefined,
  purchased_on: '',
  expires_on: '',
  auto_renew: false,
  cost: 0,
  currency: 'USD',
  total_spending: 0,
  status: 'active',
  notes: '',
});

export default function DomainsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'financial');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    listDomains(org.id)
      .then(setDomains)
      .catch((e: any) => { setErr(e.message); setDomains([]); });
  };

  useEffect(() => {
    if (org?.id && enabled) {
      load();
      getOrgUsers(org.id).then(setUsers).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id, enabled]);

  const name = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';

  const shown = useMemo(
    () =>
      (domains || []).filter(
        (d) =>
          (statusF === 'all' || d.status === statusF) &&
          (!q.trim() ||
            `${d.domain} ${d.registrar || ''}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [domains, q, statusF],
  );

  const kpis = useMemo(() => {
    const all = domains || [];
    const now = Date.now();
    const expiring = all.filter((d) => {
      if (d.status !== 'active' || !d.expires_on) return false;
      const diff = (new Date(d.expires_on).getTime() - now) / 86400000;
      return diff >= 0 && diff <= 30;
    });
    return {
      total: all.length,
      expiring: expiring.length,
      autoRenew: all.filter((d) => d.auto_renew).length,
      totalSpend: all.reduce((t, d) => t + Number(d.total_spending || 0), 0),
    };
  }, [domains]);

  const setD = (patch: Draft) =>
    setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.domain?.trim() || busy) return;
    setBusy(true);
    setErr('');
    const d = editor.draft;
    const payload: any = {
      domain: d.domain!.trim(),
      registrar: d.registrar || null,
      owner_id: d.owner_id || null,
      purchased_on: d.purchased_on || null,
      expires_on: d.expires_on || null,
      auto_renew: d.auto_renew ?? false,
      cost: Number(d.cost) || 0,
      currency: d.currency || 'USD',
      total_spending: Number(d.total_spending) || 0,
      status: d.status || 'active',
      notes: d.notes || null,
    };
    try {
      if (editor.mode === 'edit' && d.id) {
        await updateDomain(d.id, payload);
      } else {
        await createDomain({ org_id: org.id, created_by: me.id, ...payload });
      }
      setEditor(null);
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: Domain) => {
    if (!confirm(`Delete domain "${d.domain}"?`)) return;
    setBusy(true);
    try {
      await deleteDomain(d.id);
      setEditor(null);
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!enabled)
    return (
      <Layout flat title="Domains">
        <EmptyState icon="ti-world-off" title="Domains not in your plan" text="Upgrade to manage your domain portfolio." />
      </Layout>
    );

  return (
    <Layout flat title="Domains">
      <PageHeader
        title="Domains"
        subtitle="Track domain registrations, renewals, costs and ownership"
        icon="ti-world"
        action={
          <button
            className="btn btn-primary"
            onClick={() => setEditor({ mode: 'add', draft: emptyDraft() })}
          >
            <Icon name="ti-plus" />Add domain
          </button>
        }
      />

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total domains" value={String(kpis.total)} icon="ti-world" />
        <StatCard
          label="Expiring ≤30d"
          value={String(kpis.expiring)}
          icon="ti-clock-exclamation"
          hintTone={kpis.expiring > 0 ? 'down' : 'muted'}
        />
        <StatCard label="Auto-renew on" value={String(kpis.autoRenew)} icon="ti-refresh" />
        <StatCard label="Total spend" value={fmtMoney(kpis.totalSpend)} icon="ti-receipt" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="input h-9 w-56"
          placeholder="Search domains…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="w-44"><Select value={statusF} onChange={(v) => setStatusF(v)} options={[{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))]} /></div>
      </div>

      <div className="card overflow-hidden">
        {domains === null ? (
          <div className="p-8"><Spinner /></div>
        ) : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-world" text="No domains yet." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Registrar</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3 text-right">Cost /yr</th>
                  <th className="px-4 py-3">Auto-renew</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => {
                  const days = daysTo(d.expires_on);
                  const expClass =
                    days != null && days < 0
                      ? 'text-rose-600'
                      : days != null && days <= 30
                      ? 'text-amber-600'
                      : 'text-muted';
                  return (
                    <tr
                      key={d.id}
                      className="border-t border-line hover:bg-surface2/50 cursor-pointer"
                      onClick={() => setEditor({ mode: 'edit', draft: { ...d } })}
                    >
                      <td className="px-4 py-3 font-medium text-content">{d.domain}</td>
                      <td className="px-4 py-3 text-muted">{d.registrar || '—'}</td>
                      <td className="px-4 py-3 text-2xs">
                        {d.expires_on ? (
                          <span className={expClass}>
                            {d.expires_on}
                            {days != null && days >= 0 && days <= 30
                              ? ` · ${days}d`
                              : days != null && days < 0
                              ? ' · overdue'
                              : ''}
                          </span>
                        ) : (
                          <span className="text-muted2">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtMoney(d.cost, d.currency)}
                      </td>
                      <td className="px-4 py-3">
                        {d.auto_renew ? (
                          <Icon name="ti-check" className="text-emerald-600" />
                        ) : (
                          <span className="text-muted2">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-2xs text-muted">{name(d.owner_id)}</td>
                      <td className="px-4 py-3">
                        <span className={`pill ${STATUS_PILL[d.status] || 'pill-gray'}`}>
                          {d.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          size="lg"
          icon="ti-world"
          title={editor.mode === 'edit' ? 'Edit domain' : 'Add domain'}
          onSubmit={save}
          footer={
            <>
              {editor.mode === 'edit' && editor.draft.id && (
                <button
                  className="btn btn-danger mr-auto"
                  disabled={busy}
                  onClick={() => editor.draft.id && remove(editor.draft as Domain)}
                >
                  <Icon name="ti-trash" />Delete
                </button>
              )}
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={busy || !editor.draft.domain?.trim()}
                onClick={save}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Domain" required>
              <input
                className="input"
                autoFocus
                value={editor.draft.domain || ''}
                onChange={(e) => setD({ domain: e.target.value })}
                placeholder="example.com"
              />
            </Field>
            <Field label="Registrar">
              <input
                className="input"
                value={editor.draft.registrar || ''}
                onChange={(e) => setD({ registrar: e.target.value })}
                placeholder="Namecheap, GoDaddy…"
              />
            </Field>
            <Field label="Owner">
              <Select value={editor.draft.owner_id || ''} onChange={(v) => setD({ owner_id: v || undefined })} options={[{ value: '', label: 'None' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
            </Field>
            <Field label="Status">
              <Select value={editor.draft.status || 'active'} onChange={(v) => setD({ status: v as Domain['status'] })} options={[...STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))]} />
            </Field>
            <Field label="Purchased on">
              <input
                className="input"
                type="date"
                value={editor.draft.purchased_on || ''}
                onChange={(e) => setD({ purchased_on: e.target.value })}
              />
            </Field>
            <Field label="Expires on">
              <input
                className="input"
                type="date"
                value={editor.draft.expires_on || ''}
                onChange={(e) => setD({ expires_on: e.target.value })}
              />
            </Field>
            <Field label="Cost /yr">
              <input
                className="input"
                type="number"
                value={editor.draft.cost ?? 0}
                onChange={(e) => setD({ cost: Number(e.target.value) })}
              />
            </Field>
            <Field label="Currency">
              <Select value={editor.draft.currency || 'USD'} onChange={(v) => setD({ currency: v })} options={[...CURRENCIES.map((c) => ({ value: c, label: titleCase(c) }))]} />
            </Field>
            <Field label="Total spending">
              <input
                className="input"
                type="number"
                value={editor.draft.total_spending ?? 0}
                onChange={(e) => setD({ total_spending: Number(e.target.value) })}
              />
            </Field>
            <Field label="Auto-renew">
              <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line accent-accent"
                  checked={editor.draft.auto_renew ?? false}
                  onChange={(e) => setD({ auto_renew: e.target.checked })}
                />
                <span className="text-sm text-muted">Automatically renew this domain</span>
              </label>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea
                className="input min-h-[72px] resize-y"
                value={editor.draft.notes || ''}
                onChange={(e) => setD({ notes: e.target.value })}
                placeholder="Any additional notes…"
              />
            </Field>
          </div>
        </Modal>
      )}
    </Layout>
  );
}

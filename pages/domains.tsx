import { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PersonTag, PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listDomains, createDomain, updateDomain, deleteDomain, getOrgUsers, Domain } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta, EditSpec } from '@/components/DataList';
import { ListView } from '@/components/ListView';

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

const COLS: ColDef[] = [
  { id: 'domain', label: 'Domain', locked: true },
  { id: 'registrar', label: 'Registrar' },
  { id: 'expires', label: 'Expires' },
  { id: 'cost', label: 'Cost /yr' },
  { id: 'auto_renew', label: 'Auto-renew' },
  { id: 'owner', label: 'Owner' },
  { id: 'status', label: 'Status' },
];

const DOMAIN_FILTERS: FilterDef[] = [
  {
    id: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'All statuses' },
      { value: 'active', label: 'Active' },
      { value: 'expired', label: 'Expired' },
      { value: 'transferred', label: 'Transferred' },
      { value: 'for_sale', label: 'For sale' },
    ],
  },
];

const GROUP_ORDER: Domain['status'][] = ['active', 'expired', 'for_sale', 'transferred'];
const GROUPS: GroupMeta[] = GROUP_ORDER.map((st) => ({
  value: st,
  label: st.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  pill: STATUS_PILL[st] || 'pill-gray',
}));

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
  const prefs = useListPrefs('snrpmo.domains.cols', COLS, { entity: 'domains', orgId: org?.id, canManage: ['owner', 'admin'].includes(org?.member_role || '') });
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';
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

  const nameOf = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';

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

  const rs = useRowSelection(shown);

  const cell = (id: string, d: Domain) => {
    switch (id) {
      case 'domain': return <span className="font-medium text-content">{d.domain}</span>;
      case 'registrar': return d.registrar || '—';
      case 'expires': {
        if (!d.expires_on) return <span className="text-muted2">—</span>;
        const days = daysTo(d.expires_on);
        const expClass =
          days != null && days < 0
            ? 'text-rose-600'
            : days != null && days <= 30
            ? 'text-amber-600'
            : 'text-muted';
        return (
          <span className={expClass}>
            {d.expires_on}
            {days != null && days >= 0 && days <= 30 ? ` · ${days}d` : days != null && days < 0 ? ' · overdue' : ''}
          </span>
        );
      }
      case 'cost': return fmtMoney(d.cost, d.currency);
      case 'auto_renew': return d.auto_renew ? <Icon name="ti-check" className="text-emerald-600" /> : <span className="text-muted2">—</span>;
      case 'owner': return <PersonTag name={nameOf(d.owner_id)} />;
      case 'status': return <span className={`pill ${STATUS_PILL[d.status] || 'pill-gray'}`}>{d.status.replace('_', ' ')}</span>;
      default: return '—';
    }
  };

  const exportValue = (id: string, d: Domain) => {
    switch (id) {
      case 'domain': return d.domain;
      case 'registrar': return d.registrar || '';
      case 'expires': return d.expires_on || '';
      case 'cost': return fmtMoney(d.cost, d.currency);
      case 'auto_renew': return d.auto_renew ? 'Yes' : 'No';
      case 'owner': return nameOf(d.owner_id);
      case 'status': return d.status.replace('_', ' ');
      default: return '';
    }
  };

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

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} domain${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const d of rs.selected) await deleteDomain(d.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const editable: Record<string, EditSpec> = {
    domain: { type: 'text' },
    registrar: { type: 'text' },
    status: { type: 'select', options: STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') })) },
  };

  const rawValue = (id: string, d: Domain) => {
    switch (id) {
      case 'domain': return d.domain;
      case 'registrar': return d.registrar || '';
      case 'status': return d.status;
      default: return '';
    }
  };

  const onInlineEdit = async (d: Domain, id: string, value: string) => {
    try { await updateDomain(d.id, { [id]: value || null } as any); load(); }
    catch (e: any) { setErr(e.message); }
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

      <ListView
        rows={domains === null ? null : shown}
        rowKey={(d) => d.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={DOMAIN_FILTERS}
        searchPlaceholder="Search domains…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(d) => d.status}
        groups={GROUPS}
        editable={editable}
        rawValue={rawValue}
        onEdit={onInlineEdit}
        onRowClick={(d) => setEditor({ mode: 'edit', draft: { ...d } })}
        exportName="domains"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        busy={busy}
        emptyIcon="ti-world"
        emptyText="No domains found."
      />

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
                  onClick={async () => { if (editor.draft.id && confirm('Delete this domain?')) { await deleteDomain(editor.draft.id); setEditor(null); load(); } }}
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

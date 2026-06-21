import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Select from '@/components/Select';
import { PersonTag, PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listLeads, createLead, updateLead, deleteLead, convertLeadToClient, leadToDeal, getOrgUsers, Lead,
  getTaskStatuses, TaskStatus,
} from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta, EditSpec } from '@/components/DataList';
import { ListView } from '@/components/ListView';
import StatusManager from '@/components/StatusManager';

const STATUS_PILL: Record<string, string> = {
  new: 'pill-blue', contacted: 'pill-amber', qualified: 'pill-green',
  unqualified: 'pill-gray', converted: 'pill-violet',
};
const DEFAULT_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const COLS: ColDef[] = [
  { id: 'name', label: 'Name', locked: true },
  { id: 'contact', label: 'Contact' },
  { id: 'email', label: 'Email' },
  { id: 'source', label: 'Source' },
  { id: 'value', label: 'Value' },
  { id: 'owner', label: 'Owner' },
  { id: 'status', label: 'Status' },
];

const LEAD_FILTERS: FilterDef[] = [
  {
    id: 'status', label: 'Status',
    options: [
      { value: 'all', label: 'All statuses' },
      { value: 'new', label: 'New' },
      { value: 'contacted', label: 'Contacted' },
      { value: 'qualified', label: 'Qualified' },
      { value: 'unqualified', label: 'Unqualified' },
      { value: 'converted', label: 'Converted' },
    ],
  },
];


type Draft = Partial<Lead>;
const emptyDraft = (): Draft => ({ name: '', contact_name: '', email: '', phone: '', source: '', status: 'new', value: 0, currency: 'USD', notes: '' });


export default function LeadsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'crm');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const [statusDefs, setStatusDefs] = useState<TaskStatus[]>([]);
  const [statusMgr, setStatusMgr] = useState(false);

  const router = useRouter();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const prefs = useListPrefs('snrpmo.leads.cols', COLS, { entity: 'leads', orgId: org?.id, canManage: ['owner', 'admin'].includes(org?.member_role || '') });
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    listLeads(org.id).then(setLeads).catch((e) => { setErr(e.message); setLeads([]); });
  };
  useEffect(() => {
    if (org?.id && enabled) {
      load();
      getOrgUsers(org.id).then(setUsers).catch(() => {});
      getTaskStatuses(org.id, 'leads').then(setStatusDefs).catch(() => {});
    }
    // eslint-disable-next-line
  }, [org?.id, enabled]);

  const nameOf = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';
  const reloadStatusDefs = () => { if (org?.id) getTaskStatuses(org.id, 'leads').then(setStatusDefs).catch(() => {}); };
  const STATUSES = statusDefs.length ? statusDefs.map((s) => s.name) : DEFAULT_STATUSES;
  const catPill: Record<string, string> = { todo: 'pill-amber', active: 'pill-green', done: 'pill-gray', blocked: 'pill-rose' };
  const statusPill = (name: string) => { const d = statusDefs.find((s) => s.name === name); return d ? (catPill[d.category] || 'pill-gray') : (STATUS_PILL[name] || 'pill-gray'); };
  const GROUPS: GroupMeta[] = STATUSES.map((s) => ({ value: s, label: cap(s), pill: statusPill(s) }));

  const shown = useMemo(() =>
    (leads || []).filter((l) =>
      (statusF === 'all' || l.status === statusF) &&
      (!q.trim() || `${l.name} ${l.contact_name || ''} ${l.email || ''}`.toLowerCase().includes(q.toLowerCase()))
    ), [leads, q, statusF]);

  const rs = useRowSelection(shown);

  const cell = (id: string, l: Lead) => {
    switch (id) {
      case 'name': return <span className="font-medium text-content">{l.name}</span>;
      case 'contact': return l.contact_name || '—';
      case 'email': return l.email || '—';
      case 'source': return l.source || '—';
      case 'value': return <span className="tabular-nums">{fmtMoney(l.value || 0, l.currency)}</span>;
      case 'owner': return <PersonTag name={nameOf(l.owner_id)} />;
      case 'status': return <span className={`pill ${statusPill(l.status)}`}>{l.status}</span>;
      default: return '—';
    }
  };

  const exportValue = (id: string, l: Lead) =>
    id === 'name' ? l.name : id === 'contact' ? (l.contact_name || '') : id === 'email' ? (l.email || '')
    : id === 'source' ? (l.source || '') : id === 'value' ? String(l.value ?? '') : id === 'owner' ? nameOf(l.owner_id)
    : id === 'status' ? l.status : '';

  const editable: Record<string, EditSpec> = {
    status: { type: 'select', options: STATUSES.map((s) => ({ value: s, label: cap(s) })) },
    owner: { type: 'person', options: users.map((u) => ({ value: u.id, label: u.full_name })) },
  };
  const rawValueLead = (id: string, l: Lead) => id === 'owner' ? (l.owner_id || '') : id === 'status' ? l.status : '';
  const onInlineEditLead = async (l: Lead, id: string, value: string) => {
    const field = id === 'owner' ? 'owner_id' : 'status';
    try { await updateLead(l.id, { [field]: value || null } as any); load(); } catch (e: any) { setErr(e.message); }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} lead${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const r of rs.selected) await deleteLead(r.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const kpis = useMemo(() => {
    const all = leads || [];
    const open = all.filter((l) => ['new', 'contacted', 'qualified'].includes(l.status));
    const qualified = all.filter((l) => l.status === 'qualified');
    const pipeline = all
      .filter((l) => !['converted', 'unqualified'].includes(l.status))
      .reduce((t, l) => t + Number(l.value || 0), 0);
    return { total: all.length, open: open.length, qualified: qualified.length, pipeline };
  }, [leads]);

  const setD = (patch: Draft) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.name?.trim() || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    const payload = {
      name: d.name!.trim(),
      contact_name: d.contact_name || null,
      email: d.email || null,
      phone: d.phone || null,
      source: d.source || null,
      status: (d.status || 'new') as Lead['status'],
      value: Number(d.value) || 0,
      currency: d.currency || 'USD',
      owner_id: d.owner_id || null,
      notes: d.notes || null,
    };
    try {
      if (editor.mode === 'edit' && d.id) await updateLead(d.id, payload);
      else await createLead({ org_id: org.id, created_by: me.id, ...payload });
      setEditor(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const convert = async (l: Lead) => {
    if (!me) return;
    setBusy(true);
    try {
      await convertLeadToClient(l, me.id);
      setEditor(null); load();
      alert('Converted');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const convertToDeal = async (l: Lead) => {
    setBusy(true);
    try { const dealId = await leadToDeal(l.id); setEditor(null); router.push(`/crm/deal/${dealId}`); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };

  if (!enabled) return (
    <Layout flat title="Leads">
      <EmptyState icon="ti-filter-off" title="CRM not in your plan" text="Upgrade to track leads and pipeline." />
    </Layout>
  );

  return (
    <Layout flat title="Leads">
      <PageHeader help="crm"
        title="Leads"
        subtitle="Capture and qualify prospects, then convert them into the Pipeline (a deal) or directly to a Client"
        icon="ti-user-search"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && <button className="btn" onClick={() => setStatusMgr(true)}><Icon name="ti-flag-3" className="text-sm" />Statuses</button>}
            <button className="btn btn-primary" onClick={() => setEditor({ mode: 'add', draft: emptyDraft() })}>
              <Icon name="ti-plus" />Add lead
            </button>
          </div>
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total leads" value={String(kpis.total)} icon="ti-users" />
        <StatCard label="Open" value={String(kpis.open)} hint="new · contacted · qualified" icon="ti-circle-dot" />
        <StatCard label="Qualified" value={String(kpis.qualified)} icon="ti-circle-check" />
        <StatCard label="Pipeline value" value={fmtMoney(kpis.pipeline)} hint="Excl. converted & unqualified" icon="ti-currency-dollar" />
      </div>

      <ListView
        rows={leads === null ? null : shown}
        rowKey={(l) => l.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={LEAD_FILTERS}
        searchPlaceholder="Search leads…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(l) => l.status}
        groups={GROUPS}
        editable={editable}
        rawValue={rawValueLead}
        onEdit={onInlineEditLead}
        onRowClick={(l) => setEditor({ mode: 'edit', draft: l })}
        onAddInGroup={(g) => setEditor({ mode: 'add', draft: { ...emptyDraft(), status: g as Lead['status'] } })}
        exportName="leads"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        emptyIcon="ti-user-search"
        emptyText="No leads match your filters."
        orderKey="snrpmo.leads.roworder"
      />

      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          size="lg"
          icon="ti-user-search"
          title={editor.mode === 'edit' ? 'Edit lead' : 'Add lead'}
          onSubmit={() => save()}
          footer={
            <>
              {editor.mode === 'edit' && editor.draft.id && (
                <ConfirmDelete entityType="lead" id={editor.draft.id!} name={editor.draft.name}
                  className="btn btn-danger mr-auto" onDeleted={() => { setEditor(null); load(); }} />
              )}
              {editor.mode === 'edit' && editor.draft.status !== 'converted' && (
                <button className="btn" disabled={busy} onClick={() => convertToDeal(editor.draft as Lead)} title="Promote this lead into the sales pipeline">
                  <Icon name="ti-target-arrow" />Convert to deal
                </button>
              )}
              {editor.mode === 'edit' && editor.draft.status !== 'converted' && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => convert(editor.draft as Lead)}
                >
                  <Icon name="ti-user-check" />Convert to client
                </button>
              )}
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={busy || !editor.draft.name?.trim()}
                onClick={save}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" required>
              <input
                className="input"
                autoFocus
                value={editor.draft.name || ''}
                onChange={(e) => setD({ name: e.target.value })}
                placeholder="Company or prospect name"
              />
            </Field>
            <Field label="Contact name">
              <input
                className="input"
                value={editor.draft.contact_name || ''}
                onChange={(e) => setD({ contact_name: e.target.value })}
                placeholder="Jane Smith"
              />
            </Field>
            <Field label="Email">
              <input
                className="input"
                type="email"
                value={editor.draft.email || ''}
                onChange={(e) => setD({ email: e.target.value })}
                placeholder="jane@acme.com"
              />
            </Field>
            <Field label="Phone">
              <input
                className="input"
                value={editor.draft.phone || ''}
                onChange={(e) => setD({ phone: e.target.value })}
                placeholder="+1 555 000 0000"
              />
            </Field>
            <Field label="Source">
              <input
                className="input"
                value={editor.draft.source || ''}
                onChange={(e) => setD({ source: e.target.value })}
                placeholder="Referral, LinkedIn, Cold call…"
              />
            </Field>
            <Field label="Value">
              <input
                className="input"
                type="number"
                value={editor.draft.value ?? 0}
                onChange={(e) => setD({ value: Number(e.target.value) })}
              />
            </Field>
            <Field label="Currency">
              <input
                className="input"
                value={editor.draft.currency || 'USD'}
                onChange={(e) => setD({ currency: e.target.value })}
              />
            </Field>
            <Field label="Owner">
              <Select value={editor.draft.owner_id || ''} onChange={(v) => setD({ owner_id: v || null })} search placeholder="Unassigned" options={[{ value: '', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
            </Field>
            <Field label="Status">
              <Select value={editor.draft.status || 'new'} onChange={(v) => setD({ status: v as Lead['status'] })} options={DEFAULT_STATUSES.map((s) => ({ value: s, label: cap(s) }))} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea
                className="input min-h-[72px] resize-y"
                value={editor.draft.notes || ''}
                onChange={(e) => setD({ notes: e.target.value })}
                placeholder="Any context about this lead…"
              />
            </Field>
          </div>
        </Modal>
      )}
      {org?.id && <StatusManager open={statusMgr} onClose={() => setStatusMgr(false)} orgId={org.id} scope="leads" statuses={statusDefs} onChanged={reloadStatusDefs} />}
    </Layout>
  );
}

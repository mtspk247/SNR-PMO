import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Select from '@/components/Select';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listLeads, createLead, updateLead, deleteLead, convertLeadToClient, leadToDeal, getOrgUsers, Lead,
} from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection, HeadCheckbox, RowCheckbox, BulkBar } from '@/components/RowSelection';

const STATUS_PILL: Record<string, string> = {
  new: 'pill-blue', contacted: 'pill-amber', qualified: 'pill-green',
  unqualified: 'pill-gray', converted: 'pill-violet',
};
const STATUSES: Lead['status'][] = ['new', 'contacted', 'qualified', 'unqualified', 'converted'];
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

  const router = useRouter();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const prefs = useListPrefs('snrpmo.leads.cols', COLS);
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
    }
    // eslint-disable-next-line
  }, [org?.id, enabled]);

  const nameOf = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';

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
      case 'owner': return nameOf(l.owner_id);
      case 'status': return <span className={`pill ${STATUS_PILL[l.status] || 'pill-gray'}`}>{l.status}</span>;
      default: return '—';
    }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} lead${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const r of rs.selected) await deleteLead(r.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const exportSelected = () => {
    const esc = (v: any) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const heads = ['Name', 'Contact', 'Email', 'Source', 'Value', 'Currency', 'Owner', 'Status'];
    const rows = rs.selected.map((l) => [l.name, l.contact_name, l.email, l.source, l.value, l.currency, nameOf(l.owner_id), l.status]);
    const csv = heads.join(',') + '\n' + rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'leads-selected.csv'; a.click(); URL.revokeObjectURL(url);
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
          <button className="btn btn-primary" onClick={() => setEditor({ mode: 'add', draft: emptyDraft() })}>
            <Icon name="ti-plus" />Add lead
          </button>
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total leads" value={String(kpis.total)} icon="ti-users" />
        <StatCard label="Open" value={String(kpis.open)} hint="new · contacted · qualified" icon="ti-circle-dot" />
        <StatCard label="Qualified" value={String(kpis.qualified)} icon="ti-circle-check" />
        <StatCard label="Pipeline value" value={fmtMoney(kpis.pipeline)} hint="Excl. converted & unqualified" icon="ti-currency-dollar" />
      </div>

      <ListToolbar prefs={prefs} cols={COLS} filters={LEAD_FILTERS} placeholder="Search leads…" />

      <BulkBar count={rs.count} onClear={rs.clear}>
        <button onClick={exportSelected} className="btn h-8 text-xs"><Icon name="ti-download" className="text-xs" />Export</button>
        {isAdmin && <button onClick={bulkDelete} disabled={busy} className="btn h-8 text-xs text-rose-600"><Icon name="ti-trash" className="text-xs" />Delete</button>}
      </BulkBar>

      <div className="card overflow-hidden">
        {leads === null ? (
          <div className="p-8"><Spinner /></div>
        ) : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-user-search" text="No leads match your filters." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm list-card">
              <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-10"><HeadCheckbox checked={rs.allSelected} indeterminate={rs.someSelected} onChange={rs.toggleAll} /></th>
                  {prefs.ordered.map((id) => <th key={id} className="px-4 py-3">{COLS.find((c) => c.id === id)?.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr
                    key={l.id}
                    className={`group border-t border-line hover:bg-surface2/50 cursor-pointer ${rs.isSelected(l.id) ? 'bg-accent/5' : ''}`}
                    onClick={() => setEditor({ mode: 'edit', draft: l })}
                  >
                    <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}><RowCheckbox checked={rs.isSelected(l.id)} onChange={() => rs.toggle(l.id)} /></td>
                    {prefs.ordered.map((id) => <td key={id} className="px-4 py-3 text-muted">{cell(id, l)}</td>)}
                  </tr>
                ))}
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
              <Select value={editor.draft.status || 'new'} onChange={(v) => setD({ status: v as Lead['status'] })} options={STATUSES.map((s) => ({ value: s, label: cap(s) }))} />
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
    </Layout>
  );
}

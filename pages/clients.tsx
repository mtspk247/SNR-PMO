import { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listClients, createClient, updateClient, deleteClient, Client } from '@/lib/db';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection, BulkBar } from '@/components/RowSelection';
import { DataList, GroupMeta } from '@/components/DataList';
import { OrgUser } from '@/lib/supabase';
import { getOrgUsers } from '@/lib/db';

const STATUS_PILL: Record<string, string> = {
  prospect: 'pill-amber',
  active: 'pill-green',
  inactive: 'pill-gray',
};
const STATUSES = ['prospect', 'active', 'inactive'] as const;
type ClientStatus = typeof STATUSES[number];

// Group ordering: active first, then prospect, then inactive
const GROUP_ORDER: ClientStatus[] = ['active', 'prospect', 'inactive'];
const GROUPS: GroupMeta[] = GROUP_ORDER.map((st) => ({ value: st, label: titleCase(st), pill: STATUS_PILL[st] || 'pill-gray' }));

const COLS: ColDef[] = [
  { id: 'name', label: 'Name', locked: true },
  { id: 'contact', label: 'Contact' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'since', label: 'Since' },
  { id: 'owner', label: 'Owner' },
  { id: 'status', label: 'Status' },
];
const CLIENT_FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, { value: 'prospect', label: 'Prospect' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
];

type Draft = Partial<Client>;
const emptyDraft = (): Draft => ({
  name: '',
  contact_name: '',
  email: '',
  phone: '',
  status: 'prospect',
  since: null,
  owner_id: null,
  notes: '',
});

type GroupBy = 'status' | 'none';

export default function ClientsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'crm');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [clients, setClients] = useState<Client[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const prefs = useListPrefs('snrpmo.clients.cols', COLS);
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  // Set of collapsed group keys

  const load = () => {
    if (!org) return;
    listClients(org.id).then(setClients).catch((e) => { setErr(e.message); setClients([]); });
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
    (clients || []).filter((c) =>
      (statusF === 'all' || c.status === statusF) &&
      (!q.trim() || `${c.name} ${c.contact_name || ''} ${c.email || ''}`.toLowerCase().includes(q.toLowerCase()))
    ),
    [clients, q, statusF]
  );

  const rs = useRowSelection(shown);

  const cell = (id: string, c: Client) => {
    switch (id) {
      case 'name': return <span className="font-medium text-content">{c.name}</span>;
      case 'contact': return c.contact_name || '—';
      case 'email': return c.email || '—';
      case 'phone': return c.phone || '—';
      case 'since': return c.since || '—';
      case 'owner': return nameOf(c.owner_id);
      case 'status': return <span className={`pill ${STATUS_PILL[c.status] || 'pill-gray'}`}>{c.status}</span>;
      default: return '—';
    }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} client${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const c of rs.selected) await deleteClient(c.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const exportSelected = () => {
    const esc = (v: any) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const heads = ['Name', 'Contact', 'Email', 'Phone', 'Since', 'Owner', 'Status'];
    const rows = rs.selected.map((c) => [c.name, c.contact_name, c.email, c.phone, c.since, nameOf(c.owner_id), c.status]);
    const csv = heads.join(',') + '\n' + rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'clients-selected.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const kpis = useMemo(() => {
    const all = clients || [];
    return {
      total: all.length,
      active: all.filter((c) => c.status === 'active').length,
      prospects: all.filter((c) => c.status === 'prospect').length,
      inactive: all.filter((c) => c.status === 'inactive').length,
    };
  }, [clients]);

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
      status: (d.status || 'prospect') as ClientStatus,
      since: d.since || null,
      owner_id: d.owner_id || null,
      notes: d.notes || null,
    };
    try {
      if (editor.mode === 'edit' && d.id) {
        await updateClient(d.id, payload);
      } else {
        await createClient({ org_id: org.id, created_by: me.id, ...payload });
      }
      setEditor(null);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return (
    <Layout flat title="Clients">
      <EmptyState icon="ti-users" title="CRM not in your plan" text="Upgrade to manage clients." />
    </Layout>
  );

  return (
    <Layout flat title="Clients">
      <PageHeader help="crm"
        title="Clients"
        subtitle="Manage your client accounts and relationships"
        icon="ti-users"
        action={
          <button className="btn btn-primary" onClick={() => setEditor({ mode: 'add', draft: emptyDraft() })}>
            <Icon name="ti-plus" />Add client
          </button>
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total clients" value={String(kpis.total)} icon="ti-users" />
        <StatCard label="Active" value={String(kpis.active)} icon="ti-circle-check" />
        <StatCard label="Prospects" value={String(kpis.prospects)} icon="ti-user-search" />
        <StatCard label="Inactive" value={String(kpis.inactive)} icon="ti-user-off" />
      </div>

      {/* Toolbar + Group-by control */}
      <div className="flex items-end gap-2 flex-wrap mb-4">
        <div className="flex-1 min-w-0">
          <ListToolbar prefs={prefs} cols={COLS} filters={CLIENT_FILTERS} placeholder="Search clients…" />
        </div>
        <div className="flex items-center gap-1.5 mb-[1px] pb-0.5">
          <span className="text-2xs text-muted2 uppercase tracking-wide mr-0.5">Group by</span>
          <button
            onClick={() => setGroupBy('status')}
            className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${groupBy === 'status' ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}
          >
            Status
          </button>
          <button
            onClick={() => setGroupBy('none')}
            className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${groupBy === 'none' ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}
          >
            None
          </button>
        </div>
      </div>

      <BulkBar count={rs.count} onClear={rs.clear}>
        <button onClick={exportSelected} className="btn h-8 text-xs"><Icon name="ti-download" className="text-xs" />Export</button>
        {isAdmin && <button onClick={bulkDelete} disabled={busy} className="btn h-8 text-xs text-rose-600"><Icon name="ti-trash" className="text-xs" />Delete</button>}
      </BulkBar>

      {/* Main list card — borderless ClickUp style */}
      {clients === null ? (
        <div className="card p-8 border border-line/40"><Spinner /></div>
      ) : shown.length === 0 ? (
        <div className="card p-8 border border-line/40"><EmptyState icon="ti-users" text="No clients found." /></div>
      ) : (
        <DataList
          rows={shown}
          rowKey={(c) => c.id}
          cols={COLS}
          prefs={prefs}
          cell={cell}
          onRowClick={(c) => setEditor({ mode: 'edit', draft: c })}
          selection={rs}
          groupBy={groupBy}
          groupOf={(c) => c.status}
          groups={GROUPS}
        />
      )}

      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          size="lg"
          icon="ti-users"
          title={editor.mode === 'edit' ? 'Edit client' : 'Add client'}
          onSubmit={save}
          footer={
            <>
              {editor.mode === 'edit' && editor.draft.id && (
                <ConfirmDelete entityType="client" id={editor.draft.id!} name={editor.draft.name}
                  className="btn btn-danger mr-auto" onDeleted={() => { setEditor(null); load(); }} />
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
                placeholder="Acme Corp"
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
            <Field label="Status">
              <Select value={editor.draft.status || 'prospect'} onChange={(v) => setD({ status: v as ClientStatus })} options={[...STATUSES.map((s) => ({ value: s, label: titleCase(s) }))]} />
            </Field>
            <Field label="Client since">
              <input
                className="input"
                type="date"
                value={editor.draft.since || ''}
                onChange={(e) => setD({ since: e.target.value || null })}
              />
            </Field>
            <Field label="Owner">
              <Select value={editor.draft.owner_id || ''} onChange={(v) => setD({ owner_id: v || null })} options={[{ value: '', label: 'None' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea
                className="input min-h-[80px] resize-y"
                value={editor.draft.notes || ''}
                onChange={(e) => setD({ notes: e.target.value })}
                placeholder="Any notes about this client…"
              />
            </Field>
          </div>
        </Modal>
      )}
    </Layout>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PersonTag, PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listClients, createClient, updateClient, deleteClient, ensureTaskStatuses, TaskStatus, Client } from '@/lib/db';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection, BulkAssign } from '@/components/RowSelection';
import { GroupMeta, EditSpec } from '@/components/DataList';
import { ListView } from '@/components/ListView';
import { OrgUser } from '@/lib/supabase';
import { getOrgUsers, inviteMember } from '@/lib/db';
import StatusManager from '@/components/StatusManager';

const STATUS_PILL: Record<string, string> = {
  prospect: 'pill-amber',
  active: 'pill-green',
  inactive: 'pill-gray',
};
const DEFAULT_STATUSES = ['prospect', 'active', 'inactive'];
type ClientStatus = string;


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


export default function ClientsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'crm');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [clients, setClients] = useState<Client[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [statusDefs, setStatusDefs] = useState<TaskStatus[]>([]);
  const [statusMgr, setStatusMgr] = useState(false);
  const prefs = useListPrefs('snrpmo.clients.cols', COLS, { entity: 'clients', orgId: org?.id, canManage: isAdmin });
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft; initial: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Set of collapsed group keys

  const load = () => {
    if (!org) return;
    listClients(org.id).then(setClients).catch((e) => { setErr(e.message); setClients([]); });
  };

  useEffect(() => {
    if (org?.id && enabled) {
      load();
      getOrgUsers(org.id).then(setUsers).catch(() => {});
      ensureTaskStatuses(org.id, 'clients').then(setStatusDefs).catch(() => {});
    }
    // eslint-disable-next-line
  }, [org?.id, enabled]);

  const nameOf = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';
  const reloadStatusDefs = () => { if (org?.id) ensureTaskStatuses(org.id, 'clients').then(setStatusDefs).catch(() => {}); };
  const STATUSES = statusDefs.length ? statusDefs.map((s) => s.name) : DEFAULT_STATUSES;
  const catPill: Record<string, string> = { todo: 'pill-amber', active: 'pill-green', done: 'pill-gray', blocked: 'pill-rose' };
  const statusPill = (name: string) => { const d = statusDefs.find((s) => s.name === name); return d ? (catPill[d.category] || 'pill-gray') : (STATUS_PILL[name] || 'pill-gray'); };
  const statusHex = (name: string) => statusDefs.find((s) => s.name === name)?.color || '#9ca3af';
  const GROUPS: GroupMeta[] = STATUSES.map((s) => ({ value: s, label: titleCase(s), pill: statusPill(s) }));

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
      case 'owner': return <PersonTag name={nameOf(c.owner_id)} />;
      case 'status': return <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium" style={{ backgroundColor: statusHex(c.status) + '1f', color: statusHex(c.status), boxShadow: `inset 0 0 0 1px ${statusHex(c.status)}33` }}>{titleCase(c.status)}</span>;
      default: return '—';
    }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} client${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const c of rs.selected) await deleteClient(c.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const bulkAssign = async (uid: string | null) => {
    if (!rs.count) return; setBusy(true); setErr('');
    try { for (const c of rs.selected) await updateClient(c.id, { owner_id: uid } as any); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const exportValue = (id: string, c: Client) =>
    id === 'name' ? c.name : id === 'contact' ? (c.contact_name || '') : id === 'email' ? (c.email || '')
    : id === 'phone' ? (c.phone || '') : id === 'since' ? (c.since || '') : id === 'owner' ? nameOf(c.owner_id)
    : id === 'status' ? c.status : '';

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

  const editable: Record<string, EditSpec> = {
    name: { type: 'text' }, contact: { type: 'text' }, email: { type: 'text' }, phone: { type: 'text' },
    status: { type: 'select', options: STATUSES.map((st) => ({ value: st, label: titleCase(st), dot: statusHex(st) })), manage: isAdmin ? () => setStatusMgr(true) : undefined },
    owner: { type: 'person', options: users.map((u) => ({ value: u.id, label: u.full_name })) },
  };
  const rawValue = (id: string, c: Client) =>
    id === 'name' ? c.name : id === 'contact' ? (c.contact_name || '') : id === 'email' ? (c.email || '')
    : id === 'phone' ? (c.phone || '') : id === 'owner' ? (c.owner_id || '') : id === 'status' ? c.status : '';
  const onInlineEdit = async (c: Client, id: string, value: string) => {
    const field = id === 'contact' ? 'contact_name' : id === 'owner' ? 'owner_id' : id;
    try { await updateClient(c.id, { [field]: value || null } as any); load(); } catch (e: any) { setErr(e.message); }
  };

  return (
    <Layout flat title="Clients">
      <PageHeader help="crm"
        title="Clients"
        subtitle="Manage your client accounts and relationships"
        icon="ti-users"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && <button className="btn" onClick={() => setStatusMgr(true)}><Icon name="ti-flag-3" className="text-sm" />Statuses</button>}
            <button className="btn btn-primary" onClick={() => setEditor({ mode: 'add', draft: emptyDraft(), initial: JSON.stringify(emptyDraft()) })}>
              <Icon name="ti-plus" />Add client
            </button>
          </div>
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total clients" value={String(kpis.total)} icon="ti-users" />
        <StatCard label="Active" value={String(kpis.active)} icon="ti-circle-check" />
        <StatCard label="Prospects" value={String(kpis.prospects)} icon="ti-user-search" />
        <StatCard label="Inactive" value={String(kpis.inactive)} icon="ti-user-off" />
      </div>

      <ListView
        rows={clients === null ? null : shown}
        rowKey={(c) => c.id}
        orderKey="snrpmo.clients.roworder"
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={CLIENT_FILTERS}
        searchPlaceholder="Search clients…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(c) => c.status}
        groups={GROUPS}
        editable={editable}
        rawValue={rawValue}
        onEdit={onInlineEdit}
        onRename={(c, v) => { updateClient(c.id, { name: v } as any).then(load).catch((e: any) => setErr(e.message)); }}
        onInvitePerson={isAdmin ? (email) => { inviteMember(org!.id, email, 'member').then(() => alert('Invite sent to ' + email)).catch((e: any) => alert(e.message)); } : undefined}
        onRowClick={(c) => setEditor({ mode: 'edit', draft: c, initial: JSON.stringify(c) })}
        onAddInGroup={(g) => setEditor({ mode: 'add', draft: { ...emptyDraft(), status: g as ClientStatus }, initial: JSON.stringify({ ...emptyDraft(), status: g as ClientStatus }) })}
        exportName="clients"
        exportValue={exportValue}
        bulkActions={() => <BulkAssign users={users} onAssign={bulkAssign} />}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        busy={busy}
        emptyIcon="ti-users"
        emptyText="No clients found."
      />

      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          dirty={JSON.stringify(editor.draft) !== editor.initial}
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
      {org?.id && <StatusManager open={statusMgr} onClose={() => setStatusMgr(false)} orgId={org.id} scope="clients" statuses={statusDefs} onChanged={reloadStatusDefs} />}
    </Layout>
  );
}

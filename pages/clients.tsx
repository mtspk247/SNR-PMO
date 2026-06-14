import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listClients, createClient, updateClient, deleteClient, Client } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { getOrgUsers } from '@/lib/db';

const STATUS_PILL: Record<string, string> = {
  prospect: 'pill-amber',
  active: 'pill-green',
  inactive: 'pill-gray',
};
const STATUSES = ['prospect', 'active', 'inactive'] as const;
type ClientStatus = typeof STATUSES[number];

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
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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
      <PageHeader
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

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="input h-9 w-56"
          placeholder="Search clients…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input h-9 w-40" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {clients === null ? (
          <div className="p-8"><Spinner /></div>
        ) : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-users" text="No clients found." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Since</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-line hover:bg-surface2/50 cursor-pointer"
                    onClick={() => setEditor({ mode: 'edit', draft: c })}
                  >
                    <td className="px-4 py-3 font-medium text-content">{c.name}</td>
                    <td className="px-4 py-3 text-muted">{c.contact_name || '—'}</td>
                    <td className="px-4 py-3 text-muted">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-muted">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-2xs text-muted">{c.since || '—'}</td>
                    <td className="px-4 py-3 text-2xs text-muted">{nameOf(c.owner_id)}</td>
                    <td className="px-4 py-3">
                      <span className={`pill ${STATUS_PILL[c.status] || 'pill-gray'}`}>{c.status}</span>
                    </td>
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
              <select
                className="input"
                value={editor.draft.status || 'prospect'}
                onChange={(e) => setD({ status: e.target.value as ClientStatus })}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
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
              <select
                className="input"
                value={editor.draft.owner_id || ''}
                onChange={(e) => setD({ owner_id: e.target.value || null })}
              >
                <option value="">—</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
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

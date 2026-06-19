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

const STATUS_PILL: Record<string, string> = {
  new: 'pill-blue', contacted: 'pill-amber', qualified: 'pill-green',
  unqualified: 'pill-gray', converted: 'pill-violet',
};
const STATUSES: Lead['status'][] = ['new', 'contacted', 'qualified', 'unqualified', 'converted'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

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
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
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

  const name = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';

  const shown = useMemo(() =>
    (leads || []).filter((l) =>
      (statusF === 'all' || l.status === statusF) &&
      (!q.trim() || `${l.name} ${l.contact_name || ''} ${l.email || ''}`.toLowerCase().includes(q.toLowerCase()))
    ), [leads, q, statusF]);

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

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="input h-9 w-56"
          placeholder="Search leads…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="w-44"><Select value={statusF} onChange={setStatusF} options={[{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: cap(s) }))]} /></div>
      </div>

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
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr
                    key={l.id}
                    className="border-t border-line hover:bg-surface2/50 cursor-pointer"
                    onClick={() => setEditor({ mode: 'edit', draft: l })}
                  >
                    <td className="px-4 py-3 font-medium text-content">{l.name}</td>
                    <td className="px-4 py-3 text-muted">{l.contact_name || '—'}</td>
                    <td className="px-4 py-3 text-muted">{l.email || '—'}</td>
                    <td className="px-4 py-3 text-muted">{l.source || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(l.value || 0, l.currency)}</td>
                    <td className="px-4 py-3 text-2xs text-muted">{name(l.owner_id)}</td>
                    <td className="px-4 py-3"><span className={`pill ${STATUS_PILL[l.status] || 'pill-gray'}`}>{l.status}</span></td>
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

import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import Attachments from '@/components/Attachments';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listContracts, createContract, updateContract, deleteContract, Contract } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { getOrgUsers } from '@/lib/db';

const STATUS_PILL: Record<string, string> = {
  draft: 'pill-gray',
  active: 'pill-green',
  signed: 'pill-blue',
  expired: 'pill-amber',
  terminated: 'pill-red',
};
const STATUSES = ['draft', 'active', 'signed', 'expired', 'terminated'] as const;

const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const daysTo = (d: string | null) =>
  d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;

type Draft = Partial<Contract>;
const emptyDraft = (): Draft => ({
  title: '', client_name: '', value: 0, currency: 'USD',
  status: 'draft', start_date: null, end_date: null, owner_id: null, notes: '',
});

export default function ContractsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'crm');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [editor, setEditor] = useState<{ draft: Draft } | null>(null);
  const [detail, setDetail] = useState<Contract | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    listContracts(org.id).then(setContracts).catch((e) => { setErr(e.message); setContracts([]); });
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
    (contracts || []).filter((c) =>
      (statusF === 'all' || c.status === statusF) &&
      (!q.trim() || `${c.title} ${c.client_name || ''}`.toLowerCase().includes(q.toLowerCase()))
    ), [contracts, q, statusF]);

  const kpis = useMemo(() => {
    const all = contracts || [];
    const signedActive = all.filter((c) => c.status === 'active' || c.status === 'signed');
    const signedVal = signedActive.reduce((t, c) => t + Number(c.value || 0), 0);
    const expiring = signedActive.filter((c) => {
      const d = daysTo(c.end_date);
      return d != null && d >= 0 && d <= 30;
    }).length;
    return { total: all.length, active: all.filter((c) => c.status === 'active').length, signedVal, expiring };
  }, [contracts]);

  const setD = (patch: Draft) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.title?.trim() || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    const payload: any = {
      title: d.title!.trim(),
      client_name: d.client_name || null,
      value: Number(d.value) || 0,
      currency: d.currency || 'USD',
      status: d.status || 'draft',
      start_date: d.start_date || null,
      end_date: d.end_date || null,
      owner_id: d.owner_id || null,
      notes: d.notes || null,
    };
    try {
      if (d.id) await updateContract(d.id, payload);
      else await createContract({ org_id: org.id, created_by: me.id, ...payload });
      setEditor(null);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };


  if (!enabled) return (
    <Layout flat title="Contracts">
      <EmptyState icon="ti-file-certificate" title="Contracts not in your plan" text="Upgrade to manage contracts." />
    </Layout>
  );

  return (
    <Layout flat title="Contracts">
      <PageHeader title="Contracts" subtitle="Track signed agreements, values and expiry dates" icon="ti-file-certificate"
        action={isAdmin && (
          <button className="btn btn-primary" onClick={() => setEditor({ draft: emptyDraft() })}>
            <Icon name="ti-plus" />Add contract
          </button>
        )} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total" value={String(kpis.total)} icon="ti-files" />
        <StatCard label="Active" value={String(kpis.active)} icon="ti-circle-check" />
        <StatCard label="Signed value" value={fmtMoney(kpis.signedVal)} hint="Active + Signed" icon="ti-coin" />
        <StatCard label="Expiring ≤30d" value={String(kpis.expiring)} icon="ti-clock-exclamation"
          hintTone={kpis.expiring ? 'down' : 'muted'} />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input className="input h-9 w-56" placeholder="Search contracts…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input h-9 w-44" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {contracts === null ? <div className="p-8"><Spinner /></div> : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-file-certificate" text="No contracts yet." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3">End date</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const d = daysTo(c.end_date);
                  const isPast = d != null && d < 0 && (c.status === 'active' || c.status === 'signed');
                  const isSoon = d != null && d >= 0 && d <= 30 && (c.status === 'active' || c.status === 'signed');
                  return (
                    <tr key={c.id} className="border-t border-line hover:bg-surface2/50 cursor-pointer" onClick={() => setDetail(c)}>
                      <td className="px-4 py-3 font-medium text-content">{c.title}</td>
                      <td className="px-4 py-3 text-muted">{c.client_name || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(c.value, c.currency)}</td>
                      <td className="px-4 py-3 text-2xs">
                        {c.end_date
                          ? <span className={isPast ? 'text-rose-600' : isSoon ? 'text-amber-600' : 'text-muted'}>
                              {c.end_date}{isSoon ? ` · ${d}d` : isPast ? ' · overdue' : ''}
                            </span>
                          : <span className="text-muted2">—</span>}
                      </td>
                      <td className="px-4 py-3 text-2xs text-muted">{name(c.owner_id)}</td>
                      <td className="px-4 py-3">
                        <span className={`pill ${STATUS_PILL[c.status] || 'pill-gray'}`}>{c.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add editor modal */}
      {editor && (
        <Modal open onClose={() => setEditor(null)} size="lg" icon="ti-file-certificate"
          title={editor.draft.id ? 'Edit contract' : 'Add contract'}
          onSubmit={save}
          footer={
            <>
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !editor.draft.title?.trim()} onClick={save}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          }>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Title" required>
              <input className="input" autoFocus value={editor.draft.title || ''} onChange={(e) => setD({ title: e.target.value })} placeholder="e.g. Service Agreement 2026" />
            </Field>
            <Field label="Client name">
              <input className="input" value={editor.draft.client_name || ''} onChange={(e) => setD({ client_name: e.target.value })} placeholder="Acme Corp" />
            </Field>
            <Field label="Value">
              <input className="input" type="number" value={editor.draft.value ?? 0} onChange={(e) => setD({ value: Number(e.target.value) })} />
            </Field>
            <Field label="Currency">
              <input className="input" value={editor.draft.currency || 'USD'} onChange={(e) => setD({ currency: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="input" value={editor.draft.status || 'draft'} onChange={(e) => setD({ status: e.target.value as any })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Owner">
              <select className="input" value={editor.draft.owner_id || ''} onChange={(e) => setD({ owner_id: e.target.value || null })}>
                <option value="">—</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
            <Field label="Start date">
              <input className="input" type="date" value={editor.draft.start_date || ''} onChange={(e) => setD({ start_date: e.target.value || null })} />
            </Field>
            <Field label="End date">
              <input className="input" type="date" value={editor.draft.end_date || ''} onChange={(e) => setD({ end_date: e.target.value || null })} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea className="input" rows={3} value={editor.draft.notes || ''} onChange={(e) => setD({ notes: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {/* Detail modal */}
      {detail && (
        <ContractDetailModal
          contract={detail}
          users={users}
          me={me?.id}
          canEdit={isAdmin || detail.owner_id === me?.id}
          orgId={org?.id}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditor({ draft: { ...detail } }); setDetail(null); }}
          onDelete={() => { setDetail(null); load(); }}
          nameOf={name}
        />
      )}
    </Layout>
  );
}

function ContractDetailModal({ contract, users, me, canEdit, orgId, onClose, onEdit, onDelete, nameOf }: {
  contract: Contract;
  users: OrgUser[];
  me?: string;
  canEdit: boolean;
  orgId?: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  nameOf: (id?: string | null) => string;
}) {
  const fmtMoney = (n: number, c = 'USD') =>
    `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const row = (k: string, v: any) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-line/60">
      <span className="text-2xs text-muted2">{k}</span>
      <span className="text-sm text-content text-right">{v || '—'}</span>
    </div>
  );

  return (
    <Modal open onClose={onClose} size="lg" icon="ti-file-certificate" title={contract.title}
      subtitle={contract.client_name || undefined}
      footer={
        <>
          {canEdit && <ConfirmDelete entityType="contract" id={contract.id} name={contract.title} className="btn btn-danger mr-auto" onDeleted={onDelete} />}
          <button className="btn" onClick={onClose}>Close</button>
          {canEdit && <button className="btn btn-primary" onClick={onEdit}><Icon name="ti-pencil" />Edit</button>}
        </>
      }>
      <div className="grid sm:grid-cols-2 gap-x-6">
        {row('Status', <span className={`pill ${STATUS_PILL[contract.status] || 'pill-gray'}`}>{contract.status}</span>)}
        {row('Client', contract.client_name)}
        {row('Value', fmtMoney(contract.value, contract.currency))}
        {row('Start date', contract.start_date)}
        {row('End date', contract.end_date)}
        {row('Owner', contract.owner_id ? nameOf(contract.owner_id) : '—')}
      </div>
      {contract.notes && <p className="text-sm text-muted mt-3 whitespace-pre-wrap">{contract.notes}</p>}

      <div className="mt-4 pt-3 border-t border-line">
        <Attachments entityType="contract" entityId={contract.id} orgId={orgId} currentUserId={me} />
      </div>
    </Modal>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PersonTag, PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import Attachments from '@/components/Attachments';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listContracts, createContract, updateContract, deleteContract, Contract } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { getOrgUsers, getTaskStatuses, TaskStatus, inviteMember } from '@/lib/db';
import StatusManager from '@/components/StatusManager';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection, BulkBar, BulkAssign } from '@/components/RowSelection';
import { DataList, GroupMeta } from '@/components/DataList';

const STATUS_PILL: Record<string, string> = {
  draft: 'pill-gray',
  active: 'pill-green',
  signed: 'pill-blue',
  expired: 'pill-amber',
  terminated: 'pill-red',
};
const DEFAULT_STATUSES = ['draft', 'active', 'signed', 'expired', 'terminated'];

const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const daysTo = (d: string | null) =>
  d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;

const COLS: ColDef[] = [
  { id: 'title', label: 'Title', locked: true },
  { id: 'client', label: 'Client' },
  { id: 'value', label: 'Value' },
  { id: 'end_date', label: 'End date' },
  { id: 'owner', label: 'Owner' },
  { id: 'status', label: 'Status' },
];
const CONTRACT_FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, { value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }, { value: 'signed', label: 'Signed' }, { value: 'expired', label: 'Expired' }, { value: 'terminated', label: 'Terminated' }] },
];

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
  const [statusDefs, setStatusDefs] = useState<TaskStatus[]>([]);
  const [statusMgr, setStatusMgr] = useState(false);

  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const prefs = useListPrefs('snrpmo.contracts.cols', COLS, { entity: 'contracts', orgId: org?.id, canManage: ['owner', 'admin'].includes(org?.member_role || '') });
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';
  const [editor, setEditor] = useState<{ draft: Draft } | null>(null);
  const initialRef = useRef('');
  // capture the draft snapshot only when the editor opens (not each keystroke)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (editor) initialRef.current = JSON.stringify(editor.draft); }, [!!editor]);
  const [detail, setDetail] = useState<Contract | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [groupBy, setGroupBy] = useState<'status' | 'none'>('status');

  const load = () => {
    if (!org) return;
    listContracts(org.id).then(setContracts).catch((e) => { setErr(e.message); setContracts([]); });
  };
  useEffect(() => {
    if (org?.id && enabled) {
      load();
      getOrgUsers(org.id).then(setUsers).catch(() => {});
      getTaskStatuses(org.id, 'contracts').then(setStatusDefs).catch(() => {});
    }
    // eslint-disable-next-line
  }, [org?.id, enabled]);

  const name = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';
  const reloadStatusDefs = () => { if (org?.id) getTaskStatuses(org.id, 'contracts').then(setStatusDefs).catch(() => {}); };
  const STATUSES = statusDefs.length ? statusDefs.map((s) => s.name) : DEFAULT_STATUSES;
  const catPill: Record<string, string> = { todo: 'pill-amber', active: 'pill-green', done: 'pill-gray', blocked: 'pill-rose' };
  const statusPill = (nm: string) => { const d = statusDefs.find((s) => s.name === nm); return d ? (catPill[d.category] || 'pill-gray') : (STATUS_PILL[nm] || 'pill-gray'); };
  const GROUPS: GroupMeta[] = STATUSES.map((s) => ({ value: s, label: titleCase(s), pill: statusPill(s) }));

  const shown = useMemo(() =>
    (contracts || []).filter((c) =>
      (statusF === 'all' || c.status === statusF) &&
      (!q.trim() || `${c.title} ${c.client_name || ''}`.toLowerCase().includes(q.toLowerCase()))
    ), [contracts, q, statusF]);

  const rs = useRowSelection(shown);
  const cell = (id: string, c: Contract) => {
    const d = daysTo(c.end_date);
    const isPast = d != null && d < 0 && (c.status === 'active' || c.status === 'signed');
    const isSoon = d != null && d >= 0 && d <= 30 && (c.status === 'active' || c.status === 'signed');
    switch (id) {
      case 'title': return <span className="font-medium text-content">{c.title}</span>;
      case 'client': return c.client_name || '—';
      case 'value': return <span className="tabular-nums">{fmtMoney(c.value, c.currency)}</span>;
      case 'end_date': return c.end_date
        ? <span className={isPast ? 'text-rose-600' : isSoon ? 'text-amber-600' : 'text-muted'}>
            {c.end_date}{isSoon ? ` · ${d}d` : isPast ? ' · overdue' : ''}
          </span>
        : <span className="text-muted2">—</span>;
      case 'owner': return <PersonTag name={name(c.owner_id)} />;
      case 'status': return <span className={`pill ${statusPill(c.status)}`}>{c.status}</span>;
      default: return '—';
    }
  };

  const exportSelected = () => {
    const esc = (v: any) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const heads = ['Title', 'Client', 'Value', 'Currency', 'Status', 'Start date', 'End date', 'Owner'];
    const rows = rs.selected.map((c) => [c.title, c.client_name, c.value, c.currency, c.status, c.start_date, c.end_date, name(c.owner_id)]);
    const csv = heads.join(',') + '\n' + rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'contracts-selected.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const bulkAssign = async (uid: string | null) => {
    if (!rs.count) return; setBusy(true); setErr('');
    try { for (const x of rs.selected) await updateContract(x.id, { owner_id: uid } as any); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} contract${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const r of rs.selected) await deleteContract(r.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

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
      <PageHeader help="crm" title="Contracts" subtitle="Track signed agreements, values and expiry dates" icon="ti-file-certificate"
        action={isAdmin && (
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => setStatusMgr(true)}><Icon name="ti-flag-3" className="text-sm" />Statuses</button>
            <button className="btn btn-primary" onClick={() => setEditor({ draft: emptyDraft() })}>
              <Icon name="ti-plus" />Add contract
            </button>
          </div>
        )} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total" value={String(kpis.total)} icon="ti-files" />
        <StatCard label="Active" value={String(kpis.active)} icon="ti-circle-check" />
        <StatCard label="Signed value" value={fmtMoney(kpis.signedVal)} hint="Active + Signed" icon="ti-coin" />
        <StatCard label="Expiring ≤30d" value={String(kpis.expiring)} icon="ti-clock-exclamation"
          hintTone={kpis.expiring ? 'down' : 'muted'} />
      </div>

      <ListToolbar prefs={prefs} cols={COLS} filters={CONTRACT_FILTERS} placeholder="Search contracts…">
        <div className="flex items-center gap-1.5">
          <span className="text-2xs text-muted2 uppercase tracking-wide mr-0.5">Group by</span>
          <button onClick={() => setGroupBy('status')} className={`h-9 px-3 rounded-md text-xs font-medium transition-colors ${groupBy === 'status' ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}>Status</button>
          <button onClick={() => setGroupBy('none')} className={`h-9 px-3 rounded-md text-xs font-medium transition-colors ${groupBy === 'none' ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}>None</button>
        </div>
      </ListToolbar>

      <BulkBar count={rs.count} onClear={rs.clear}>
        <BulkAssign users={users} onAssign={bulkAssign} />
        <button onClick={exportSelected} className="btn h-8 text-xs"><Icon name="ti-download" className="text-xs" />Export</button>
        {isAdmin && <button onClick={bulkDelete} disabled={busy} className="btn h-8 text-xs text-rose-600"><Icon name="ti-trash" className="text-xs" />Delete</button>}
      </BulkBar>

      {contracts === null ? (
        <div className="card p-8 border border-line/40"><Spinner /></div>
      ) : shown.length === 0 ? (
        <div className="card p-8 border border-line/40"><EmptyState icon="ti-file-certificate" text="No contracts yet." /></div>
      ) : (
        <DataList
          rows={shown}
          rowKey={(c) => c.id}
          cols={COLS}
          prefs={prefs}
          cell={cell}
          onRowClick={(c) => setDetail(c)}
          selection={rs}
          groupBy={groupBy}
          groupOf={(c) => c.status}
          groups={GROUPS}
          onAddInGroup={(g) => setEditor({ draft: { ...emptyDraft(), status: g as typeof STATUSES[number] } })}
          editable={{ owner: { type: 'person' as const, options: users.map((u) => ({ value: u.id, label: u.full_name })) } }}
          rawValue={(id, c) => (id === 'owner' ? (c.owner_id || '') : id === 'title' ? (c.title || '') : '')}
          onEdit={(c, id, v) => { if (id === 'owner') updateContract(c.id, { owner_id: v || null } as any).then(load).catch((e: any) => alert(e.message)); }}
          onRename={(c, v) => { updateContract(c.id, { title: v } as any).then(load).catch((e: any) => alert(e.message)); }}
          onInvitePerson={isAdmin ? (email) => { inviteMember(org!.id, email, 'member').then(() => alert('Invite sent to ' + email)).catch((e: any) => alert(e.message)); } : undefined}
        />
      )}

      {/* Add/Edit modal */}
      {editor && (
        <Modal open onClose={() => setEditor(null)} dirty={editor ? JSON.stringify(editor.draft) !== initialRef.current : false} size="lg" icon="ti-file-certificate"
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
              <Select value={editor.draft.status || 'draft'} onChange={(v) => setD({ status: v as any })} options={[...DEFAULT_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))]} />
            </Field>
            <Field label="Owner">
              <Select value={editor.draft.owner_id || ''} onChange={(v) => setD({ owner_id: v || null })} options={[{ value: '', label: 'None' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
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
      {org?.id && <StatusManager open={statusMgr} onClose={() => setStatusMgr(false)} orgId={org.id} scope="contracts" statuses={statusDefs} onChanged={reloadStatusDefs} />}
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
          <a className="btn" href={`/templates?type=contract&client_name=${encodeURIComponent(contract.client_name || '')}&company_name=${encodeURIComponent(contract.client_name || '')}&amount=${contract.value || 0}&currency=${encodeURIComponent(contract.currency || 'USD')}`} title="Draft a branded contract from a template"><Icon name="ti-file-export" />Generate document</a>
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

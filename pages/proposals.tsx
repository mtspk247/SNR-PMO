import { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PersonTag, PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import Attachments from '@/components/Attachments';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listProposals, createProposal, updateProposal, deleteProposal, Proposal } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { getOrgUsers, getTaskStatuses, TaskStatus, inviteMember } from '@/lib/db';
import StatusManager from '@/components/StatusManager';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection, BulkBar } from '@/components/RowSelection';
import { DataList, GroupMeta } from '@/components/DataList';

const STATUS_PILL: Record<string, string> = {
  draft: 'pill-gray',
  sent: 'pill-blue',
  accepted: 'pill-green',
  rejected: 'pill-red',
  expired: 'pill-amber',
};
const DEFAULT_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];


const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const COLS: ColDef[] = [
  { id: 'title', label: 'Title', locked: true },
  { id: 'client', label: 'Client' },
  { id: 'amount', label: 'Amount' },
  { id: 'valid_until', label: 'Valid until' },
  { id: 'owner', label: 'Owner' },
  { id: 'status', label: 'Status' },
];
const PROPOSAL_FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'accepted', label: 'Accepted' }, { value: 'rejected', label: 'Rejected' }, { value: 'expired', label: 'Expired' }] },
];

type Draft = Partial<Proposal>;
const emptyDraft = (): Draft => ({
  title: '', client_name: '', amount: 0, currency: 'USD',
  status: 'draft', valid_until: null, owner_id: null, notes: '',
});

type GroupBy = 'status' | 'none';

export default function ProposalsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'crm');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const [statusDefs, setStatusDefs] = useState<TaskStatus[]>([]);
  const [statusMgr, setStatusMgr] = useState(false);

  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const prefs = useListPrefs('snrpmo.proposals.cols', COLS, { entity: 'proposals', orgId: org?.id, canManage: ['owner', 'admin'].includes(org?.member_role || '') });
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';
  const [editor, setEditor] = useState<{ draft: Draft } | null>(null);
  const [detail, setDetail] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');

  const load = () => {
    if (!org) return;
    listProposals(org.id).then(setProposals).catch((e) => { setErr(e.message); setProposals([]); });
  };
  useEffect(() => {
    if (org?.id && enabled) {
      load();
      getOrgUsers(org.id).then(setUsers).catch(() => {});
      getTaskStatuses(org.id, 'proposals').then(setStatusDefs).catch(() => {});
    }
    // eslint-disable-next-line
  }, [org?.id, enabled]);

  const nameOf = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';
  const reloadStatusDefs = () => { if (org?.id) getTaskStatuses(org.id, 'proposals').then(setStatusDefs).catch(() => {}); };
  const STATUSES = statusDefs.length ? statusDefs.map((s) => s.name) : DEFAULT_STATUSES;
  const catPill: Record<string, string> = { todo: 'pill-amber', active: 'pill-green', done: 'pill-gray', blocked: 'pill-rose' };
  const statusPill = (name: string) => { const d = statusDefs.find((s) => s.name === name); return d ? (catPill[d.category] || 'pill-gray') : (STATUS_PILL[name] || 'pill-gray'); };
  const GROUPS: GroupMeta[] = STATUSES.map((s) => ({ value: s, label: titleCase(s), pill: statusPill(s) }));

  const shown = useMemo(() =>
    (proposals || []).filter((p) =>
      (statusF === 'all' || p.status === statusF) &&
      (!q.trim() || `${p.title} ${p.client_name || ''}`.toLowerCase().includes(q.toLowerCase()))
    ), [proposals, q, statusF]);

  const rs = useRowSelection(shown);

  const isPast = (d: string | null) => d ? new Date(d).getTime() < Date.now() : false;

  const cell = (id: string, p: Proposal) => {
    switch (id) {
      case 'title': return <span className="font-medium text-content">{p.title}</span>;
      case 'client': return p.client_name || '—';
      case 'amount': return <span className="tabular-nums">{fmtMoney(p.amount, p.currency)}</span>;
      case 'valid_until': return p.valid_until ? (
        <span className={isPast(p.valid_until) && p.status !== 'accepted' ? 'text-rose-600' : 'text-muted'}>
          {p.valid_until}
        </span>
      ) : <span className="text-muted2">—</span>;
      case 'owner': return <PersonTag name={nameOf(p.owner_id)} />;
      case 'status': return <span className={`pill ${statusPill(p.status)}`}>{p.status}</span>;
      default: return '—';
    }
  };

  const exportSelected = () => {
    const esc = (v: any) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const heads = ['Title', 'Client', 'Amount', 'Currency', 'Valid until', 'Owner', 'Status'];
    const rows = rs.selected.map((p) => [p.title, p.client_name, fmtMoney(p.amount, p.currency), p.currency, p.valid_until, nameOf(p.owner_id), p.status]);
    const csv = heads.join(',') + '\n' + rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'proposals-selected.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} proposal${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const r of rs.selected) await deleteProposal(r.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const kpis = useMemo(() => {
    const all = proposals || [];
    const open = all.filter((p) => p.status === 'draft' || p.status === 'sent');
    const accepted = all.filter((p) => p.status === 'accepted');
    const total = all.reduce((t, p) => t + Number(p.amount || 0), 0);
    return { total: all.length, open: open.length, accepted: accepted.length, value: total };
  }, [proposals]);

  const setD = (patch: Draft) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.title?.trim() || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    const payload: any = {
      title: d.title!.trim(),
      client_name: d.client_name || null,
      amount: Number(d.amount) || 0,
      currency: d.currency || 'USD',
      status: d.status || 'draft',
      valid_until: d.valid_until || null,
      owner_id: d.owner_id || null,
      notes: d.notes || null,
    };
    try {
      if (d.id) await updateProposal(d.id, payload);
      else await createProposal({ org_id: org.id, created_by: me.id, ...payload });
      setEditor(null);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return (
    <Layout flat title="Proposals">
      <EmptyState icon="ti-file-description" title="Proposals not in your plan" text="Upgrade to manage client proposals." />
    </Layout>
  );

  return (
    <Layout flat title="Proposals">
      <PageHeader help="crm"
        title="Proposals"
        subtitle="Manage client proposals, values and statuses"
        icon="ti-file-description"
        action={
          isAdmin && (
            <div className="flex items-center gap-2">
              <button className="btn" onClick={() => setStatusMgr(true)}><Icon name="ti-flag-3" className="text-sm" />Statuses</button>
              <button className="btn btn-primary" onClick={() => setEditor({ draft: emptyDraft() })}>
                <Icon name="ti-plus" />Add proposal
              </button>
            </div>
          )
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total" value={String(kpis.total)} icon="ti-file-description" />
        <StatCard label="Open" value={String(kpis.open)} hint="Draft + Sent" icon="ti-send" />
        <StatCard label="Accepted" value={String(kpis.accepted)} icon="ti-circle-check" />
        <StatCard label="Total value" value={fmtMoney(kpis.value)} icon="ti-currency-dollar" />
      </div>

      {/* Toolbar + Group-by control */}
      <div className="flex items-end gap-2 flex-wrap mb-4">
        <div className="flex-1 min-w-0">
          <ListToolbar prefs={prefs} cols={COLS} filters={PROPOSAL_FILTERS} placeholder="Search proposals…" />
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

      {proposals === null ? (
        <div className="card p-8 border border-line/40"><Spinner /></div>
      ) : shown.length === 0 ? (
        <div className="card p-8 border border-line/40"><EmptyState icon="ti-file-description" text="No proposals yet." /></div>
      ) : (
        <DataList
          rows={shown}
          rowKey={(p) => p.id}
          cols={COLS}
          prefs={prefs}
          cell={cell}
          onRowClick={(p) => setDetail(p)}
          selection={rs}
          groupBy={groupBy}
          groupOf={(p) => p.status}
          groups={GROUPS}
          onAddInGroup={(g) => setEditor({ draft: { ...emptyDraft(), status: g as Proposal['status'] } })}
          editable={{ owner: { type: 'person' as const, options: users.map((u) => ({ value: u.id, label: u.full_name })) } }}
          rawValue={(id, p) => (id === 'owner' ? (p.owner_id || '') : '')}
          onEdit={(p, id, v) => { if (id === 'owner') updateProposal(p.id, { owner_id: v || null } as any).then(load).catch((e: any) => alert(e.message)); }}
          onInvitePerson={isAdmin ? (email) => { inviteMember(org!.id, email, 'member').then(() => alert('Invite sent to ' + email)).catch((e: any) => alert(e.message)); } : undefined}
        />
      )}

      {editor && !editor.draft.id && (
        <Modal
          open
          onClose={() => setEditor(null)}
          size="lg"
          icon="ti-file-description"
          title="Add proposal"
          onSubmit={() => save()}
          footer={
            <>
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !editor.draft.title?.trim()} onClick={save}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <EditorFields draft={editor.draft} setD={setD} users={users} />
        </Modal>
      )}

      {detail && (
        <DetailModal
          proposal={detail}
          users={users}
          me={me?.id}
          canEdit={isAdmin || detail.created_by === me?.id || detail.owner_id === me?.id}
          orgId={org?.id}
          onClose={() => setDetail(null)}
          onDelete={() => { setDetail(null); load(); }}
          nameOf={nameOf}
          busy={busy}
          onSave={async (patch) => {
            setBusy(true); setErr('');
            try { await updateProposal(detail.id, patch); setDetail(null); load(); }
            catch (e: any) { setErr(e.message); } finally { setBusy(false); }
          }}
        />
      )}
      {org?.id && <StatusManager open={statusMgr} onClose={() => setStatusMgr(false)} orgId={org.id} scope="proposals" statuses={statusDefs} onChanged={reloadStatusDefs} />}
    </Layout>
  );
}

function EditorFields({ draft, setD, users }: { draft: Draft; setD: (p: Draft) => void; users: OrgUser[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <Field label="Title" required>
        <input className="input" autoFocus value={draft.title || ''} onChange={(e) => setD({ title: e.target.value })} placeholder="e.g. Website Redesign" />
      </Field>
      <Field label="Client name">
        <input className="input" value={draft.client_name || ''} onChange={(e) => setD({ client_name: e.target.value })} placeholder="Acme Corp" />
      </Field>
      <Field label="Amount">
        <input className="input" type="number" value={draft.amount ?? 0} onChange={(e) => setD({ amount: Number(e.target.value) })} />
      </Field>
      <Field label="Currency">
        <input className="input" value={draft.currency || 'USD'} onChange={(e) => setD({ currency: e.target.value })} />
      </Field>
      <Field label="Status">
        <Select value={draft.status || 'draft'} onChange={(v) => setD({ status: v as Proposal['status'] })} options={DEFAULT_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
      </Field>
      <Field label="Valid until">
        <input className="input" type="date" value={draft.valid_until || ''} onChange={(e) => setD({ valid_until: e.target.value || null })} />
      </Field>
      <Field label="Owner">
        <Select value={draft.owner_id || ''} onChange={(v) => setD({ owner_id: v || null })} options={[{ value: '', label: 'None' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
      </Field>
      <Field label="Notes">
        <input className="input" value={draft.notes || ''} onChange={(e) => setD({ notes: e.target.value })} placeholder="Any additional notes…" />
      </Field>
    </div>
  );
}

function DetailModal({
  proposal, users, me, canEdit, orgId, onClose, onDelete, nameOf, busy, onSave,
}: {
  proposal: Proposal; users: OrgUser[]; me?: string; canEdit: boolean; orgId?: string;
  onClose: () => void; onDelete: () => void; nameOf: (id?: string | null) => string;
  busy: boolean; onSave: (patch: any) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>({ ...proposal });
  const setD = (patch: Draft) => setDraft((d) => ({ ...d, ...patch }));
  const isPast = (d: string | null) => d ? new Date(d).getTime() < Date.now() : false;

  const row = (k: string, v: any) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-line/60">
      <span className="text-2xs text-muted2">{k}</span>
      <span className="text-sm text-content text-right">{v || '—'}</span>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon="ti-file-description"
      title={proposal.title}
      subtitle={proposal.client_name || undefined}
      footer={
        <>
          {canEdit && <ConfirmDelete entityType="proposal" id={proposal.id} name={proposal.title}
            className="btn btn-danger mr-auto" onDeleted={onDelete} />}
          <a className="btn" href={`/templates?type=proposal&client_name=${encodeURIComponent(proposal.client_name || '')}&company_name=${encodeURIComponent(proposal.client_name || '')}&amount=${proposal.amount || 0}&currency=${encodeURIComponent(proposal.currency || 'USD')}`} title="Draft a branded proposal from a template"><Icon name="ti-file-export" />Generate document</a>
          <button className="btn" onClick={onClose}>Close</button>
          {canEdit && (
            <button
              className="btn btn-primary"
              disabled={busy || !draft.title?.trim()}
              onClick={() => onSave({
                title: draft.title,
                client_name: draft.client_name || null,
                amount: Number(draft.amount) || 0,
                currency: draft.currency || 'USD',
                status: draft.status || 'draft',
                valid_until: draft.valid_until || null,
                owner_id: draft.owner_id || null,
                notes: draft.notes || null,
              })}
            >
              {busy ? 'Saving…' : <><Icon name="ti-device-floppy" />Save</>}
            </button>
          )}
        </>
      }
    >
      {canEdit ? (
        <EditorFields draft={draft} setD={setD} users={users} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-x-6">
          {row('Status', <span className={`pill ${STATUS_PILL[proposal.status] || 'pill-gray'}`}>{proposal.status}</span>)}
          {row('Client', proposal.client_name)}
          {row('Amount', fmtMoney(proposal.amount, proposal.currency))}
          {row('Valid until', proposal.valid_until
            ? <span className={isPast(proposal.valid_until) && proposal.status !== 'accepted' ? 'text-rose-600' : ''}>{proposal.valid_until}</span>
            : null)}
          {row('Owner', nameOf(proposal.owner_id))}
          {row('Notes', proposal.notes)}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-line">
        <Attachments entityType="proposal" entityId={proposal.id} orgId={orgId} currentUserId={me} />
      </div>
    </Modal>
  );
}

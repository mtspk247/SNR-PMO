import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import Attachments from '@/components/Attachments';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listProposals, createProposal, updateProposal, deleteProposal, Proposal } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { getOrgUsers } from '@/lib/db';

const STATUS_PILL: Record<string, string> = {
  draft: 'pill-gray',
  sent: 'pill-blue',
  accepted: 'pill-green',
  rejected: 'pill-red',
  expired: 'pill-amber',
};
const STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const;

const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

type Draft = Partial<Proposal>;
const emptyDraft = (): Draft => ({
  title: '', client_name: '', amount: 0, currency: 'USD',
  status: 'draft', valid_until: null, owner_id: null, notes: '',
});

export default function ProposalsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'crm');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [editor, setEditor] = useState<{ draft: Draft } | null>(null);
  const [detail, setDetail] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    listProposals(org.id).then(setProposals).catch((e) => { setErr(e.message); setProposals([]); });
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
    (proposals || []).filter((p) =>
      (statusF === 'all' || p.status === statusF) &&
      (!q.trim() || `${p.title} ${p.client_name || ''}`.toLowerCase().includes(q.toLowerCase()))
    ), [proposals, q, statusF]);

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


  const isPast = (d: string | null) => d ? new Date(d).getTime() < Date.now() : false;

  if (!enabled) return (
    <Layout flat title="Proposals">
      <EmptyState icon="ti-file-description" title="Proposals not in your plan" text="Upgrade to manage client proposals." />
    </Layout>
  );

  return (
    <Layout flat title="Proposals">
      <PageHeader
        title="Proposals"
        subtitle="Manage client proposals, values and statuses"
        icon="ti-file-description"
        action={
          isAdmin && (
            <button className="btn btn-primary" onClick={() => setEditor({ draft: emptyDraft() })}>
              <Icon name="ti-plus" />Add proposal
            </button>
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

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="input h-9 w-56"
          placeholder="Search proposals…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input h-9 w-40" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {proposals === null ? (
          <div className="p-8"><Spinner /></div>
        ) : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-file-description" text="No proposals yet." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Valid until</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-line hover:bg-surface2/50 cursor-pointer"
                    onClick={() => setDetail(p)}
                  >
                    <td className="px-4 py-3 font-medium text-content">{p.title}</td>
                    <td className="px-4 py-3 text-muted">{p.client_name || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(p.amount, p.currency)}</td>
                    <td className="px-4 py-3 text-2xs">
                      {p.valid_until ? (
                        <span className={isPast(p.valid_until) && p.status !== 'accepted' ? 'text-rose-600' : 'text-muted'}>
                          {p.valid_until}
                        </span>
                      ) : <span className="text-muted2">—</span>}
                    </td>
                    <td className="px-4 py-3 text-2xs text-muted">{name(p.owner_id)}</td>
                    <td className="px-4 py-3">
                      <span className={`pill ${STATUS_PILL[p.status] || 'pill-gray'}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add editor modal (no attachments — no id yet) */}
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

      {/* Detail / edit modal (with attachments) */}
      {detail && (
        <DetailModal
          proposal={detail}
          users={users}
          me={me?.id}
          canEdit={isAdmin || detail.created_by === me?.id || detail.owner_id === me?.id}
          orgId={org?.id}
          onClose={() => setDetail(null)}
          onDelete={() => { setDetail(null); load(); }}
          nameOf={name}
          busy={busy}
          onSave={async (patch) => {
            setBusy(true); setErr('');
            try { await updateProposal(detail.id, patch); setDetail(null); load(); }
            catch (e: any) { setErr(e.message); } finally { setBusy(false); }
          }}
        />
      )}
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
        <select className="input" value={draft.status || 'draft'} onChange={(e) => setD({ status: e.target.value as Proposal['status'] })}>
          {(['draft', 'sent', 'accepted', 'rejected', 'expired'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Valid until">
        <input className="input" type="date" value={draft.valid_until || ''} onChange={(e) => setD({ valid_until: e.target.value || null })} />
      </Field>
      <Field label="Owner">
        <select className="input" value={draft.owner_id || ''} onChange={(e) => setD({ owner_id: e.target.value || null })}>
          <option value="">—</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
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

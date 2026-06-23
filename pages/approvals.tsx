import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Avatar } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { listApprovals, approvalDecide, approvalCancel, getOrgUsers, ApprovalRequest, getProjects, createPortalApproval, listPortalApprovals, cancelPortalApproval, PortalApproval } from '@/lib/db';
import { OrgUser, Project } from '@/lib/supabase';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';

const PILL: Record<string, string> = { pending: 'pill-amber', approved: 'pill-green', rejected: 'pill-red', cancelled: 'pill-gray' };

export default function ApprovalsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const isOrgAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const [rows, setRows] = useState<ApprovalRequest[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [signoffs, setSignoffs] = useState<PortalApproval[] | null>(null);
  const [createDraft, setCreateDraft] = useState<{ project_id: string; title: string; body: string } | null>(null);

  const load = () => { if (!org) return; listApprovals(org.id).then(setRows).catch((e) => { setErr(e.message); setRows([]); }); };
  const loadSignoffs = () => { if (org) listPortalApprovals(org.id).then(setSignoffs).catch(() => setSignoffs([])); };
  useEffect(() => { if (org?.id) { load(); getOrgUsers(org.id).then(setUsers).catch(() => {}); getProjects(org.id).then(setProjects).catch(() => {}); loadSignoffs(); } /* eslint-disable-next-line */ }, [org?.id]);

  const name = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || 'Someone';
  const shown = useMemo(() => (rows || []).filter((r) => filter === 'all' || r.status === 'pending'), [rows, filter]);
  const canDecide = (r: ApprovalRequest) => isOrgAdmin || r.approver_id === me?.id;

  const decide = async (r: ApprovalRequest, status: 'approved' | 'rejected') => {
    if (busy) return; setBusy(true); setErr('');
    try { await approvalDecide(r.id, status, noteFor === r.id ? note : undefined); setNoteFor(null); setNote(''); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const cancel = async (r: ApprovalRequest) => {
    if (busy || !confirm('Cancel this request?')) return; setBusy(true); setErr('');
    try { await approvalCancel(r.id); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const saveSignoff = async () => {
    if (!org || !me || !createDraft || !createDraft.project_id || !createDraft.title.trim() || busy) return;
    setBusy(true); setErr('');
    try { await createPortalApproval({ org_id: org.id, project_id: createDraft.project_id, title: createDraft.title.trim(), body: createDraft.body.trim() || null, requested_by: me.id }); setCreateDraft(null); loadSignoffs(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const cancelSignoff = async (a: PortalApproval) => {
    if (busy || !confirm('Cancel this sign-off request?')) return; setBusy(true);
    try { await cancelPortalApproval(a.id); loadSignoffs(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Layout flat title="Approvals">
      <PageHeader title="Approvals" subtitle="Requests awaiting a decision, and the status of your own requests" icon="ti-checks" help="client-portal"
        action={isOrgAdmin ? <button className="btn btn-primary" onClick={() => setCreateDraft({ project_id: '', title: '', body: '' })}><Icon name="ti-plus" />Request client sign-off</button> : undefined} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="flex items-center gap-2 mb-3">
        {(['pending', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`pill capitalize cursor-pointer ${filter === f ? 'bg-accent/15 text-accentstrong font-medium' : 'pill-gray hover:bg-surface2'}`}>{f}</button>
        ))}
      </div>
      {rows === null ? <Spinner /> : shown.length === 0 ? (
        <div className="card p-8"><EmptyState icon="ti-checks" text="Nothing to approve." /></div>
      ) : (
        <div className="space-y-2.5 max-w-3xl">
          {shown.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="chip capitalize">{r.entity_type}</span>
                <span className={`pill ${PILL[r.status]}`}>{r.status}</span>
                {r.amount != null && <span className="ml-auto text-sm font-semibold tabular-nums">${Number(r.amount).toLocaleString()}</span>}
              </div>
              <p className="text-sm font-medium text-content">{r.title}</p>
              {r.body && <p className="text-2xs text-muted mt-0.5 whitespace-pre-wrap">{r.body}</p>}
              <p className="text-2xs text-muted2 mt-1 inline-flex items-center gap-1.5"><Avatar name={name(r.requested_by)} size={16} />{name(r.requested_by)} · {new Date(r.created_at).toLocaleDateString()}{r.decided_at ? ` · ${r.status} by ${name(r.decided_by)}` : ''}</p>
              {r.decision_note && <p className="text-2xs text-muted mt-1 italic">&ldquo;{r.decision_note}&rdquo;</p>}
              {r.status === 'pending' && (canDecide(r) || r.requested_by === me?.id) && (
                <div className="mt-3 pt-3 border-t border-line">
                  {canDecide(r) && noteFor === r.id && <input className="input mb-2" placeholder="Decision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />}
                  <div className="flex flex-wrap gap-2">
                    {canDecide(r) && <button className="btn btn-primary h-8 py-0" disabled={busy} onClick={() => decide(r, 'approved')}><Icon name="ti-check" />Approve</button>}
                    {canDecide(r) && <button className="btn btn-danger h-8 py-0" disabled={busy} onClick={() => decide(r, 'rejected')}><Icon name="ti-x" />Reject</button>}
                    {canDecide(r) && <button className="btn-ghost h-8 py-0" onClick={() => { setNoteFor(noteFor === r.id ? null : r.id); setNote(''); }}><Icon name="ti-note" />Note</button>}
                    {r.requested_by === me?.id && <button className="btn h-8 py-0 ml-auto" disabled={busy} onClick={() => cancel(r)}>Cancel request</button>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {signoffs && signoffs.length > 0 && (
        <div className="mt-8 max-w-3xl">
          <h2 className="text-sm font-semibold text-content mb-2">Client sign-offs</h2>
          <div className="space-y-2.5">
            {signoffs.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex items-center gap-2 mb-0.5">
                  {a.project_name && <span className="chip">{a.project_name}</span>}
                  <span className={`pill ${a.status === 'approved' ? 'pill-green' : a.status === 'rejected' ? 'pill-red' : a.status === 'cancelled' ? 'pill-gray' : 'pill-amber'}`}>{a.status}</span>
                  {a.status === 'pending' && <button className="btn h-7 py-0 ml-auto text-2xs" onClick={() => cancelSignoff(a)}>Cancel</button>}
                </div>
                <p className="text-sm font-medium text-content">{a.title}</p>
                {a.body && <p className="text-2xs text-muted mt-0.5 whitespace-pre-wrap">{a.body}</p>}
                {a.decided_at && <p className="text-2xs text-muted2 mt-1">{a.status} · {new Date(a.decided_at).toLocaleDateString()}</p>}
                {a.decision_note && <p className="text-2xs text-muted mt-1 italic">&ldquo;{a.decision_note}&rdquo;</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {createDraft && (
        <Modal open onClose={() => setCreateDraft(null)} title="Request client sign-off" icon="ti-checks" size="sm" onSubmit={() => saveSignoff()}
          footer={<><button className="btn" onClick={() => setCreateDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !createDraft.project_id || !createDraft.title.trim()} onClick={saveSignoff}>{busy ? 'Sending…' : 'Send to client'}</button></>}>
          <Field label="Project" required><Select value={createDraft.project_id} onChange={(v) => setCreateDraft((d) => (d ? { ...d, project_id: v } : d))} options={projects.map((pr) => ({ value: pr.id, label: pr.name }))} placeholder="Select a project…" search /></Field>
          <Field label="What needs approval?" required><input className="input" autoFocus value={createDraft.title} onChange={(e) => setCreateDraft((d) => (d ? { ...d, title: e.target.value } : d))} placeholder="e.g. Homepage design v2" /></Field>
          <Field label="Details"><textarea className="input" rows={3} value={createDraft.body} onChange={(e) => setCreateDraft((d) => (d ? { ...d, body: e.target.value } : d))} placeholder="Optional context for the client" /></Field>
        </Modal>
      )}
    </Layout>
  );
}

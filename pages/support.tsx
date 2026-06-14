import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard, Avatar } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listTickets, createTicket, updateTicket, listTicketReplies, addTicketReply, getOrgUsers,
  SupportTicket, SupportReply,
} from '@/lib/db';
import { OrgUser } from '@/lib/supabase';

const PRIORITY_PILL: Record<string, string> = { low: 'pill-gray', medium: 'pill-blue', high: 'pill-amber', urgent: 'pill-red' };
const STATUS_PILL: Record<string, string> = { open: 'pill-amber', in_progress: 'pill-blue', waiting: 'pill-violet', resolved: 'pill-green', closed: 'pill-gray' };
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;
const CATEGORIES = ['General', 'Bug', 'Feature Request', 'Billing', 'Access', 'Other'];

const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtDateTime = (d: string | null | undefined) => d ? new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

type NewDraft = { subject: string; category: string; priority: string; body: string };
const emptyDraft = (): NewDraft => ({ subject: '', category: '', priority: 'medium', body: '' });

export default function SupportPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'support');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<NewDraft>(emptyDraft());
  const [detail, setDetail] = useState<SupportTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    listTickets(org.id).then(setTickets).catch((e: Error) => { setErr(e.message); setTickets([]); });
  };

  useEffect(() => {
    if (org?.id && enabled) {
      load();
      getOrgUsers(org.id).then(setUsers).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id, enabled]);

  const name = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';

  const shown = useMemo(
    () => (tickets || []).filter(
      (t) => (statusF === 'all' || t.status === statusF) &&
        (!q.trim() || t.subject.toLowerCase().includes(q.toLowerCase()))
    ),
    [tickets, q, statusF]
  );

  const kpis = useMemo(() => {
    const all = tickets || [];
    return {
      open: all.filter((t) => t.status === 'open').length,
      in_progress: all.filter((t) => t.status === 'in_progress').length,
      resolved: all.filter((t) => t.status === 'resolved' || t.status === 'closed').length,
      total: all.length,
    };
  }, [tickets]);

  const submitNew = async () => {
    if (!org || !draft.subject.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      await createTicket({
        org_id: org.id,
        subject: draft.subject.trim(),
        body: draft.body.trim() || undefined,
        category: draft.category || undefined,
        priority: draft.priority || undefined,
      });
      setNewOpen(false);
      setDraft(emptyDraft());
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return (
    <Layout flat title="Support">
      <EmptyState icon="ti-lifebuoy" title="Support not in your plan" text="Upgrade to use the helpdesk and support tickets." />
    </Layout>
  );

  return (
    <Layout flat title="Support">
      <PageHeader
        title="Support"
        subtitle="Raise and resolve helpdesk tickets"
        icon="ti-lifebuoy"
        action={
          <button className="btn btn-primary" onClick={() => { setDraft(emptyDraft()); setNewOpen(true); }}>
            <Icon name="ti-plus" />New ticket
          </button>
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Open" value={String(kpis.open)} icon="ti-alert-circle" />
        <StatCard label="In progress" value={String(kpis.in_progress)} icon="ti-loader-2" />
        <StatCard label="Resolved" value={String(kpis.resolved)} icon="ti-circle-check" />
        <StatCard label="Total" value={String(kpis.total)} icon="ti-ticket" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input className="input h-9 w-56" placeholder="Search tickets…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input h-9 w-44" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {tickets === null ? <div className="p-8"><Spinner /></div> : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-ticket" text="No tickets found." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Requester</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} className="border-t border-line hover:bg-surface2/50 cursor-pointer" onClick={() => setDetail(t)}>
                    <td className="px-4 py-3 font-medium text-content">{t.subject}</td>
                    <td className="px-4 py-3 text-muted">{name(t.requester_id)}</td>
                    <td className="px-4 py-3"><span className={`pill ${PRIORITY_PILL[t.priority] || 'pill-gray'}`}>{t.priority}</span></td>
                    <td className="px-4 py-3"><span className={`pill ${STATUS_PILL[t.status] || 'pill-gray'}`}>{t.status.replace('_', ' ')}</span></td>
                    <td className="px-4 py-3 text-2xs text-muted">{fmtDate(t.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New ticket modal */}
      {newOpen && (
        <Modal
          open
          onClose={() => setNewOpen(false)}
          size="md"
          icon="ti-ticket"
          title="New support ticket"
          onSubmit={submitNew}
          footer={
            <>
              <button className="btn" onClick={() => setNewOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !draft.subject.trim()} onClick={submitNew}>
                {busy ? 'Submitting…' : 'Submit ticket'}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label="Subject" required>
              <input className="input" autoFocus value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="Briefly describe the issue" />
            </Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Category">
                <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  <option value="">— none —</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select className="input" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Description">
              <textarea className="input min-h-[100px] resize-y" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Provide more detail (optional)" />
            </Field>
          </div>
        </Modal>
      )}

      {/* Detail modal */}
      {detail && (
        <TicketDetailModal
          ticket={detail}
          users={users}
          isAdmin={isAdmin}
          meId={me?.id}
          orgId={org?.id}
          nameOf={name}
          onClose={() => setDetail(null)}
          onUpdated={(updated) => { setDetail(updated); load(); }}
        />
      )}
    </Layout>
  );
}

function TicketDetailModal({
  ticket, users, isAdmin, meId, orgId, nameOf, onClose, onUpdated,
}: {
  ticket: SupportTicket;
  users: OrgUser[];
  isAdmin: boolean;
  meId?: string;
  orgId?: string;
  nameOf: (id?: string | null) => string;
  onClose: () => void;
  onUpdated: (t: SupportTicket) => void;
}) {
  const [replies, setReplies] = useState<SupportReply[] | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);
  const [assigneeId, setAssigneeId] = useState(ticket.assignee_id || '');
  const [busy, setBusy] = useState(false);
  const [replyBusy, setReplyBusy] = useState(false);

  const isRequester = meId === ticket.requester_id;
  const canAdminControl = isAdmin;
  const canReply = isAdmin || isRequester;

  const loadReplies = () => {
    listTicketReplies(ticket.id).then(setReplies).catch(() => setReplies([]));
  };

  useEffect(() => { loadReplies(); /* eslint-disable-next-line */ }, [ticket.id]);

  const saveAdminControls = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const patch: Partial<SupportTicket> & Record<string, any> = {
        status,
        priority,
        assignee_id: assigneeId || null,
      };
      if ((status === 'resolved' || status === 'closed') && ticket.status !== status) {
        patch.resolved_at = new Date().toISOString();
      }
      await updateTicket(ticket.id, patch);
      onUpdated({ ...ticket, ...patch });
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const closeTicket = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const patch: any = { status: 'closed', resolved_at: new Date().toISOString() };
      await updateTicket(ticket.id, patch);
      onUpdated({ ...ticket, ...patch });
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!replyBody.trim() || replyBusy || !meId || !orgId) return;
    setReplyBusy(true);
    try {
      await addTicketReply(ticket.id, replyBody.trim());
      setReplyBody('');
      loadReplies();
    } catch (e: any) { alert(e.message); } finally { setReplyBusy(false); }
  };

  const row = (k: string, v: React.ReactNode) => (
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
      icon="ti-ticket"
      title={ticket.subject}
      subtitle={ticket.category || undefined}
      footer={
        <>
          {isRequester && ticket.status !== 'closed' && (
            <button className="btn mr-auto" disabled={busy} onClick={closeTicket}>Close ticket</button>
          )}
          <button className="btn" onClick={onClose}>Dismiss</button>
          {canAdminControl && (
            <button className="btn btn-primary" disabled={busy} onClick={saveAdminControls}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </>
      }
    >
      {/* Ticket meta */}
      <div className="grid sm:grid-cols-2 gap-x-6 mb-4">
        {row('Status', <span className={`pill ${STATUS_PILL[ticket.status] || 'pill-gray'}`}>{ticket.status.replace('_', ' ')}</span>)}
        {row('Priority', <span className={`pill ${PRIORITY_PILL[ticket.priority] || 'pill-gray'}`}>{ticket.priority}</span>)}
        {row('Requester', nameOf(ticket.requester_id))}
        {row('Assignee', nameOf(ticket.assignee_id))}
        {row('Created', fmtDateTime(ticket.created_at))}
        {row('Updated', fmtDateTime(ticket.updated_at))}
        {ticket.resolved_at && row('Resolved', fmtDateTime(ticket.resolved_at))}
      </div>

      {ticket.body && (
        <div className="mb-4 p-3 rounded-lg bg-surface2 text-sm text-content whitespace-pre-wrap">
          {ticket.body}
        </div>
      )}

      {/* Admin controls */}
      {canAdminControl && (
        <div className="grid sm:grid-cols-3 gap-3 mb-4 p-3 rounded-lg border border-line bg-surface2/40">
          <Field label="Status">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as any)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Assignee">
            <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">— unassigned —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </Field>
        </div>
      )}

      {/* Replies thread */}
      <div className="pt-3 border-t border-line">
        <p className="text-2xs uppercase tracking-wide text-muted2 mb-3">Replies</p>
        {replies === null ? (
          <Spinner />
        ) : replies.length === 0 ? (
          <p className="text-sm text-muted2 text-center py-4">No replies yet.</p>
        ) : (
          <div className="flex flex-col gap-2 mb-3 max-h-64 overflow-y-auto pr-1">
            {replies.map((r) => {
              const isMe = r.author_id === meId;
              return (
                <div key={r.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <Avatar name={nameOf(r.author_id)} size={28} />
                  <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${isMe ? 'bg-accent/10 text-content' : 'bg-surface2 text-content'}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-2xs font-medium text-muted">{nameOf(r.author_id)}</span>
                      <span className="text-2xs text-muted2">{fmtDateTime(r.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{r.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {canReply && ticket.status !== 'closed' && (
          <div className="flex gap-2 mt-2">
            <textarea
              className="input flex-1 min-h-[60px] resize-none text-sm"
              placeholder="Write a reply…"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply(); }}
            />
            <button className="btn btn-primary self-end px-3" disabled={replyBusy || !replyBody.trim()} onClick={sendReply}>
              <Icon name="ti-send" />
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import Select from '@/components/Select';
import Dropdown from '@/components/Dropdown';
import { useAuthStore } from '@/lib/store';
import {
  supportQueue, assignTicket, setTicketStatus, listTicketReplies, addTicketReply,
  supportAgentList, listCannedReplies, saveCannedReply, SupportQueueRow, SupportReply, SupportAgent, CannedReply,
} from '@/lib/db';

const STATUSES = ['open', 'pending', 'resolved', 'closed'];
const PRIO: Record<string, string> = { urgent: 'bg-rose-500/10 text-rose-600', high: 'bg-amber-500/10 text-amber-600', medium: 'bg-sky-500/10 text-sky-600', low: 'bg-surface2 text-muted' };

export default function SupportQueuePage() {
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  const [rows, setRows] = useState<SupportQueueRow[] | null>(null);
  const [agents, setAgents] = useState<SupportAgent[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const [sel, setSel] = useState<string | null>(null);
  const [replies, setReplies] = useState<SupportReply[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [canned, setCanned] = useState<CannedReply[]>([]);

  const load = useCallback(() => {
    supportQueue(filter === 'all' ? null : filter).then(setRows).catch((e) => { setErr(e?.message || 'Failed to load queue'); setRows([]); });
  }, [filter]);
  useEffect(() => { if (platformAdmin) load(); }, [platformAdmin, load]);
  useEffect(() => { if (platformAdmin) { supportAgentList().then(setAgents).catch(() => {}); listCannedReplies().then(setCanned).catch(() => {}); } }, [platformAdmin]);

  const t = rows?.find((r) => r.id === sel) || null;
  useEffect(() => {
    if (!sel) { setReplies([]); return; }
    listTicketReplies(sel).then(setReplies).catch(() => setReplies([]));
  }, [sel]);

  const changeStatus = async (status: string) => {
    if (!t) return; setBusy(true); setErr('');
    try { await setTicketStatus(t.id, status); await load(); } catch (e: any) { setErr(e?.message || 'Could not update status'); } finally { setBusy(false); }
  };
  const changeAssignee = async (agentId: string) => {
    if (!t) return; setBusy(true); setErr('');
    try { await assignTicket(t.id, agentId || null); await load(); } catch (e: any) { setErr(e?.message || 'Could not reassign'); } finally { setBusy(false); }
  };
  const sendReply = async () => {
    if (!t || !reply.trim() || busy) return; setBusy(true); setErr('');
    try { await addTicketReply(t.id, reply.trim()); setReply(''); setReplies(await listTicketReplies(t.id)); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not send reply'); } finally { setBusy(false); }
  };
  const saveCanned = async () => {
    if (!reply.trim()) return; const title = window.prompt('Save this reply as a canned reply — title:'); if (!title || !title.trim()) return;
    try { await saveCannedReply(null, title.trim(), reply.trim()); listCannedReplies().then(setCanned).catch(() => {}); } catch (e: any) { setErr(e?.message || 'Could not save'); }
  };

  if (!platformAdmin) return <Layout flat title="Support queue"><EmptyState icon="ti-lock" title="Platform staff only" text="The cross-tenant support queue is available to platform administrators and support agents." /></Layout>;

  const agentOptions = [{ value: '', label: 'Unassigned' }, ...agents.map((a) => ({ value: a.user_id, label: (a.full_name || a.email) + (a.active ? '' : ' (paused)') }))];

  return (
    <Layout flat title="Support queue">
      <PageHeader title="Support queue" subtitle="Cross-tenant tickets — auto-assigned round-robin across active agents" icon="ti-lifebuoy" />

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {['all', ...STATUSES].map((s) => (
          <button key={s} onClick={() => { setFilter(s); setSel(null); }}
            className={`h-8 px-3 rounded-lg text-sm capitalize transition ${filter === s ? 'bg-accent/15 text-accentstrong font-medium' : 'text-muted hover:text-content border border-line'}`}>{s}</button>
        ))}
      </div>

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      {rows === null ? <Spinner /> : (
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="w-full lg:w-96 lg:shrink-0">
            <div className="card overflow-y-auto" style={{ maxHeight: '74vh' }}>
              {rows.length === 0 ? <EmptyState icon="ti-inbox" text="No tickets in this view." /> : rows.map((r) => (
                <button key={r.id} onClick={() => setSel(r.id)}
                  className={`w-full text-left px-4 py-3 border-b border-line last:border-0 transition ${sel === r.id ? 'bg-accent/5 border-l-2 border-l-accent' : 'hover:bg-surface2 border-l-2 border-l-transparent'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`pill ${PRIO[r.priority] || 'pill-gray'} capitalize`}>{r.priority}</span>
                    {r.awaiting_response && <span className="pill bg-amber-500/10 text-amber-600" title="No staff reply yet">Awaiting</span>}
                    <span className="text-sm font-medium text-content truncate flex-1">{r.subject}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-2xs text-muted">
                    <span className="truncate">{r.org_name || '—'}</span>
                    <span className="text-muted2">·</span>
                    <span className="truncate">{r.assignee_name ? `→ ${r.assignee_name}` : 'Unassigned'}</span>
                    {r.reply_count > 0 && <span className="ml-auto inline-flex items-center gap-1"><Icon name="ti-message" className="text-2xs" />{r.reply_count}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {t ? (
            <div className="card flex-1 p-6">
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-line">
                <div className="min-w-0">
                  <h3 className="font-semibold text-content">{t.subject}</h3>
                  <p className="text-2xs text-muted mt-0.5">{t.org_name} · opened by {t.requester_name || '—'} · {new Date(t.created_at).toLocaleString()}</p>
                </div>
                <span className={`pill ${PRIO[t.priority] || 'pill-gray'} capitalize shrink-0`}>{t.priority}</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="label">Status</label>
                  <Select value={t.status} disabled={busy} onChange={changeStatus} options={STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} />
                </div>
                <div>
                  <label className="label">Assignee</label>
                  <Select search value={t.assignee_id || ''} disabled={busy} onChange={changeAssignee} options={agentOptions} />
                </div>
              </div>

              {t.body && <div className="mt-4 text-sm text-content whitespace-pre-wrap rounded-lg bg-surface2/50 border border-line p-3">{t.body}</div>}

              <div className="mt-5">
                <p className="text-2xs uppercase tracking-wide text-muted mb-2 font-medium">Conversation</p>
                <div className="space-y-2">
                  {replies.length === 0 ? <p className="text-sm text-muted">No replies yet.</p> : replies.map((rp) => (
                    <div key={rp.id} className="text-sm rounded-lg border border-line bg-surface p-3">
                      <p className="text-2xs text-muted2 mb-1">{new Date(rp.created_at).toLocaleString()}</p>
                      <p className="text-content whitespace-pre-wrap">{rp.body}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {canned.length > 0 && (
                      <Dropdown value="" onChange={(id) => { const c = canned.find((x) => x.id === id); if (c) setReply((r) => (r ? r + '\n\n' : '') + c.body); }}
                        items={canned.map((c) => ({ value: c.id, label: c.title }))}
                        trigger={<span className="btn h-8 py-0 cursor-pointer"><Icon name="ti-message-bolt" />Canned reply</span>} />
                    )}
                    <button className="btn h-8 py-0" disabled={!reply.trim()} onClick={saveCanned}><Icon name="ti-bookmark" />Save as canned</button>
                    <span className="text-2xs text-muted2 ml-auto">Resolved tickets auto-close after 7 days.</span>
                  </div>
                  <div className="flex items-end gap-2">
                    <textarea className="input flex-1 min-h-[60px]" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply to the tenant…" disabled={busy} />
                    <button className="btn btn-primary shrink-0" disabled={busy || !reply.trim()} onClick={sendReply}><Icon name="ti-send" />Send</button>
                  </div>
                </div>
              </div>
            </div>
          ) : <div className="card flex-1 p-6 text-sm text-muted">Select a ticket to view and respond.</div>}
        </div>
      )}
    </Layout>
  );
}

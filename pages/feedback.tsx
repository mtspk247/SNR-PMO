import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { sb } from '@/lib/supabase';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';

type FB = { id: string; org_id: string; org_name: string | null; kind: string; subject: string; body: string | null; status: string; priority: string | null; page_path: string | null; admin_note: string | null; created_at: string; submitter: string | null; submitter_email: string | null; reply_count: number };
type Reply = { id: string; author: string | null; message: string; created_at: string };

const STATUSES = ['new', 'triaged', 'planned', 'in_progress', 'done', 'declined'];
const PRIORITIES = ['high', 'medium', 'low'];
const KIND_META: Record<string, { label: string; icon: string; cls: string }> = {
  bug: { label: 'Bug', icon: 'ti-bug', cls: 'pill-red' },
  idea: { label: 'Idea', icon: 'ti-bulb', cls: 'pill-amber' },
  praise: { label: 'Praise', icon: 'ti-heart', cls: 'pill-green' },
  other: { label: 'Other', icon: 'ti-message-dots', cls: 'pill-gray' },
};

function Thread({ id }: { id: string }) {
  const [rows, setRows] = useState<Reply[] | null>(null);
  useEffect(() => { sb.rpc('feedback_thread', { p_id: id }).then(({ data }) => setRows((data as Reply[]) || []), () => setRows([])); }, [id]);
  if (!rows || rows.length === 0) return null;
  return <div className="space-y-1.5 mt-2">{rows.map((r) => <div key={r.id} className="rounded-lg bg-surface2 border border-line p-2"><p className="text-2xs text-content whitespace-pre-wrap">{r.message}</p><p className="text-[10px] text-muted2 mt-0.5">{r.author || 'Admin'} · {new Date(r.created_at).toLocaleString()}</p></div>)}</div>;
}

function Item({ fb, onChange }: { fb: FB; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const km = KIND_META[fb.kind] || KIND_META.other;
  const triage = async (patch: { status?: string; priority?: string }) => { await sb.rpc('feedback_triage', { p_id: fb.id, p_status: patch.status ?? null, p_priority: patch.priority ?? null, p_note: null }); onChange(); };
  const send = async () => {
    if (!reply.trim()) return; setBusy(true); setMsg('');
    try { const { error } = await sb.rpc('feedback_reply', { p_id: fb.id, p_message: reply.trim() }); if (error) throw new Error(error.message); setReply(''); setMsg('Reply sent to ' + (fb.submitter_email || 'the user')); onChange(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className={`pill ${km.cls} shrink-0`}><Icon name={km.icon} className="mr-1" />{km.label}</span>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setOpen((o) => !o)}>
          <p className="text-sm font-medium text-content">{fb.subject}</p>
          <p className="text-[11px] text-muted2 mt-0.5">{fb.submitter || 'Someone'}{fb.org_name ? ` · ${fb.org_name}` : ''} · {new Date(fb.created_at).toLocaleDateString()}{fb.reply_count > 0 ? ` · ${fb.reply_count} repl${fb.reply_count === 1 ? 'y' : 'ies'}` : ''}</p>
        </div>
        <select value={fb.status} onChange={(e) => triage({ status: e.target.value })} onClick={(e) => e.stopPropagation()} className="input h-8 py-0 text-2xs capitalize shrink-0">{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
        <select value={fb.priority || ''} onChange={(e) => triage({ priority: e.target.value })} onClick={(e) => e.stopPropagation()} className="input h-8 py-0 text-2xs capitalize shrink-0 w-24"><option value="">priority</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
      </div>
      {open && (
        <div className="mt-3 pl-1 space-y-2">
          {fb.body && <p className="text-2xs text-muted whitespace-pre-wrap">{fb.body}</p>}
          {fb.page_path && <p className="text-[10px] text-muted2">From page: {fb.page_path}</p>}
          {fb.submitter_email && <p className="text-[10px] text-muted2">Reply-to: {fb.submitter_email}</p>}
          {fb.admin_note && <p className="text-[10px] text-muted2">Note: {fb.admin_note}</p>}
          <Thread id={fb.id} />
          <div className="flex items-end gap-2 pt-1">
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the submitter (emails them)…" className="input flex-1 h-16 resize-none text-2xs" />
            <button className="btn btn-primary h-8 py-0 shrink-0" disabled={busy || !reply.trim()} onClick={send}><Icon name={busy ? 'ti-loader-2' : 'ti-send'} className={busy ? 'animate-spin' : ''} />Reply</button>
          </div>
          {msg && <p className="text-[10px] text-muted">{msg}</p>}
        </div>
      )}
    </div>
  );
}

export default function FeedbackAdmin() {
  const { platformAdmin } = useAuthStore();
  const org = useActiveOrg();
  const [rows, setRows] = useState<FB[] | null>(null);
  const [status, setStatus] = useState('all'); const [kind, setKind] = useState('all'); const [tenant, setTenant] = useState('all'); const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const allowed = platformAdmin || can.manageMembers(org);

  const load = useCallback(async () => { setErr(''); try { const { data, error } = await sb.rpc('feedback_admin_list', { p_status: null }); if (error) throw new Error(error.message); setRows((data as FB[]) || []); } catch (e: any) { setErr(e.message); setRows([]); } }, []);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  if (!allowed) return <Layout title="Feedback"><EmptyState icon="ti-lock" title="Admins only" text="Feedback management is available to workspace admins and the platform team." /></Layout>;

  const all = rows || [];
  const tenants = Array.from(new Set(all.map((r) => r.org_name).filter(Boolean))) as string[];
  const shown = all.filter((r) => (status === 'all' || r.status === status) && (kind === 'all' || r.kind === kind) && (tenant === 'all' || r.org_name === tenant) && (!q || (r.subject + ' ' + (r.body || '') + ' ' + (r.submitter || '')).toLowerCase().includes(q.toLowerCase())));
  const counts = STATUSES.reduce((a, s) => { a[s] = all.filter((r) => r.status === s).length; return a; }, {} as Record<string, number>);

  return (
    <Layout title="Feedback">
      <PageHeader title="Feedback" subtitle="Every submission — by tenant, person and date — with status, priority and replies" icon="ti-message-circle" help="feedback" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="input h-8 py-0 text-2xs w-44" />
        {platformAdmin && tenants.length > 0 && (
          <select value={tenant} onChange={(e) => setTenant(e.target.value)} className="input h-8 py-0 text-2xs"><option value="all">All tenants</option>{tenants.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        )}
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="input h-8 py-0 text-2xs capitalize"><option value="all">All types</option>{Object.keys(KIND_META).map((k) => <option key={k} value={k}>{k}</option>)}</select>
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setStatus('all')} className={`btn h-7 py-0 text-2xs ${status === 'all' ? 'btn-primary' : 'border border-line text-muted'}`}>All ({all.length})</button>
          {STATUSES.map((s) => <button key={s} onClick={() => setStatus(s)} className={`btn h-7 py-0 text-2xs capitalize ${status === s ? 'btn-primary' : 'border border-line text-muted'}`}>{s.replace('_', ' ')} ({counts[s] || 0})</button>)}
        </div>
      </div>
      {rows === null ? <Spinner /> : shown.length === 0 ? <EmptyState icon="ti-message-circle" title="No feedback" text="Submissions from the in-app feedback action appear here." /> : (
        <div className="space-y-2">{shown.map((fb) => <Item key={fb.id} fb={fb} onChange={load} />)}</div>
      )}
    </Layout>
  );
}

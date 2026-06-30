import { useEffect, useState, useCallback, useMemo } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, PersonTag } from '@/components/ui';
import { ListView } from '@/components/ListView';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta, EditSpec } from '@/components/DataList';
import { sb } from '@/lib/supabase';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';

type FB = { id: string; org_id: string; org_name: string | null; kind: string; subject: string; body: string | null; status: string; priority: string | null; page_path: string | null; app_version: string | null; rating: number | null; meta: Record<string, any> | null; admin_note: string | null; created_at: string; updated_at: string | null; submitter: string | null; submitter_email: string | null; public: boolean; public_title: string | null; votes: number; reply_count: number };
type Reply = { id: string; author: string | null; message: string; created_at: string };

const STATUSES = ['new', 'triaged', 'planned', 'in_progress', 'done', 'declined'];
const PRIOS = ['high', 'medium', 'low'];
const STATUS_HEX: Record<string, string> = { new: '#f59e0b', triaged: '#3b82f6', planned: '#8b5cf6', in_progress: '#0ea5e9', done: '#10b981', declined: '#6b7280' };
const PRIO_HEX: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
const KIND_META: Record<string, { label: string; icon: string; hex: string }> = { bug: { label: 'Bug', icon: 'ti-bug', hex: '#ef4444' }, idea: { label: 'Idea', icon: 'ti-bulb', hex: '#f59e0b' }, praise: { label: 'Praise', icon: 'ti-heart', hex: '#10b981' }, other: { label: 'Other', icon: 'ti-message-dots', hex: '#6b7280' } };
const title = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const COLS: ColDef[] = [
  { id: 'subject', label: 'Feedback', locked: true },
  { id: 'kind', label: 'Type', width: 110 }, { id: 'rating', label: 'Rating', width: 100 },
  { id: 'status', label: 'Status', width: 130 }, { id: 'priority', label: 'Priority', width: 120 },
  { id: 'submitter', label: 'User', width: 160 }, { id: 'tenant', label: 'Tenant', width: 160 },
  { id: 'created', label: 'Date', width: 160 }, { id: 'page', label: 'Page', width: 130 },
  { id: 'device', label: 'Device', width: 150 }, { id: 'location', label: 'Location', width: 150 },
  { id: 'replies', label: 'Replies', width: 90 },
];
const FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: title(s) }))] },
  { id: 'kind', label: 'Type', options: [{ value: 'all', label: 'All types' }, ...Object.keys(KIND_META).map((k) => ({ value: k, label: (KIND_META[k] || KIND_META.other).label }))] },
  { id: 'priority', label: 'Priority', options: [{ value: 'all', label: 'Any priority' }, ...PRIOS.map((p) => ({ value: p, label: title(p) }))] },
];
const GROUPS: GroupMeta[] = STATUSES.map((s) => ({ value: s, label: title(s), color: STATUS_HEX[s] }));

const Stars = ({ n }: { n: number | null }) => n ? <span style={{ color: '#f59e0b' }} className="text-2xs">{'★'.repeat(n)}<span className="text-muted2">{'☆'.repeat(5 - n)}</span></span> : <span className="text-muted2">—</span>;
const Tag = ({ label, hex, icon }: { label: string; hex: string; icon?: string }) => <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-2xs font-medium" style={{ backgroundColor: hex + '1f', color: hex, boxShadow: `inset 0 0 0 1px ${hex}33` }}>{icon && <Icon name={icon} />}{label}</span>;

function Detail({ fb, onClose, onChange }: { fb: FB; onClose: () => void; onChange: () => void }) {
  const [thread, setThread] = useState<Reply[] | null>(null);
  const [reply, setReply] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const loadThread = useCallback(() => { sb.rpc('feedback_thread', { p_id: fb.id }).then(({ data }) => setThread((data as Reply[]) || []), () => setThread([])); }, [fb.id]);
  useEffect(() => { loadThread(); }, [loadThread]);
  const m = fb.meta || {}; const km = KIND_META[fb.kind] || KIND_META.other;
  const send = async () => {
    if (!reply.trim()) return; setBusy(true); setMsg('');
    try { const { error } = await sb.rpc('feedback_reply', { p_id: fb.id, p_message: reply.trim() }); if (error) throw new Error(error.message); setReply(''); setMsg('Reply sent to ' + (fb.submitter_email || 'the user')); loadThread(); onChange(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const Row = ({ k, v }: { k: string; v: any }) => v ? <div className="flex justify-between gap-3 text-2xs"><span className="text-muted2">{k}</span><span className="text-content text-right break-all">{String(v)}</span></div> : null;
  return (
    <div className="fixed inset-0 z-[55] flex" onClick={onClose}>
      <div className="flex-1 bg-black/30" />
      <div className="w-[440px] max-w-full h-full overflow-y-auto bg-bg border-l border-line p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2"><Tag label={km.label} hex={km.hex} icon={km.icon} /><Stars n={fb.rating} /></div>
          <button onClick={onClose} className="text-muted hover:text-content"><Icon name="ti-x" /></button>
        </div>
        <h2 className="text-base font-semibold text-content">{fb.subject}</h2>
        {fb.body && <p className="text-2xs text-muted whitespace-pre-wrap">{fb.body}</p>}
        <div className="rounded-lg border border-line bg-surface2 p-3 space-y-1.5">
          <Row k="User" v={fb.submitter} /><Row k="Email" v={fb.submitter_email} /><Row k="Tenant" v={fb.org_name} />
          <Row k="Submitted" v={new Date(fb.created_at).toLocaleString()} /><Row k="Page" v={fb.page_path} />
          <Row k="Device" v={[m.device, m.os, m.browser].filter(Boolean).join(' · ')} /><Row k="Screen" v={m.screen} />
          <Row k="Viewport" v={m.viewport} /><Row k="Locale" v={m.locale} /><Row k="Timezone" v={m.timezone} />
          <Row k="Mode" v={m.mode} /><Row k="Online" v={m.online === false ? 'offline' : (m.online === true ? 'online' : null)} />
          <Row k="Referrer" v={m.referrer} /><Row k="App version" v={fb.app_version} />
        </div>
        <div className="flex items-center gap-2"><label className="text-2xs text-muted2 w-16">Status</label>
          <select value={fb.status} onChange={(e) => { sb.rpc('feedback_triage', { p_id: fb.id, p_status: e.target.value, p_priority: null, p_note: null }).then(onChange, () => {}); }} className="input h-8 py-0 text-2xs capitalize flex-1">{STATUSES.map((s) => <option key={s} value={s}>{title(s)}</option>)}</select></div>
        <div className="flex items-center gap-2"><label className="text-2xs text-muted2 w-16">Priority</label>
          <select value={fb.priority || ''} onChange={(e) => { sb.rpc('feedback_triage', { p_id: fb.id, p_status: null, p_priority: e.target.value, p_note: null }).then(onChange, () => {}); }} className="input h-8 py-0 text-2xs capitalize flex-1"><option value="">—</option>{PRIOS.map((p) => <option key={p} value={p}>{title(p)}</option>)}</select></div>
        <div className="flex items-center gap-2"><label className="text-2xs text-muted2 w-16">Roadmap</label>
          <button onClick={() => { sb.rpc('feedback_set_public', { p_id: fb.id, p_public: !fb.public, p_title: null }).then(onChange, () => {}); }} className={`btn h-8 py-0 text-2xs ${fb.public ? 'btn-primary' : 'border border-line text-muted'}`}><Icon name={fb.public ? 'ti-check' : 'ti-map-2'} />{fb.public ? 'On public roadmap' : 'Add to public roadmap'}</button>
          {fb.votes > 0 && <span className="text-2xs text-muted2">{fb.votes} vote{fb.votes === 1 ? '' : 's'}</span>}
        </div>
        <div>
          <p className="text-2xs font-semibold text-content mb-1.5">Conversation</p>
          {thread === null ? <p className="text-2xs text-muted">Loading…</p> : thread.length === 0 ? <p className="text-2xs text-muted2">No replies yet.</p> :
            <div className="space-y-1.5">{thread.map((r) => <div key={r.id} className="rounded-lg bg-surface2 border border-line p-2"><p className="text-2xs text-content whitespace-pre-wrap">{r.message}</p><p className="text-[10px] text-muted2 mt-0.5">{r.author || 'Admin'} · {new Date(r.created_at).toLocaleString()}</p></div>)}</div>}
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the submitter (emails them)…" className="input w-full h-16 resize-none text-2xs mt-2" />
          <button className="btn btn-primary w-full mt-1" disabled={busy || !reply.trim()} onClick={send}><Icon name={busy ? 'ti-loader-2' : 'ti-send'} className={busy ? 'animate-spin' : ''} />Send reply</button>
          {msg && <p className="text-[10px] text-muted mt-1">{msg}</p>}
        </div>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const { platformAdmin } = useAuthStore();
  const org = useActiveOrg();
  const allowed = platformAdmin || can.manageMembers(org);
  const [rows, setRows] = useState<FB[] | null>(null);
  const [err, setErr] = useState(''); const [sel, setSel] = useState<FB | null>(null);
  const prefs = useListPrefs('snrpmo.feedback.cols', COLS, { entity: 'feedback', orgId: org?.id, canManage: allowed });
  const { query, filters } = prefs;

  const load = useCallback(() => { setErr(''); sb.rpc('feedback_admin_list', { p_status: null }).then(({ data, error }) => { if (error) { setErr(error.message); setRows([]); } else setRows((data as FB[]) || []); }, (e) => { setErr(String(e?.message || e)); setRows([]); }); }, []);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  const shown = useMemo(() => (rows || []).filter((r) => {
    const sf = filters.status || 'all', kf = filters.kind || 'all', pf = filters.priority || 'all';
    if (sf !== 'all' && r.status !== sf) return false;
    if (kf !== 'all' && r.kind !== kf) return false;
    if (pf !== 'all' && (r.priority || '') !== pf) return false;
    if (query.trim() && !`${r.subject} ${r.body || ''} ${r.submitter || ''} ${r.org_name || ''}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [rows, filters.status, filters.kind, filters.priority, query]);

  const rs = useRowSelection(shown);

  const cell = (id: string, r: FB) => {
    const m = r.meta || {};
    switch (id) {
      case 'subject': return <span className="font-medium text-content">{r.subject}</span>;
      case 'kind': { const k = KIND_META[r.kind] || KIND_META.other; return <Tag label={k.label} hex={k.hex} icon={k.icon} />; }
      case 'rating': return <Stars n={r.rating} />;
      case 'status': return <Tag label={title(r.status)} hex={STATUS_HEX[r.status] || '#6b7280'} />;
      case 'priority': return r.priority ? <Tag label={title(r.priority)} hex={PRIO_HEX[r.priority] || '#6b7280'} /> : <span className="text-muted2">—</span>;
      case 'submitter': return r.submitter ? <PersonTag name={r.submitter} /> : <span className="text-muted2">—</span>;
      case 'tenant': return r.org_name || <span className="text-muted2">—</span>;
      case 'created': return <span className="text-muted">{new Date(r.created_at).toLocaleString()}</span>;
      case 'page': return r.page_path || <span className="text-muted2">—</span>;
      case 'device': return [m.device, m.browser].filter(Boolean).join(' · ') || <span className="text-muted2">—</span>;
      case 'location': return m.timezone || m.locale || <span className="text-muted2">—</span>;
      case 'replies': return r.reply_count > 0 ? <span className="inline-flex items-center gap-1 text-2xs text-muted"><Icon name="ti-message" />{r.reply_count}</span> : <span className="text-muted2">—</span>;
      default: return '—';
    }
  };
  const rawValue = (id: string, r: FB) => {
    const m = r.meta || {};
    switch (id) {
      case 'subject': return r.subject; case 'kind': return r.kind; case 'rating': return String(r.rating || 0);
      case 'status': return r.status; case 'priority': return r.priority || ''; case 'submitter': return r.submitter || '';
      case 'tenant': return r.org_name || ''; case 'created': return r.created_at; case 'page': return r.page_path || '';
      case 'device': return [m.device, m.browser].filter(Boolean).join(' '); case 'location': return m.timezone || m.locale || '';
      case 'replies': return String(r.reply_count || 0); default: return '';
    }
  };
  const editable: Record<string, EditSpec> = {
    status: { type: 'select', options: STATUSES.map((s) => ({ value: s, label: title(s), dot: STATUS_HEX[s] })) },
    priority: { type: 'select', options: PRIOS.map((p) => ({ value: p, label: title(p), dot: PRIO_HEX[p] })) },
  };
  const onEdit = async (r: FB, id: string, value: string) => {
    try { const { error } = await sb.rpc('feedback_triage', { p_id: r.id, p_status: id === 'status' ? value : null, p_priority: id === 'priority' ? value : null, p_note: null }); if (error) throw new Error(error.message); load(); }
    catch (e: any) { setErr(e.message); }
  };
  const exportValue = (id: string, r: FB) => id === 'created' ? new Date(r.created_at).toLocaleString() : rawValue(id, r);

  if (!allowed) return <Layout title="Feedback"><EmptyState icon="ti-lock" title="Admins only" text="Feedback management is available to workspace admins and the platform team." /></Layout>;

  return (
    <Layout title="Feedback">
      <PageHeader title="Feedback" subtitle="Every submission — tenant, person, device & date — with rating, status, priority and replies" icon="ti-message-circle" help="feedback" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <ListView
        rows={rows === null ? null : shown}
        rowKey={(r) => r.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={FILTERS}
        searchPlaceholder="Search feedback…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(r) => r.status}
        groups={GROUPS}
        defaultGroup={false}
        editable={editable}
        rawValue={rawValue}
        onEdit={onEdit}
        nameCol="subject"
        onRowClick={(r) => setSel(r)}
        exportName="feedback"
        exportValue={exportValue}
        emptyIcon="ti-message-circle"
        emptyText="No feedback yet — submissions from the in-app feedback action appear here."
      />
      {sel && <Detail fb={sel} onClose={() => setSel(null)} onChange={load} />}
    </Layout>
  );
}

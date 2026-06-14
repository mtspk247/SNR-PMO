import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { Spinner, EmptyState, Avatar, Icon, StatCard, Pill, StatusBadge, Tabs } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { guestDetail, GuestDetail, guestSetAccess, guestDocumentUrl } from '@/lib/db';

const LEVEL_META: Record<string, { label: string; pill: string }> = {
  viewer: { label: 'Viewer', pill: 'pill-gray' }, collaborator: { label: 'Collaborator', pill: 'pill-amber' }, contributor: { label: 'Contributor', pill: 'pill-green' },
};
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString() : '—');
const fmtD = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : '—');

export default function GuestDetailPage() {
  const router = useRouter();
  const org = useActiveOrg();
  const manage = can.manageMembers(org);
  const id = (router.query.id as string) || '';
  const [d, setD] = useState<GuestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('activity');
  const [acc, setAcc] = useState<{ level: string; directEdit: boolean; logWork: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!org?.id || !id) return;
    setLoading(true);
    try { setD(await guestDetail(id, org.id)); } catch (e: any) { setErr(e?.message || 'Failed to load guest'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id, id]);

  const p = d?.profile;
  const lvl = LEVEL_META[p?.guest_level || 'viewer'] || LEVEL_META.viewer;
  const checkins = (d?.activity || []).filter((a) => a.kind === 'checkin');
  const views = (d?.activity || []).filter((a) => a.kind === 'view');

  const timeline = useMemo(() => {
    if (!d) return [] as { t: string; icon: string; text: string; meta?: string }[];
    const ev: { t: string; icon: string; text: string; meta?: string }[] = [];
    d.requests.forEach((r) => ev.push({ t: r.created_at, icon: 'ti-inbox', text: `${r.type}: ${r.title}`, meta: r.status }));
    d.comments.forEach((c) => ev.push({ t: c.created_at, icon: 'ti-message', text: `Comment${c.task ? ` on “${c.task}”` : ''}: ${c.body}` }));
    d.documents.forEach((x) => ev.push({ t: x.created_at, icon: 'ti-paperclip', text: `Uploaded ${x.file_name}` }));
    d.messages.forEach((m) => ev.push({ t: m.created_at, icon: 'ti-messages', text: `Chat: ${m.body}` }));
    d.activity.forEach((a) => ev.push({ t: a.created_at, icon: a.kind === 'checkin' ? 'ti-login' : 'ti-eye', text: a.detail || (a.kind === 'checkin' ? 'Signed in' : 'Viewed') + (a.project ? ` — ${a.project}` : '') }));
    d.audit.forEach((a) => ev.push({ t: a.ts, icon: 'ti-history', text: `${a.action} ${a.entity_type || ''}`.trim(), meta: a.ip }));
    return ev.filter((e) => e.t).sort((a, b) => b.t.localeCompare(a.t));
  }, [d]);

  const openAccess = () => p && setAcc({ level: p.guest_level || 'viewer', directEdit: p.guest_perms?.direct_edit ?? (p.guest_level === 'contributor'), logWork: p.guest_perms?.log_work ?? (p.guest_level === 'contributor') });
  const saveAccess = async () => {
    if (!acc || !org?.id || busy) return;
    setBusy(true);
    try { await guestSetAccess(id, org.id, acc.level, { direct_edit: acc.directEdit, log_work: acc.logWork }); setAcc(null); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not update access'); } finally { setBusy(false); }
  };
  const openDoc = async (path: string) => { try { window.open(await guestDocumentUrl(path), '_blank'); } catch (e: any) { setErr(e?.message || 'Could not open file'); } };

  if (!manage) return <Layout flat title="Guest"><EmptyState icon="ti-lock" title="Admins only" text="Guest details are available to owners and admins." /></Layout>;

  return (
    <Layout flat title={p?.full_name || 'Guest'}>
      <Link href="/guests" className="inline-flex items-center gap-1 text-xs text-muted hover:text-content mb-3"><Icon name="ti-arrow-left" className="text-sm" />Back to Guests</Link>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {loading ? <Spinner /> : !p ? <EmptyState icon="ti-user-off" text="Guest not found." /> : (
        <>
          <div className="flex items-center gap-3 mb-5">
            <Avatar name={p.full_name || p.email} size={48} />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-content truncate">{p.full_name || p.email}</h1>
              <p className="text-sm text-muted2 truncate">{p.email}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className={`pill ${p.is_linked ? 'pill-green' : 'pill-amber'}`}>{p.is_linked ? 'Active' : 'Pending'}</span>
              <button onClick={openAccess} className="inline-flex items-center gap-1.5"><span className={`pill ${lvl.pill}`}>{lvl.label}</span><Icon name="ti-settings" className="text-muted2 text-sm" /></button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-5 text-2xs text-muted2">
            <span>Guest since {fmtD(p.created_at)}</span>
            {p.projects.length > 0 && <><span>·</span><span>Projects:</span>{p.projects.map((pr) => <Link key={pr.id} href={`/projects/${pr.id}`} className="chip hover:text-content">{pr.name}</Link>)}</>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
            <StatCard label="Requests" value={d!.requests.length} icon="ti-inbox" />
            <StatCard label="Documents" value={d!.documents.length} icon="ti-paperclip" />
            <StatCard label="Comments" value={d!.comments.length} icon="ti-message" />
            <StatCard label="Messages" value={d!.messages.length} icon="ti-messages" />
            <StatCard label="Tasks" value={d!.tasks.length} icon="ti-checkbox" />
            <StatCard label="Check-ins" value={checkins.length} hint={`${views.length} views`} icon="ti-login" />
          </div>

          <Tabs active={tab} onChange={setTab} tabs={[
            { key: 'activity', label: 'Activity', icon: 'ti-timeline', count: timeline.length },
            { key: 'requests', label: 'Requests', icon: 'ti-inbox', count: d!.requests.length },
            { key: 'documents', label: 'Documents', icon: 'ti-paperclip', count: d!.documents.length },
            { key: 'comments', label: 'Comments & chat', icon: 'ti-message', count: d!.comments.length + d!.messages.length },
            { key: 'tasks', label: 'Tasks', icon: 'ti-checkbox', count: d!.tasks.length },
            { key: 'log', label: 'Check-ins & log', icon: 'ti-history', count: d!.activity.length + d!.audit.length },
          ]} />

          {tab === 'activity' && (
            <div className="card overflow-hidden">
              {timeline.length === 0 ? <EmptyState text="No activity yet." icon="ti-timeline" /> : (
                <div className="divide-y divide-line">
                  {timeline.slice(0, 200).map((e, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                      <span className="w-7 h-7 rounded-md grid place-items-center bg-surface2 text-muted2 shrink-0 mt-0.5"><Icon name={e.icon} className="text-sm" /></span>
                      <div className="min-w-0 flex-1"><p className="text-sm text-content truncate">{e.text}</p><p className="text-2xs text-muted2">{fmt(e.t)}{e.meta ? ` · ${e.meta}` : ''}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'requests' && (
            <div className="card overflow-hidden">
              {d!.requests.length === 0 ? <EmptyState text="No requests." icon="ti-inbox" /> : <div className="divide-y divide-line">{d!.requests.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-0.5"><span className="chip capitalize">{r.type}</span><span className={`pill ${r.status === 'approved' ? 'pill-green' : r.status === 'rejected' ? 'pill-red' : 'pill-amber'}`}>{r.status}</span>{r.project && <span className="text-2xs text-muted2">{r.project}</span>}</div>
                  <p className="text-sm text-content">{r.title}</p>{r.body && <p className="text-2xs text-muted mt-0.5">{r.body}</p>}
                  <p className="text-2xs text-muted2 mt-1">{fmt(r.created_at)}{r.decision_note ? ` · “${r.decision_note}”` : ''}</p>
                </div>
              ))}</div>}
            </div>
          )}

          {tab === 'documents' && (
            <div className="card overflow-hidden">
              {d!.documents.length === 0 ? <EmptyState text="No documents." icon="ti-paperclip" /> : <div className="divide-y divide-line">{d!.documents.map((x) => (
                <div key={x.id} className="flex items-center gap-3 px-4 py-3">
                  <Icon name="ti-file" className="text-muted2 text-lg shrink-0" />
                  <div className="min-w-0 flex-1"><button onClick={() => openDoc(x.file_path)} className="block text-sm text-content hover:text-accent truncate text-left">{x.file_name}</button><p className="text-2xs text-muted2 truncate">{fmtD(x.created_at)}{x.project ? ` · ${x.project}` : ''}{x.note ? ` · ${x.note}` : ''}</p></div>
                  <button onClick={() => openDoc(x.file_path)} className="btn btn-ghost h-8 py-0"><Icon name="ti-download" className="text-sm" /></button>
                </div>
              ))}</div>}
            </div>
          )}

          {tab === 'comments' && (
            <div className="card overflow-hidden">
              {d!.comments.length + d!.messages.length === 0 ? <EmptyState text="No comments or messages." icon="ti-message" /> : <div className="divide-y divide-line">
                {d!.comments.map((c) => (<div key={'c' + c.id} className="px-4 py-3"><div className="flex items-center gap-2 mb-0.5"><Icon name="ti-message" className="text-muted2 text-sm" /><span className="text-2xs text-muted2">Comment{c.task ? ` on “${c.task}”` : ''} · {fmt(c.created_at)}</span></div><p className="text-sm text-content">{c.body}</p></div>))}
                {d!.messages.map((m) => (<div key={'m' + m.id} className="px-4 py-3"><div className="flex items-center gap-2 mb-0.5"><Icon name="ti-messages" className="text-muted2 text-sm" /><span className="text-2xs text-muted2">Chat{m.project ? ` · ${m.project}` : ''} · {fmt(m.created_at)}</span></div><p className="text-sm text-content">{m.body}</p></div>))}
              </div>}
            </div>
          )}

          {tab === 'tasks' && (
            <div className="card overflow-hidden">
              {d!.tasks.length === 0 ? <EmptyState text="No assigned tasks." icon="ti-checkbox" /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-2xs uppercase tracking-wider text-muted2 border-b border-line"><th className="text-left font-semibold px-4 py-2">Task</th><th className="text-left font-semibold px-4 py-2">Status</th><th className="text-left font-semibold px-4 py-2">Priority</th><th className="text-left font-semibold px-4 py-2">Due</th><th className="text-left font-semibold px-4 py-2">Project</th></tr></thead><tbody>
                {d!.tasks.map((t) => (<tr key={t.id} className="border-b border-line hover:bg-surface2"><td className="px-4 py-2"><Link href={`/tasks?task=${t.id}`} className="text-content hover:text-accent">{t.name}</Link></td><td className="px-4 py-2"><StatusBadge status={t.status} /></td><td className="px-4 py-2 text-muted">{t.priority}</td><td className="px-4 py-2 text-muted tabular-nums">{t.due_date || '—'}</td><td className="px-4 py-2 text-muted">{t.project || '—'}</td></tr>))}
              </tbody></table></div>}
            </div>
          )}

          {tab === 'log' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-line text-sm font-semibold text-content">Check-ins &amp; views ({d!.activity.length})</div>
                {d!.activity.length === 0 ? <EmptyState text="No check-ins yet." icon="ti-login" /> : <div className="divide-y divide-line">{d!.activity.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2.5"><Icon name={a.kind === 'checkin' ? 'ti-login' : 'ti-eye'} className="text-muted2 text-base shrink-0" /><div className="min-w-0 flex-1"><p className="text-sm text-content truncate">{a.detail || (a.kind === 'checkin' ? 'Signed in' : 'Viewed')}{a.project ? ` — ${a.project}` : ''}</p><p className="text-2xs text-muted2">{fmt(a.created_at)}</p></div><span className="chip capitalize">{a.kind}</span></div>
                ))}</div>}
              </div>
              <div className="card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-line text-sm font-semibold text-content">Action log ({d!.audit.length})</div>
                {d!.audit.length === 0 ? <EmptyState text="No recorded actions." icon="ti-history" /> : <div className="divide-y divide-line">{d!.audit.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2.5"><Icon name="ti-history" className="text-muted2 text-base shrink-0" /><div className="min-w-0 flex-1"><p className="text-sm text-content truncate">{a.action} {a.entity_type}</p><p className="text-2xs text-muted2">{fmt(a.ts)}{a.ip ? ` · ${a.ip}` : ''}</p></div></div>
                ))}</div>}
              </div>
            </div>
          )}
        </>
      )}

      {acc && (
        <Modal open onClose={() => setAcc(null)} title="Edit access" icon="ti-adjustments" size="sm"
          footer={<><button className="btn" onClick={() => setAcc(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={saveAccess}>{busy ? 'Saving…' : 'Save'}</button></>}>
          <Field label="Level">
            <select className="input" value={acc.level} onChange={(e) => { const level = e.target.value; setAcc({ level, directEdit: level === 'contributor', logWork: level === 'contributor' }); }}>
              {Object.entries(LEVEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Overrides">
            <label className="flex items-center gap-2 text-sm py-1"><input type="checkbox" className="accent-accent w-4 h-4" checked={acc.directEdit} onChange={(e) => setAcc({ ...acc, directEdit: e.target.checked })} />Allow direct edits</label>
            <label className="flex items-center gap-2 text-sm py-1"><input type="checkbox" className="accent-accent w-4 h-4" checked={acc.logWork} onChange={(e) => setAcc({ ...acc, logWork: e.target.checked })} />Allow time logging</label>
          </Field>
        </Modal>
      )}
    </Layout>
  );
}

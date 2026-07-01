import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard, PersonTag } from '@/components/ui';
import { Modal } from '@/components/Modal';
import RecorderModal from '@/components/RecorderModal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { toast } from '@/lib/toast';
import {
  listScreenRecordings, deleteScreenRecording, updateScreenRecording, screenRecordingUrl,
  getOrgUsers, listRecordingTaskLinks, linkRecordingToTask, unlinkRecording, listTasksLite, createRecordingShare, revokeRecordingShare, listRecordingShares, RecordingShare,
  ScreenRecording, ScreenRecordingLink, TaskLite,
} from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { useListPrefs, ColDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { EditSpec } from '@/components/DataList';
import { ListView } from '@/components/ListView';
import Select from '@/components/Select';

// Lazy signed-URL thumbnail for a recording row / poster.
function RecThumb({ path, className = '' }: { path: string | null; className?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let a = true; if (path) screenRecordingUrl(path).then((u) => { if (a) setSrc(u); }).catch(() => {}); return () => { a = false; }; }, [path]);
  if (!src) return <span className={`grid place-items-center bg-surface2 ${className}`}><Icon name="ti-video" className="text-muted2 text-sm" /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`object-cover ${className}`} loading="lazy" />;
}
const COLS: ColDef[] = [
  { id: 'title', label: 'Title', locked: true },
  { id: 'duration', label: 'Length' },
  { id: 'size', label: 'Size' },
  { id: 'by', label: 'Recorded by' },
  { id: 'date', label: 'Date' },
];
const fmtDur = (s: number | null) => s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtSize = (b: number | null) => b == null ? '—' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

export default function RecordingsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'recordings');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [recs, setRecs] = useState<ScreenRecording[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [recording, setRecording] = useState(false);
  const [viewer, setViewer] = useState<{ rec: ScreenRecording; url: string; poster: string } | null>(null);
  const [links, setLinks] = useState<ScreenRecordingLink[]>([]);
  const [shares, setShares] = useState<RecordingShare[]>([]);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [linkTaskId, setLinkTaskId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => { if (org) listScreenRecordings(org.id).then(setRecs).catch((e) => { setErr(e.message); setRecs([]); }); };
  useEffect(() => { if (org?.id && enabled) { load(); getOrgUsers(org.id).then(setUsers).catch(() => {}); listTasksLite(org.id).then(setTasks).catch(() => {}); } /* eslint-disable-line */ }, [org?.id, enabled]);

  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.full_name || '—';
  const canDeleteRec = (r: ScreenRecording) => isAdmin || r.created_by === me?.id;

  const prefs = useListPrefs('snrpmo.recordings.cols', COLS, { entity: 'recordings', orgId: org?.id, canManage: isAdmin });
  const rs = useRowSelection(recs || []);

  const play = async (r: ScreenRecording) => {
    if (!r.storage_path) { toast('This recording is still uploading.', 'error'); return; }
    try {
      const url = await screenRecordingUrl(r.storage_path);
      const poster = r.thumb_path ? await screenRecordingUrl(r.thumb_path).catch(() => '') : '';
      setViewer({ rec: r, url, poster }); setLinkTaskId('');
      listRecordingTaskLinks(r.id).then(setLinks).catch(() => setLinks([]));
      listRecordingShares(r.id).then(setShares).catch(() => setShares([]));
    } catch (e: any) { setErr(e.message); }
  };
  const download = async (r: ScreenRecording) => {
    if (!r.storage_path) return;
    try {
      const url = await screenRecordingUrl(r.storage_path);
      const a = document.createElement('a'); a.href = url; a.download = `${r.title}.${r.mime.includes('mp4') ? 'mp4' : 'webm'}`;
      a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove();
    } catch (e: any) { setErr(e.message); }
  };
  const removeRec = async (r: ScreenRecording) => {
    if (!confirm(`Delete “${r.title}”? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { await deleteScreenRecording(r); setViewer(null); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const attach = async () => {
    if (!org || !me || !viewer || !linkTaskId || busy) return; setBusy(true); setErr('');
    try { await linkRecordingToTask({ org_id: org.id, created_by: me.id, recording_id: viewer.rec.id, task_id: linkTaskId }); setLinkTaskId(''); toast('Attached to task', 'success'); listRecordingTaskLinks(viewer.rec.id).then(setLinks); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const detach = async (id: string) => {
    if (!viewer || busy) return; setBusy(true); setErr('');
    try { await unlinkRecording(id); listRecordingTaskLinks(viewer.rec.id).then(setLinks); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const shareUrl = (token: string) => `${window.location.origin}/r/${token}`;
  const copyShare = async (token: string) => { try { await navigator.clipboard.writeText(shareUrl(token)); toast('Link copied', 'success'); } catch { window.prompt('Copy:', shareUrl(token)); } };
  const revokeShare = async (id: string) => {
    if (busy || !confirm('Revoke this share link? Anyone with it will lose access.')) return; setBusy(true);
    try { await revokeRecordingShare(id); if (viewer) listRecordingShares(viewer.rec.id).then(setShares); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const shareLink = async (r: ScreenRecording) => {
    if (busy) return; setBusy(true); setErr('');
    try {
      const token = await createRecordingShare(r.id);
      const url = `${window.location.origin}/r/${token}`;
      try { await navigator.clipboard.writeText(url); toast('Share link copied to clipboard', 'success'); }
      catch { window.prompt('Copy this share link:', url); }
      if (viewer) listRecordingShares(viewer.rec.id).then(setShares).catch(() => {});
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const bulkDelete = async () => {
    const del = rs.selected.filter(canDeleteRec);
    if (!del.length) { toast('You can only delete recordings you own.', 'error'); return; }
    if (!confirm(`Delete ${del.length} recording${del.length > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const r of del) await deleteScreenRecording(r); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const cell = (id: string, r: ScreenRecording) => {
    switch (id) {
      case 'title': return <span className="font-medium text-content inline-flex items-center gap-2"><RecThumb path={r.thumb_path} className="w-9 h-6 rounded shrink-0" />{r.title}</span>;
      case 'duration': return fmtDur(r.duration_sec);
      case 'size': return fmtSize(r.size_bytes);
      case 'by': return <PersonTag name={nameOf(r.created_by)} />;
      case 'date': return new Date(r.created_at).toLocaleDateString();
      default: return '—';
    }
  };
  const exportValue = (id: string, r: ScreenRecording) =>
    id === 'title' ? r.title : id === 'duration' ? fmtDur(r.duration_sec) : id === 'size' ? fmtSize(r.size_bytes)
    : id === 'by' ? nameOf(r.created_by) : id === 'date' ? new Date(r.created_at).toLocaleDateString() : '';

  const editable: Record<string, EditSpec> = { title: { type: 'text' } };
  const rawValue = (id: string, r: ScreenRecording) => id === 'title' ? r.title : '';
  const onInlineEdit = async (r: ScreenRecording, id: string, value: string) => {
    if (id !== 'title' || !value.trim()) return;
    try { await updateScreenRecording(r.id, { title: value.trim() }); load(); } catch (e: any) { setErr(e.message); }
  };

  const kpis = useMemo(() => {
    const all = recs || [];
    return { total: all.length, size: all.reduce((s, r) => s + (r.size_bytes || 0), 0), dur: all.reduce((s, r) => s + (r.duration_sec || 0), 0) };
  }, [recs]);

  if (!enabled) return (
    <Layout flat title="Screen Recordings">
      <EmptyState icon="ti-video" title="Screen recording not in your plan" text="Capture and share screen recordings for demos, bug reports, and walkthroughs." />
    </Layout>
  );

  return (
    <Layout flat title="Screen Recordings">
      <PageHeader help="recordings" title="Screen Recordings" subtitle="Record your screen for demos, bug reports, and walkthroughs — stored securely in your workspace." icon="ti-video"
        action={<button className="btn btn-primary" onClick={() => setRecording(true)}><Icon name="ti-player-record" />New recording</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-3 gap-4 mb-5">
        <StatCard label="Recordings" value={String(kpis.total)} icon="ti-video" />
        <StatCard label="Total size" value={fmtSize(kpis.size)} icon="ti-database" />
        <StatCard label="Total length" value={fmtDur(kpis.dur)} icon="ti-clock" />
      </div>

      <ListView
        rows={recs}
        rowKey={(r) => r.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        searchPlaceholder="Search recordings…"
        editable={editable}
        rawValue={rawValue}
        onEdit={onInlineEdit}
        onRename={(r, v) => { if (v.trim()) updateScreenRecording(r.id, { title: v.trim() }).then(load).catch((e: any) => setErr(e.message)); }}
        onRowClick={(r) => play(r)}
        exportName="recordings"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={recs != null && (isAdmin || rs.selected.some(canDeleteRec))}
        busy={busy}
        emptyIcon="ti-video"
        emptyText="No recordings yet. Click “New recording” to capture your screen."
      />

      {recording && me && org && (
        <RecorderModal orgId={org.id} userId={me.id} onClose={() => setRecording(false)}
          onSaved={() => { setRecording(false); load(); }} />
      )}

      {viewer && (
        <Modal open onClose={() => setViewer(null)} size="lg" icon="ti-video" title={viewer.rec.title}
          footer={<>
            {canDeleteRec(viewer.rec) && <button className="btn btn-danger mr-auto" disabled={busy} onClick={() => removeRec(viewer.rec)}><Icon name="ti-trash" />Delete</button>}
            <button className="btn" disabled={busy} onClick={() => shareLink(viewer.rec)}><Icon name="ti-link" />Share link</button>
            <button className="btn" onClick={() => download(viewer.rec)}><Icon name="ti-download" />Download</button>
            <button className="btn btn-primary" onClick={() => setViewer(null)}>Close</button>
          </>}>
          <video src={viewer.url} poster={viewer.poster || undefined} controls autoPlay className="w-full rounded-lg bg-black max-h-[60vh]" />
          <div className="flex items-center gap-3 text-2xs text-muted2 mt-2">
            <span><Icon name="ti-clock" className="text-sm" /> {fmtDur(viewer.rec.duration_sec)}</span>
            <span><Icon name="ti-database" className="text-sm" /> {fmtSize(viewer.rec.size_bytes)}</span>
            <span><Icon name="ti-user" className="text-sm" /> {nameOf(viewer.rec.created_by)}</span>
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="text-sm font-semibold mb-2 inline-flex items-center gap-2"><Icon name="ti-checkbox" className="text-muted2" />Attached tasks</h3>
            {links.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {links.map((l) => (
                  <span key={l.id} className="inline-flex items-center gap-1 rounded-md bg-surface2 px-2 py-1 text-2xs text-content">
                    <Icon name="ti-checkbox" className="text-muted2 text-xs" />{l.task_name || 'Task'}
                    <button className="text-muted2 hover:text-rose-500" title="Detach" onClick={() => detach(l.id)}><Icon name="ti-x" className="text-xs" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 max-w-md">
              <Select value={linkTaskId} onChange={setLinkTaskId} options={[{ value: '', label: 'Pick a task…' }, ...tasks.filter((t) => !links.some((l) => l.task_id === t.id)).map((t) => ({ value: t.id, label: t.name }))]} />
              <button className="btn btn-sm" disabled={!linkTaskId || busy} onClick={attach}>Attach</button>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="text-sm font-semibold mb-2 inline-flex items-center gap-2"><Icon name="ti-link" className="text-muted2" />Share links</h3>
            {shares.filter((sh) => !sh.revoked).length === 0 ? (
              <p className="text-2xs text-muted2">No active share links. Use “Share link” below to create one.</p>
            ) : (
              <div className="space-y-1.5">
                {shares.filter((sh) => !sh.revoked).map((sh) => (
                  <div key={sh.id} className="flex items-center gap-2 text-2xs">
                    <Icon name="ti-world" className="text-muted2" />
                    <span className="font-mono text-muted2 truncate flex-1">/r/{sh.token.slice(0, 12)}…</span>
                    <span className="text-muted2"><Icon name="ti-eye" className="text-xs" /> {sh.views}</span>
                    <button className="btn btn-sm py-0 h-6" onClick={() => copyShare(sh.token)}><Icon name="ti-copy" className="text-xs" />Copy</button>
                    <button className="btn btn-sm btn-danger py-0 h-6" disabled={busy} onClick={() => revokeShare(sh.id)}>Revoke</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </Layout>
  );
}

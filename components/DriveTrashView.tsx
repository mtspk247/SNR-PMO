import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { Drive, DriveFile, DriveFolder, listArchived, restoreFile, restoreFolder, deleteDriveFile, deleteFolder } from '@/lib/db';

const fmtBytes = (n?: number | null) => { if (!n) return '—'; const u = ['B', 'KB', 'MB', 'GB']; let i = 0, v = n; while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; } return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`; };
const fmtDate = (s?: string | null) => { if (!s) return ''; const d = new Date(s); return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };

// Drive Trash — archived (soft-deleted) folders & files for this drive, with Restore and
// permanent Delete. Reuses the same RLS-enforced helpers as before (restore = clear archived_at,
// delete = drive_can(manage)/creator gated); canEdit decides which items the user may act on.
export default function DriveTrashView({ drive, canEdit, fileIcon, onChange }: {
  drive: Drive; canEdit: (createdBy?: string | null) => boolean; fileIcon: (f: DriveFile) => string; onChange: () => void;
}) {
  const [data, setData] = useState<{ files: DriveFile[]; folders: DriveFolder[] } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  const load = () => listArchived(drive.id).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { setData(null); setErr(''); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [drive.id]);

  const restoreFolderOne = async (id: string) => { setBusy(true); setErr(''); try { await restoreFolder(id); load(); onChange(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const restoreFileOne = async (id: string) => { setBusy(true); setErr(''); try { await restoreFile(id); load(); onChange(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const deleteFolderOne = async (id: string, name: string) => { if (!confirm(`Permanently delete folder “${name}” and everything in it? This cannot be undone.`)) return; setBusy(true); setErr(''); try { await deleteFolder(id); load(); onChange(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const deleteFileOne = async (f: DriveFile) => { if (!confirm(`Permanently delete “${f.name}”? This cannot be undone.`)) return; setBusy(true); setErr(''); try { await deleteDriveFile(f); load(); onChange(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const emptyTrash = async () => {
    if (!data) return;
    const fd = data.folders.filter((f) => canEdit(f.created_by)); const fs = data.files.filter((f) => canEdit(f.created_by));
    if (!fd.length && !fs.length) { setErr('Nothing here you can delete.'); return; }
    if (!confirm(`Permanently delete ${fs.length} file(s) and ${fd.length} folder(s)? This cannot be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const f of fs) await deleteDriveFile(f); for (const f of fd) await deleteFolder(f.id); load(); onChange(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const empty = data && data.files.length === 0 && data.folders.length === 0;
  const total = data ? data.files.length + data.folders.length : 0;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="ti-trash" className="text-accentstrong" />
        <h3 className="text-sm font-medium">Trash</h3>
        {total > 0 && <span className="text-2xs text-muted2 hidden sm:inline">{total} item{total === 1 ? '' : 's'} · items stay here until you delete them</span>}
        {total > 0 && <button className="btn h-7 py-0 text-rose-600 ml-auto" disabled={busy} onClick={emptyTrash}><Icon name="ti-trash-x" className="text-sm" />Empty trash</button>}
      </div>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      {data === null ? <p className="text-2xs text-muted2 py-6 text-center">Loading…</p> :
        empty ? <div className="py-12 text-center text-muted2"><Icon name="ti-trash-off" className="text-3xl mb-2" /><p className="text-sm">Trash is empty.</p><p className="text-2xs">Items you delete from this drive land here first — restore them any time.</p></div> : (
          <div className="rounded-lg border border-line divide-y divide-line">
            {data.folders.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-surface2/50">
                <Icon name="ti-folder" className="text-amber-500 shrink-0" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="w-24 shrink-0 hidden sm:block text-2xs text-muted2 tabular-nums">{fmtDate(f.archived_at)}</span>
                {canEdit(f.created_by) ? (<>
                  <button className="btn h-7 py-0" disabled={busy} onClick={() => restoreFolderOne(f.id)}><Icon name="ti-arrow-back-up" className="text-sm" />Restore</button>
                  <button className="btn h-7 py-0 text-rose-600" disabled={busy} onClick={() => deleteFolderOne(f.id, f.name)} title="Delete forever"><Icon name="ti-trash" className="text-sm" /></button>
                </>) : <span className="text-2xs text-muted2">View only</span>}
              </div>
            ))}
            {data.files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-surface2/50">
                <Icon name={fileIcon(f)} className="text-muted shrink-0" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="w-16 shrink-0 hidden sm:block text-2xs text-muted2 tabular-nums">{fmtBytes(f.size_bytes)}</span>
                <span className="w-24 shrink-0 hidden sm:block text-2xs text-muted2 tabular-nums">{fmtDate(f.archived_at)}</span>
                {canEdit(f.created_by) ? (<>
                  <button className="btn h-7 py-0" disabled={busy} onClick={() => restoreFileOne(f.id)}><Icon name="ti-arrow-back-up" className="text-sm" />Restore</button>
                  <button className="btn h-7 py-0 text-rose-600" disabled={busy} onClick={() => deleteFileOne(f)} title="Delete forever"><Icon name="ti-trash" className="text-sm" /></button>
                </>) : <span className="text-2xs text-muted2">View only</span>}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listDrives, createDrive, deleteDrive, listFolders, createFolder, deleteFolder,
  listFiles, uploadDriveFile, driveFileUrl, deleteDriveFile, getDriveUsage, tenantLimit,
  getProjects, setDriveProject,
  Drive, DriveFolder, DriveFile,
} from '@/lib/db';
import { Project } from '@/lib/supabase';
import Select from '@/components/Select';

const fmtBytes = (n: number) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};
const fileIcon = (f: DriveFile) => {
  const m = f.mime_type || ''; if (f.kind === 'doc') return 'ti-file-text'; if (f.kind === 'sheet') return 'ti-table';
  if (m.startsWith('image/')) return 'ti-photo'; if (m.includes('pdf')) return 'ti-file-type-pdf';
  if (m.includes('zip') || m.includes('compressed')) return 'ti-file-zip'; return 'ti-file';
};

export default function DrivesPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'drives');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const [projects, setProjects] = useState<Project[]>([]);

  const [drives, setDrives] = useState<Drive[] | null>(null);
  const [active, setActive] = useState<Drive | null>(null);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [path, setPath] = useState<{ id: string | null; name: string }[]>([]);
  const [usage, setUsage] = useState<{ used: number; limitMb: number | null }>({ used: 0, limitMb: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [newDrive, setNewDrive] = useState<{ name: string; description: string } | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [showFolder, setShowFolder] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const currentFolderId = path.length ? path[path.length - 1].id : null;
  useEffect(() => { if (org?.id && enabled) getProjects(org.id).then(setProjects).catch(() => {}); }, [org?.id, enabled]);

  const loadUsage = () => { if (org) Promise.all([getDriveUsage(org.id), tenantLimit(org.id, 'storage_mb')]).then(([u, l]) => setUsage({ used: u, limitMb: l })).catch(() => {}); };
  const loadDrives = () => { if (!org) return; listDrives(org.id).then((d) => { setDrives(d); if (!active && d.length) selectDrive(d[0]); }).catch((e) => { setErr(e.message); setDrives([]); }); };
  useEffect(() => { if (org?.id && enabled) { loadDrives(); loadUsage(); } /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const selectDrive = (d: Drive) => { setActive(d); setPath([{ id: null, name: d.name }]); listFolders(d.id).then(setFolders).catch(() => {}); };
  useEffect(() => { if (active) { setFiles(null); listFiles(active.id, currentFolderId).then(setFiles).catch(() => setFiles([])); } /* eslint-disable-next-line */ }, [active?.id, currentFolderId]);

  const childFolders = useMemo(() => folders.filter((f) => f.parent_id === currentFolderId), [folders, currentFolderId]);

  const refreshHere = () => { if (active) { listFiles(active.id, currentFolderId).then(setFiles).catch(() => {}); listFolders(active.id).then(setFolders).catch(() => {}); loadUsage(); } };

  const addDrive = async () => {
    if (!org || !me || !newDrive?.name.trim() || busy) return;
    setBusy(true); setErr('');
    try { const d = await createDrive({ org_id: org.id, name: newDrive.name.trim(), description: newDrive.description.trim() || undefined, created_by: me.id }); setNewDrive(null); setDrives((p) => [...(p || []), d]); selectDrive(d); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const addFolder = async () => {
    if (!org || !me || !active || !newFolder.trim() || busy) return;
    setBusy(true); setErr('');
    try { await createFolder({ org_id: org.id, drive_id: active.id, parent_id: currentFolderId, name: newFolder.trim(), created_by: me.id }); setNewFolder(''); setShowFolder(false); refreshHere(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const onUpload = async (list: FileList | null) => {
    if (!org || !me || !active || !list || !list.length) return;
    setBusy(true); setErr('');
    try { for (const file of Array.from(list)) await uploadDriveFile({ org_id: org.id, drive_id: active.id, folder_id: currentFolderId, file, created_by: me.id }); refreshHere(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  };
  const download = async (f: DriveFile) => { if (!f.storage_path) return; try { const url = await driveFileUrl(f.storage_path); window.open(url, '_blank'); } catch (e: any) { setErr(e.message); } };
  const delFile = async (f: DriveFile) => { if (!confirm(`Delete "${f.name}"?`)) return; setBusy(true); try { await deleteDriveFile(f); refreshHere(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const delFolder = async (f: DriveFolder) => { if (!confirm(`Delete folder "${f.name}" and everything in it?`)) return; setBusy(true); try { await deleteFolder(f.id); refreshHere(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const delDrive = async (d: Drive) => { if (!confirm(`Delete drive "${d.name}" and all its contents?`)) return; setBusy(true); try { await deleteDrive(d.id); const left = (drives || []).filter((x) => x.id !== d.id); setDrives(left); setActive(null); setFiles(null); if (left.length) selectDrive(left[0]); loadUsage(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

  if (!enabled) return <Layout flat title="Drives"><EmptyState icon="ti-cloud-off" title="Drives not in your plan" text="Upgrade your plan to use cloud storage." /></Layout>;

  const limitBytes = usage.limitMb != null ? usage.limitMb * 1024 * 1024 : null;
  const pct = limitBytes ? Math.min(100, Math.round((usage.used / limitBytes) * 100)) : 0;

  return (
    <Layout flat title="Drives">
      <PageHeader title="Drives" subtitle="Your team’s cloud storage — drives, folders, and files" icon="ti-cloud"
        action={<button className="btn btn-primary" onClick={() => setNewDrive({ name: '', description: '' })}><Icon name="ti-plus" />New drive</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="card p-3 mb-4 max-w-md">
        <div className="flex items-center justify-between text-2xs text-muted mb-1">
          <span>Storage used</span>
          <span>{fmtBytes(usage.used)}{limitBytes ? ` of ${fmtBytes(limitBytes)}` : ''}</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface2"><div className={`h-1.5 rounded-full ${pct > 90 ? 'bg-rose-500' : 'bg-accent'}`} style={{ width: `${pct}%` }} /></div>
      </div>

      {drives === null ? <Spinner /> : (
        <div className="grid lg:grid-cols-[16rem_1fr] gap-4">
          {/* Drives list */}
          <div className="card p-2 h-max">
            <p className="text-2xs uppercase tracking-wide text-muted2 px-2 py-1.5">Drives</p>
            {drives.length === 0 ? <p className="text-2xs text-muted2 px-2 py-2">No drives yet.</p> : drives.map((d) => (
              <div key={d.id} className={`group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer ${active?.id === d.id ? 'bg-accent/10 text-accentstrong' : 'hover:bg-surface2'}`} onClick={() => selectDrive(d)}>
                <Icon name="ti-folders" className="text-sm shrink-0" />
                <span className="text-sm truncate flex-1">{d.name}</span>
                {d.project_id && <Icon name="ti-users" className="text-2xs text-accentstrong shrink-0" title="Shared with client portal" />}
                <button onClick={(e) => { e.stopPropagation(); delDrive(d); }} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500" title="Delete drive"><Icon name="ti-trash" className="text-xs" /></button>
              </div>
            ))}
          </div>

          {/* Contents */}
          <div className="card overflow-hidden">
            {!active ? <div className="p-8"><EmptyState icon="ti-folders" text="Select or create a drive." /></div> : (
              <>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-line flex-wrap">
                  <div className="flex items-center gap-1 text-sm mr-auto min-w-0 flex-wrap">
                    {path.map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        {i > 0 && <Icon name="ti-chevron-right" className="text-2xs text-muted2" />}
                        <button onClick={() => setPath((p) => p.slice(0, i + 1))} className={`truncate max-w-[12rem] ${i === path.length - 1 ? 'font-medium text-content' : 'text-muted hover:text-content'}`}>{c.name}</button>
                      </span>
                    ))}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1.5 mr-1">
                      <span className="text-2xs text-muted2 hidden sm:inline">Client portal:</span>
                      <Select width={210} value={active?.project_id || ''}
                        onChange={(v) => { if (!active) return; const did = active.id; const pid = v || null; setDriveProject(did, pid).then(() => { setActive((a) => (a ? { ...a, project_id: pid } : a)); setDrives((ds) => (ds || []).map((x) => (x.id === did ? { ...x, project_id: pid } : x))); }).catch((e) => setErr(e.message)); }}
                        options={[{ value: '', label: 'Not shared' }, ...projects.map((pr) => ({ value: pr.id, label: pr.name }))]} />
                    </div>
                  )}
                  <button className="btn h-8 py-0" onClick={() => setShowFolder(true)}><Icon name="ti-folder-plus" className="text-sm" />New folder</button>
                  <button className="btn btn-primary h-8 py-0" disabled={busy} onClick={() => fileInput.current?.click()}><Icon name="ti-upload" className="text-sm" />Upload</button>
                  <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
                </div>

                {files === null ? <div className="p-8"><Spinner /></div> : (childFolders.length === 0 && files.length === 0) ? (
                  <div className="p-10"><EmptyState icon="ti-folder-open" text="This folder is empty — upload a file or create a folder." /></div>
                ) : (
                  <div className="divide-y divide-line">
                    {childFolders.map((f) => (
                      <div key={f.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface2/50">
                        <Icon name="ti-folder" className="text-amber-500" />
                        <button className="text-sm text-content font-medium truncate flex-1 text-left hover:text-accentstrong" onClick={() => setPath((p) => [...p, { id: f.id, name: f.name }])}>{f.name}</button>
                        <button onClick={() => delFolder(f)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500"><Icon name="ti-trash" className="text-sm" /></button>
                      </div>
                    ))}
                    {files.map((f) => (
                      <div key={f.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface2/50">
                        <Icon name={fileIcon(f)} className="text-muted" />
                        <button className="text-sm text-content truncate flex-1 text-left hover:text-accentstrong" onClick={() => download(f)}>{f.name}</button>
                        <span className="text-2xs text-muted2 shrink-0 tabular-nums">{fmtBytes(f.size_bytes)}</span>
                        <button onClick={() => download(f)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-content" title="Download"><Icon name="ti-download" className="text-sm" /></button>
                        <button onClick={() => delFile(f)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500" title="Delete"><Icon name="ti-trash" className="text-sm" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {newDrive && (
        <Modal open onClose={() => setNewDrive(null)} title="New drive" icon="ti-folders" size="sm" onSubmit={() => addDrive()}
          footer={<><button className="btn" onClick={() => setNewDrive(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !newDrive.name.trim()} onClick={addDrive}>{busy ? 'Creating…' : 'Create drive'}</button></>}>
          <Field label="Name" required><input className="input" autoFocus value={newDrive.name} onChange={(e) => setNewDrive({ ...newDrive, name: e.target.value })} placeholder="e.g. Marketing" /></Field>
          <Field label="Description"><input className="input" value={newDrive.description} onChange={(e) => setNewDrive({ ...newDrive, description: e.target.value })} placeholder="Optional" /></Field>
        </Modal>
      )}
      {showFolder && (
        <Modal open onClose={() => setShowFolder(false)} title="New folder" icon="ti-folder-plus" size="sm" onSubmit={() => addFolder()}
          footer={<><button className="btn" onClick={() => setShowFolder(false)}>Cancel</button><button className="btn btn-primary" disabled={busy || !newFolder.trim()} onClick={addFolder}>{busy ? 'Creating…' : 'Create folder'}</button></>}>
          <Field label="Folder name" required><input className="input" autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="e.g. Q3 assets" /></Field>
        </Modal>
      )}
    </Layout>
  );
}

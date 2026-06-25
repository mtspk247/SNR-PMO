import { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listDrives, createDrive, deleteDrive, listFolders, createFolder, deleteFolder,
  listFiles, uploadDriveFile, driveFileUrl, deleteDriveFile, getDriveUsage, tenantLimit,
  getProjects, setDriveProject, moveFolder, moveFile, createDoc, saveDoc, getDriveLevel, getOrgUsers,
  archiveFile, restoreFile, archiveFolder, restoreFolder, listArchived, listAccessRequests,
  Drive, DriveFolder, DriveFile, DriveLevel,
} from '@/lib/db';
import { Project, OrgUser } from '@/lib/supabase';
import Select from '@/components/Select';
import dynamic from 'next/dynamic';

const CollabDocEditor = dynamic(() => import('@/components/CollabDocEditor'), { ssr: false, loading: () => <div className="p-8 text-sm text-muted2">Loading editor…</div> });
import DriveShareModal from '@/components/DriveShareModal';
import DriveComments from '@/components/DriveComments';
import DriveActivityModal from '@/components/DriveActivityModal';
import DriveAccessModal from '@/components/DriveAccessModal';
import DriveRequestsModal from '@/components/DriveRequestsModal';

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
const isImage = (f: DriveFile) => (f.mime_type || '').startsWith('image/');
const isPdf = (f: DriveFile) => (f.mime_type || '').includes('pdf');
const OFFICE_RE = /\.(docx?|xlsx?|pptx?)$/i;
const isOffice = (f: DriveFile) => { const m = f.mime_type || ''; return m.includes('officedocument') || m.includes('msword') || m.includes('ms-excel') || m.includes('ms-powerpoint') || OFFICE_RE.test(f.name || ''); };
const dtHasFiles = (e: React.DragEvent) => { try { return Array.from(e.dataTransfer.types || []).includes('Files'); } catch { return false; } };

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [usage, setUsage] = useState<{ used: number; limitMb: number | null }>({ used: 0, limitMb: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [newDrive, setNewDrive] = useState<{ name: string; description: string } | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [showFolder, setShowFolder] = useState(false);
  const [moving, setMoving] = useState<{ kind: 'folder' | 'file'; id: string; name: string; parent: string | null } | null>(null);
  const [preview, setPreview] = useState<{ name: string; type: 'image' | 'pdf' | 'office'; url: string; raw?: string } | null>(null);
  const [docEd, setDocEd] = useState<{ id: string; name: string } | null>(null);
  const [level, setLevel] = useState<DriveLevel | null>(null);
  const [people, setPeople] = useState<OrgUser[]>([]);
  const [shareFor, setShareFor] = useState<Drive | null>(null);
  const [commentsFor, setCommentsFor] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'size' | 'created' | 'modified'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; kind: 'file' | 'folder'; item: any } | null>(null);
  const [bulkMove, setBulkMove] = useState(false);
  const [archived, setArchived] = useState<{ files: DriveFile[]; folders: DriveFolder[] } | null>(null);
  const [activityFor, setActivityFor] = useState<{ id: string; name: string; kind: 'file' | 'folder' } | null>(null);
  const [accessFor, setAccessFor] = useState<{ kind: 'file' | 'folder'; id: string; name: string; drive_id: string; folder_id?: string | null } | null>(null);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [pendingReq, setPendingReq] = useState(0);
  const [over, setOver] = useState<string | null>(null); // drop-target highlight: folder id or '__root__'
  const dragRef = useRef<{ kind: 'folder' | 'file'; id: string; parent: string | null } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const currentFolderId = path.length ? path[path.length - 1].id : null;
  useEffect(() => { if (org?.id && enabled) { getProjects(org.id).then(setProjects).catch(() => {}); getOrgUsers(org.id).then(setPeople).catch(() => {}); } }, [org?.id, enabled]);

  const loadUsage = () => { if (org) Promise.all([getDriveUsage(org.id), tenantLimit(org.id, 'storage_mb')]).then(([u, l]) => setUsage({ used: u, limitMb: l })).catch(() => {}); };
  const loadDrives = () => { if (!org) return; listDrives(org.id).then((d) => { setDrives(d); if (!active && d.length) selectDrive(d[0]); }).catch((e) => { setErr(e.message); setDrives([]); }); };
  useEffect(() => { if (org?.id && enabled) { loadDrives(); loadUsage(); } /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const selectDrive = (d: Drive) => { setActive(d); setPath([{ id: null, name: d.name }]); setExpanded({}); setLevel(null); getDriveLevel(d.id).then(setLevel).catch(() => setLevel(null)); listAccessRequests({ driveId: d.id, status: 'pending' }).then((r) => setPendingReq(r.length)).catch(() => setPendingReq(0)); listFolders(d.id).then(setFolders).catch(() => {}); };
  useEffect(() => { if (active) { setFiles(null); listFiles(active.id, currentFolderId).then(setFiles).catch(() => setFiles([])); } /* eslint-disable-next-line */ }, [active?.id, currentFolderId]);
  useEffect(() => { setSelected(new Set()); setMenu(null); }, [active?.id, currentFolderId]);

  // ---- Tree helpers ----
  const childrenOf = (pid: string | null) => folders.filter((f) => f.parent_id === pid);
  const folderById = useMemo(() => { const m: Record<string, DriveFolder> = {}; folders.forEach((f) => (m[f.id] = f)); return m; }, [folders]);
  const pathTo = (folderId: string | null): { id: string | null; name: string }[] => {
    const root = { id: null as string | null, name: active?.name || 'Drive' };
    if (!folderId) return [root];
    const chain: DriveFolder[] = []; const guard = new Set<string>();
    let cur: DriveFolder | undefined = folderById[folderId];
    while (cur && !guard.has(cur.id)) { guard.add(cur.id); chain.unshift(cur); cur = cur.parent_id ? folderById[cur.parent_id] : undefined; }
    return [root, ...chain.map((c) => ({ id: c.id as string | null, name: c.name }))];
  };
  const navTo = (folderId: string | null) => setPath(pathTo(folderId));
  const descendantIds = (folderId: string) => {
    const out = new Set<string>(); const stack = [folderId];
    while (stack.length) { const id = stack.pop() as string; childrenOf(id).forEach((c) => { if (!out.has(c.id)) { out.add(c.id); stack.push(c.id); } }); }
    return out;
  };

  const childFolders = useMemo(() => folders.filter((f) => f.parent_id === currentFolderId), [folders, currentFolderId]);
  const canEdit = (createdBy?: string | null) => isAdmin || (!!me && !!createdBy && createdBy === me.id);

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
  // Upload one or more files into a specific folder (or the drive root).
  const uploadFilesTo = async (folderId: string | null, list: FileList | null) => {
    if (!org || !me || !active || !list || !list.length) return;
    setBusy(true); setErr('');
    try { for (const file of Array.from(list)) await uploadDriveFile({ org_id: org.id, drive_id: active.id, folder_id: folderId, file, created_by: me.id }); if (folderId) setExpanded((e) => ({ ...e, [folderId]: true })); refreshHere(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  };
  const onUpload = (list: FileList | null) => uploadFilesTo(currentFolderId, list);

  const openDoc = (f: DriveFile) => setDocEd({ id: f.id, name: f.name });
  const newDoc = async () => {
    if (!org || !me || !active || busy) return;
    setBusy(true); setErr('');
    try { const d = await createDoc({ org_id: org.id, drive_id: active.id, folder_id: currentFolderId, name: 'Untitled document', created_by: me.id }); refreshHere(); setDocEd({ id: d.id, name: d.name }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const renameDoc = async (name: string) => {
    if (!docEd) return;
    try { await saveDoc(docEd.id, { name }); setDocEd((d) => (d ? { ...d, name } : d)); refreshHere(); }
    catch (e: any) { setErr(e.message); }
  };
  // Click a file: open docs in the editor, preview images/PDFs in-browser, otherwise download.
  const openFile = async (f: DriveFile) => {
    if (f.kind === 'doc') { openDoc(f); return; }
    if (!f.storage_path) return;
    try {
      const url = await driveFileUrl(f.storage_path);
      if (isImage(f)) setPreview({ name: f.name, type: 'image', url });
      else if (isPdf(f)) setPreview({ name: f.name, type: 'pdf', url });
      else if (isOffice(f)) setPreview({ name: f.name, type: 'office', url: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`, raw: url });
      else window.open(url, '_blank');
    } catch (e: any) { setErr(e.message); }
  };
  const download = async (f: DriveFile) => { if (!f.storage_path) return; try { const url = await driveFileUrl(f.storage_path); window.open(url, '_blank'); } catch (e: any) { setErr(e.message); } };
  const delFile = async (f: DriveFile) => { if (!confirm(`Delete "${f.name}"?`)) return; setBusy(true); try { await deleteDriveFile(f); refreshHere(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const delFolder = async (f: DriveFolder) => { if (!confirm(`Delete folder "${f.name}" and everything in it?`)) return; setBusy(true); try { await deleteFolder(f.id); refreshHere(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const delDrive = async (d: Drive) => { if (!confirm(`Delete drive "${d.name}" and all its contents?`)) return; setBusy(true); try { await deleteDrive(d.id); const left = (drives || []).filter((x) => x.id !== d.id); setDrives(left); setActive(null); setFiles(null); if (left.length) selectDrive(left[0]); loadUsage(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

  // ---- Move (picker + drag-and-drop), RBAC/RLS-enforced server-side ----
  const invalidDest = useMemo(() => {
    if (!moving || moving.kind !== 'folder') return new Set<string>();
    const d = descendantIds(moving.id); d.add(moving.id); return d;
    /* eslint-disable-next-line */
  }, [moving, folders]);
  const doMove = async (destFolderId: string | null) => {
    if (!moving || busy) return;
    if (destFolderId && invalidDest.has(destFolderId)) return;
    setBusy(true); setErr('');
    try {
      if (moving.kind === 'folder') await moveFolder(moving.id, destFolderId);
      else await moveFile(moving.id, destFolderId);
      if (destFolderId) setExpanded((e) => ({ ...e, [destFolderId]: true }));
      setMoving(null); refreshHere();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  // Drag-and-drop move: drop the dragged item onto a destination folder (null = root).
  const dragMoveTo = async (destId: string | null) => {
    const it = dragRef.current; dragRef.current = null; setOver(null);
    if (!it) return;
    if (it.kind === 'folder') { if (destId === it.id) return; if (destId && descendantIds(it.id).has(destId)) return; }
    if (destId === it.parent) return; // already there
    setBusy(true); setErr('');
    try { if (it.kind === 'folder') await moveFolder(it.id, destId); else await moveFile(it.id, destId); if (destId) setExpanded((e) => ({ ...e, [destId]: true })); refreshHere(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const startDrag = (item: { kind: 'folder' | 'file'; id: string; parent: string | null }) => (e: React.DragEvent) => { dragRef.current = item; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id); } catch { /* noop */ } };
  const endDrag = () => { dragRef.current = null; setOver(null); };
  const overIf = (key: string) => (e: React.DragEvent) => { if (dragRef.current || dtHasFiles(e)) { e.preventDefault(); setOver(key); } };
  // Drop onto a folder: internal move OR upload OS files into that folder.
  const dropOnFolder = (folderId: string) => (e: React.DragEvent) => {
    if (dragRef.current) { e.preventDefault(); e.stopPropagation(); dragMoveTo(folderId); }
    else if (dtHasFiles(e)) { e.preventDefault(); e.stopPropagation(); setOver(null); uploadFilesTo(folderId, e.dataTransfer.files); }
  };
  // Drop on the open pane: internal move to current folder OR upload OS files here.
  const dropOnPane = (e: React.DragEvent) => {
    if (dragRef.current) { e.preventDefault(); dragMoveTo(currentFolderId); }
    else if (dtHasFiles(e)) { e.preventDefault(); setOver(null); uploadFilesTo(currentFolderId, e.dataTransfer.files); }
  };

  // ---- Slice 1: search, sort, multi-select, bulk, context menu ----
  const q = query.trim().toLowerCase();
  const matchesQ = (n: string) => !q || (n || '').toLowerCase().includes(q);
  const cmp = (a: any, b: any) => {
    let r = 0;
    if (sortKey === 'size') r = (a.size_bytes || 0) - (b.size_bytes || 0);
    else if (sortKey === 'created') r = (a.created_at || '').localeCompare(b.created_at || '');
    else if (sortKey === 'modified') r = ((a.updated_at || a.created_at) || '').localeCompare((b.updated_at || b.created_at) || '');
    else r = (a.name || '').localeCompare(b.name || '');
    return sortDir === 'asc' ? r : -r;
  };
  const shownFolders = childFolders.filter((f) => matchesQ(f.name)).slice().sort(cmp);
  const shownFiles = (files || []).filter((f) => matchesQ(f.name)).slice().sort(cmp);
  const kfile = (id: string) => 'f:' + id; const kfold = (id: string) => 'd:' + id;
  const isSel = (k: string) => selected.has(k);
  const toggleSel = (k: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const clearSel = () => setSelected(new Set());
  const allKeys = [...shownFolders.map((f) => kfold(f.id)), ...shownFiles.map((f) => kfile(f.id))];
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allKeys));
  const selFiles = () => (files || []).filter((f) => selected.has(kfile(f.id)));
  const selFolders = () => folders.filter((f) => selected.has(kfold(f.id)));
  const bulkInvalid = (() => { const set = new Set<string>(); selFolders().forEach((f) => { set.add(f.id); descendantIds(f.id).forEach((d) => set.add(d)); }); return set; })();
  const bulkDownload = async () => { for (const f of selFiles()) { if (!f.storage_path) continue; try { const u = await driveFileUrl(f.storage_path); window.open(u, '_blank'); } catch { /* skip */ } } };
  const bulkDelete = async () => {
    const fs = selFiles().filter((f) => canEdit(f.created_by)); const fd = selFolders().filter((f) => canEdit(f.created_by));
    if (!fs.length && !fd.length) { setErr('You can only delete items you created (or as an admin).'); return; }
    if (!confirm(`Delete ${fs.length} file(s) and ${fd.length} folder(s)? This cannot be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const f of fs) await deleteDriveFile(f); for (const f of fd) await deleteFolder(f.id); clearSel(); refreshHere(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const bulkArchive = async () => {
    const fs = selFiles().filter((f) => canEdit(f.created_by)); const fd = selFolders().filter((f) => canEdit(f.created_by));
    if (!fs.length && !fd.length) { setErr('You can only archive items you created (or as an admin).'); return; }
    setBusy(true); setErr('');
    try { for (const f of fs) await archiveFile(f.id); for (const f of fd) await archiveFolder(f.id); clearSel(); refreshHere(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const bulkMoveTo = async (dest: string | null) => {
    setBusy(true); setErr('');
    try {
      for (const f of selFolders()) { if (!canEdit(f.created_by) || f.id === dest || (dest && descendantIds(f.id).has(dest))) continue; await moveFolder(f.id, dest); }
      for (const f of selFiles()) { if (canEdit(f.created_by)) await moveFile(f.id, dest); }
      setBulkMove(false); clearSel(); if (dest) setExpanded((e) => ({ ...e, [dest]: true })); refreshHere();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const ctxItems = (m: { kind: 'file' | 'folder'; item: any }) => {
    const it = m.item; const ed = canEdit(it.created_by);
    const out: { icon: string; label: string; run: () => void; danger?: boolean }[] = [];
    out.push(m.kind === 'folder' ? { icon: 'ti-folder-open', label: 'Open', run: () => navTo(it.id) } : { icon: 'ti-eye', label: 'Open', run: () => openFile(it) });
    if (m.kind === 'file') out.push({ icon: 'ti-download', label: 'Download', run: () => download(it) });
    out.push({ icon: 'ti-message-circle', label: 'Comments', run: () => setCommentsFor({ id: it.id, name: it.name }) });
    out.push({ icon: 'ti-history', label: 'Activity', run: () => setActivityFor({ id: it.id, name: it.name, kind: m.kind }) });
    out.push({ icon: 'ti-shield-lock', label: 'Access', run: () => setAccessFor({ kind: m.kind, id: it.id, name: it.name, drive_id: it.drive_id, folder_id: m.kind === 'file' ? it.folder_id : null }) });
    if (ed) out.push({ icon: 'ti-arrows-move', label: 'Move', run: () => setMoving({ kind: m.kind, id: it.id, name: it.name, parent: m.kind === 'folder' ? it.parent_id : it.folder_id }) });
    if (ed) out.push({ icon: 'ti-archive', label: 'Archive', run: () => (m.kind === 'folder' ? archiveFolder(it.id) : archiveFile(it.id)).then(refreshHere).catch((e: any) => setErr(e.message)) });
    if (ed) out.push({ icon: 'ti-trash', label: 'Delete', danger: true, run: () => (m.kind === 'folder' ? delFolder(it) : delFile(it)) });
    return out;
  };

  if (!enabled) return <Layout flat title="Drives"><EmptyState icon="ti-cloud-off" title="Drives not in your plan" text="Upgrade your plan to use cloud storage." /></Layout>;

  const limitBytes = usage.limitMb != null ? usage.limitMb * 1024 * 1024 : null;
  const pct = limitBytes ? Math.min(100, Math.round((usage.used / limitBytes) * 100)) : 0;
  const docCanEdit = level === 'editor' || level === 'manage';

  const renderTree = (parentId: string | null, depth: number) => childrenOf(parentId).map((f) => {
    const kids = childrenOf(f.id); const open = !!expanded[f.id]; const cur = currentFolderId === f.id;
    return (
      <div key={f.id}>
        <div draggable={canEdit(f.created_by)} onDragStart={startDrag({ kind: 'folder', id: f.id, parent: f.parent_id })} onDragEnd={endDrag}
          onDragOver={overIf(f.id)} onDragLeave={() => setOver((o) => (o === f.id ? null : o))} onDrop={dropOnFolder(f.id)}
          className={`group flex items-center gap-1 rounded-md pr-1 ${cur ? 'bg-accent/10 text-accentstrong' : 'hover:bg-surface2'} ${over === f.id ? 'ring-2 ring-accent' : ''}`} style={{ paddingLeft: depth * 12 + 2 }}>
          <button onClick={() => setExpanded((e) => ({ ...e, [f.id]: !open }))} className={`w-4 h-6 grid place-items-center text-muted2 shrink-0 ${kids.length ? '' : 'invisible'}`} title={open ? 'Collapse' : 'Expand'}>
            <Icon name={open ? 'ti-chevron-down' : 'ti-chevron-right'} className="text-2xs" />
          </button>
          <Icon name={cur ? 'ti-folder-open' : 'ti-folder'} className="text-amber-500 text-sm shrink-0" />
          <button onClick={() => navTo(f.id)} className="text-sm truncate flex-1 text-left py-1">{f.name}</button>
        </div>
        {open && kids.length > 0 && renderTree(f.id, depth + 1)}
      </div>
    );
  });

  const renderMoveTargets = (parentId: string | null, depth: number): any[] => childrenOf(parentId).flatMap((f) => {
    const bad = invalidDest.has(f.id); const isParent = moving?.parent === f.id;
    return [
      <button key={f.id} disabled={busy || bad || isParent} onClick={() => doMove(f.id)} style={{ paddingLeft: depth * 14 + 12 }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface2 disabled:opacity-40 disabled:cursor-not-allowed text-left">
        <Icon name="ti-folder" className="text-amber-500 shrink-0" />
        <span className="truncate flex-1">{f.name}</span>
        {isParent && <span className="text-2xs text-muted2 shrink-0">current</span>}
      </button>,
      ...renderMoveTargets(f.id, depth + 1),
    ];
  });

  const renderBulkMoveTargets = (parentId: string | null, depth: number): any[] => childrenOf(parentId).flatMap((f) => [
    <button key={f.id} disabled={busy || bulkInvalid.has(f.id)} onClick={() => bulkMoveTo(f.id)} style={{ paddingLeft: depth * 14 + 12 }}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface2 disabled:opacity-40 disabled:cursor-not-allowed text-left">
      <Icon name="ti-folder" className="text-amber-500 shrink-0" /><span className="truncate flex-1">{f.name}</span>
    </button>,
    ...renderBulkMoveTargets(f.id, depth + 1),
  ]);

  return (
    <Layout flat title="Drives">
      <PageHeader title="Drives" subtitle="Your team’s cloud storage — drag to move, drop files to upload" icon="ti-cloud" help="drives"
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
          <div className="card p-2 h-max">
            <p className="text-2xs uppercase tracking-wide text-muted2 px-2 py-1.5">Drives</p>
            {drives.length === 0 ? <p className="text-2xs text-muted2 px-2 py-2">No drives yet.</p> : drives.map((d) => (
              <div key={d.id} className={`group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer ${active?.id === d.id ? 'bg-accent/10 text-accentstrong' : 'hover:bg-surface2'}`} onClick={() => selectDrive(d)}>
                <Icon name="ti-folders" className="text-sm shrink-0" />
                <span className="text-sm truncate flex-1">{d.name}</span>
                {d.project_id && <Icon name="ti-users" className="text-2xs text-accentstrong shrink-0" title="Shared with client portal" />}
                {canEdit(d.created_by) && <button onClick={(e) => { e.stopPropagation(); delDrive(d); }} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500" title="Delete drive"><Icon name="ti-trash" className="text-xs" /></button>}
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            {!active ? <div className="p-8"><EmptyState icon="ti-folders" text="Select or create a drive." /></div> : (
              <>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-line flex-wrap">
                  <div className="flex items-center gap-1 text-sm mr-auto min-w-0 flex-wrap">
                    {path.map((c, i) => {
                      const key = c.id === null ? '__root__' : c.id;
                      return (
                        <span key={i} className="inline-flex items-center gap-1">
                          {i > 0 && <Icon name="ti-chevron-right" className="text-2xs text-muted2" />}
                          <button onClick={() => setPath((p) => p.slice(0, i + 1))}
                            onDragOver={overIf(key)} onDragLeave={() => setOver((o) => (o === key ? null : o))}
                            onDrop={(e) => { if (dragRef.current) { e.preventDefault(); dragMoveTo(c.id); } }}
                            className={`truncate max-w-[12rem] rounded px-1 ${i === path.length - 1 ? 'font-medium text-content' : 'text-muted hover:text-content'} ${over === key ? 'ring-2 ring-accent' : ''}`}>{c.name}</button>
                        </span>
                      );
                    })}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1.5 mr-1">
                      <span className="text-2xs text-muted2 hidden sm:inline">Client portal:</span>
                      <Select width={210} value={active?.project_id || ''}
                        onChange={(v) => { if (!active) return; const did = active.id; const pid = v || null; setDriveProject(did, pid).then(() => { setActive((a) => (a ? { ...a, project_id: pid } : a)); setDrives((ds) => (ds || []).map((x) => (x.id === did ? { ...x, project_id: pid } : x))); }).catch((e) => setErr(e.message)); }}
                        options={[{ value: '', label: 'Not shared' }, ...projects.map((pr) => ({ value: pr.id, label: pr.name }))]} />
                    </div>
                  )}
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="input h-8 py-0 w-36 hidden sm:block" />
                  <Select width={120} value={sortKey} onChange={(v) => setSortKey(v as any)} options={[{ value: 'name', label: 'Name' }, { value: 'size', label: 'Size' }, { value: 'created', label: 'Created' }, { value: 'modified', label: 'Modified' }]} />
                  <button className="btn h-8 py-0 px-2" title={sortDir === 'asc' ? 'Ascending' : 'Descending'} onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}><Icon name={sortDir === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'} className="text-sm" /></button>
                  <button className="btn h-8 py-0 px-2" title="Select all" onClick={toggleAll}><Icon name={allSelected ? 'ti-checkbox' : 'ti-square'} className="text-sm" /></button>
                  <button className="btn h-8 py-0" disabled={busy} onClick={newDoc}><Icon name="ti-file-text" className="text-sm" />New doc</button>
                  <button className="btn h-8 py-0" onClick={() => setShowFolder(true)}><Icon name="ti-folder-plus" className="text-sm" />New folder</button>
                  <button className="btn h-8 py-0" disabled={!active} onClick={() => { if (active) listArchived(active.id).then(setArchived).catch((e) => setErr(e.message)); }}><Icon name="ti-archive" className="text-sm" />Archived</button>
                  {(level === 'manage' || isAdmin) && <button className="btn h-8 py-0" onClick={() => setRequestsOpen(true)}><Icon name="ti-inbox" className="text-sm" />Requests{pendingReq > 0 && <span className="ml-1 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-accent text-white text-2xs">{pendingReq}</span>}</button>}
                  {(level === 'manage' || isAdmin) && <button className="btn h-8 py-0" onClick={() => active && setShareFor(active)}><Icon name="ti-user-share" className="text-sm" />Share</button>}
                  <button className="btn btn-primary h-8 py-0" disabled={busy} onClick={() => fileInput.current?.click()}><Icon name="ti-upload" className="text-sm" />Upload</button>
                  <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
                </div>

                <div className="grid md:grid-cols-[14rem_1fr]">
                  <div className="border-b md:border-b-0 md:border-r border-line p-2 overflow-auto md:max-h-[calc(100vh-15rem)]">
                    <button onClick={() => navTo(null)} onDragOver={overIf('__root__')} onDragLeave={() => setOver((o) => (o === '__root__' ? null : o))} onDrop={(e) => { if (dragRef.current) { e.preventDefault(); dragMoveTo(null); } }}
                      className={`w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm ${currentFolderId === null ? 'bg-accent/10 text-accentstrong' : 'hover:bg-surface2'} ${over === '__root__' ? 'ring-2 ring-accent' : ''}`}>
                      <Icon name="ti-folders" className="text-sm shrink-0" />
                      <span className="truncate flex-1 text-left font-medium">{active.name}</span>
                    </button>
                    {renderTree(null, 0)}
                    {folders.length === 0 && <p className="text-2xs text-muted2 px-2 py-2">No folders yet.</p>}
                  </div>

                  <div onDragOver={(e) => { if (dragRef.current || dtHasFiles(e)) { e.preventDefault(); setOver('__pane__'); } }} onDragLeave={() => setOver((o) => (o === '__pane__' ? null : o))} onDrop={dropOnPane}
                    className={over === '__pane__' ? 'bg-accent/5 ring-2 ring-inset ring-accent/40' : ''}>
                    {selected.size > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2 border-b border-line bg-surface2/60 text-sm sticky top-0 z-10">
                        <span className="font-medium">{selected.size} selected</span>
                        <button className="btn h-7 py-0" disabled={busy} onClick={() => setBulkMove(true)}><Icon name="ti-arrows-move" className="text-sm" />Move</button>
                        <button className="btn h-7 py-0" disabled={busy} onClick={bulkDownload}><Icon name="ti-download" className="text-sm" />Download</button>
                        <button className="btn h-7 py-0" disabled={busy} onClick={bulkArchive}><Icon name="ti-archive" className="text-sm" />Archive</button>
                        <button className="btn h-7 py-0 text-rose-600" disabled={busy} onClick={bulkDelete}><Icon name="ti-trash" className="text-sm" />Delete</button>
                        <button className="btn h-7 py-0 ml-auto" onClick={clearSel}>Clear</button>
                      </div>
                    )}
                    {files === null ? <div className="p-8"><Spinner /></div> : (shownFolders.length === 0 && shownFiles.length === 0) ? (
                      <div className="p-10"><EmptyState icon="ti-folder-open" text={q ? 'No files or folders match your search.' : 'This folder is empty — drop files here to upload, or create a folder.'} /></div>
                    ) : (
                      <div className="divide-y divide-line">
                        {shownFolders.map((f) => (
                          <div key={f.id} draggable={canEdit(f.created_by)} onDragStart={startDrag({ kind: 'folder', id: f.id, parent: f.parent_id })} onDragEnd={endDrag}
                            onDragOver={overIf(f.id)} onDragLeave={() => setOver((o) => (o === f.id ? null : o))} onDrop={dropOnFolder(f.id)}
                            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, kind: 'folder', item: f }); }}
                            className={`group flex items-center gap-3 px-4 py-2.5 hover:bg-surface2/50 ${isSel(kfold(f.id)) ? 'bg-accent/5' : ''} ${over === f.id ? 'ring-2 ring-inset ring-accent' : ''}`}>
                            <input type="checkbox" className={`shrink-0 ${selected.size ? '' : 'opacity-0 group-hover:opacity-100'}`} checked={isSel(kfold(f.id))} onChange={() => toggleSel(kfold(f.id))} onClick={(e) => e.stopPropagation()} />
                            <Icon name="ti-folder" className="text-amber-500" />
                            <button className="text-sm text-content font-medium truncate flex-1 text-left hover:text-accentstrong" onClick={() => navTo(f.id)}>{f.name}</button>
                            {canEdit(f.created_by) && <button onClick={() => setMoving({ kind: 'folder', id: f.id, name: f.name, parent: f.parent_id })} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-content" title="Move"><Icon name="ti-arrows-move" className="text-sm" /></button>}
                            {canEdit(f.created_by) && <button onClick={() => delFolder(f)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500" title="Delete"><Icon name="ti-trash" className="text-sm" /></button>}
                          </div>
                        ))}
                        {shownFiles.map((f) => (
                          <div key={f.id} draggable={canEdit(f.created_by)} onDragStart={startDrag({ kind: 'file', id: f.id, parent: f.folder_id })} onDragEnd={endDrag}
                            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, kind: 'file', item: f }); }}
                            className={`group flex items-center gap-3 px-4 py-2.5 hover:bg-surface2/50 ${isSel(kfile(f.id)) ? 'bg-accent/5' : ''}`}>
                            <input type="checkbox" className={`shrink-0 ${selected.size ? '' : 'opacity-0 group-hover:opacity-100'}`} checked={isSel(kfile(f.id))} onChange={() => toggleSel(kfile(f.id))} onClick={(e) => e.stopPropagation()} />
                            <Icon name={fileIcon(f)} className="text-muted" />
                            <button className="text-sm text-content truncate flex-1 text-left hover:text-accentstrong" onClick={() => openFile(f)}>{f.name}</button>
                            <span className="text-2xs text-muted2 shrink-0 tabular-nums">{fmtBytes(f.size_bytes)}</span>
                            <button onClick={() => setCommentsFor({ id: f.id, name: f.name })} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-content" title="Comments"><Icon name="ti-message-circle" className="text-sm" /></button>
                            <button onClick={() => download(f)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-content" title="Download"><Icon name="ti-download" className="text-sm" /></button>
                            {canEdit(f.created_by) && <button onClick={() => setMoving({ kind: 'file', id: f.id, name: f.name, parent: f.folder_id })} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-content" title="Move"><Icon name="ti-arrows-move" className="text-sm" /></button>}
                            {canEdit(f.created_by) && <button onClick={() => delFile(f)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500" title="Delete"><Icon name="ti-trash" className="text-sm" /></button>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
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
      {moving && (
        <Modal open onClose={() => setMoving(null)} title={`Move “${moving.name}”`} icon="ti-arrows-move" size="sm"
          footer={<button className="btn" onClick={() => setMoving(null)}>Cancel</button>}>
          <p className="text-2xs text-muted2 mb-2">Pick a destination folder{moving.kind === 'folder' ? ' (a folder can’t move into itself)' : ''}. Tip: you can also drag rows to move them.</p>
          <div className="max-h-72 overflow-auto rounded-lg border border-line divide-y divide-line">
            <button disabled={busy || moving.parent === null} onClick={() => doMove(null)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface2 disabled:opacity-40 disabled:cursor-not-allowed text-left">
              <Icon name="ti-folders" className="text-accentstrong shrink-0" />
              <span className="truncate flex-1">{active?.name}</span>
              <span className="text-2xs text-muted2 shrink-0">{moving.parent === null ? 'current' : 'root'}</span>
            </button>
            {renderMoveTargets(null, 0)}
          </div>
        </Modal>
      )}
      {docEd && (
        <Modal open onClose={() => setDocEd(null)} size="lg" icon="ti-file-text" title="Document"
          footer={<><button className="btn" onClick={() => setCommentsFor({ id: docEd.id, name: docEd.name })}><Icon name="ti-message-circle" className="text-sm" />Comments</button><button className="btn btn-primary" onClick={() => setDocEd(null)}>Done</button></>}>
          <div className="space-y-3">
            <Field label="Title"><input className="input" defaultValue={docEd.name} onBlur={(e) => renameDoc(e.target.value.trim() || 'Untitled document')} placeholder="Untitled document" disabled={!docCanEdit} /></Field>
            <CollabDocEditor key={docEd.id} fileId={docEd.id} meId={me?.id || ''} meName={me?.full_name || ''} canEdit={docCanEdit} />
          </div>
        </Modal>
      )}
      {preview && (
        <Modal open onClose={() => setPreview(null)} size="lg" icon={preview.type === 'pdf' ? 'ti-file-type-pdf' : 'ti-photo'} title={preview.name}
          footer={<><a className="btn" href={preview.raw || preview.url} target="_blank" rel="noreferrer"><Icon name="ti-external-link" className="text-sm" />Open original</a><button className="btn" onClick={() => setPreview(null)}>Close</button></>}>
          {preview.type === 'image'
            ? <img src={preview.url} alt={preview.name} className="max-h-[70vh] mx-auto rounded-lg" />
            : <iframe src={preview.url} className="w-full h-[70vh] rounded-lg border border-line" title={preview.name} />}
        </Modal>
      )}
      {shareFor && (
        <DriveShareModal drive={shareFor} meId={me?.id || ''} people={people} canManage={level === 'manage' || isAdmin}
          onClose={() => setShareFor(null)} onChanged={(r) => { setDrives((ds) => (ds || []).map((x) => (x.id === shareFor.id ? { ...x, restricted: r } : x))); if (active?.id === shareFor.id) getDriveLevel(shareFor.id).then(setLevel).catch(() => {}); }} />
      )}
      {commentsFor && (
        <DriveComments fileId={commentsFor.id} fileName={commentsFor.name} meId={me?.id || ''} people={people} level={level} onClose={() => setCommentsFor(null)} />
      )}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="fixed z-50 min-w-[10rem] rounded-lg border border-line bg-surface shadow-xl py-1"
            style={{ top: Math.min(menu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 260), left: Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 190) }}>
            {ctxItems(menu).map((a, i) => (
              <button key={i} className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface2 text-left ${a.danger ? 'text-rose-600' : ''}`} onClick={() => { setMenu(null); a.run(); }}>
                <Icon name={a.icon} className="text-sm" />{a.label}
              </button>
            ))}
          </div>
        </>
      )}
      {bulkMove && (
        <Modal open onClose={() => setBulkMove(false)} title={`Move ${selected.size} item(s)`} icon="ti-arrows-move" size="sm"
          footer={<button className="btn" onClick={() => setBulkMove(false)}>Cancel</button>}>
          <p className="text-2xs text-muted2 mb-2">Pick a destination folder. Selected folders (and their contents) are disabled as targets.</p>
          <div className="max-h-72 overflow-auto rounded-lg border border-line divide-y divide-line">
            <button disabled={busy} onClick={() => bulkMoveTo(null)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface2 text-left">
              <Icon name="ti-folders" className="text-accentstrong shrink-0" /><span className="truncate flex-1">{active?.name}</span><span className="text-2xs text-muted2">root</span>
            </button>
            {renderBulkMoveTargets(null, 0)}
          </div>
        </Modal>
      )}
      {archived && (
        <Modal open onClose={() => setArchived(null)} size="md" icon="ti-archive" title="Archived items"
          footer={<button className="btn" onClick={() => setArchived(null)}>Close</button>}>
          {(archived.files.length === 0 && archived.folders.length === 0) ? <p className="text-2xs text-muted2 py-4 text-center">Nothing archived in this drive.</p> : (
            <div className="rounded-lg border border-line divide-y divide-line max-h-[55vh] overflow-auto">
              {archived.folders.map((f) => (
                <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <Icon name="ti-folder" className="text-amber-500 shrink-0" /><span className="flex-1 truncate">{f.name}</span>
                  {canEdit(f.created_by) && <button className="btn h-7 py-0" onClick={() => restoreFolder(f.id).then(() => { if (active) listArchived(active.id).then(setArchived); refreshHere(); }).catch((e) => setErr(e.message))}><Icon name="ti-arrow-back-up" className="text-sm" />Restore</button>}
                </div>
              ))}
              {archived.files.map((f) => (
                <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <Icon name={fileIcon(f)} className="text-muted shrink-0" /><span className="flex-1 truncate">{f.name}</span>
                  {canEdit(f.created_by) && <button className="btn h-7 py-0" onClick={() => restoreFile(f.id).then(() => { if (active) listArchived(active.id).then(setArchived); refreshHere(); }).catch((e) => setErr(e.message))}><Icon name="ti-arrow-back-up" className="text-sm" />Restore</button>}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
      {activityFor && (
        <DriveActivityModal fileId={activityFor.kind === 'file' ? activityFor.id : undefined} folderId={activityFor.kind === 'folder' ? activityFor.id : undefined} name={activityFor.name} people={people} onClose={() => setActivityFor(null)} />
      )}
      {accessFor && org && (
        <DriveAccessModal target={accessFor} orgId={org.id} folders={folders} people={people} meId={me?.id || ''} canManage={level === 'manage' || isAdmin} onClose={() => setAccessFor(null)} />
      )}
      {requestsOpen && active && (
        <DriveRequestsModal driveId={active.id} people={people} folders={folders} files={files || []} onClose={() => setRequestsOpen(false)}
          onChange={() => { if (active) listAccessRequests({ driveId: active.id, status: 'pending' }).then((r) => setPendingReq(r.length)).catch(() => {}); refreshHere(); }} />
      )}
    </Layout>
  );
}

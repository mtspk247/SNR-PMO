import { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard, HelpHint } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { can } from '@/lib/authz';
import { listMediaAssets, createMediaAsset, deleteMediaAsset, uploadMediaAsset, createMediaAssetFromDrive, mediaAssetUrl, listDriveMediaFiles, driveFileUrl, SocialMediaAsset, DriveFile } from '@/lib/db';
import { toast } from '@/lib/toast';

const KINDS = [
  { value: 'image', label: 'Image', icon: 'ti-photo' },
  { value: 'video', label: 'Video', icon: 'ti-video' },
  { value: 'gif', label: 'GIF', icon: 'ti-gif' },
] as const;
const kindMeta = (k: string) => KINDS.find((x) => x.value === k) || KINDS[0];

// Resolves a previewable (signed) URL for private drive/upload assets; literal for url assets.
function MediaThumb({ asset, icon }: { asset: SocialMediaAsset; icon: string }) {
  const [src, setSrc] = useState<string>(asset.source === 'url' ? (asset.thumb_url || (asset.kind === 'image' ? asset.url : '')) : '');
  useEffect(() => {
    let alive = true;
    if (asset.source !== 'url' && asset.kind !== 'video') { mediaAssetUrl(asset).then((u) => { if (alive) setSrc(u); }).catch(() => {}); }
    return () => { alive = false; };
  }, [asset.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!src) return <Icon name={icon} className="text-3xl text-muted2" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={asset.title} className="w-full h-full object-cover" loading="lazy" />;
}
function DriveThumb({ file }: { file: DriveFile }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let a = true; if (file.storage_path && (file.mime_type || '').startsWith('image/')) driveFileUrl(file.storage_path).then((u) => { if (a) setSrc(u); }).catch(() => {}); return () => { a = false; }; }, [file.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!src) return <Icon name={(file.mime_type || '').startsWith('video/') ? 'ti-video' : 'ti-photo'} className="text-2xl text-muted2" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={file.name} className="w-full h-full object-cover" loading="lazy" />;
}

export default function MediaLibrary() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const isAdmin = can.manageMembers(org);

  const [assets, setAssets] = useState<SocialMediaAsset[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [kindF, setKindF] = useState<'all' | 'image' | 'video' | 'gif'>('all');
  const [f, setF] = useState<{ kind: 'image' | 'video' | 'gif'; title: string; url: string; thumb_url: string }>({ kind: 'image', title: '', url: '', thumb_url: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[] | null>(null);

  const onUpload = async (file: File | null) => {
    if (!org || !me || !file) return;
    setUploading(true); setErr('');
    try { await uploadMediaAsset({ org_id: org.id, created_by: me.id, file }); toast('Media uploaded', 'success'); load(); }
    catch (e: any) { setErr(e.message); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const openDrive = () => { if (!org) return; setDriveOpen(true); setDriveFiles(null); listDriveMediaFiles(org.id).then(setDriveFiles).catch((e) => { setErr(e.message); setDriveFiles([]); }); };
  const pickDrive = async (file: DriveFile) => {
    if (!org || !me) return; setBusy(true); setErr('');
    try { await createMediaAssetFromDrive({ org_id: org.id, created_by: me.id, file }); toast('Added from Drive', 'success'); setDriveOpen(false); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const load = () => {
    if (!org) return;
    listMediaAssets(org.id).then(setAssets).catch((e) => { setErr(e.message); setAssets([]); });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

  const shown = useMemo(() => (assets || []).filter((a) => kindF === 'all' || a.kind === kindF), [assets, kindF]);
  const counts = useMemo(() => {
    const r = assets || [];
    return { total: r.length, image: r.filter((x) => x.kind === 'image').length, video: r.filter((x) => x.kind === 'video').length };
  }, [assets]);


  if (org && !hasFeature(org, 'social')) {
    return <Layout flat title="Media Library"><EmptyState icon="ti-photo" title="Social & Content not enabled" text="Ask an admin to enable Social on your plan." /></Layout>;
  }

  const add = async () => {
    if (!org || !me || !f.url.trim()) return;
    setBusy(true); setErr('');
    try {
      await createMediaAsset({ org_id: org.id, created_by: me.id, kind: f.kind, title: f.title.trim() || 'Untitled', url: f.url.trim(), thumb_url: f.thumb_url.trim() || null });
      setOpen(false); setF({ kind: 'image', title: '', url: '', thumb_url: '' }); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => { try { await deleteMediaAsset(id); load(); } catch (e: any) { setErr(e.message); } };

  return (
    <Layout flat title="Media Library">
      <PageHeader help="social" title="Media Library" icon="ti-photo"
        subtitle="Reusable images, video and GIFs for your posts"
        action={<div className="flex items-center gap-2">
          <Select value={kindF} onChange={(v) => setKindF(v as any)} options={[{ value: 'all', label: 'All media' }, ...KINDS.map((k) => ({ value: k.value, label: k.label }))]} />
          {isAdmin && <>
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => onUpload(e.target.files?.[0] || null)} />
            <button className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="ti-upload" />{uploading ? 'Uploading…' : 'Upload'}</button>
            <button className="btn" onClick={openDrive}><Icon name="ti-cloud" />From Drive</button>
            <button className="btn btn-primary" onClick={() => { setF({ kind: 'image', title: '', url: '', thumb_url: '' }); setOpen(true); }}><Icon name="ti-link" />Add by URL</button>
          </>}
        </div>}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Assets" value={counts.total} icon="ti-photo" />
        <StatCard label="Images" value={counts.image} icon="ti-photo" />
        <StatCard label="Video" value={counts.video} icon="ti-video" />
      </div>

      {assets === null ? <p className="text-2xs text-muted2">Loading…</p> : shown.length === 0 ? (
        <div className="card p-6"><EmptyState icon="ti-photo" title="No media yet" text="Add reusable images, video or GIFs by URL (from your Drive, CDN or hosting). Attach them to any post from the composer." /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {shown.map((a) => {
            const m = kindMeta(a.kind);
            return (
              <div key={a.id} className="card overflow-hidden group relative">
                <div className="aspect-square bg-surface2 flex items-center justify-center overflow-hidden">
                  <MediaThumb asset={a} icon={m.icon} />
                </div>
                <div className="p-2">
                  <div className="flex items-center gap-1 text-2xs text-muted2 mb-0.5"><Icon name={m.icon} className="text-xs" /><span className="capitalize">{a.kind}</span></div>
                  <div className="text-xs font-medium text-content truncate" title={a.title}>{a.title}</div>
                </div>
                {isAdmin && <button onClick={() => remove(a.id)} className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition hover:bg-rose-600" title="Remove"><Icon name="ti-trash" className="text-xs" /></button>}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add media" icon="ti-photo"
        footer={<>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !f.url.trim()} onClick={add}>{busy ? 'Adding…' : 'Add media'}</button>
        </>}>
        <div className="space-y-3">
          <Field label="Type"><Select value={f.kind} onChange={(v) => setF({ ...f, kind: v as any })} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} /></Field>
          <Field label="Media URL" hint="Direct link to the image/video (https). Use your Drive share link, CDN or host."><input className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…/photo.jpg" /></Field>
          {f.kind !== 'image' && <Field label="Thumbnail URL" hint="Optional preview image for video/GIF"><input className="input" value={f.thumb_url} onChange={(e) => setF({ ...f, thumb_url: e.target.value })} placeholder="https://…/thumb.jpg" /></Field>}
          <Field label="Title" hint="Optional label"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Spring campaign hero" /></Field>
        </div>
      </Modal>

      <Modal open={driveOpen} onClose={() => setDriveOpen(false)} title="Add from Drive" icon="ti-cloud" size="lg"
        footer={<button className="btn" onClick={() => setDriveOpen(false)}>Close</button>}>
        <p className="text-2xs text-muted2 mb-3">Pick an image or video already in your Drives. Drive files are malware-scanned, so they are ready to use right away.</p>
        {driveFiles === null ? <p className="text-2xs text-muted2">Loading…</p> : driveFiles.length === 0 ? (
          <EmptyState icon="ti-cloud" text="No images or videos found in your Drives yet." />
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[55vh] overflow-y-auto">
            {driveFiles.map((df) => (
              <button key={df.id} disabled={busy} onClick={() => pickDrive(df)} className="card overflow-hidden text-left hover:border-borderstrong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">
                <div className="aspect-square bg-surface2 flex items-center justify-center overflow-hidden"><DriveThumb file={df} /></div>
                <div className="p-1.5 text-2xs font-medium text-content truncate" title={df.name}>{df.name}</div>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </Layout>
  );
}

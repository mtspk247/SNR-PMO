import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard, HelpHint } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { can } from '@/lib/authz';
import { listMediaAssets, createMediaAsset, deleteMediaAsset, SocialMediaAsset } from '@/lib/db';

const KINDS = [
  { value: 'image', label: 'Image', icon: 'ti-photo' },
  { value: 'video', label: 'Video', icon: 'ti-video' },
  { value: 'gif', label: 'GIF', icon: 'ti-gif' },
] as const;
const kindMeta = (k: string) => KINDS.find((x) => x.value === k) || KINDS[0];

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
          {isAdmin && <button className="btn btn-primary" onClick={() => { setF({ kind: 'image', title: '', url: '', thumb_url: '' }); setOpen(true); }}><Icon name="ti-plus" />Add media</button>}
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
            const preview = a.thumb_url || (a.kind === 'image' ? a.url : '');
            return (
              <div key={a.id} className="card overflow-hidden group relative">
                <div className="aspect-square bg-surface2 flex items-center justify-center overflow-hidden">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt={a.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : <Icon name={m.icon} className="text-3xl text-muted2" />}
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
    </Layout>
  );
}

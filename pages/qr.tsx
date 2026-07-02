import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature, effectivePagePerm } from '@/lib/entitlements';
import { useListPrefs, ColDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { ListView } from '@/components/ListView';
import { listQrCodes, createQrCode, updateQrCode, deleteQrCode, listQrScans, QrCode, QrScan } from '@/lib/db';

// QR Codes — DYNAMIC: the printed code encodes /q/<slug>; the destination stays
// editable after printing (qr_resolve returns the live target and logs a scan).
// RLS is the wall for every read/write; the public path is the capped anon RPC only.

const COLS: ColDef[] = [
  { id: 'name', label: 'Name', locked: true },
  { id: 'link', label: 'Short link' },
  { id: 'target', label: 'Destination' },
  { id: 'scans', label: 'Scans', width: 72 },
  { id: 'status', label: 'Status', width: 90 },
  { id: 'created', label: 'Created', width: 100 },
];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const origin = () => (typeof window !== 'undefined' ? window.location.origin : 'https://snr-pmo.vercel.app');

export default function QrCodesPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'qr');
  const canWrite = effectivePagePerm(me, '/qr').c; // UI convenience only — the DB policies (page_allows) are the wall

  const [rows, setRows] = useState<QrCode[] | null>(null);
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; row: QrCode }>(null);
  const [form, setForm] = useState({ name: '', slug: '', target_url: '', dark: '#111827' });
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<QrCode | null>(null);
  const [scans, setScans] = useState<QrScan[] | null>(null);
  const [dataUrl, setDataUrl] = useState('');
  const prefs = useListPrefs('snrpmo.qr.cols', COLS);
  const slugTouched = useRef(false);

  const load = () => { if (org) listQrCodes(org.id).then(setRows).catch(() => setRows([])); };
  useEffect(() => { if (org?.id && enabled) load(); /* eslint-disable-next-line */ }, [org?.id, enabled]);

  // Live preview in the modal + big render in the detail panel.
  useEffect(() => {
    const slug = modal?.mode === 'edit' ? modal.row.slug : form.slug;
    if (!modal || !slug) { setDataUrl(''); return; }
    QRCode.toDataURL(`${origin()}/q/${slug}`, { margin: 1, width: 220, color: { dark: form.dark || '#111827', light: '#ffffff' } })
      .then(setDataUrl).catch(() => setDataUrl(''));
  }, [modal, form.slug, form.dark]);

  const openDetail = (row: QrCode) => {
    setDetail(row); setScans(null);
    listQrScans(row.id, 100).then(setScans).catch(() => setScans([]));
  };

  const submit = async () => {
    if (!org || busy) return;
    const name = form.name.trim(); const target = form.target_url.trim();
    if (!name || !target) { alert('Name and destination URL are required.'); return; }
    if (!/^https?:\/\/|^\//.test(target)) { alert('Destination must start with https:// (or a / path inside the app).'); return; }
    setBusy(true);
    try {
      if (modal?.mode === 'edit') {
        await updateQrCode(modal.row.id, { name, target_url: target, style: { dark: form.dark } });
      } else {
        const slug = slugify(form.slug || name);
        if (slug.length < 3) { alert('Slug must be at least 3 characters.'); setBusy(false); return; }
        await createQrCode({ org_id: org.id, slug, name, target_url: target, style: { dark: form.dark }, created_by: me?.id || null });
      }
      setModal(null); setForm({ name: '', slug: '', target_url: '', dark: '#111827' }); slugTouched.current = false;
      load();
    } catch (e: any) { alert(e.message?.includes('duplicate') ? 'That slug is already taken — pick another.' : e.message); }
    setBusy(false);
  };

  const download = async (row: QrCode, size = 1024) => {
    const url = await QRCode.toDataURL(`${origin()}/q/${row.slug}`, { margin: 2, width: size, color: { dark: (row.style?.dark as string) || '#111827', light: '#ffffff' } });
    const a = document.createElement('a'); a.href = url; a.download = `qr-${row.slug}.png`; a.click();
  };
  const copyLink = (row: QrCode) => { try { navigator.clipboard.writeText(`${origin()}/q/${row.slug}`); alert('Short link copied.'); } catch { /* ignore */ } };

  const cell = (id: string, r: QrCode) => {
    switch (id) {
      case 'name': return <span className="font-medium text-content">{r.name}</span>;
      case 'link': return <span className="text-xs text-accentstrong">/q/{r.slug}</span>;
      case 'target': return <span className="text-xs text-muted truncate inline-block max-w-[280px]" title={r.target_url}>{r.target_url}</span>;
      case 'scans': return <span className="tnum font-medium">{r.scan_count}</span>;
      case 'status': return r.active
        ? <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium" style={{ backgroundColor: '#16a34a1f', color: '#16a34a' }}>Active</span>
        : <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium bg-surface2 text-muted2">Paused</span>;
      case 'created': return <span className="text-xs text-muted">{r.created_at?.slice(0, 10)}</span>;
      default: return '—';
    }
  };
  const shown = useMemo(() => {
    const q = prefs.query.trim().toLowerCase();
    return (rows || []).filter((r) => !q || `${r.name} ${r.slug} ${r.target_url}`.toLowerCase().includes(q));
  }, [rows, prefs.query]);
  const rs = useRowSelection(shown);
  const totalScans = (rows || []).reduce((m, r) => m + r.scan_count, 0);

  if (!enabled) return (
    <Layout flat title="QR Codes"><EmptyState icon="ti-qrcode" title="QR Codes not in your plan" text="Upgrade to create dynamic QR codes with scan tracking." /></Layout>
  );

  return (
    <Layout flat title="QR Codes">
      <PageHeader help="qr" title="QR Codes" subtitle="Dynamic codes — print once, change the destination any time, every scan tracked" icon="ti-qrcode"
        action={canWrite ? <button className="btn btn-primary" onClick={() => { setModal({ mode: 'create' }); }}><Icon name="ti-plus" />New QR code</button> : undefined} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Codes" value={String(rows?.length ?? 0)} icon="ti-qrcode" />
        <StatCard label="Active" value={String((rows || []).filter((r) => r.active).length)} icon="ti-circle-check" />
        <StatCard label="Total scans" value={String(totalScans)} icon="ti-scan" />
        <StatCard label="Scans / code" value={rows && rows.length ? (totalScans / rows.length).toFixed(1) : '—'} icon="ti-chart-bar" />
      </div>

      <ListView
        rows={rows === null ? null : shown}
        rowKey={(r) => r.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        searchPlaceholder="Search QR codes…"
        onRowClick={openDetail}
        exportName="qr-codes"
        exportValue={(id, r) => id === 'name' ? r.name : id === 'link' ? `/q/${r.slug}` : id === 'target' ? r.target_url : id === 'scans' ? String(r.scan_count) : id === 'status' ? (r.active ? 'active' : 'paused') : id === 'created' ? (r.created_at || '') : ''}
        onDelete={canWrite ? (sel) => { if (confirm(`Delete ${sel.count} QR code(s)? Printed codes will stop working. This can't be undone.`)) { Promise.all([...sel.ids].map((id) => deleteQrCode(id))).then(load).catch((e) => alert(e.message)); } } : undefined}
        canDelete={canWrite}
        emptyIcon="ti-qrcode"
        emptyText="No QR codes yet — create one and point it anywhere: a form, a booking page, your site."
      />

      {modal && (
        <Modal open title={modal.mode === 'edit' ? 'Edit QR code' : 'New QR code'} onClose={() => setModal(null)}
          footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : modal.mode === 'edit' ? 'Save changes' : 'Create code'}</button></>}>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
            <div className="space-y-3">
              <Field label="Name"><input className="input w-full" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value, slug: modal.mode === 'create' && !slugTouched.current ? slugify(e.target.value) : form.slug }); }} placeholder="Spring campaign flyer" /></Field>
              {modal.mode === 'create' && (
                <Field label="Short link (permanent — printed on the code)"><div className="flex items-center gap-1"><span className="text-xs text-muted2">/q/</span><input className="input flex-1" value={form.slug} onChange={(e) => { slugTouched.current = true; setForm({ ...form, slug: slugify(e.target.value) }); }} placeholder="spring-flyer" /></div></Field>
              )}
              <Field label="Destination URL (editable any time — even after printing)"><input className="input w-full" value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} placeholder="https://… or /booking" /></Field>
              <Field label="Color"><input type="color" value={form.dark} onChange={(e) => setForm({ ...form, dark: e.target.value })} className="h-9 w-16 rounded cursor-pointer border border-line bg-surface" /></Field>
            </div>
            <div className="grid place-items-center min-w-[180px]">
              {dataUrl ? <img src={dataUrl} alt="QR preview" className="rounded-lg border border-line" width={170} height={170} /> : <div className="w-[170px] h-[170px] rounded-lg border border-dashed border-line grid place-items-center text-2xs text-muted2 text-center px-3">Preview appears when the short link is set</div>}
            </div>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal open title={detail.name} onClose={() => setDetail(null)}
          footer={<>
            {canWrite && <button className="btn" onClick={() => { setForm({ name: detail.name, slug: detail.slug, target_url: detail.target_url, dark: (detail.style?.dark as string) || '#111827' }); setModal({ mode: 'edit', row: detail }); setDetail(null); }}><Icon name="ti-pencil" />Edit</button>}
            {canWrite && <button className="btn" onClick={async () => { await updateQrCode(detail.id, { active: !detail.active }); setDetail(null); load(); }}>{detail.active ? 'Pause' : 'Activate'}</button>}
            <button className="btn" onClick={() => copyLink(detail)}><Icon name="ti-copy" />Copy link</button>
            <button className="btn btn-primary" onClick={() => download(detail)}><Icon name="ti-download" />Download PNG</button>
          </>}>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4">
            <QrBig slug={detail.slug} dark={(detail.style?.dark as string) || '#111827'} />
            <div className="min-w-0 text-xs text-muted space-y-1.5">
              <p><span className="text-muted2 uppercase text-2xs tracking-wide">Short link</span><br /><span className="text-accentstrong">{origin()}/q/{detail.slug}</span></p>
              <p><span className="text-muted2 uppercase text-2xs tracking-wide">Destination</span><br /><span className="break-all">{detail.target_url}</span></p>
              <p><span className="text-muted2 uppercase text-2xs tracking-wide">Scans</span><br /><span className="tnum text-content font-medium">{detail.scan_count}</span></p>
              <div>
                <p className="text-muted2 uppercase text-2xs tracking-wide mb-1">Recent scans</p>
                {scans === null ? <p>Loading…</p> : scans.length === 0 ? <p className="text-muted2">No scans yet.</p> : (
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {scans.slice(0, 25).map((s) => (<p key={s.id} className="text-2xs">{s.scanned_at.replace('T', ' ').slice(0, 16)} · {s.device || 'other'}{s.ref_host ? ` · ${s.ref_host}` : ''}</p>))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}

function QrBig({ slug, dark }: { slug: string; dark: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => { QRCode.toDataURL(`${origin()}/q/${slug}`, { margin: 1, width: 200, color: { dark, light: '#ffffff' } }).then(setUrl).catch(() => setUrl('')); }, [slug, dark]);
  return url ? <img src={url} alt={`QR for /q/${slug}`} width={190} height={190} className="rounded-lg border border-line self-start" /> : <div className="w-[190px] h-[190px]" />;
}

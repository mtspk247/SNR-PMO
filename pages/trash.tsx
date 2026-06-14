import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Tabs } from '@/components/ui';
import { useAuthStore } from '@/lib/store';
import { listTrash, restoreTrash, purgeTrash, emptyTrash, archiveTrash, TrashItem } from '@/lib/db';

const daysLeft = (purgeAt: string) => Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / 86400000));

export default function TrashPage() {
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  const [tab, setTab] = useState<'mine' | 'retained'>('mine');
  const [mine, setMine] = useState<TrashItem[] | null>(null);
  const [retained, setRetained] = useState<TrashItem[] | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const loadMine = () => listTrash('mine').then(setMine).catch((e) => { setErr(e.message); setMine([]); });
  const loadRetained = () => listTrash('admin').then(setRetained).catch(() => setRetained([]));
  useEffect(() => { loadMine(); if (platformAdmin) loadRetained(); /* eslint-disable-next-line */ }, [platformAdmin]);

  const act = async (fn: () => Promise<any>, after: () => void) => {
    setBusy('1'); setErr('');
    try { await fn(); after(); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const restore = (t: TrashItem) => act(() => restoreTrash(t.id), () => { loadMine(); if (platformAdmin) loadRetained(); });
  const purge = (t: TrashItem) => { if (confirm(`Permanently delete “${t.label || t.entity_type}”? This cannot be undone.`)) act(() => purgeTrash(t.id), () => { loadMine(); if (platformAdmin) loadRetained(); }); };
  const archive = (t: TrashItem) => act(() => archiveTrash(t.id), loadRetained);
  const empty = () => { if (confirm('Permanently delete everything in your trash? This cannot be undone.')) act(() => emptyTrash(), loadMine); };

  const Row = ({ t, admin }: { t: TrashItem; admin?: boolean }) => (
    <tr className="border-t border-line hover:bg-surface2/50">
      <td className="px-4 py-3"><span className="block font-medium text-content">{t.label || 'Untitled'}</span><span className="block text-2xs text-muted2 capitalize">{t.entity_type.replace('_', ' ')}</span></td>
      <td className="px-4 py-3 text-muted tabular-nums whitespace-nowrap text-2xs">{new Date(t.deleted_at).toLocaleString()}</td>
      <td className="px-4 py-3">
        {admin ? <span className={`pill ${t.status === 'archived' ? 'pill-gray' : 'pill-amber'}`}>{t.status === 'archived' ? 'Archived' : 'Retained'}</span>
          : <span className={`pill ${daysLeft(t.purge_at) <= 5 ? 'pill-red' : 'pill-gray'}`}>{daysLeft(t.purge_at)}d left</span>}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <button disabled={!!busy} onClick={() => restore(t)} className="btn btn-ghost h-8 py-0 border border-line"><Icon name="ti-arrow-back-up" />Restore</button>
        {admin && t.status !== 'archived' && <button disabled={!!busy} onClick={() => archive(t)} className="btn btn-ghost h-8 py-0 border border-line ml-2"><Icon name="ti-archive" />Archive</button>}
        <button disabled={!!busy} onClick={() => purge(t)} className="btn btn-ghost h-8 py-0 text-rose-600 ml-2" title="Delete permanently"><Icon name="ti-trash-x" /></button>
      </td>
    </tr>
  );

  const Table = ({ rows, admin }: { rows: TrashItem[]; admin?: boolean }) => (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
          <tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Deleted</th><th className="px-4 py-3">{admin ? 'State' : 'Auto-removal'}</th><th className="px-4 py-3" /></tr>
        </thead>
        <tbody>{rows.map((t) => <Row key={t.id} t={t} admin={admin} />)}</tbody>
      </table></div>
    </div>
  );

  return (
    <Layout flat title="Trash">
      <PageHeader title="Trash" subtitle="Deleted records — restorable for 30 days" icon="ti-trash"
        action={tab === 'mine' && mine && mine.length > 0 ? <button className="btn btn-ghost border border-line" onClick={empty}><Icon name="ti-trash-x" />Empty trash</button> : undefined} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      {platformAdmin && <Tabs tabs={[{ key: 'mine', label: 'My trash', icon: 'ti-trash', count: mine?.length }, { key: 'retained', label: 'Tenant retention', icon: 'ti-building-community', count: retained?.length }]}
        active={tab} onChange={(k) => setTab(k as 'mine' | 'retained')} />}

      {tab === 'mine' ? (
        mine === null ? <Spinner /> : mine.length === 0 ? <EmptyState icon="ti-trash" title="Trash is empty" text="Deleted records appear here for 30 days before moving to tenant retention." />
          : <Table rows={mine} />
      ) : (
        retained === null ? <Spinner /> : retained.length === 0 ? <EmptyState icon="ti-building-community" title="Nothing retained" text="Items past their 30-day window are kept here for platform admins to purge or archive." />
          : <Table rows={retained} admin />
      )}
    </Layout>
  );
}

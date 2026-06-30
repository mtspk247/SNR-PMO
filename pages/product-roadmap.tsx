import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { sb } from '@/lib/supabase';

type RItem = { id: string; title: string; kind: string; status: string; votes: number; voted: boolean; updated_at: string };
const COLUMNS: { key: string; label: string; statuses: string[]; icon: string }[] = [
  { key: 'considering', label: 'Considering', statuses: ['new', 'triaged'], icon: 'ti-bulb' },
  { key: 'planned', label: 'Planned', statuses: ['planned'], icon: 'ti-calendar' },
  { key: 'in_progress', label: 'In progress', statuses: ['in_progress'], icon: 'ti-progress' },
  { key: 'shipped', label: 'Shipped', statuses: ['done'], icon: 'ti-rocket' },
];
const KIND_HEX: Record<string, string> = { bug: '#ef4444', idea: '#f59e0b', praise: '#10b981', other: '#6b7280' };

export default function ProductRoadmap() {
  const [items, setItems] = useState<RItem[] | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  const load = useCallback(() => { sb.rpc('product_roadmap').then(({ data, error }) => { if (error) { setErr(error.message); setItems([]); } else setItems((data as RItem[]) || []); }, (e) => { setErr(String(e?.message || e)); setItems([]); }); }, []);
  useEffect(() => { load(); }, [load]);
  const vote = async (id: string) => { setBusy(id); try { const { error } = await sb.rpc('feedback_vote', { p_id: id }); if (error) throw new Error(error.message); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(''); } };
  return (
    <Layout title="Roadmap">
      <PageHeader title="Product roadmap" subtitle="What we're considering, building and have shipped — vote for what matters to you" icon="ti-map-2" help="feedback" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {items === null ? <Spinner /> : items.length === 0 ? <EmptyState icon="ti-map-2" title="Nothing here yet" text="As we plan and ship improvements they'll appear here. Send ideas any time from the feedback button." /> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => { const list = items.filter((i) => col.statuses.includes(i.status)); return (
            <div key={col.key}>
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-content"><Icon name={col.icon} className="text-accentstrong" />{col.label}<span className="text-2xs text-muted2 font-normal">({list.length})</span></div>
              <div className="space-y-2">
                {list.length === 0 ? <p className="text-2xs text-muted2 px-1">—</p> : list.map((it) => { const kh = KIND_HEX[it.kind] || '#6b7280'; return (
                  <div key={it.id} className="card p-3 flex items-start gap-2">
                    <button onClick={() => vote(it.id)} disabled={!!busy} className={`flex flex-col items-center justify-center rounded-lg border px-2 py-1 shrink-0 transition ${it.voted ? 'border-accent text-accentstrong bg-accent/5' : 'border-line text-muted hover:border-accent'}`} title={it.voted ? 'Remove your vote' : 'Upvote'}>
                      <Icon name="ti-chevron-up" className="text-sm" /><span className="text-2xs font-semibold">{it.votes}</span>
                    </button>
                    <div className="flex-1 min-w-0"><p className="text-sm text-content">{it.title}</p>
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium mt-1 capitalize" style={{ background: kh + '1f', color: kh }}>{it.kind}</span></div>
                  </div>); })}
              </div>
            </div>); })}
        </div>
      )}
    </Layout>
  );
}

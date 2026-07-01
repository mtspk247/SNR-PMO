import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, Spinner } from '@/components/ui';
import Select from '@/components/Select';
import { useActiveOrg } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listSocialPosts, listSocialChannels, updateSocialPost, SocialPost, SocialChannel } from '@/lib/db';

const PLAT_ICON: Record<string, string> = {
  facebook: 'ti-brand-facebook', instagram: 'ti-brand-instagram', linkedin: 'ti-brand-linkedin', x: 'ti-brand-x',
  youtube: 'ti-brand-youtube', tiktok: 'ti-brand-tiktok', threads: 'ti-brand-threads', pinterest: 'ti-brand-pinterest', google_business: 'ti-brand-google',
};
const STATUS_DOT: Record<string, string> = { draft: 'bg-slate-400', scheduled: 'bg-amber-500', published: 'bg-emerald-500', failed: 'bg-rose-500', cancelled: 'bg-slate-300' };
const STATUS_RING: Record<string, string> = { draft: 'border-slate-300', scheduled: 'border-amber-400', published: 'border-emerald-400', failed: 'border-rose-400', cancelled: 'border-slate-200' };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const effDate = (p: SocialPost): string | null => {
  const s = p.status === 'published' ? p.published_at : (p.scheduled_at || (p.status === 'draft' ? p.created_at : p.scheduled_at));
  return s ? ymd(new Date(s)) : null;
};

export default function SocialCalendar() {
  const org = useActiveOrg();
  const router = useRouter();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [chanFilter, setChanFilter] = useState('all');
  const [err, setErr] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const load = () => {
    if (!org) return;
    listSocialPosts(org.id).then(setPosts).catch((e) => { setErr(e.message); setPosts([]); });
    listSocialChannels(org.id).then(setChannels).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

  const platOf = (p: SocialPost): string[] => {
    const cs = p.channels || [];
    return cs.map((c) => channels.find((x) => x.id === c.channel_id)?.platform).filter(Boolean) as string[];
  };

  const byDay = useMemo(() => {
    const m: Record<string, SocialPost[]> = {};
    for (const p of posts || []) {
      if (chanFilter !== 'all' && !(p.channels || []).some((c) => c.channel_id === chanFilter)) continue;
      const d = effDate(p); if (!d) continue;
      (m[d] ||= []).push(p);
    }
    return m;
  }, [posts, chanFilter]);

  const weeks = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first); start.setDate(first.getDate() - first.getDay());
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(d); }
    return cells;
  }, [cursor]);

  if (org && !hasFeature(org, 'social')) {
    return <Layout flat title="Content calendar"><EmptyState icon="ti-calendar" title="Social & Content not enabled" text="Ask an admin to enable Social on your plan." /></Layout>;
  }

  const drop = async (dayStr: string) => {
    if (!dragId || !posts) return;
    const p = posts.find((x) => x.id === dragId);
    setDragId(null);
    if (!p || p.status === 'published') return;
    const prev = p.scheduled_at ? new Date(p.scheduled_at) : null;
    const nd = new Date(dayStr + 'T00:00:00');
    nd.setHours(prev ? prev.getHours() : 9, prev ? prev.getMinutes() : 0, 0, 0);
    const patch: any = { scheduled_at: nd.toISOString() };
    if (p.status === 'draft') patch.status = 'scheduled';
    setPosts((list) => (list || []).map((x) => x.id === p.id ? { ...x, ...patch } : x)); // optimistic
    try { await updateSocialPost(p.id, patch); } catch (e: any) { setErr(e.message); load(); }
  };

  const todayStr = ymd(new Date());
  const drafts = (posts || []).filter((p) => p.status === 'draft' && !p.scheduled_at);

  return (
    <Layout flat title="Content calendar">
      <PageHeader help="social" title="Content calendar" icon="ti-calendar-event"
        subtitle="Plan and schedule your posts across every channel — drag to reschedule"
        action={<div className="flex items-center gap-2">
          <Select value={chanFilter} onChange={setChanFilter} options={[{ value: 'all', label: 'All channels' }, ...channels.map((c) => ({ value: c.id, label: c.handle || c.platform }))]} />
          <button className="btn btn-primary" onClick={() => router.push('/social')}><Icon name="ti-pencil-plus" />Compose</button>
        </div>}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {posts === null ? <div className="p-10"><Spinner /></div> : (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button className="btn btn-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><Icon name="ti-chevron-left" /></button>
              <h2 className="text-sm font-semibold w-40 text-center">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
              <button className="btn btn-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><Icon name="ti-chevron-right" /></button>
              <button className="btn btn-sm" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-2xs text-muted2">
              {['scheduled','published','draft','failed'].map((s) => <span key={s} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />{s}</span>)}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-line rounded-lg overflow-hidden border border-line">
            {DOW.map((d) => <div key={d} className="bg-surface2 px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted2 text-center">{d}</div>)}
            {weeks.map((d) => {
              const ds = ymd(d); const inMonth = d.getMonth() === cursor.getMonth(); const dayPosts = byDay[ds] || [];
              return (
                <div key={ds} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(ds)}
                  className={`min-h-[104px] bg-surface p-1.5 ${inMonth ? '' : 'opacity-45'} ${ds === todayStr ? 'ring-1 ring-inset ring-accent/50' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-2xs ${ds === todayStr ? 'font-bold text-accentstrong' : 'text-muted2'}`}>{d.getDate()}</span>
                    <button onClick={() => router.push('/social')} title="Add post" className="opacity-0 hover:opacity-100 focus:opacity-100 text-muted2 hover:text-content transition"><Icon name="ti-plus" className="text-xs" /></button>
                  </div>
                  <div className="space-y-1">
                    {dayPosts.slice(0, 4).map((p) => {
                      const plats = platOf(p);
                      return (
                        <div key={p.id} draggable={p.status !== 'published'} onDragStart={() => setDragId(p.id)} onDragEnd={() => setDragId(null)}
                          onClick={() => router.push('/social')} title={`${p.status} · ${p.body.slice(0, 80)}`}
                          className={`text-[11px] leading-tight rounded border ${STATUS_RING[p.status]} bg-surface2/60 px-1.5 py-1 truncate cursor-pointer hover:bg-surface2 ${p.status !== 'published' ? 'active:cursor-grabbing' : ''}`}>
                          <span className="inline-flex items-center gap-1 align-middle mr-1">
                            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[p.status]} shrink-0`} />
                            {plats.slice(0, 2).map((pl, i) => <Icon key={i} name={PLAT_ICON[pl] || 'ti-world'} className="text-[10px] text-muted shrink-0" />)}
                          </span>
                          {p.body || '(empty)'}
                        </div>
                      );
                    })}
                    {dayPosts.length > 4 && <div className="text-[10px] text-muted2 px-1">+{dayPosts.length - 4} more</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {drafts.length > 0 && (
            <div className="card p-3 mt-4">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted2 mb-2">Unscheduled drafts — drag onto a day to schedule</p>
              <div className="flex flex-wrap gap-2">
                {drafts.map((p) => (
                  <div key={p.id} draggable onDragStart={() => setDragId(p.id)} onDragEnd={() => setDragId(null)}
                    className="text-[11px] rounded border border-slate-300 bg-surface2/60 px-2 py-1 max-w-[220px] truncate cursor-grab active:cursor-grabbing">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT.draft} mr-1 align-middle`} />{p.body || '(empty)'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

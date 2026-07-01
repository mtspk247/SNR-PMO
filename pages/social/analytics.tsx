import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard, Spinner } from '@/components/ui';
import Select from '@/components/Select';
import AgentPanel from '@/components/AgentPanel';
import { useActiveOrg } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  socialAnalyticsOverview, socialChannelStats, socialTopPosts, socialEngagementTrend,
  SocialAnalyticsOverview, SocialChannelStat, SocialTopPost, SocialTrendPoint,
} from '@/lib/db';

const PLAT: Record<string, { label: string; icon: string; color: string }> = {
  facebook: { label: 'Facebook', icon: 'ti-brand-facebook', color: '#1877F2' },
  instagram: { label: 'Instagram', icon: 'ti-brand-instagram', color: '#E1306C' },
  linkedin: { label: 'LinkedIn', icon: 'ti-brand-linkedin', color: '#0A66C2' },
  x: { label: 'X', icon: 'ti-brand-x', color: '#111827' },
  youtube: { label: 'YouTube', icon: 'ti-brand-youtube', color: '#FF0000' },
  tiktok: { label: 'TikTok', icon: 'ti-brand-tiktok', color: '#111827' },
  threads: { label: 'Threads', icon: 'ti-brand-threads', color: '#111827' },
  pinterest: { label: 'Pinterest', icon: 'ti-brand-pinterest', color: '#E60023' },
  google_business: { label: 'Google', icon: 'ti-brand-google', color: '#4285F4' },
};
const pm = (p?: string | null) => PLAT[p || ''] || { label: p || '—', icon: 'ti-world', color: '#6366F1' };
const fmt = (n: number) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);
const dstr = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');

export default function SocialAnalytics() {
  const org = useActiveOrg();
  const [days, setDays] = useState(30);
  const [ov, setOv] = useState<SocialAnalyticsOverview | null>(null);
  const [channels, setChannels] = useState<SocialChannelStat[]>([]);
  const [top, setTop] = useState<SocialTopPost[]>([]);
  const [trend, setTrend] = useState<SocialTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!org) return;
    setLoading(true);
    Promise.all([
      socialAnalyticsOverview(org.id, days).then(setOv),
      socialChannelStats(org.id).then(setChannels),
      socialTopPosts(org.id, 8).then(setTop),
      socialEngagementTrend(org.id, days).then(setTrend),
    ]).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [org?.id, days]);

  const maxTrend = useMemo(() => Math.max(1, ...trend.map((t) => t.engagement)), [trend]);
  const maxChan = useMemo(() => Math.max(1, ...channels.map((c) => c.engagement)), [channels]);
  const totalFollowers = useMemo(() => channels.reduce((a, c) => a + (c.followers || 0), 0), [channels]);

  if (org && !hasFeature(org, 'social')) {
    return <Layout flat title="Social Analytics"><EmptyState icon="ti-chart-dots" title="Social & Content not enabled" text="Ask an admin to enable Social on your plan." /></Layout>;
  }

  const hasData = !!ov && (ov.posts > 0 || ov.impressions > 0);

  return (
    <Layout flat title="Social Analytics">
      <PageHeader help="social" title="Social Analytics" icon="ti-chart-dots"
        subtitle="Reach, engagement and top content across every channel"
        action={<Select value={String(days)} onChange={(v) => setDays(Number(v))} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {loading ? <div className="p-10"><Spinner /></div> : !hasData ? (
        <EmptyState icon="ti-chart-dots" title="No analytics yet" text="Once your posts are published and metrics come in, your reach, engagement and top content appear here. (Connect channels and publish to start collecting.)" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            <StatCard label="Posts" value={fmt(ov!.posts)} icon="ti-news" />
            <StatCard label="Impressions" value={fmt(ov!.impressions)} icon="ti-eye" />
            <StatCard label="Reach" value={fmt(ov!.reach)} icon="ti-broadcast" />
            <StatCard label="Engagement" value={fmt(ov!.engagement)} icon="ti-heart" />
            <StatCard label="Eng. rate" value={`${ov!.engagement_rate}%`} icon="ti-flame" />
            <StatCard label="Followers" value={fmt(totalFollowers)} icon="ti-users" />
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <div className="card overflow-hidden lg:col-span-2">
              <div className="px-4 py-3 border-b border-line"><h3 className="text-sm font-semibold">Engagement over time</h3></div>
              <div className="p-4">
                {trend.length === 0 ? <p className="text-2xs text-muted2">No data in range.</p> : (
                  <div className="flex items-end gap-1 h-40">
                    {trend.map((t) => (
                      <div key={t.day} className="flex-1 flex flex-col items-center justify-end group" title={`${dstr(t.day)} · ${t.engagement} eng · ${t.impressions} impr`}>
                        <div className="w-full rounded-t bg-accent/80 group-hover:bg-accent transition-all" style={{ height: `${Math.max((t.engagement / maxTrend) * 100, 3)}%` }} />
                        <span className="mt-1 text-[9px] text-muted2 truncate w-full text-center">{dstr(t.day)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-line"><h3 className="text-sm font-semibold">By channel</h3></div>
              <div className="p-4 space-y-3">
                {channels.length === 0 ? <p className="text-2xs text-muted2">No channels yet.</p> : channels.map((c) => {
                  const m = pm(c.platform); const pct = Math.round((c.engagement / maxChan) * 100);
                  return (
                    <div key={c.channel_id}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="inline-flex items-center gap-1.5"><Icon name={m.icon} style={{ color: m.color }} />{c.handle || m.label}</span>
                        <span className="text-2xs text-muted tabular-nums">{fmt(c.engagement)} eng · {fmt(c.followers)} foll.</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(pct, 4)}%`, background: m.color }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-line"><h3 className="text-sm font-semibold">Top posts</h3><p className="text-2xs text-muted">Ranked by engagement</p></div>
            <div className="divide-y divide-line">
              {top.map((t, i) => {
                const m = pm(t.platform);
                return (
                  <div key={t.post_id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-2xs text-muted2 w-4 tabular-nums">{i + 1}</span>
                    <Icon name={m.icon} style={{ color: m.color }} className="shrink-0" />
                    <span className="flex-1 min-w-0 text-sm text-content truncate">{t.body || '(empty)'}</span>
                    <span className="text-2xs text-muted2 tabular-nums hidden sm:block">{dstr(t.published_at)}</span>
                    <span className="text-2xs text-muted tabular-nums w-16 text-right">{fmt(t.impressions)} impr</span>
                    <span className="text-2xs font-semibold text-accentstrong tabular-nums w-20 text-right">{fmt(t.engagement)} · {t.engagement_rate}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6"><AgentPanel domain="marketing" /></div>
        </>
      )}
    </Layout>
  );
}

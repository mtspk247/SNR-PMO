import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { Icon, Spinner } from '@/components/ui';
import Select from '@/components/Select';
import { useActiveOrg } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  socialAnalyticsOverview, socialChannelStats, socialTopPosts, socialEngagementTrend,
  SocialAnalyticsOverview, SocialChannelStat, SocialTopPost, SocialTrendPoint,
} from '@/lib/db';

const PLAT: Record<string, { label: string; color: string }> = {
  facebook: { label: 'Facebook', color: '#1877F2' }, instagram: { label: 'Instagram', color: '#E1306C' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2' }, x: { label: 'X', color: '#111827' },
  youtube: { label: 'YouTube', color: '#FF0000' }, tiktok: { label: 'TikTok', color: '#111827' },
  threads: { label: 'Threads', color: '#111827' }, pinterest: { label: 'Pinterest', color: '#E60023' }, google_business: { label: 'Google', color: '#4285F4' },
};
const pl = (p?: string | null) => PLAT[p || '']?.label || p || '—';
const clr = (p?: string | null) => PLAT[p || '']?.color || '#6366F1';
const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));

export default function SocialReport() {
  const org = useActiveOrg();
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [ov, setOv] = useState<SocialAnalyticsOverview | null>(null);
  const [channels, setChannels] = useState<SocialChannelStat[]>([]);
  const [top, setTop] = useState<SocialTopPost[]>([]);
  const [trend, setTrend] = useState<SocialTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!org) return; setLoading(true);
    Promise.all([
      socialAnalyticsOverview(org.id, days).then(setOv),
      socialChannelStats(org.id).then(setChannels),
      socialTopPosts(org.id, 5).then(setTop),
      socialEngagementTrend(org.id, days).then(setTrend),
    ]).finally(() => setLoading(false));
  }, [org?.id, days]);

  const maxTrend = useMemo(() => Math.max(1, ...trend.map((t) => t.engagement)), [trend]);
  const brand = (org?.branding || {}) as { logo_url?: string; primary_color?: string };
  const rangeLabel = `Last ${days} days · ${new Date(Date.now() - days * 864e5).toLocaleDateString()} – ${new Date().toLocaleDateString()}`;

  if (org && !hasFeature(org, 'social')) return <Layout flat title="Report"><div className="p-8 text-sm text-muted">Social & Content is not enabled.</div></Layout>;

  return (
    <Layout flat title="Social report">
      <div className="no-print flex items-center justify-between mb-4 gap-2">
        <button className="btn" onClick={() => router.push('/social/analytics')}><Icon name="ti-arrow-left" />Back</button>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onChange={(v) => setDays(Number(v))} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
          <button className="btn btn-primary" onClick={() => window.print()}><Icon name="ti-download" />Print / Save PDF</button>
        </div>
      </div>

      {loading ? <div className="p-10"><Spinner /></div> : (
        <div className="print-area mx-auto max-w-3xl bg-white text-slate-900 rounded-lg border border-slate-200 p-8">
          {/* Branded header */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
            <div className="flex items-center gap-3">
              {brand.logo_url ? <img src={brand.logo_url} alt="" className="h-9 w-auto" /> : <div className="h-9 w-9 rounded-md grid place-items-center text-white font-bold" style={{ background: brand.primary_color || '#4f46e5' }}>{(org?.name || 'S')[0]}</div>}
              <div><h1 className="text-lg font-bold leading-tight">{org?.name || 'Social'} — Social Report</h1><p className="text-xs text-slate-500">{rangeLabel}</p></div>
            </div>
            <p className="text-[10px] text-slate-400 text-right">Generated<br />{new Date().toLocaleDateString()}</p>
          </div>

          {/* KPI summary */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[['Posts', fmt(ov?.posts || 0)], ['Impressions', fmt(ov?.impressions || 0)], ['Reach', fmt(ov?.reach || 0)], ['Engagement', fmt(ov?.engagement || 0)], ['Eng. rate', `${ov?.engagement_rate || 0}%`], ['Clicks', fmt(ov?.clicks || 0)]].map(([k, v]) => (
              <div key={k} className="rounded-md border border-slate-200 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-400">{k}</p><p className="text-xl font-bold">{v}</p></div>
            ))}
          </div>

          {/* Engagement trend */}
          <h2 className="text-sm font-bold mb-2">Engagement over time</h2>
          <div className="flex items-end gap-0.5 h-24 mb-6 border-b border-slate-100">
            {trend.map((t, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${Math.max((t.engagement / maxTrend) * 100, 2)}%`, background: brand.primary_color || '#4f46e5', opacity: 0.85 }} title={`${t.engagement}`} />)}
          </div>

          {/* Channels */}
          <h2 className="text-sm font-bold mb-2">By channel</h2>
          <table className="w-full text-xs mb-6"><thead><tr className="text-slate-400 text-left"><th className="py-1">Channel</th><th>Followers</th><th>Posts</th><th>Impressions</th><th>Engagement</th></tr></thead>
            <tbody>{channels.map((c) => (<tr key={c.channel_id} className="border-t border-slate-100"><td className="py-1.5 font-medium"><span style={{ color: clr(c.platform) }}>●</span> {c.handle || pl(c.platform)}</td><td>{fmt(c.followers)}</td><td>{c.posts}</td><td>{fmt(c.impressions)}</td><td className="font-semibold">{fmt(c.engagement)}</td></tr>))}</tbody>
          </table>

          {/* Top posts */}
          <h2 className="text-sm font-bold mb-2">Top posts</h2>
          <div className="space-y-1.5">
            {top.map((t, i) => (<div key={t.post_id} className="flex items-center gap-2 text-xs border-b border-slate-100 pb-1.5"><span className="text-slate-400 w-4">{i + 1}</span><span className="flex-1 min-w-0 truncate">{t.body || '(empty)'}</span><span className="text-slate-500">{pl(t.platform)}</span><span className="font-semibold w-24 text-right">{fmt(t.engagement)} eng · {t.engagement_rate}%</span></div>))}
          </div>

          <p className="text-[10px] text-slate-400 mt-8 pt-3 border-t border-slate-100">Prepared by {org?.name || 'your team'}. Figures reflect collected metrics for the selected period.</p>
        </div>
      )}
    </Layout>
  );
}

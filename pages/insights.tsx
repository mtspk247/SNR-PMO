import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, StatCard } from '@/components/ui';
import { ListView } from '@/components/ListView';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { sb } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store';

type Overview = Record<string, any>;
type FunnelRow = { step: string; count: number };
type TrendRow = { week: string; count: number };
type TH = { id: string; org_id: string; name: string; plan: string; status: string; created_at: string; members: number; last_active: string | null; projects: number; tasks: number; clients: number; deals: number; invoices: number };

const title = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const STATUS_HEX: Record<string, string> = { active: '#10b981', suspended: '#f59e0b', archived: '#6b7280' };

const COLS: ColDef[] = [
  { id: 'name', label: 'Tenant', locked: true },
  { id: 'plan', label: 'Plan', width: 110 }, { id: 'status', label: 'Status', width: 110 },
  { id: 'members', label: 'Members', width: 90 }, { id: 'last_active', label: 'Last active', width: 140 },
  { id: 'projects', label: 'Projects', width: 90 }, { id: 'tasks', label: 'Tasks', width: 80 },
  { id: 'clients', label: 'Clients', width: 90 }, { id: 'deals', label: 'Deals', width: 80 },
  { id: 'invoices', label: 'Invoices', width: 90 }, { id: 'created', label: 'Joined', width: 120 },
];

function Funnel({ data }: { data: FunnelRow[] }) {
  const top = data[0]?.count || 1;
  return <div className="space-y-2">{data.map((s, i) => { const pct = Math.round((s.count / top) * 100); return (
    <div key={s.step} className="flex items-center gap-3">
      <div className="w-36 text-2xs text-muted shrink-0">{s.step}</div>
      <div className="flex-1 h-6 rounded-md bg-surface2 overflow-hidden"><div className="h-full rounded-md flex items-center px-2 text-[10px] font-medium text-white" style={{ width: `${Math.max(pct, 8)}%`, background: `hsl(${160 - i * 16} 70% 45%)` }}>{s.count}</div></div>
      <div className="w-10 text-2xs text-muted2 text-right">{pct}%</div>
    </div>); })}</div>;
}
function TrendBars({ data }: { data: TrendRow[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return <div className="flex items-end gap-1 h-24">{data.map((d) => (
    <div key={d.week} className="flex-1 flex flex-col items-center gap-1" title={`${d.week}: ${d.count}`}>
      <div className="w-full rounded-t bg-accent" style={{ height: `${Math.max((d.count / max) * 100, 4)}%` }} />
      <span className="text-[9px] text-muted2">{d.week.slice(5)}</span>
    </div>))}</div>;
}

export default function Insights() {
  const { platformAdmin } = useAuthStore();
  const router = useRouter();
  const [ov, setOv] = useState<Overview | null>(null); const [fn, setFn] = useState<FunnelRow[]>([]); const [tr, setTr] = useState<TrendRow[]>([]); const [th, setTh] = useState<TH[] | null>(null);
  const [err, setErr] = useState('');
  const prefs = useListPrefs('snrpmo.insights.cols', COLS);
  const { query, filters } = prefs;

  const load = useCallback(() => { setErr('');
    sb.rpc('analytics_platform_overview').then(({ data }) => setOv((data as any) || {}), () => {});
    sb.rpc('analytics_activation_funnel').then(({ data }) => setFn((data as any) || []), () => {});
    sb.rpc('analytics_signups_trend', { p_weeks: 12 }).then(({ data }) => setTr((data as any) || []), () => {});
    sb.rpc('analytics_tenant_health').then(({ data, error }) => { if (error) { setErr(error.message); setTh([]); } else setTh(((data as any[]) || []).map((r) => ({ ...r, id: r.org_id }))); }, (e) => { setErr(String(e?.message || e)); setTh([]); });
  }, []);
  useEffect(() => { if (platformAdmin) load(); }, [platformAdmin, load]);

  const shown = useMemo(() => (th || []).filter((r) => {
    if ((filters.status || 'all') !== 'all' && r.status !== filters.status) return false;
    if ((filters.plan || 'all') !== 'all' && r.plan !== filters.plan) return false;
    if (query.trim() && !r.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [th, filters.status, filters.plan, query]);
  const rs = useRowSelection(shown);
  const FILTERS: FilterDef[] = useMemo(() => {
    const plans = Array.from(new Set((th || []).map((r) => r.plan)));
    return [
      { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'archived', label: 'Archived' }] },
      { id: 'plan', label: 'Plan', options: [{ value: 'all', label: 'All plans' }, ...plans.map((p) => ({ value: p, label: title(p) }))] },
    ];
  }, [th]);

  const cell = (id: string, r: TH) => {
    switch (id) {
      case 'name': return <span className="font-medium text-content">{r.name}</span>;
      case 'plan': return <span className="capitalize">{r.plan}</span>;
      case 'status': { const h = STATUS_HEX[r.status] || '#6b7280'; return <span className="inline-flex rounded-md px-2 py-0.5 text-2xs font-medium" style={{ background: h + '1f', color: h, boxShadow: `inset 0 0 0 1px ${h}33` }}>{title(r.status)}</span>; }
      case 'members': return r.members;
      case 'last_active': return r.last_active ? <span className="text-muted">{new Date(r.last_active).toLocaleDateString()}</span> : <span className="text-muted2">never</span>;
      case 'projects': return r.projects; case 'tasks': return r.tasks; case 'clients': return r.clients; case 'deals': return r.deals; case 'invoices': return r.invoices;
      case 'created': return <span className="text-muted">{new Date(r.created_at).toLocaleDateString()}</span>;
      default: return '—';
    }
  };
  const rawValue = (id: string, r: TH) => { if (id === 'last_active') return r.last_active || ''; if (id === 'created') return r.created_at; const v = (r as any)[id]; return v == null ? '' : String(v); };

  if (!platformAdmin) return <Layout title="Insights"><EmptyState icon="ti-lock" title="Platform admins only" text="Product insights are available to the platform team." /></Layout>;
  const o = ov || {};
  return (
    <Layout title="Insights">
      <PageHeader title="Insights" subtitle="Product analytics across all tenants — adoption, activation and health" icon="ti-chart-histogram" help="insights" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Tenants" value={ov ? String(o.tenants_total ?? '—') : '…'} icon="ti-building-community" hint={`${o.tenants_new_30d ?? 0} new in 30d`} hintTone="up" />
        <StatCard label="Active users (7d)" value={ov ? String(o.users_active_7d ?? '—') : '…'} icon="ti-user-check" hint={`${o.users_total ?? 0} total`} />
        <StatCard label="Active users (30d)" value={ov ? String(o.users_active_30d ?? '—') : '…'} icon="ti-users" />
        <StatCard label="Resellers" value={ov ? String(o.resellers ?? '—') : '…'} icon="ti-building-store" />
        <StatCard label="Suspended" value={ov ? String(o.tenants_suspended ?? '—') : '…'} icon="ti-ban" hintTone={o.tenants_suspended ? 'down' : 'muted'} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mb-5">
        <div className="card p-5"><p className="text-sm font-semibold mb-3">Activation funnel</p><Funnel data={fn} /></div>
        <div className="card p-5"><p className="text-sm font-semibold mb-3">New tenants / week</p><TrendBars data={tr} /></div>
      </div>
      <ListView rows={th === null ? null : shown} rowKey={(r) => r.id} cols={COLS} prefs={prefs} cell={cell} selection={rs}
        filters={FILTERS} searchPlaceholder="Search tenants…" rawValue={rawValue}
        onRowClick={(r) => router.push(`/tenants/${r.org_id}`)} exportName="tenant-health" exportValue={rawValue}
        emptyIcon="ti-chart-histogram" emptyText="No tenant data yet." />
    </Layout>
  );
}

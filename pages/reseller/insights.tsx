import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, StatCard, Icon } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import {
  resellerListOrgs, resellerBillingSummary, resellerAgentMargin,
  ResellerOrg, ResellerBilling, ResellerAgentMargin,
} from '@/lib/db';

// Reseller-scoped analytics — mirrors the platform Insights, but every figure is
// derived from the reseller's OWN sub-tenants via RLS-scoped RPCs (no new data surface).
export default function ResellerInsights() {
  const org = useActiveOrg();
  const [subs, setSubs] = useState<ResellerOrg[] | null>(null);
  const [billing, setBilling] = useState<ResellerBilling | null>(null);
  const [margin, setMargin] = useState<ResellerAgentMargin | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!org) return;
    resellerListOrgs(org.id).then(setSubs).catch((e) => { setErr(e.message); setSubs([]); });
    resellerBillingSummary(org.id).then(setBilling).catch(() => {});
    resellerAgentMargin(org.id, 'month').then(setMargin).catch(() => {});
  }, [org?.id]);

  const kpis = useMemo(() => {
    const list = subs || [];
    const active = list.filter((s) => !s.sub_status || s.sub_status === 'active').length;
    const members = list.reduce((a, s) => a + (s.member_count || 0), 0);
    const seats = list.reduce((a, s) => a + (s.seats || 0), 0);
    return { total: list.length, active, suspended: list.length - active, members, seats };
  }, [subs]);

  const byPlan = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of subs || []) { const k = s.plan_name || s.plan_key || 'free'; m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [subs]);

  const topMargin = useMemo(() =>
    (margin?.subs || []).filter((s) => s.margin > 0).sort((a, b) => b.margin - a.margin).slice(0, 8),
  [margin]);

  if (org && (!org.is_reseller || !can.manageMembers(org))) {
    return <Layout flat title="Insights"><EmptyState icon="ti-lock" title="Reseller access required" text="This view is for reseller owners and admins." /></Layout>;
  }
  if (subs === null) return <Layout flat title="Insights"><div className="p-8"><Spinner /></div></Layout>;

  const money = (n: number) => `$${(n || 0).toFixed(2)}`;

  return (
    <Layout flat title="Reseller insights">
      <PageHeader help="reselling" title="Insights" icon="ti-chart-histogram"
        subtitle="How your reselling business is doing — sub-tenants, seats and AI agent margin" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Sub-tenants" value={kpis.total} icon="ti-buildings" />
        <StatCard label="Active" value={kpis.active} icon="ti-circle-check" />
        <StatCard label="Suspended" value={kpis.suspended} icon="ti-ban" />
        <StatCard label="Members" value={kpis.members} icon="ti-users" />
        <StatCard label="Seats sold" value={kpis.seats} icon="ti-armchair" />
        <StatCard label="Agent margin (MTD)" value={money(margin?.total_margin || 0)} icon="ti-coin" hint={margin && margin.total_runs ? `${margin.total_runs} runs` : undefined} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Sub-tenants by plan */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-line"><h3 className="text-sm font-semibold">Sub-tenants by plan</h3></div>
          <div className="p-4">
            {byPlan.length === 0 ? <p className="text-2xs text-muted2">No sub-tenants yet. Invite your first client from Reseller ▸ Clients.</p> : (
              <ul className="space-y-2">
                {byPlan.map(([plan, n]) => {
                  const pct = kpis.total ? Math.round((n / kpis.total) * 100) : 0;
                  return (
                    <li key={plan}>
                      <div className="flex items-center justify-between text-sm mb-0.5"><span className="capitalize font-medium text-content">{plan}</span><span className="text-muted tabular-nums">{n} · {pct}%</span></div>
                      <div className="h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* AI agent margin */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-line"><h3 className="text-sm font-semibold">AI agent margin — this month</h3><p className="text-2xs text-muted">Retail you bill clients minus the platform's wholesale.</p></div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-line p-3"><p className="text-2xs uppercase tracking-wide text-muted2">Retail</p><p className="text-lg font-semibold tabular-nums">{money(margin?.total_retail || 0)}</p></div>
              <div className="rounded-lg border border-line p-3"><p className="text-2xs uppercase tracking-wide text-muted2">Wholesale</p><p className="text-lg font-semibold tabular-nums">{money(margin?.total_wholesale || 0)}</p></div>
              <div className="rounded-lg border border-line p-3 bg-emerald-500/5"><p className="text-2xs uppercase tracking-wide text-muted2">Margin</p><p className="text-lg font-semibold tabular-nums text-accentstrong">{money(margin?.total_margin || 0)}</p></div>
            </div>
            {topMargin.length === 0 ? (
              <p className="text-2xs text-muted2">No agent usage from your sub-tenants yet this month.</p>
            ) : (
              <ul className="divide-y divide-line border border-line rounded-lg">
                {topMargin.map((s) => (
                  <li key={s.org_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="truncate font-medium text-content flex-1">{s.name}</span>
                    <span className="text-2xs text-muted tabular-nums">{s.runs} runs</span>
                    <span className="tabular-nums text-accentstrong w-20 text-right">+{money(s.margin)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

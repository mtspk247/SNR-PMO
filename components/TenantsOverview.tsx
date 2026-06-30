/**
 * TenantsOverview — read-only platform analytics dashboard for the /tenants page.
 * Pure presentational: derives everything from the rows returned by listTenants()
 * and the plans returned by listPlans(). No data fetching, no mutations.
 */
import { useMemo } from 'react';
import { StatCard, Icon, EmptyState } from '@/components/ui';
import { PlanBadge } from '@/components/PlanBadge';
import type { Plan } from '@/lib/supabase';

type TenantRow = {
  org_id: string;
  org_name: string;
  slug?: string | null;
  member_count?: number | null;
  plan_key?: string | null;
  plan_name?: string | null;
  sub_status?: string | null;
  seats?: number | null;
  seat_limit?: number | null;
  is_reseller?: boolean | null;
  parent_org_id?: string | null;
};

const fmtMoney = (cents: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: (currency || 'USD').toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `$${Math.round(cents / 100).toLocaleString()}`;
  }
};

export default function TenantsOverview({
  rows,
  plans,
  onOpenTenant,
}: {
  rows: TenantRow[];
  plans: Plan[];
  onOpenTenant: (orgId: string) => void;
}) {
  const stats = useMemo(() => {
    const total = rows.length;
    const resellers = rows.filter((r) => r.is_reseller).length;
    const subTenants = rows.filter((r) => r.parent_org_id).length;
    const direct = rows.filter((r) => !r.is_reseller && !r.parent_org_id).length;
    const active = rows.filter((r) => ((r as any).lifecycle || 'active') === 'active').length;
    const archived = rows.filter((r) => (r as any).lifecycle === 'archived').length;
    const members = rows.reduce((a, r) => a + (r.member_count || 0), 0);
    const seats = rows.reduce((a, r) => a + (r.seats || 0), 0);
    return { total, resellers, subTenants, direct, active, archived, members, seats };
  }, [rows]);

  // Plan distribution — count tenants per plan (matched by plan_key, falling back to plan_name).
  const planDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = r.plan_key || r.plan_name || 'free';
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const byKey = new Map(plans.map((p) => [p.key, p] as const));
    const out = [...counts.entries()].map(([key, count]) => {
      const p = byKey.get(key);
      return { key, count, name: p?.name || rows.find((r) => (r.plan_key || r.plan_name) === key)?.plan_name || key };
    });
    out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const max = out.reduce((m, x) => Math.max(m, x.count), 0) || 1;
    return { out, max };
  }, [rows, plans]);

  // Estimated MRR — sum each tenant's plan price (annual normalised to monthly).
  // Only computable when plans expose a positive price; otherwise omitted.
  const mrr = useMemo(() => {
    const byKey = new Map(plans.map((p) => [p.key, p] as const));
    const havePriced = plans.some((p) => (p.price_cents || 0) > 0);
    if (!havePriced) return null;
    let cents = 0;
    let currency = 'USD';
    for (const r of rows) {
      const p = r.plan_key ? byKey.get(r.plan_key) : undefined;
      if (!p || !p.price_cents) continue;
      currency = p.currency || currency;
      cents += p.billing_period === 'annual' ? Math.round(p.price_cents / 12) : p.price_cents;
    }
    return { cents, currency };
  }, [rows, plans]);

  // Resellers with their sub-tenant counts.
  const resellers = useMemo(() => {
    return rows
      .filter((r) => r.is_reseller)
      .map((r) => ({ ...r, subs: rows.filter((x) => x.parent_org_id === r.org_id).length }))
      .sort((a, b) => b.subs - a.subs || a.org_name.localeCompare(b.org_name));
  }, [rows]);

  const kpis: { label: string; value: number; icon: string }[] = [
    { label: 'Total tenants', value: stats.total, icon: 'ti-building-community' },
    { label: 'Resellers', value: stats.resellers, icon: 'ti-buildings' },
    { label: 'Sub-tenants', value: stats.subTenants, icon: 'ti-sitemap' },
    { label: 'Direct tenants', value: stats.direct, icon: 'ti-building' },
    { label: 'Active', value: stats.active, icon: 'ti-circle-check' },
    { label: 'Archived', value: stats.archived, icon: 'ti-archive' },
    { label: 'Total members', value: stats.members, icon: 'ti-users' },
    { label: 'Total seats', value: stats.seats, icon: 'ti-armchair' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <StatCard key={k.label} label={k.label} value={k.value.toLocaleString()} icon={k.icon} />
        ))}
        {mrr && (
          <StatCard
            label="Estimated MRR"
            value={fmtMoney(mrr.cents, mrr.currency)}
            hint="From assigned plan prices"
            icon="ti-coin"
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="ti-chart-bar" className="text-accentstrong" />
            <h3 className="text-sm font-semibold text-content">Plan distribution</h3>
          </div>
          {planDist.out.length === 0 ? (
            <EmptyState icon="ti-chart-bar" text="No tenants to chart yet." />
          ) : (
            <div className="space-y-2.5">
              {planDist.out.map((p) => (
                <div key={p.key}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-2xs font-medium text-content truncate">{p.name}</span>
                    <span className="text-2xs text-muted2 tabular-nums shrink-0">{p.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, (p.count / planDist.max) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="ti-building-community" className="text-accentstrong" />
            <h3 className="text-sm font-semibold text-content">Resellers</h3>
          </div>
          {resellers.length === 0 ? (
            <EmptyState icon="ti-building-community" text="No resellers yet." />
          ) : (
            <div className="divide-y divide-line -mx-1">
              {resellers.map((r) => (
                <button
                  key={r.org_id}
                  onClick={() => onOpenTenant(r.org_id)}
                  className="w-full flex items-center justify-between gap-3 px-1 py-2.5 text-left hover:bg-surface2/60 rounded-md transition-colors"
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-medium text-content truncate">{r.org_name}</span>
                    <span className="block text-2xs text-muted2">{r.slug || ''}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <PlanBadge planKey={r.plan_key} planName={r.plan_name} size="sm" />
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-2xs font-medium text-violet-600">
                      <Icon name="ti-buildings" className="text-2xs" />
                      {r.subs} sub-tenant{r.subs === 1 ? '' : 's'}
                    </span>
                    <Icon name="ti-chevron-right" className="text-muted2" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

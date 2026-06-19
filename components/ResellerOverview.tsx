/**
 * ResellerOverview — KPI stat cards + plan distribution for the /reseller Overview tab.
 * Pure presentational: derives everything from data already fetched by reseller.tsx.
 * No data fetching, no mutations.
 */
import { useMemo } from 'react';
import { StatCard, Icon, EmptyState } from '@/components/ui';
import type { ResellerOrg, ResellerBilling, ResellerPlanPrice } from '@/lib/db';

const fmtMoney = (cents: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `$${Math.round(cents / 100).toLocaleString()}`;
  }
};

export default function ResellerOverview({
  orgs,
  billing,
  prices,
  agencyPlan,
}: {
  orgs: ResellerOrg[];
  billing: ResellerBilling | null;
  prices: ResellerPlanPrice[];
  agencyPlan: string | null | undefined;
}) {
  const stats = useMemo(() => {
    const total = billing?.sub_count ?? orgs.length;
    const active = billing?.active ?? orgs.filter((o) => o.sub_status === 'active').length;
    const members = orgs.reduce((a, o) => a + (o.member_count || 0), 0);
    const seats = billing?.total_seats ?? orgs.reduce((a, o) => a + (o.seats || 0), 0);
    return { total, active, members, seats };
  }, [orgs, billing]);

  // Estimated MRR: sum each sub-tenant's reseller price for their plan_key.
  // Annual prices normalised to monthly. Omit if no prices configured.
  const mrr = useMemo(() => {
    if (prices.length === 0) return null;
    const byPlan = new Map(prices.map((p) => [p.plan_key, p]));
    let cents = 0;
    let currency = 'USD';
    for (const o of orgs) {
      const p = o.plan_key ? byPlan.get(o.plan_key) : undefined;
      if (!p || !p.amount_cents) continue;
      currency = p.currency || currency;
      cents += p.interval === 'year' ? Math.round(p.amount_cents / 12) : p.amount_cents;
    }
    return { cents, currency };
  }, [orgs, prices]);

  // Plan distribution: count sub-tenants per plan_key.
  const planDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orgs) {
      const k = o.plan_key || o.plan_name || 'free';
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const out = [...counts.entries()].map(([key, count]) => ({
      key,
      count,
      name: orgs.find((o) => (o.plan_key || o.plan_name || 'free') === key)?.plan_name || key,
    }));
    out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const max = out.reduce((m, x) => Math.max(m, x.count), 0) || 1;
    return { out, max };
  }, [orgs]);

  const kpis: { label: string; value: number | string; icon: string; hint?: string }[] = [
    { label: 'Sub-tenants', value: stats.total, icon: 'ti-buildings' },
    { label: 'Active', value: stats.active, icon: 'ti-circle-check' },
    { label: 'Total members', value: stats.members, icon: 'ti-users', hint: 'across all sub-tenants' },
    { label: 'Total seats', value: stats.seats, icon: 'ti-armchair', hint: 'billed across sub-tenants' },
    { label: 'Agency plan', value: agencyPlan || '—', icon: 'ti-package' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <StatCard
            key={k.label}
            label={k.label}
            value={typeof k.value === 'number' ? k.value.toLocaleString() : k.value}
            icon={k.icon}
            hint={k.hint}
          />
        ))}
        {mrr && (
          <StatCard
            label="Est. revenue (MRR)"
            value={fmtMoney(mrr.cents, mrr.currency)}
            hint="From your reseller prices"
            icon="ti-coin"
          />
        )}
      </div>

      <div className="card p-4 max-w-lg">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="ti-chart-bar" className="text-accentstrong" />
          <h3 className="text-sm font-semibold text-content">Plan distribution</h3>
        </div>
        {planDist.out.length === 0 ? (
          <EmptyState icon="ti-chart-bar" text="No sub-tenants to chart yet." />
        ) : (
          <div className="space-y-2.5">
            {planDist.out.map((p) => (
              <div key={p.key}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-2xs font-medium text-content truncate capitalize">{p.name}</span>
                  <span className="text-2xs text-muted2 tabular-nums shrink-0">{p.count}</span>
                </div>
                <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(4, (p.count / planDist.max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { Spinner, EmptyState, Icon, StatCard, Pill } from '@/components/ui';
import { getFinancials } from '@/lib/db';
import { Financial } from '@/lib/supabase';

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const monthLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' });
const fullDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function FinancialData() {
  const [rows, setRows] = useState<Financial[]>([]);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState('');

  useEffect(() => { getFinancials().then(setRows).finally(() => setLoading(false)); }, []);

  const projects = useMemo(() => Array.from(new Set(rows.map((r) => r.projects?.name).filter(Boolean))) as string[], [rows]);
  const data = useMemo(() => (project ? rows.filter((r) => r.projects?.name === project) : rows), [rows, project]);

  const totalPlan = data.reduce((a, r) => a + Number(r.planned), 0);
  const totalActual = data.reduce((a, r) => a + Number(r.actual), 0);
  const variance = totalActual - totalPlan;
  const utilization = totalPlan ? Math.round((totalActual / totalPlan) * 100) : 0;

  // monthly plan vs actual
  const months = useMemo(() => {
    const m: Record<string, { plan: number; actual: number }> = {};
    data.forEach((r) => {
      const k = r.period;
      m[k] = m[k] || { plan: 0, actual: 0 };
      m[k].plan += Number(r.planned); m[k].actual += Number(r.actual);
    });
    return Object.keys(m).sort().map((k) => ({ period: k, ...m[k] }));
  }, [data]);

  // category split
  const cats = useMemo(() => {
    const m: Record<string, { plan: number; actual: number }> = {};
    data.forEach((r) => {
      m[r.category] = m[r.category] || { plan: 0, actual: 0 };
      m[r.category].plan += Number(r.planned); m[r.category].actual += Number(r.actual);
    });
    return Object.entries(m).map(([k, v]) => ({ category: k, ...v })).sort((a, b) => b.actual - a.actual);
  }, [data]);

  // per-project breakdown (only when not filtered)
  const byProject = useMemo(() => {
    const m: Record<string, { plan: number; actual: number }> = {};
    rows.forEach((r) => {
      const k = r.projects?.name || '—';
      m[k] = m[k] || { plan: 0, actual: 0 };
      m[k].plan += Number(r.planned); m[k].actual += Number(r.actual);
    });
    return Object.entries(m).map(([k, v]) => ({ name: k, ...v, variance: v.actual - v.plan })).sort((a, b) => b.actual - a.actual);
  }, [rows]);

  const payments = useMemo(() =>
    data.filter((r) => r.paid_on && Number(r.actual) > 0)
      .sort((a, b) => (b.paid_on! > a.paid_on! ? 1 : -1)).slice(0, 12),
    [data]);

  // chart geometry
  const maxBar = Math.max(1, ...months.map((m) => Math.max(m.plan, m.actual)));
  const W = 640, H = 240, padL = 8, padR = 8, padB = 28, padT = 8;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const groupW = months.length ? innerW / months.length : innerW;
  const barW = Math.min(26, groupW * 0.3);

  return (
    <Layout title="Financial Data">
      {loading ? <Spinner /> : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">Plan vs. actual spend · {data.length} entries</p>
            <select value={project} onChange={(e) => setProject(e.target.value)} className="input max-w-[220px]">
              <option value="">All projects</option>
              {projects.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Planned" value={money(totalPlan)} icon="ti-target" />
            <StatCard label="Actual" value={money(totalActual)} icon="ti-cash"
              hint={`${utilization}% of plan`} hintTone={utilization > 100 ? 'down' : 'muted'} />
            <StatCard label="Variance" value={`${variance >= 0 ? '+' : '−'}${money(Math.abs(variance))}`}
              icon={variance >= 0 ? 'ti-trending-up' : 'ti-trending-down'}
              hint={variance >= 0 ? 'Over budget' : 'Under budget'} hintTone={variance >= 0 ? 'down' : 'up'} />
            <StatCard label="Paid to date" value={money(data.filter(r => r.paid_on).reduce((a, r) => a + Number(r.actual), 0))}
              icon="ti-receipt" hint={`${data.filter(r => r.paid_on).length} payments`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Fact / Plan bar chart */}
            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Plan vs. actual by month</h3>
                <div className="flex items-center gap-3 text-2xs text-neutral-500">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-neutral-300" />Plan</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-ink" />Actual</span>
                </div>
              </div>
              {months.length === 0 ? <EmptyState text="No data" icon="ti-chart-bar" /> : (
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 240 }}>
                  {[0.25, 0.5, 0.75, 1].map((g) => (
                    <line key={g} x1={padL} x2={W - padR} y1={padT + innerH * (1 - g)} y2={padT + innerH * (1 - g)}
                      stroke="#eceae5" strokeWidth={1} />
                  ))}
                  {months.map((m, idx) => {
                    const gx = padL + idx * groupW + groupW / 2;
                    const planH = (m.plan / maxBar) * innerH;
                    const actH = (m.actual / maxBar) * innerH;
                    const gap = 4;
                    return (
                      <g key={m.period}>
                        <rect x={gx - barW - gap / 2} y={padT + innerH - planH} width={barW} height={planH} rx={3} fill="#d6d3cd" />
                        <rect x={gx + gap / 2} y={padT + innerH - actH} width={barW} height={actH} rx={3}
                          fill={m.actual > m.plan ? '#f43f5e' : '#1c1b19'} />
                        <text x={gx} y={H - 10} textAnchor="middle" fontSize={11} fill="#9a978f">{monthLabel(m.period)}</text>
                      </g>
                    );
                  })}
                </svg>
              )}
              <p className="text-2xs text-neutral-400 mt-1">Actual bars turn red when a month runs over its plan.</p>
            </div>

            {/* Category split */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-4">By category</h3>
              <div className="space-y-3.5">
                {cats.map((c) => {
                  const pct = c.plan ? Math.min(140, Math.round((c.actual / c.plan) * 100)) : 100;
                  const over = c.actual > c.plan;
                  return (
                    <div key={c.category}>
                      <div className="flex items-center justify-between mb-1 text-2xs">
                        <span className="font-medium text-neutral-600">{c.category}</span>
                        <span className="text-neutral-400">{money(c.actual)} / {money(c.plan)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                        <div className={`h-full rounded-full ${over ? 'bg-rose-400' : 'bg-emerald-400'}`}
                          style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Project breakdown */}
            <div className="card overflow-hidden lg:col-span-2">
              <div className="px-4 h-11 flex items-center border-b border-line bg-paper/50">
                <h3 className="text-sm font-semibold">Project breakdown</h3>
              </div>
              <div className="overflow-x-auto"><table className="w-full">
                <thead><tr>
                  <th className="th">Project</th><th className="th text-right">Planned</th>
                  <th className="th text-right">Actual</th><th className="th text-right">Variance</th><th className="th text-right">Used</th>
                </tr></thead>
                <tbody>
                  {byProject.map((p) => {
                    const used = p.plan ? Math.round((p.actual / p.plan) * 100) : 0;
                    return (
                      <tr key={p.name} className="row">
                        <td className="td font-medium">{p.name}</td>
                        <td className="td text-right text-neutral-500">{money(p.plan)}</td>
                        <td className="td text-right font-medium">{money(p.actual)}</td>
                        <td className={`td text-right font-medium ${p.variance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {p.variance >= 0 ? '+' : '−'}{money(Math.abs(p.variance))}
                        </td>
                        <td className="td text-right text-2xs text-neutral-500">{used}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>

            {/* Payments timeline */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-4">Recent payments</h3>
              {payments.length === 0 ? <EmptyState text="No payments" icon="ti-receipt-off" /> : (
                <ol className="relative border-l border-line ml-1 space-y-4">
                  {payments.map((p) => (
                    <li key={p.id} className="ml-4">
                      <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{money(Number(p.actual))}</span>
                        <span className="text-2xs text-neutral-400">{fullDate(p.paid_on!)}</span>
                      </div>
                      <p className="text-2xs text-neutral-500 truncate">{p.projects?.name || '—'} · {p.category}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

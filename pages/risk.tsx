import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { Pill, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { getRisks } from '@/lib/db';
import { Risk } from '@/lib/supabase';

const STATUSES = ['Open', 'Mitigating', 'Monitoring', 'Accepted', 'Closed'];
const exposure = (r: Risk) => r.impact * r.probability;
const sevLabel = (s: number) => (s >= 20 ? 'Critical' : s >= 13 ? 'High' : s >= 7 ? 'Medium' : 'Low');
// heatmap cell tone keyed on inherent score (impact × probability)
const cellTone = (s: number, active: boolean) => {
  const base =
    s >= 20 ? 'bg-rose-500' :
    s >= 13 ? 'bg-orange-400' :
    s >= 7 ? 'bg-amber-300' :
      'bg-emerald-300';
  return `${base} ${active ? '' : 'opacity-80'}`;
};

export default function RiskAnalysis() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [cell, setCell] = useState<{ i: number; p: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { getRisks().then(setRisks).finally(() => setLoading(false)); }, []);

  const open = risks.filter((r) => r.status !== 'Closed');
  const highExp = risks.filter((r) => exposure(r) >= 13);
  const avgExp = risks.length ? Math.round((risks.reduce((a, r) => a + exposure(r), 0) / risks.length) * 10) / 10 : 0;

  // matrix[impact][prob] = count
  const matrix = useMemo(() => {
    const m: Record<number, Record<number, number>> = {};
    for (let i = 1; i <= 5; i++) { m[i] = {}; for (let p = 1; p <= 5; p++) m[i][p] = 0; }
    risks.forEach((r) => { m[r.impact][r.probability] = (m[r.impact][r.probability] || 0) + 1; });
    return m;
  }, [risks]);

  const byStatus = STATUSES.map((s) => ({ status: s, count: risks.filter((r) => r.status === s).length }));
  const maxStatus = Math.max(1, ...byStatus.map((b) => b.count));

  const filtered = useMemo(() => {
    let r = [...risks];
    if (cell) r = r.filter((x) => x.impact === cell.i && x.probability === cell.p);
    if (statusFilter) r = r.filter((x) => x.status === statusFilter);
    return r.sort((a, b) => exposure(b) - exposure(a));
  }, [risks, cell, statusFilter]);

  const clearFilters = () => { setCell(null); setStatusFilter(''); };
  const hasFilter = !!cell || !!statusFilter;

  return (
    <Layout title="Risk Analysis">
      {loading ? <Spinner /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total risks" value={risks.length} icon="ti-alert-triangle" />
            <StatCard label="High / Critical" value={highExp.length} hint={`${Math.round((highExp.length / Math.max(1, risks.length)) * 100)}% of register`} hintTone="down" icon="ti-flame" />
            <StatCard label="Open" value={open.length} hint={`${risks.filter(r => r.status === 'Mitigating').length} mitigating`} icon="ti-progress-alert" />
            <StatCard label="Avg exposure" value={avgExp} hint="impact × probability" icon="ti-activity" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Heatmap */}
            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold">Impact × Probability</h3>
                  <p className="text-2xs text-neutral-400 mt-0.5">Click a cell to filter the register</p>
                </div>
                <div className="flex items-center gap-3 text-2xs text-neutral-500">
                  {[['bg-emerald-300', 'Low'], ['bg-amber-300', 'Medium'], ['bg-orange-400', 'High'], ['bg-rose-500', 'Critical']].map(([c, l]) => (
                    <span key={l} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${c}`} />{l}</span>
                  ))}
                </div>
              </div>

              <div className="flex">
                {/* y-axis label */}
                <div className="flex items-center justify-center w-6">
                  <span className="text-2xs uppercase tracking-wide text-neutral-400 -rotate-90 whitespace-nowrap">Impact</span>
                </div>
                <div className="flex-1">
                  <div className="space-y-1.5">
                    {[5, 4, 3, 2, 1].map((i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="w-4 text-2xs text-neutral-400 text-right">{i}</span>
                        {[1, 2, 3, 4, 5].map((p) => {
                          const score = i * p;
                          const count = matrix[i][p];
                          const active = !cell || (cell.i === i && cell.p === p);
                          return (
                            <button key={p} onClick={() => setCell(cell && cell.i === i && cell.p === p ? null : { i, p })}
                              title={`Impact ${i} × Probability ${p} = ${score} (${sevLabel(score)})`}
                              className={`flex-1 aspect-[5/3] rounded-md grid place-items-center text-sm font-semibold transition
                                ${cellTone(score, active)} ${count ? 'text-[rgba(255,255,255,0.95)]' : 'text-[rgba(255,255,255,0.55)]'}
                                ${cell && cell.i === i && cell.p === p ? 'ring-2 ring-ink ring-offset-1' : 'hover:brightness-105'}`}>
                              {count || ''}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="w-4" />
                      {[1, 2, 3, 4, 5].map((p) => <span key={p} className="flex-1 text-center text-2xs text-neutral-400">{p}</span>)}
                    </div>
                    <p className="text-center text-2xs uppercase tracking-wide text-neutral-400 pt-1">Probability</p>
                  </div>
                </div>
              </div>
            </div>

            {/* By status */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-4">Risks by status</h3>
              <div className="space-y-3">
                {byStatus.map((b) => (
                  <button key={b.status} onClick={() => setStatusFilter(statusFilter === b.status ? '' : b.status)}
                    className="w-full text-left group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-2"><Pill label={b.status} />
                        {statusFilter === b.status && <Icon name="ti-filter" className="text-2xs text-neutral-400" />}</span>
                      <span className="text-2xs font-medium text-neutral-500">{b.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                      <div className="h-full rounded-full bg-ink/80 group-hover:bg-ink transition-all"
                        style={{ width: `${(b.count / maxStatus) * 100}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Register */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 h-11 border-b border-line bg-paper/50">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Risk register</h3>
                <span className="text-2xs text-neutral-400">{filtered.length}</span>
                {cell && <span className="pill pill-gray">Impact {cell.i} · Prob {cell.p}</span>}
              </div>
              {hasFilter && <button onClick={clearFilters} className="btn-ghost text-2xs text-neutral-500 px-2 py-1 rounded">Clear filters</button>}
            </div>
            {filtered.length === 0 ? <EmptyState text="No risks match" icon="ti-shield-check" /> : (
              <div className="overflow-x-auto"><table className="w-full">
                <thead><tr>
                  <th className="th">Risk</th><th className="th">Project</th><th className="th">Category</th>
                  <th className="th text-center">Impact</th><th className="th text-center">Prob.</th>
                  <th className="th text-center">Exposure</th><th className="th">Status</th><th className="th">Owner due</th>
                </tr></thead>
                <tbody>
                  {filtered.map((r) => {
                    const e = exposure(r);
                    return (
                      <tr key={r.id} className="row">
                        <td className="td font-medium max-w-xs"><span className="block truncate">{r.title}</span></td>
                        <td className="td text-2xs text-neutral-500">{r.projects?.name || '—'}</td>
                        <td className="td"><Pill label={r.category} /></td>
                        <td className="td text-center text-sm">{r.impact}</td>
                        <td className="td text-center text-sm">{r.probability}</td>
                        <td className="td text-center">
                          <span className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded-md text-2xs font-semibold text-[#fff] ${cellTone(e, true)}`}>{e}</span>
                        </td>
                        <td className="td"><Pill label={r.status} /></td>
                        <td className="td text-2xs text-neutral-500">{r.due_date || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { Pill, EmptyState, Icon, StatCard, PageHeader } from '@/components/ui';
import { getRisks, glRiskMetrics, RiskMetrics } from '@/lib/db';
import { Risk, sb } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta, EditSpec } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const STATUSES = ['Open', 'Mitigating', 'Monitoring', 'Accepted', 'Closed'];
const CATEGORIES = ['Technical', 'Financial', 'Operational', 'Legal', 'Strategic', 'Reputational', 'Other'];
const SCORE_OPTIONS = ['1', '2', '3', '4', '5'];

const exposure = (r: Risk) => r.impact * r.probability;
const sevLabel = (s: number) => (s >= 20 ? 'Critical' : s >= 13 ? 'High' : s >= 7 ? 'Medium' : 'Low');
const sevPill = (s: number) =>
  s >= 20 ? 'pill-rose' : s >= 13 ? 'pill-amber' : s >= 7 ? 'pill-yellow' : 'pill-green';
const STATUS_PILL: Record<string, string> = {
  Open: 'pill-rose',
  Mitigating: 'pill-amber',
  Monitoring: 'pill-yellow',
  Accepted: 'pill-blue',
  Closed: 'pill-green',
};

const cellTone = (s: number, active: boolean) => {
  const base =
    s >= 20 ? 'bg-rose-500' :
    s >= 13 ? 'bg-orange-400' :
    s >= 7 ? 'bg-amber-300' :
      'bg-emerald-300';
  return `${base} ${active ? '' : 'opacity-80'}`;
};

const finFmt = (n?: number) => n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
function FinMetric({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const c = tone === 'bad' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-600' : 'text-content';
  return <div className="rounded-lg border border-line p-3"><p className="text-2xs text-muted">{label}</p><p className={`text-base font-semibold tabular-nums ${c}`}>{value}</p></div>;
}

const STATUS_GROUP_ORDER = STATUSES;
const GROUPS: GroupMeta[] = STATUS_GROUP_ORDER.map((s) => ({ value: s, label: s, pill: STATUS_PILL[s] || 'pill-gray' }));

const COLS: ColDef[] = [
  { id: 'title', label: 'Risk', locked: true },
  { id: 'project', label: 'Project' },
  { id: 'category', label: 'Category' },
  { id: 'impact', label: 'Impact' },
  { id: 'probability', label: 'Prob.' },
  { id: 'exposure', label: 'Exposure' },
  { id: 'status', label: 'Status' },
  { id: 'owner', label: 'Owner due' },
];

const RISK_FILTERS: FilterDef[] = [
  {
    id: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'All statuses' },
      ...STATUSES.map((s) => ({ value: s, label: s })),
    ],
  },
  {
    id: 'severity',
    label: 'Severity',
    options: [
      { value: 'all', label: 'All severities' },
      { value: 'critical', label: 'Critical (≥20)' },
      { value: 'high', label: 'High (13–19)' },
      { value: 'medium', label: 'Medium (7–12)' },
      { value: 'low', label: 'Low (<7)' },
    ],
  },
];

async function updateRisk(id: string, patch: Partial<Risk>): Promise<void> {
  const { error } = await sb.from('risks').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

async function deleteRiskById(id: string): Promise<void> {
  const { error } = await sb.from('risks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export default function RiskAnalysis() {
  const [risks, setRisks] = useState<Risk[] | null>(null);
  const [heatCell, setHeatCell] = useState<{ i: number; p: number } | null>(null);
  const [chartStatusFilter, setChartStatusFilter] = useState('');
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const [fin, setFin] = useState<RiskMetrics | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const prefs = useListPrefs('snrpmo.risk.cols', COLS, { entity: 'risk', orgId: org?.id, canManage: ['owner', 'admin'].includes(org?.member_role || '') });
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';
  const severityF = prefs.filters.severity || 'all';

  const load = () => {
    getRisks().then(setRisks).catch((e) => { setErr(e.message); setRisks([]); });
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (org?.id && hasFeature(org, 'financial')) glRiskMetrics(org.id).then(setFin).catch(() => {}); }, [org?.id]);

  const allRisks = risks || [];
  const open = allRisks.filter((r) => r.status !== 'Closed');
  const highExp = allRisks.filter((r) => exposure(r) >= 13);
  const avgExp = allRisks.length ? Math.round((allRisks.reduce((a, r) => a + exposure(r), 0) / allRisks.length) * 10) / 10 : 0;

  const matrix = useMemo(() => {
    const m: Record<number, Record<number, number>> = {};
    for (let i = 1; i <= 5; i++) { m[i] = {}; for (let p = 1; p <= 5; p++) m[i][p] = 0; }
    allRisks.forEach((r) => { m[r.impact][r.probability] = (m[r.impact][r.probability] || 0) + 1; });
    return m;
  }, [allRisks]);

  const byStatus = STATUSES.map((s) => ({ status: s, count: allRisks.filter((r) => r.status === s).length }));
  const maxStatus = Math.max(1, ...byStatus.map((b) => b.count));

  // Pre-filter by heatmap cell + chart status bar click, then hand to ListView
  const heatFiltered = useMemo(() => {
    let r = [...allRisks];
    if (heatCell) r = r.filter((x) => x.impact === heatCell.i && x.probability === heatCell.p);
    if (chartStatusFilter) r = r.filter((x) => x.status === chartStatusFilter);
    return r.sort((a, b) => exposure(b) - exposure(a));
  }, [allRisks, heatCell, chartStatusFilter]);

  // ListView search + filter layer on top of heatmap pre-filter
  const shown = useMemo(() => {
    const scoreInRange = (e: number) => {
      if (severityF === 'critical') return e >= 20;
      if (severityF === 'high') return e >= 13 && e < 20;
      if (severityF === 'medium') return e >= 7 && e < 13;
      if (severityF === 'low') return e < 7;
      return true;
    };
    return heatFiltered.filter((r) =>
      (statusF === 'all' || r.status === statusF) &&
      scoreInRange(exposure(r)) &&
      (!q.trim() || `${r.title} ${r.category} ${r.projects?.name || ''}`.toLowerCase().includes(q.toLowerCase()))
    );
  }, [heatFiltered, statusF, severityF, q]);

  const rs = useRowSelection(shown);

  const cell = (id: string, r: Risk) => {
    const e = exposure(r);
    switch (id) {
      case 'title': return <span className="font-medium text-content">{r.title}</span>;
      case 'project': return r.projects?.name || '—';
      case 'category': return <Pill label={r.category} />;
      case 'impact': return <span className="text-sm">{r.impact}</span>;
      case 'probability': return <span className="text-sm">{r.probability}</span>;
      case 'exposure': return (
        <span className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded-md text-2xs font-semibold text-white ${cellTone(e, true)}`}>
          {e} <span className="ml-1 opacity-80">{sevLabel(e)}</span>
        </span>
      );
      case 'status': return <span className={`pill ${STATUS_PILL[r.status] || 'pill-gray'}`}>{r.status}</span>;
      case 'owner': return r.due_date || '—';
      default: return '—';
    }
  };

  const editable: Record<string, EditSpec> = {
    status: { type: 'select', options: STATUSES.map((s) => ({ value: s, label: s })) },
    impact: { type: 'select', options: SCORE_OPTIONS.map((v) => ({ value: v, label: v })) },
    probability: { type: 'select', options: SCORE_OPTIONS.map((v) => ({ value: v, label: v })) },
    category: { type: 'select', options: CATEGORIES.map((c) => ({ value: c, label: c })) },
  };

  const rawValue = (id: string, r: Risk) => {
    if (id === 'status') return r.status;
    if (id === 'impact') return String(r.impact);
    if (id === 'probability') return String(r.probability);
    if (id === 'category') return r.category;
    return '';
  };

  const onInlineEdit = async (r: Risk, id: string, value: string) => {
    try {
      const patch: Partial<Risk> =
        id === 'impact' ? { impact: Number(value) } :
        id === 'probability' ? { probability: Number(value) } :
        { [id]: value };
      await updateRisk(r.id, patch);
      load();
    } catch (e: any) { setErr(e.message); }
  };

  const exportValue = (id: string, r: Risk) => {
    const e = exposure(r);
    if (id === 'title') return r.title;
    if (id === 'project') return r.projects?.name || '';
    if (id === 'category') return r.category;
    if (id === 'impact') return String(r.impact);
    if (id === 'probability') return String(r.probability);
    if (id === 'exposure') return `${e} (${sevLabel(e)})`;
    if (id === 'status') return r.status;
    if (id === 'owner') return r.due_date || '';
    return '';
  };

  const bulkDelete = async (sel: typeof rs) => {
    if (!sel.count || !confirm(`Delete ${sel.count} risk${sel.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const r of sel.selected) await deleteRiskById(r.id); sel.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const clearChartFilters = () => { setHeatCell(null); setChartStatusFilter(''); };
  const hasChartFilter = !!heatCell || !!chartStatusFilter;

  return (
    <Layout title="Risk Analysis">
      <PageHeader
        title="Risk Analysis"
        subtitle="Monitor and manage project risks"
        icon="ti-shield-exclamation"
        help="risk"
      />

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total risks" value={allRisks.length} icon="ti-alert-triangle" />
          <StatCard label="High / Critical" value={highExp.length} hint={`${Math.round((highExp.length / Math.max(1, allRisks.length)) * 100)}% of register`} hintTone="down" icon="ti-flame" />
          <StatCard label="Open" value={open.length} hint={`${allRisks.filter(r => r.status === 'Mitigating').length} mitigating`} icon="ti-progress-alert" />
          <StatCard label="Avg exposure" value={avgExp} hint="impact × probability" icon="ti-activity" />
        </div>

        {fin && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3"><Icon name="ti-shield-dollar" className="text-muted" /><h3 className="text-sm font-semibold text-content">Financial risk</h3><span className="text-2xs text-muted2">live from the ledger</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              <FinMetric label="Cash" value={finFmt(fin.cash)} />
              <FinMetric label="Runway" value={fin.runway_months != null ? `${fin.runway_months} mo` : '—'} tone={fin.runway_months != null && fin.runway_months < 3 ? 'bad' : fin.runway_months != null && fin.runway_months < 6 ? 'warn' : 'ok'} />
              <FinMetric label="A/R overdue" value={finFmt(fin.ar_overdue)} tone={(fin.ar_overdue || 0) > 0 ? 'warn' : 'ok'} />
              <FinMetric label="A/P overdue" value={finFmt(fin.ap_overdue)} tone={(fin.ap_overdue || 0) > 0 ? 'warn' : 'ok'} />
              <FinMetric label="Current ratio" value={fin.current_ratio != null ? String(fin.current_ratio) : '—'} tone={fin.current_ratio != null && fin.current_ratio < 1 ? 'bad' : 'ok'} />
              <FinMetric label="Quick ratio" value={fin.quick_ratio != null ? String(fin.quick_ratio) : '—'} tone={fin.quick_ratio != null && fin.quick_ratio < 1 ? 'warn' : 'ok'} />
              <FinMetric label="DSO" value={fin.dso_days != null ? `${fin.dso_days}d` : '—'} tone={fin.dso_days != null && fin.dso_days > 60 ? 'warn' : 'ok'} />
              <FinMetric label="Top-client share" value={fin.revenue_concentration_pct != null ? `${fin.revenue_concentration_pct}%` : '—'} tone={(fin.revenue_concentration_pct || 0) > 40 ? 'warn' : 'ok'} />
            </div>
          </div>
        )}

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
                        const active = !heatCell || (heatCell.i === i && heatCell.p === p);
                        return (
                          <button key={p} onClick={() => setHeatCell(heatCell && heatCell.i === i && heatCell.p === p ? null : { i, p })}
                            title={`Impact ${i} × Probability ${p} = ${score} (${sevLabel(score)})`}
                            className={`flex-1 aspect-[5/3] rounded-md grid place-items-center text-sm font-semibold transition
                              ${cellTone(score, active)} ${count ? 'text-[rgba(255,255,255,0.95)]' : 'text-[rgba(255,255,255,0.55)]'}
                              ${heatCell && heatCell.i === i && heatCell.p === p ? 'ring-2 ring-ink ring-offset-1' : 'hover:brightness-105'}`}>
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
                <button key={b.status} onClick={() => setChartStatusFilter(chartStatusFilter === b.status ? '' : b.status)}
                  className="w-full text-left group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-2"><Pill label={b.status} />
                      {chartStatusFilter === b.status && <Icon name="ti-filter" className="text-2xs text-neutral-400" />}</span>
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

        {/* Register — ListView */}
        <div>
          {hasChartFilter && (
            <div className="flex items-center gap-2 mb-2">
              {heatCell && <span className="pill pill-gray">Impact {heatCell.i} · Prob {heatCell.p}</span>}
              {chartStatusFilter && <span className="pill pill-gray">{chartStatusFilter}</span>}
              <button onClick={clearChartFilters} className="btn-ghost text-2xs text-neutral-500 px-2 py-1 rounded">Clear chart filters</button>
            </div>
          )}
          <ListView
            rows={risks === null ? null : shown}
            rowKey={(r) => r.id}
            cols={COLS}
            prefs={prefs}
            cell={cell}
            selection={rs}
            filters={RISK_FILTERS}
            searchPlaceholder="Search risks…"
            groupField={{ value: 'status', label: 'Status' }}
            groupOf={(r) => r.status}
            groups={GROUPS}
            editable={editable}
            rawValue={rawValue}
            onEdit={onInlineEdit}
            exportName="risk"
            exportValue={exportValue}
            onDelete={(sel) => bulkDelete(sel)}
            canDelete={isAdmin}
            busy={busy}
            emptyIcon="ti-shield-check"
            emptyText="No risks match."
          />
        </div>
      </div>
    </Layout>
  );
}

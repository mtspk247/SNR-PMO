import { useMemo, useRef, useState, useEffect } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PriorityBars, PageHeader, Pill, Spinner, EmptyState, StatCard, Icon } from '@/components/ui';
import { useProjects, usePortfolios } from '@/lib/queries';
import { updateProject, deleteProject } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { Project, Portfolio } from '@/lib/supabase';
import { ColDef, useListPrefs } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { ListView } from '@/components/ListView';
import { GroupMeta } from '@/components/DataList';

// ── Status → bar colour (bg token) ─────────────────────────────────────────
const STATUS_BAR: Record<string, string> = {
  Planning:  'bg-blue-400',
  Active:    'bg-green-500',
  'On Hold': 'bg-amber-400',
  Completed: 'bg-violet-500',
  Cancelled: 'bg-rose-500',
};
const STATUS_PROGRESS: Record<string, string> = {
  Planning:  'bg-blue-600',
  Active:    'bg-green-700',
  'On Hold': 'bg-amber-600',
  Completed: 'bg-violet-700',
  Cancelled: 'bg-rose-700',
};
const STATUS_PILL: Record<string, string> = {
  Active:    'pill-green',
  Planning:  'pill-blue',
  'On Hold': 'pill-amber',
  Completed: 'pill-violet',
  Cancelled: 'pill-red',
};
const STATUS_ORDER = ['Active', 'Planning', 'On Hold', 'Completed', 'Cancelled'];
const PRIORITY_ORDER = ['Urgent', 'High', 'Medium', 'Low'];

// ── Unscheduled list config ──────────────────────────────────────────────────
const COLS: ColDef[] = [
  { id: 'name',     label: 'Project', locked: true },
  { id: 'status',   label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'progress', label: 'Progress' },
];

const UNSCHED_GROUPS: GroupMeta[] = STATUS_ORDER.map((st) => ({
  value: st,
  label: st,
  pill: STATUS_PILL[st] || 'pill-gray',
}));

// ── Date helpers ─────────────────────────────────────────────────────────────
function parseDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function isoDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function pct(value: Date, rangeStart: Date, rangeEnd: Date): number {
  const total = rangeEnd.getTime() - rangeStart.getTime();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, ((value.getTime() - rangeStart.getTime()) / total) * 100));
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_MIN_W = 90; // px

// ── Inline date-edit popover ─────────────────────────────────────────────────
interface PopoverProps {
  project: Project;
  canEdit: boolean;
  onClose: () => void;
  onSave: (id: string, patch: { start_date: string | null; end_date: string | null }) => Promise<void>;
  anchorRef: React.RefObject<HTMLDivElement>;
}
function BarPopover({ project: p, canEdit, onClose, onSave, anchorRef }: PopoverProps) {
  const [start, setStart] = useState(p.start_date || '');
  const [end, setEnd] = useState(p.end_date || '');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  const save = async () => {
    setBusy(true);
    try {
      await onSave(p.id, { start_date: start || null, end_date: end || null });
      onClose();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div
      ref={ref}
      className="card absolute z-50 shadow-xl border border-line p-4 w-72 text-sm"
      style={{ top: '100%', left: 0, marginTop: 4 }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-content leading-tight">{p.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Pill label={p.status} />
            <span className="text-2xs text-muted">{p.priority}</span>
          </div>
        </div>
        <button className="btn-ghost p-1" onClick={onClose}><Icon name="ti-x" /></button>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1.5 rounded bg-surface2 overflow-hidden">
          <div
            className={`h-1.5 rounded ${STATUS_PROGRESS[p.status] ?? 'bg-accent'}`}
            style={{ width: `${p.progress ?? 0}%` }}
          />
        </div>
        <span className="text-2xs text-muted tabular-nums w-8 text-right">{p.progress ?? 0}%</span>
      </div>
      {canEdit && (
        <div className="mt-3 border-t border-line pt-3 flex flex-col gap-2">
          <p className="text-2xs text-muted font-medium uppercase tracking-wide mb-1">Edit dates</p>
          <label className="flex flex-col gap-0.5">
            <span className="text-2xs text-muted">Start</span>
            <input type="date" className="input text-sm" value={start} onChange={e => setStart(e.target.value)} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-2xs text-muted">End</span>
            <input type="date" className="input text-sm" value={end} onChange={e => setEnd(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2 mt-1">
            <button className="btn text-xs px-3 py-1.5" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary text-xs px-3 py-1.5" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
      <Link href={`/projects/${p.id}`} className="mt-3 flex items-center gap-1 text-2xs text-accent hover:underline">
        Open project <Icon name="ti-arrow-right" className="text-xs" />
      </Link>
    </div>
  );
}

// ── Gantt row ────────────────────────────────────────────────────────────────
interface RowProps {
  project: Project;
  rangeStart: Date;
  rangeEnd: Date;
  totalMonths: number;
  canEdit: boolean;
  onSave: (id: string, patch: { start_date: string | null; end_date: string | null }) => Promise<void>;
}
function GanttRow({ project: p, rangeStart, rangeEnd, totalMonths, canEdit, onSave }: RowProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const s = parseDate(p.start_date);
  const e = parseDate(p.end_date);

  const left = s ? pct(s < rangeStart ? rangeStart : s, rangeStart, rangeEnd) : 0;
  const right = e ? pct(e > rangeEnd ? rangeEnd : e, rangeStart, rangeEnd) : 100;
  const width = Math.max(right - left, 0.5);

  const barBg = STATUS_BAR[p.status] ?? 'bg-blue-400';
  const progressBg = STATUS_PROGRESS[p.status] ?? 'bg-blue-600';

  return (
    <div className="flex border-b border-line last:border-b-0 group" style={{ minHeight: 40 }}>
      {/* sticky name column */}
      <div className="sticky left-0 z-10 bg-surface flex items-center gap-2 px-3 w-52 shrink-0 border-r border-line">
        <Link
          href={`/projects/${p.id}`}
          className="font-medium text-sm text-content truncate hover:text-accent"
          title={p.name}
        >
          {p.name}
        </Link>
        <Pill label={p.status} />
      </div>

      {/* bar track */}
      <div
        className="relative flex-1"
        style={{ minWidth: totalMonths * MONTH_MIN_W }}
      >
        {/* bar */}
        <div
          ref={anchorRef}
          className="absolute top-2 h-6 rounded cursor-pointer opacity-90 hover:opacity-100 transition-opacity overflow-hidden"
          style={{ left: `${left}%`, width: `${width}%`, minWidth: 4 }}
          onClick={() => setOpen(v => !v)}
          title={`${p.name} · ${p.start_date ?? '?'} → ${p.end_date ?? '?'}`}
        >
          {/* base bar */}
          <div className={`absolute inset-0 rounded ${barBg} opacity-40`} />
          {/* progress overlay */}
          <div
            className={`absolute top-0 left-0 h-full rounded ${progressBg} opacity-80`}
            style={{ width: `${p.progress ?? 0}%` }}
          />
          {/* label */}
          <span className="absolute inset-0 flex items-center px-2 text-2xs font-medium text-white truncate">
            {p.name}
          </span>
        </div>

        {/* popover */}
        {open && (
          <div className="absolute top-2 z-50" style={{ left: `${left}%` }}>
            <BarPopover
              project={p}
              canEdit={canEdit}
              onClose={() => setOpen(false)}
              onSave={onSave}
              anchorRef={anchorRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Group section ────────────────────────────────────────────────────────────
interface GroupProps {
  label: string;
  projects: Project[];
  rangeStart: Date;
  rangeEnd: Date;
  totalMonths: number;
  canEdit: boolean;
  onSave: (id: string, patch: { start_date: string | null; end_date: string | null }) => Promise<void>;
}
function GanttGroup({ label, projects, rangeStart, rangeEnd, totalMonths, canEdit, onSave }: GroupProps) {
  return (
    <div>
      <div className="sticky left-0 px-3 py-1.5 bg-surface2 border-b border-line">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      </div>
      {projects.map(p => (
        <GanttRow
          key={p.id}
          project={p}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          totalMonths={totalMonths}
          canEdit={canEdit}
          onSave={onSave}
        />
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function RoadmapPage() {
  const org = useActiveOrg();
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useProjects();
  const { data: portfolios = [] } = usePortfolios();
  const canEdit = can.write(org);
  const isAdmin = can.manageOrg(org);

  // ── View options
  const [groupBy, setGroupBy] = useState<'portfolio' | 'status' | 'priority' | 'none'>('portfolio');
  const [statusF, setStatusF] = useState('all');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [busy, setBusy] = useState(false);

  // ── Unscheduled list prefs + selection
  const prefs = useListPrefs('snrpmo.roadmap.cols', COLS);
  const { scheduled, unscheduled } = useMemo(() => {
    const sched: Project[] = [];
    const unsched: Project[] = [];
    for (const p of projects) {
      if (statusF !== 'all' && p.status !== statusF) continue;
      if (p.start_date && p.end_date) sched.push(p);
      else unsched.push(p);
    }
    return { scheduled: sched, unscheduled: unsched };
  }, [projects, statusF]);

  const rs = useRowSelection(unscheduled);

  // ── Compute timeline range (fits the visible/scheduled set)
  const { rangeStart, rangeEnd, months } = useMemo(() => {
    const now = new Date();
    if (scheduled.length === 0) {
      const rs = startOfMonth(new Date(now.getFullYear(), 0, 1));
      const re = startOfMonth(new Date(now.getFullYear(), 12, 1));
      const ms: Date[] = [];
      let cur = rs;
      while (cur < re) { ms.push(cur); cur = addMonths(cur, 1); }
      return { rangeStart: rs, rangeEnd: re, months: ms };
    }
    const allDates = scheduled.flatMap(p => [parseDate(p.start_date), parseDate(p.end_date)]).filter(Boolean) as Date[];
    const minD = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxD = new Date(Math.max(...allDates.map(d => d.getTime())));
    const rs = startOfMonth(addMonths(minD, -1));
    const re = addMonths(startOfMonth(maxD), 2);
    const ms: Date[] = [];
    let cur = rs;
    while (cur < re) { ms.push(cur); cur = addMonths(cur, 1); }
    return { rangeStart: rs, rangeEnd: re, months: ms };
  }, [scheduled]);

  // ── Group scheduled by the chosen dimension
  const groupEntries = useMemo<[string, Project[]][]>(() => {
    if (groupBy === 'none') return [['', scheduled]];
    const portfolioMap = new Map<string, Portfolio>(portfolios.map(pf => [pf.id, pf]));
    const m = new Map<string, Project[]>();
    for (const p of scheduled) {
      const key =
        groupBy === 'portfolio' ? (p.portfolio_id ? (portfolioMap.get(p.portfolio_id)?.name ?? 'Unknown portfolio') : 'No portfolio')
        : groupBy === 'status' ? (p.status || 'No status')
        : (p.priority || 'No priority');
      const list = m.get(key) ?? [];
      list.push(p); m.set(key, list);
    }
    const entries = [...m.entries()];
    const order = groupBy === 'status' ? STATUS_ORDER : groupBy === 'priority' ? PRIORITY_ORDER : null;
    if (order) entries.sort((a, b) => (order.indexOf(a[0]) < 0 ? 99 : order.indexOf(a[0])) - (order.indexOf(b[0]) < 0 ? 99 : order.indexOf(b[0])));
    return entries;
  }, [scheduled, portfolios, groupBy]);

  // Single un-portfolioed group reads cleaner without a header (preserves prior UX).
  const hasGroups = groupBy !== 'none' && !(groupEntries.length === 1 && groupEntries[0][0] === 'No portfolio');

  // ── Stats (whole portfolio, unaffected by filter)
  const total = projects.length;
  const active = projects.filter(p => p.status === 'Active').length;
  const done = projects.filter(p => p.status === 'Completed').length;
  const allUnscheduled = useMemo(() => projects.filter(p => !(p.start_date && p.end_date)).length, [projects]);

  // ── Analysis (status mix, overdue, avg progress, on-track)
  const analysis = useMemo(() => {
    const today = new Date();
    const byStatus = new Map<string, number>();
    for (const p of projects) byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);
    const overdue = projects.filter(p => {
      const e = parseDate(p.end_date);
      return e && e < today && p.status !== 'Completed' && p.status !== 'Cancelled';
    }).length;
    const avgProgress = projects.length ? Math.round(projects.reduce((s, p) => s + (p.progress ?? 0), 0) / projects.length) : 0;
    const schedAll = projects.filter(p => p.start_date && p.end_date);
    const onTrack = schedAll.filter(p => { const e = parseDate(p.end_date); return p.status === 'Completed' || (e && e >= today); }).length;
    const onTrackPct = schedAll.length ? Math.round((onTrack / schedAll.length) * 100) : 0;
    return { byStatus, overdue, avgProgress, onTrackPct, schedCount: schedAll.length };
  }, [projects]);

  // ── Cache-patch save (mirrors useUpdateProject.onSuccess pattern)
  const handleSave = async (id: string, patch: { start_date: string | null; end_date: string | null }) => {
    const list = await updateProject(id, patch);
    qc.setQueryData(qk.projects(org?.id), list);
  };

  // ── Unscheduled: inline status/priority edit via updateProject
  const handleEdit = async (p: Project, colId: string, value: string) => {
    const patch = colId === 'status' ? { status: value } : { priority: value };
    const list = await updateProject(p.id, patch);
    qc.setQueryData(qk.projects(org?.id), list);
  };

  // ── Unscheduled: bulk delete (admin-gated, cache-invalidated)
  const handleBulkDelete = async (sel: typeof rs) => {
    if (!sel.count || !confirm(`Delete ${sel.count} project${sel.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true);
    try {
      for (const p of sel.selected) await deleteProject(p.id);
      sel.clear();
      qc.invalidateQueries({ queryKey: qk.projects(org?.id) });
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };


  const cell = (id: string, p: Project) => {
    switch (id) {
      case 'name':
        return (
          <Link href={`/projects/${p.id}`} className="font-medium text-content hover:text-accent">
            {p.name}
          </Link>
        );
      case 'status':   return <Pill label={p.status} />;
      case 'priority': return <span className="inline-flex items-center gap-2"><PriorityBars priority={p.priority} /><Pill label={p.priority} /></span>;
      case 'progress':
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded bg-surface2">
              <div
                className={`h-1.5 rounded ${STATUS_PROGRESS[p.status] ?? 'bg-accent'}`}
                style={{ width: `${p.progress ?? 0}%` }}
              />
            </div>
            <span className="text-2xs text-muted tabular-nums w-8 text-right">{p.progress ?? 0}%</span>
          </div>
        );
      default: return '—';
    }
  };

  // ── Unscheduled: export plain-text values
  const exportValue = (id: string, p: Project) => {
    switch (id) {
      case 'name':     return p.name;
      case 'status':   return p.status || '';
      case 'priority': return p.priority || '';
      case 'progress': return String(p.progress ?? 0) + '%';
      default: return '';
    }
  };

  const todayPct = pct(new Date(), rangeStart, rangeEnd);

  if (isLoading) return <Layout flat title="Roadmap"><Spinner /></Layout>;

  return (
    <Layout flat title="Roadmap">
      <PageHeader help="work"
        title="Roadmap"
        subtitle="Project timeline — visualise schedules and track progress across the portfolio."
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total" value={String(total)} hint="All projects" icon="ti-folder" />
        <StatCard label="Active" value={String(active)} hint="In progress" hintTone="up" icon="ti-player-play" />
        <StatCard label="Completed" value={String(done)} hint="Finished" hintTone="up" icon="ti-circle-check" />
        <StatCard label="Unscheduled" value={String(allUnscheduled)} hint="Missing dates" icon="ti-calendar-off" />
      </div>

      {projects.length === 0 ? (
        <div className="card p-8">
          <EmptyState icon="ti-calendar" text="No projects yet — create one from the Projects page." />
        </div>
      ) : (
        <>
          {/* View options */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className="text-2xs text-muted2">Group by</span>
            <div className="w-auto"><Select value={groupBy} onChange={(v) => setGroupBy(v as any)} options={[{ value: 'portfolio', label: 'Portfolio' }, { value: 'status', label: 'Status' }, { value: 'priority', label: 'Priority' }, { value: 'none', label: 'None' }]} /></div>
            <div className="w-auto"><Select value={statusF} onChange={(v) => setStatusF(v)} options={[{ value: 'all', label: 'All statuses' }, ...STATUS_ORDER.map(st => ({ value: st, label: titleCase(st) }))]} /></div>
            <div className="hidden sm:block flex-1" />
            <button onClick={() => setShowAnalysis(v => !v)} className={`btn h-9 ${showAnalysis ? 'border-accent text-accentstrong' : ''}`}>
              <Icon name="ti-chart-histogram" className="text-sm" />Analysis
            </button>
          </div>

          {/* Analysis panel */}
          {showAnalysis && (
            <div className="card p-4 mb-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wide text-muted mb-2">Status distribution</p>
                  <div className="flex flex-col gap-1.5">
                    {STATUS_ORDER.filter(st => (analysis.byStatus.get(st) ?? 0) > 0).map(st => {
                      const n = analysis.byStatus.get(st) ?? 0;
                      return (
                        <div key={st} className="flex items-center gap-2">
                          <span className="text-2xs text-muted w-20 shrink-0">{st}</span>
                          <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
                            <div className={`h-full rounded-full ${STATUS_BAR[st] ?? 'bg-accent'}`} style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
                          </div>
                          <span className="text-2xs text-muted tabular-nums w-6 text-right">{n}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 content-start">
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-2xl font-semibold tabular-nums text-content">{analysis.avgProgress}%</p>
                    <p className="text-2xs text-muted mt-0.5">Avg progress</p>
                  </div>
                  <div className="rounded-lg border border-line p-3">
                    <p className={`text-2xl font-semibold tabular-nums ${analysis.overdue > 0 ? 'text-rose-500' : 'text-content'}`}>{analysis.overdue}</p>
                    <p className="text-2xs text-muted mt-0.5">Overdue (past end)</p>
                  </div>
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-2xl font-semibold tabular-nums text-content">{analysis.onTrackPct}%</p>
                    <p className="text-2xs text-muted mt-0.5">On track (of {analysis.schedCount} scheduled)</p>
                  </div>
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-2xl font-semibold tabular-nums text-content">{allUnscheduled}</p>
                    <p className="text-2xs text-muted mt-0.5">Unscheduled</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {scheduled.length === 0 && unscheduled.length === 0 ? (
            <div className="card p-8"><EmptyState icon="ti-filter-off" text="No projects match this status filter." /></div>
          ) : null}

          {/* ── Gantt chart */}
          {scheduled.length > 0 && (
            <div className="card overflow-hidden mb-6">
              <div className="overflow-x-auto" style={{ position: 'relative' }}>
                <div style={{ minWidth: months.length * MONTH_MIN_W + 208 }}>
                  {/* Month header */}
                  <div className="flex border-b border-line sticky top-0 z-20 bg-surface">
                    <div className="sticky left-0 z-30 w-52 shrink-0 bg-surface border-r border-line" />
                    <div className="flex flex-1" style={{ minWidth: months.length * MONTH_MIN_W }}>
                      {months.map((m, i) => (
                        <div
                          key={i}
                          className="text-2xs text-muted font-medium py-2 px-2 border-r border-line last:border-r-0 shrink-0 text-center"
                          style={{ width: MONTH_MIN_W }}
                        >
                          {MONTH_NAMES[m.getMonth()]} {m.getFullYear()}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Rows with today line overlay */}
                  <div className="relative">
                    {todayPct >= 0 && todayPct <= 100 && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-accent/60 z-10 pointer-events-none"
                        style={{ left: `calc(${208}px + ${todayPct}% * (100% - ${208}px) / 100)` }}
                        title={`Today: ${isoDateStr(new Date())}`}
                      />
                    )}

                    {hasGroups ? (
                      groupEntries.map(([label, projs]) => (
                        <GanttGroup
                          key={label}
                          label={label}
                          projects={projs}
                          rangeStart={rangeStart}
                          rangeEnd={rangeEnd}
                          totalMonths={months.length}
                          canEdit={canEdit}
                          onSave={handleSave}
                        />
                      ))
                    ) : (
                      scheduled.map(p => (
                        <GanttRow
                          key={p.id}
                          project={p}
                          rangeStart={rangeStart}
                          rangeEnd={rangeEnd}
                          totalMonths={months.length}
                          canEdit={canEdit}
                          onSave={handleSave}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Unscheduled (ListView) */}
          {unscheduled.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line flex items-center gap-2">
                <Icon name="ti-calendar-off" className="text-muted" />
                <span className="text-sm font-medium text-muted">Unscheduled ({unscheduled.length})</span>
              </div>
              <div className="p-4">
                <ListView
                  rows={unscheduled}
                  rowKey={(p) => p.id}
                  cols={COLS}
                  prefs={prefs}
                  cell={cell}
                  selection={rs}
                  groupField={{ value: 'status', label: 'Status' }}
                  groupOf={(p) => p.status}
                  groups={UNSCHED_GROUPS}
                  exportName="roadmap"
                  exportValue={exportValue}
                  onDelete={handleBulkDelete}
                  canDelete={isAdmin}
                  busy={busy}
                  editable={canEdit ? {
                    status:   { type: 'select', options: STATUS_ORDER.map(s => ({ value: s, label: s })) },
                    priority: { type: 'select', options: PRIORITY_ORDER.map(s => ({ value: s, label: s })) },
                  } : undefined}
                  rawValue={(id, p) => id === 'status' ? p.status : id === 'priority' ? (p.priority || '') : ''}
                  onEdit={handleEdit}
                  onRowClick={(p) => window.location.href = `/projects/${p.id}`}
                  emptyIcon="ti-calendar-off"
                  emptyText="No unscheduled projects."
                />
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

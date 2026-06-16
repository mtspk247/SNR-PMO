import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, StatCard, Icon, Spinner } from '@/components/ui';
import Dropdown from '@/components/Dropdown';
import { useTasks, useLeaves, useProjects, useOrgCompanies } from '@/lib/queries';
import { Task, Leave } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a YYYY-MM-DD string into a local-midnight Date (avoids UTC off-by-one). */
function parseLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/** Returns 42 calendar cells for a month grid (Mon-first). */
function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // Mon=0 offset: getDay() returns 0=Sun → shift so Mon=0
  const startOffset = (first.getDay() + 6) % 7;
  const cells: Date[] = [];
  const start = new Date(year, month, 1 - startOffset);
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------------------------------------------------------------------------
// Event building
// ---------------------------------------------------------------------------

type CalEvent =
  | { kind: 'task'; id: string; label: string; dot: 'done' | 'overdue' | 'accent' }
  | { kind: 'leave'; id: string; label: string };

function taskDot(task: Task, today: Date): 'done' | 'overdue' | 'accent' {
  if (task.status === 'Done') return 'done';
  if (task.due_date && parseLocal(task.due_date) < today && task.status !== 'Done') return 'overdue';
  return 'accent';
}

function buildDayEvents(
  day: Date,
  tasks: Task[],
  leaves: Leave[],
  today: Date,
): CalEvent[] {
  const events: CalEvent[] = [];

  for (const t of tasks) {
    if (!t.due_date) continue;
    const d = parseLocal(t.due_date);
    if (sameDay(d, day)) {
      events.push({ kind: 'task', id: t.id, label: t.name, dot: taskDot(t, today) });
    }
  }

  for (const l of leaves) {
    if (l.status !== 'Approved' && l.status !== 'Pending') continue;
    const start = parseLocal(l.start_date);
    const end = parseLocal(l.end_date);
    if (day >= start && day <= end) {
      const name = l.requester?.full_name || 'Leave';
      events.push({ kind: 'leave', id: l.id, label: `${name} · leave` });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// EventChip
// ---------------------------------------------------------------------------

function EventChip({ ev, onClick }: { ev: CalEvent; onClick?: () => void }) {
  if (ev.kind === 'task') {
    const dotClass =
      ev.dot === 'done' ? 'bg-muted2' :
      ev.dot === 'overdue' ? 'bg-rose-500' : 'bg-accent';
    const textClass =
      ev.dot === 'done' ? 'text-muted line-through' :
      ev.dot === 'overdue' ? 'text-rose-600' : 'text-content';
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 w-full text-left px-1 py-0.5 rounded hover:bg-surface2 transition-colors"
      >
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span className={`text-2xs truncate ${textClass}`}>{ev.label}</span>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1 w-full px-1 py-0.5 rounded bg-accent/10">
      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accentstrong" />
      <span className="text-2xs text-accentstrong truncate">{ev.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DayPopover
// ---------------------------------------------------------------------------

function DayPopover({
  day,
  events,
  onClose,
  onTaskClick,
}: {
  day: Date;
  events: CalEvent[];
  onClose: () => void;
  onTaskClick: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full left-0 mt-1 w-56 card shadow-lg p-2 flex flex-col gap-1"
    >
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-xs font-medium text-content">
          {day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
        <button onClick={onClose} className="btn-ghost p-0.5">
          <Icon name="ti-x" className="text-sm" />
        </button>
      </div>
      {events.map((ev) => (
        <EventChip
          key={ev.kind + ev.id}
          ev={ev}
          onClick={ev.kind === 'task' ? () => { onTaskClick(ev.id); onClose(); } : undefined}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DayCell
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 3;

function DayCell({
  day,
  isCurrentMonth,
  isToday,
  events,
  onTaskClick,
  tall = false,
}: {
  day: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalEvent[];
  onTaskClick: (id: string) => void;
  tall?: boolean;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const overflow = events.length - MAX_VISIBLE;
  const visible = events.slice(0, MAX_VISIBLE);
  const closePopover = useCallback(() => setPopoverOpen(false), []);

  return (
    <div
      className={`relative ${tall ? 'min-h-[9rem]' : 'min-h-[5.5rem]'} p-1 border-r border-b border-line flex flex-col gap-0.5
        ${isCurrentMonth ? 'bg-surface' : 'bg-surface2'}`}
    >
      <span
        className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full shrink-0 self-start
          ${isToday
            ? 'bg-accent text-accentfg'
            : isCurrentMonth ? 'text-content' : 'text-muted2'}`}
      >
        {day.getDate()}
      </span>

      {visible.map((ev) => (
        <EventChip
          key={ev.kind + ev.id}
          ev={ev}
          onClick={ev.kind === 'task' ? () => onTaskClick(ev.id) : undefined}
        />
      ))}

      {overflow > 0 && (
        <button
          onClick={() => setPopoverOpen(true)}
          className="text-2xs text-muted hover:text-accentstrong px-1 text-left transition-colors"
        >
          +{overflow} more
        </button>
      )}

      {popoverOpen && (
        <DayPopover
          day={day}
          events={events}
          onClose={closePopover}
          onTaskClick={onTaskClick}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const router = useRouter();
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  type View = 'month' | 'week' | 'range';
  const [view, setView] = useState<View>('month');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [weekAnchor, setWeekAnchor] = useState<Date>(today);
  const [rangeStart, setRangeStart] = useState<string>(isoDate(today));
  const [rangeEnd, setRangeEnd] = useState<string>(isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 13)));

  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: leaves = [], isLoading: leavesLoading } = useLeaves();
  const { data: projects = [] } = useProjects();
  const { data: companies = [] } = useOrgCompanies();
  const isLoading = tasksLoading || leavesLoading;
  const [companyFilter, setCompanyFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const projCompany = useMemo(() => { const m = new Map<string, string>(); projects.forEach((p: any) => { if (p.company_id) m.set(p.id, p.company_id); }); return m; }, [projects]);
  const fTasks = useMemo(() => tasks.filter((t) => (!companyFilter || projCompany.get(t.project_id || '') === companyFilter) && (!projectFilter || t.project_id === projectFilter)), [tasks, companyFilter, projectFilter, projCompany]);

  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  // Mon-first week containing the anchor date.
  const weekCells = useMemo(() => {
    const off = (weekAnchor.getDay() + 6) % 7;
    const start = new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), weekAnchor.getDate() - off);
    return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [weekAnchor]);

  // Inclusive day list for the custom range (guarded so a wide range can't run away).
  const rangeDays = useMemo(() => {
    const s = parseLocal(rangeStart), e = parseLocal(rangeEnd);
    if (e < s) return [];
    const out: Date[] = []; let cur = s, guard = 0;
    while (cur <= e && guard++ < 370) { out.push(cur); cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1); }
    return out;
  }, [rangeStart, rangeEnd]);

  const visibleDays = useMemo(
    () => (view === 'month' ? grid : view === 'week' ? weekCells : rangeDays),
    [view, grid, weekCells, rangeDays],
  );

  const eventMap = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const cell of visibleDays) map.set(isoDate(cell), buildDayEvents(cell, fTasks, leaves, today));
    return map;
  }, [visibleDays, fTasks, leaves, today]);

  // Active period drives the stat cards + the header title.
  const period = useMemo(() => {
    if (view === 'week') return { start: weekCells[0], end: weekCells[6], label: `${fmt(weekCells[0])} – ${fmt(weekCells[6])}, ${weekCells[6].getFullYear()}` };
    if (view === 'range') {
      const s = parseLocal(rangeStart), e = parseLocal(rangeEnd);
      return { start: s, end: e, label: e < s ? 'Invalid range' : `${fmt(s)} – ${fmt(e)}` };
    }
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0), label: `${MONTH_NAMES[month]} ${year}` };
  }, [view, weekCells, rangeStart, rangeEnd, year, month]);

  const stats = useMemo(() => {
    const { start, end } = period;
    const inPeriod = fTasks.filter((t) => {
      if (!t.due_date) return false;
      const d = parseLocal(t.due_date);
      return d >= start && d <= end;
    }).length;
    const overdue = fTasks.filter((t) => {
      if (!t.due_date || t.status === 'Done') return false;
      return parseLocal(t.due_date) < today;
    }).length;
    const leavesInPeriod = leaves.filter((l) => {
      if (l.status !== 'Approved' && l.status !== 'Pending') return false;
      const s = parseLocal(l.start_date), e = parseLocal(l.end_date);
      return s <= end && e >= start;
    }).length;
    return { inPeriod, overdue, leavesInPeriod };
  }, [fTasks, leaves, period, today]);

  // Navigation adapts to the active view.
  const goPrev = () => {
    if (view === 'month') { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); }
    else if (view === 'week') setWeekAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7));
  };
  const goNext = () => {
    if (view === 'month') { if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); }
    else if (view === 'week') setWeekAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7));
  };
  const goToday = () => {
    setYear(today.getFullYear()); setMonth(today.getMonth()); setWeekAnchor(today);
  };

  const handleTaskClick = useCallback((id: string) => {
    router.push(`/tasks?task=${id}`);
  }, [router]);

  const DayGrid = ({ cells, tall }: { cells: Date[]; tall?: boolean }) => (
    <div className="overflow-x-auto">
      <div style={{ minWidth: '42rem' }}>
        <div className="grid grid-cols-7 border-b border-line">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="py-2 text-center text-2xs font-medium text-muted uppercase tracking-wide">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const key = isoDate(day);
            return (
              <DayCell
                key={key + idx}
                day={day}
                isCurrentMonth={view === 'month' ? day.getMonth() === month : true}
                isToday={sameDay(day, today)}
                events={eventMap.get(key) ?? []}
                onTaskClick={handleTaskClick}
                tall={tall}
              />
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <Layout flat title="Calendar">
      <PageHeader title="Calendar" subtitle="Tasks and leave at a glance." />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Tasks due" value={String(stats.inPeriod)} hint={period.label} icon="ti-calendar-due" />
        <StatCard label="Overdue tasks" value={String(stats.overdue)} hint="Not done, past due" hintTone={stats.overdue > 0 ? 'down' : 'muted'} icon="ti-alert-triangle" />
        <StatCard label="Leaves" value={String(stats.leavesInPeriod)} hint="Approved + Pending" icon="ti-beach" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-line">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-sm font-semibold text-content truncate">{period.label}</h2>
            <div className="flex items-center rounded-lg border border-line overflow-hidden h-8 shrink-0">
              {(['month', 'week', 'range'] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`h-full px-3 text-xs capitalize transition ${view === v ? 'bg-surface2 text-content font-medium' : 'text-muted hover:text-content'}`}>
                  {v === 'range' ? 'Custom' : v}
                </button>
              ))}
            </div>
            {(companies.length > 0 || projects.length > 0) && (
              <div className="hidden md:flex items-center gap-2 shrink-0">
                {companies.length > 0 && (
                  <Dropdown value={companyFilter} onChange={(v) => { setCompanyFilter(v); setProjectFilter(''); }} width={190}
                    items={[{ value: '', label: 'All companies' }, ...companies.map((c: any) => ({ value: c.id, label: c.name }))]}
                    trigger={<span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-line bg-surface text-xs text-content cursor-pointer hover:border-borderstrong"><Icon name="ti-building" className="text-sm text-muted2" />{companies.find((c: any) => c.id === companyFilter)?.name || 'All companies'}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>} />
                )}
                {projects.length > 0 && (
                  <Dropdown value={projectFilter} onChange={setProjectFilter} width={210}
                    items={[{ value: '', label: 'All projects' }, ...projects.filter((p: any) => !companyFilter || p.company_id === companyFilter).map((p: any) => ({ value: p.id, label: p.name }))]}
                    trigger={<span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-line bg-surface text-xs text-content cursor-pointer hover:border-borderstrong"><Icon name="ti-folder" className="text-sm text-muted2" />{projects.find((p: any) => p.id === projectFilter)?.name || 'All projects'}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>} />
                )}
              </div>
            )}
          </div>
          {view === 'range' ? (
            <div className="flex items-center gap-2">
              <input type="date" value={rangeStart} max={rangeEnd} onChange={(e) => setRangeStart(e.target.value)}
                className="h-8 px-2 rounded-lg border border-line bg-surface text-xs text-content outline-none focus:border-accent" />
              <span className="text-muted2 text-xs">to</span>
              <input type="date" value={rangeEnd} min={rangeStart} onChange={(e) => setRangeEnd(e.target.value)}
                className="h-8 px-2 rounded-lg border border-line bg-surface text-xs text-content outline-none focus:border-accent" />
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button className="btn btn-ghost px-2 py-1" onClick={goPrev} title={view === 'week' ? 'Previous week' : 'Previous month'}><Icon name="ti-chevron-left" /></button>
              <button className="btn px-2.5 py-1 text-xs" onClick={goToday}>Today</button>
              <button className="btn btn-ghost px-2 py-1" onClick={goNext} title={view === 'week' ? 'Next week' : 'Next month'}><Icon name="ti-chevron-right" /></button>
            </div>
          )}
        </div>

        {isLoading ? (
          <Spinner />
        ) : view === 'month' ? (
          <DayGrid cells={grid} />
        ) : view === 'week' ? (
          <DayGrid cells={weekCells} tall />
        ) : (
          <div className="divide-y divide-line">
            {period.label === 'Invalid range' ? (
              <p className="px-4 py-10 text-center text-sm text-muted2">End date is before start date.</p>
            ) : rangeDays.every((d) => (eventMap.get(isoDate(d)) ?? []).length === 0) ? (
              <p className="px-4 py-10 text-center text-sm text-muted2">No tasks or leave in this range.</p>
            ) : (
              rangeDays.filter((d) => (eventMap.get(isoDate(d)) ?? []).length > 0).map((d) => {
                const evs = eventMap.get(isoDate(d)) ?? [];
                return (
                  <div key={isoDate(d)} className={`flex gap-3 px-4 py-3 ${sameDay(d, today) ? 'bg-accent/5' : ''}`}>
                    <div className="w-28 shrink-0">
                      <div className="text-xs font-medium text-content">{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                      <div className="text-2xs text-muted2">{d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </div>
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      {evs.map((ev) => (
                        <EventChip key={ev.kind + ev.id} ev={ev} onClick={ev.kind === 'task' ? () => handleTaskClick(ev.id) : undefined} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-t border-line">
          <div className="flex items-center gap-1.5 text-2xs text-muted"><span className="w-2 h-2 rounded-full bg-accent inline-block" /> Task (upcoming)</div>
          <div className="flex items-center gap-1.5 text-2xs text-muted"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Task (overdue)</div>
          <div className="flex items-center gap-1.5 text-2xs text-muted"><span className="w-2 h-2 rounded-full bg-muted2 inline-block" /> Task (done)</div>
          <div className="flex items-center gap-1.5 text-2xs text-muted"><span className="w-2 h-2 rounded-full bg-accentstrong inline-block" /> Leave</div>
        </div>
      </div>
    </Layout>
  );
}

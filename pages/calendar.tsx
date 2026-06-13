import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, StatCard, Icon, Spinner } from '@/components/ui';
import { useTasks, useLeaves } from '@/lib/queries';
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
}: {
  day: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalEvent[];
  onTaskClick: (id: string) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const overflow = events.length - MAX_VISIBLE;
  const visible = events.slice(0, MAX_VISIBLE);
  const closePopover = useCallback(() => setPopoverOpen(false), []);

  return (
    <div
      className={`relative min-h-[5.5rem] p-1 border-r border-b border-line flex flex-col gap-0.5
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

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: leaves = [], isLoading: leavesLoading } = useLeaves();
  const isLoading = tasksLoading || leavesLoading;

  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  const eventMap = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const cell of grid) {
      const key = isoDate(cell);
      map.set(key, buildDayEvents(cell, tasks, leaves, today));
    }
    return map;
  }, [grid, tasks, leaves, today]);

  const stats = useMemo(() => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    const dueThisMonth = tasks.filter((t) => {
      if (!t.due_date) return false;
      const d = parseLocal(t.due_date);
      return d >= monthStart && d <= monthEnd;
    }).length;

    const overdue = tasks.filter((t) => {
      if (!t.due_date || t.status === 'Done') return false;
      return parseLocal(t.due_date) < today;
    }).length;

    const leavesThisMonth = leaves.filter((l) => {
      if (l.status !== 'Approved' && l.status !== 'Pending') return false;
      const s = parseLocal(l.start_date);
      const e = parseLocal(l.end_date);
      return s <= monthEnd && e >= monthStart;
    }).length;

    return { dueThisMonth, overdue, leavesThisMonth };
  }, [tasks, leaves, year, month, today]);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const handleTaskClick = useCallback((id: string) => {
    router.push(`/tasks?task=${id}`);
  }, [router]);

  return (
    <Layout flat title="Calendar">
      <PageHeader
        title="Calendar"
        subtitle="Tasks and leave at a glance."
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Tasks due this month"
          value={String(stats.dueThisMonth)}
          hint={`${MONTH_NAMES[month]} ${year}`}
          icon="ti-calendar-due"
        />
        <StatCard
          label="Overdue tasks"
          value={String(stats.overdue)}
          hint="Not done, past due"
          hintTone={stats.overdue > 0 ? 'down' : 'muted'}
          icon="ti-alert-triangle"
        />
        <StatCard
          label="Leaves this month"
          value={String(stats.leavesThisMonth)}
          hint="Approved + Pending"
          icon="ti-beach"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-content">
            {MONTH_NAMES[month]} {year}
          </h2>
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost px-2 py-1" onClick={prevMonth} title="Previous month">
              <Icon name="ti-chevron-left" />
            </button>
            <button className="btn px-2.5 py-1 text-xs" onClick={goToday}>
              Today
            </button>
            <button className="btn btn-ghost px-2 py-1" onClick={nextMonth} title="Next month">
              <Icon name="ti-chevron-right" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: '42rem' }}>
              <div className="grid grid-cols-7 border-b border-line">
                {DAY_HEADERS.map((d) => (
                  <div key={d} className="py-2 text-center text-2xs font-medium text-muted uppercase tracking-wide">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {grid.map((day, idx) => {
                  const key = isoDate(day);
                  return (
                    <DayCell
                      key={key + idx}
                      day={day}
                      isCurrentMonth={day.getMonth() === month}
                      isToday={sameDay(day, today)}
                      events={eventMap.get(key) ?? []}
                      onTaskClick={handleTaskClick}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-t border-line">
          <div className="flex items-center gap-1.5 text-2xs text-muted">
            <span className="w-2 h-2 rounded-full bg-accent inline-block" /> Task (upcoming)
          </div>
          <div className="flex items-center gap-1.5 text-2xs text-muted">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Task (overdue)
          </div>
          <div className="flex items-center gap-1.5 text-2xs text-muted">
            <span className="w-2 h-2 rounded-full bg-muted2 inline-block" /> Task (done)
          </div>
          <div className="flex items-center gap-1.5 text-2xs text-muted">
            <span className="w-2 h-2 rounded-full bg-accentstrong inline-block" /> Leave
          </div>
        </div>
      </div>
    </Layout>
  );
}

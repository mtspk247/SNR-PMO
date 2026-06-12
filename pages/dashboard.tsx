import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { StatCard, Pill, Spinner, EmptyState, Icon, Avatar } from '@/components/ui';
import { useAuthStore } from '@/lib/store';
import {
  getProjects, getTasks, getDeals, getLedgerEntries,
  getEmployees, getLeaves, getOnboardingTasks,
} from '@/lib/db';
import {
  Project, Task, Deal, LedgerEntry,
  Employee, Leave, OnboardingTask,
} from '@/lib/supabase';

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const isOverdue = (d: string | null) => !!d && new Date(d) < new Date(new Date().toDateString());

const STATUS_COLOR: Record<string, string> = {
  Active: '#3ECF8E', Planning: '#38bdf8', 'On Hold': '#f59e0b', Completed: '#a78bfa', Cancelled: '#f43f5e',
};
const STAGE_ORDER = ['Lead', 'Qualified', 'Proposal', 'Negotiation'];

// ── helpers ──────────────────────────────────────────────────────────────────

/** Return the 6 most-recent calendar months as 'YYYY-MM' strings, oldest first. */
function last6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function shortMonth(key: string) {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'short' });
}

interface MonthBucket { month: string; income: number; expense: number }

function buildTrendBuckets(ledger: LedgerEntry[]): MonthBucket[] {
  const keys = last6Months();
  return keys.map((month) => ({
    month,
    income: ledger.filter((e) => e.type === 'income' && (e.entry_date || '').slice(0, 7) === month)
      .reduce((s, e) => s + (e.amount || 0), 0),
    expense: ledger.filter((e) => e.type === 'expense' && (e.entry_date || '').slice(0, 7) === month)
      .reduce((s, e) => s + (e.amount || 0), 0),
  }));
}

// ── component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuthStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [onboardingTasks, setOnboardingTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getProjects().catch(() => [] as Project[]),
      getTasks().catch(() => [] as Task[]),
      getDeals().catch(() => [] as Deal[]),
      getLedgerEntries().catch(() => [] as LedgerEntry[]),
      getEmployees().catch(() => [] as Employee[]),
      getLeaves().catch(() => [] as Leave[]),
      getOnboardingTasks().catch(() => [] as OnboardingTask[]),
    ]).then(([p, t, d, l, emp, lv, ob]) => {
      setProjects(p); setTasks(t); setDeals(d); setLedger(l);
      setEmployees(emp); setLeaves(lv); setOnboardingTasks(ob);
    }).finally(() => setLoading(false));
  }, []);

  // ── derived: PMO ────────────────────────────────────────────────────────
  const activeProjects = projects.filter((p) => p.status === 'Active').length;
  const openTasks = tasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
  const overdue = openTasks.filter((t) => isOverdue(t.due_date)).length;
  const openDeals = deals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost');
  const pipeline = openDeals.reduce((s, d) => s + (d.value || 0), 0);

  // ── derived: finance ────────────────────────────────────────────────────
  const income = ledger.filter((e) => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0);
  const expense = ledger.filter((e) => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0);
  const net = income - expense;
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthExpense = ledger
    .filter((e) => e.type === 'expense' && (e.entry_date || '').slice(0, 7) === monthKey)
    .reduce((s, e) => s + (e.amount || 0), 0);
  const trendBuckets = buildTrendBuckets(ledger);
  const maxTrend = Math.max(1, ...trendBuckets.flatMap((b) => [b.income, b.expense]));
  const hasLedger = ledger.length > 0;

  // ── derived: project donut ───────────────────────────────────────────────
  const statusCounts = projects.reduce<Record<string, number>>(
    (m, p) => { m[p.status] = (m[p.status] || 0) + 1; return m; }, {},
  );
  const statusEntries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
  const totalProjects = projects.length || 1;
  let acc = 0;
  const gradient = statusEntries.length
    ? statusEntries.map(([s, c]) => {
        const start = (acc / totalProjects) * 360; acc += c;
        const end = (acc / totalProjects) * 360;
        return `${STATUS_COLOR[s] || '#94a3b8'} ${start}deg ${end}deg`;
      }).join(', ')
    : 'rgb(var(--border)) 0deg 360deg';

  // ── derived: pipeline by stage ──────────────────────────────────────────
  const stageTotals = STAGE_ORDER.map((stage) => ({
    stage,
    value: openDeals.filter((d) => d.stage === stage).reduce((s, d) => s + (d.value || 0), 0),
    count: openDeals.filter((d) => d.stage === stage).length,
  }));
  const maxStage = Math.max(1, ...stageTotals.map((s) => s.value));

  // ── derived: HR ─────────────────────────────────────────────────────────
  const headcount = employees.filter((e) => e.status === 'active').length;
  const deptMap = employees
    .filter((e) => e.status === 'active' && e.department)
    .reduce<Record<string, number>>((m, e) => {
      const d = e.department!; m[d] = (m[d] || 0) + 1; return m;
    }, {});
  const topDepts = Object.entries(deptMap).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const pendingLeaves = leaves.filter((l) => l.status === 'Pending').length;
  const today = new Date().toISOString().slice(0, 10);
  const onLeaveToday = leaves.filter(
    (l) => l.status === 'Approved' && l.start_date <= today && l.end_date >= today,
  );

  // Onboarding: group tasks by user_id, compute per-hire progress
  const onboardingByUser = onboardingTasks.reduce<Record<string, OnboardingTask[]>>((m, t) => {
    (m[t.user_id] = m[t.user_id] || []).push(t); return m;
  }, {});
  const activeHires = Object.entries(onboardingByUser)
    .map(([uid, tasks]) => ({
      uid,
      name: tasks[0]?.hire?.full_name || 'New hire',
      done: tasks.filter((t) => t.status === 'Done').length,
      total: tasks.length,
    }))
    .filter((h) => h.done < h.total)
    .slice(0, 4);

  return (
    <Layout title="Dashboard">
      {/* ── header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Welcome back, {user?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-muted mt-1">Here's what's happening across the workspace.</p>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* ── row 1: PMO stats ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Active projects" value={activeProjects} hint={`${projects.length} total`} icon="ti-folder" />
            <StatCard label="Open tasks" value={openTasks.length} hint={overdue ? `${overdue} overdue` : 'On schedule'} hintTone={overdue ? 'down' : 'up'} icon="ti-checkbox" />
            <StatCard label="Open deals" value={openDeals.length} hint={`${deals.length} total`} icon="ti-target" />
            <StatCard label="Pipeline value" value={money(pipeline)} hint="Open opportunities" icon="ti-currency-dollar" />
          </div>

          {/* ── row 2: finance stats ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Income" value={money(income)} hint="Ledger, all time" icon="ti-trending-up" />
            <StatCard label="Expenses" value={money(expense)} hint="Ledger incl. payroll" icon="ti-trending-down" />
            <StatCard label="Net" value={money(net)} hint={net >= 0 ? 'Profitable' : 'Running negative'} hintTone={net >= 0 ? 'up' : 'down'} icon="ti-scale" />
            <StatCard label="Spend this month" value={money(monthExpense)} hint={monthKey} icon="ti-calendar-stats" />
          </div>

          {/* ── row 3: projects list + donut ── */}
          <div className="grid lg:grid-cols-3 gap-5 mb-5">
            <div className="card lg:col-span-2 overflow-hidden">
              <div className="flex items-center justify-between px-5 h-14 border-b border-line">
                <div>
                  <span className="text-sm font-semibold">Projects</span>
                  <span className="ml-2 text-2xs text-muted2">{projects.length} total</span>
                </div>
                <Link href="/projects" className="text-xs font-medium text-accentstrong hover:underline">View all</Link>
              </div>
              {projects.length === 0 ? <EmptyState text="No projects yet" icon="ti-folder" /> : (
                <div className="divide-y divide-line">
                  {projects.slice(0, 6).map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-surface2/60"
                    >
                      <Avatar name={p.name} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Pill label={p.status} />
                          <Pill label={p.priority} />
                        </div>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 w-32 shrink-0">
                        <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${p.progress || 0}%` }} />
                        </div>
                        <span className="text-2xs text-muted w-8 text-right tabular-nums">{p.progress || 0}%</span>
                      </div>
                      <Icon name="ti-chevron-right" className="text-base text-muted2 shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* project status donut */}
            <div className="card p-5 lg:self-start">
              <span className="text-sm font-semibold">Project status</span>
              {projects.length === 0 ? <EmptyState text="No data" icon="ti-chart-donut" /> : (
                <div className="flex items-center gap-6 mt-5">
                  <div className="relative w-28 h-28 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
                    <div className="absolute inset-[14px] rounded-full bg-surface grid place-items-center">
                      <div className="text-center">
                        <p className="text-xl font-semibold leading-none">{projects.length}</p>
                        <p className="text-2xs text-muted mt-1">total</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2.5">
                    {statusEntries.map(([s, c]) => (
                      <div key={s} className="flex items-center gap-2.5 text-xs">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: STATUS_COLOR[s] || '#94a3b8' }} />
                        <span className="flex-1 truncate text-contentsoft">{s}</span>
                        <span className="font-medium text-content tabular-nums">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── row 4: income/expense trend chart ── */}
          <div className="card p-5 mb-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-sm font-semibold">Income vs. Expenses — last 6 months</span>
              <Link href="/finance" className="text-xs font-medium text-accentstrong hover:underline">Finance</Link>
            </div>
            {!hasLedger ? <EmptyState text="No ledger entries yet" icon="ti-chart-bar" /> : (
              <div className="w-full overflow-x-auto">
                <div className="min-w-[420px]">
                  {/* bar grid */}
                  <div className="flex items-end gap-2 h-36">
                    {trendBuckets.map((b) => {
                      const incH = Math.round((b.income / maxTrend) * 100);
                      const expH = Math.round((b.expense / maxTrend) * 100);
                      return (
                        <div key={b.month} className="flex-1 flex flex-col items-center gap-0.5">
                          <div className="w-full flex items-end justify-center gap-1" style={{ height: '100%' }}>
                            {/* income bar */}
                            <div
                              className="flex-1 rounded-t bg-accent transition-all"
                              style={{ height: `${incH}%`, minHeight: b.income > 0 ? 3 : 0 }}
                              title={`Income ${money(b.income)}`}
                            />
                            {/* expense bar */}
                            <div
                              className="flex-1 rounded-t bg-rose-500/70 transition-all"
                              style={{ height: `${expH}%`, minHeight: b.expense > 0 ? 3 : 0 }}
                              title={`Expense ${money(b.expense)}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* month labels */}
                  <div className="flex gap-2 mt-2">
                    {trendBuckets.map((b) => (
                      <div key={b.month} className="flex-1 text-center text-2xs text-muted2 tabular-nums">
                        {shortMonth(b.month)}
                      </div>
                    ))}
                  </div>
                  {/* amounts row */}
                  <div className="flex gap-2 mt-1">
                    {trendBuckets.map((b) => (
                      <div key={b.month} className="flex-1 flex flex-col items-center gap-0.5">
                        {b.income > 0 && (
                          <span className="text-2xs tabular-nums text-accent font-medium truncate w-full text-center">{money(b.income)}</span>
                        )}
                        {b.expense > 0 && (
                          <span className="text-2xs tabular-nums text-rose-500 truncate w-full text-center">{money(b.expense)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* legend */}
                  <div className="flex items-center gap-4 mt-3 justify-end">
                    <span className="flex items-center gap-1.5 text-xs text-contentsoft">
                      <span className="w-3 h-2 rounded-sm bg-accent inline-block" />Income
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-contentsoft">
                      <span className="w-3 h-2 rounded-sm bg-rose-500/70 inline-block" />Expenses
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── row 5: pipeline + due soon ── */}
          <div className="grid lg:grid-cols-3 gap-5 mb-5">
            {/* pipeline by stage */}
            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-5">
                <span className="text-sm font-semibold">Pipeline by stage</span>
                <Link href="/crm" className="text-xs font-medium text-accentstrong hover:underline">Open CRM</Link>
              </div>
              {openDeals.length === 0 ? <EmptyState text="No open deals" icon="ti-target" /> : (
                <div className="space-y-4">
                  {stageTotals.map((s) => (
                    <div key={s.stage}>
                      <div className="flex items-center justify-between mb-1.5 text-xs">
                        <span className="flex items-center gap-2">
                          <Pill label={s.stage} />
                          <span className="text-muted2">{s.count} deal{s.count === 1 ? '' : 's'}</span>
                        </span>
                        <span className="font-semibold text-content tabular-nums">{money(s.value)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(s.value / maxStage) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* due soon */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 h-14 border-b border-line">
                <span className="text-sm font-semibold">Due soon</span>
                <Link href="/tasks" className="text-xs font-medium text-accentstrong hover:underline">All tasks</Link>
              </div>
              <div className="divide-y divide-line">
                {openTasks.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isOverdue(t.due_date) ? 'bg-rose-500' : 'bg-accent'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{t.name}</p>
                      <p className="text-2xs text-muted truncate mt-0.5">{t.projects?.name || '—'}</p>
                    </div>
                    <span className={`text-2xs font-medium shrink-0 ${isOverdue(t.due_date) ? 'text-rose-500' : 'text-muted2'}`}>
                      {t.due_date || ''}
                    </span>
                  </div>
                ))}
                {openTasks.length === 0 && <EmptyState text="All caught up" icon="ti-checks" />}
              </div>
            </div>
          </div>

          {/* ── row 6: HR snapshot ── */}
          <div className="grid lg:grid-cols-3 gap-5">
            {/* headcount + departments */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold">Headcount</span>
                <Link href="/employees" className="text-xs font-medium text-accentstrong hover:underline">All employees</Link>
              </div>
              {employees.length === 0 ? <EmptyState text="No employees yet" icon="ti-users" /> : (
                <>
                  <div className="flex items-end gap-2 mb-4">
                    <p className="text-3xl font-semibold text-content tabular-nums">{headcount}</p>
                    <p className="text-sm text-muted mb-1">active</p>
                  </div>
                  {topDepts.length > 0 && (
                    <div className="space-y-2.5">
                      {topDepts.map(([dept, count]) => (
                        <div key={dept} className="flex items-center gap-2 text-xs">
                          <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${Math.round((count / (headcount || 1)) * 100)}%` }}
                            />
                          </div>
                          <span className="text-contentsoft truncate w-24">{dept}</span>
                          <span className="font-medium text-content tabular-nums w-4 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* leave requests */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 h-14 border-b border-line">
                <span className="text-sm font-semibold">Leave</span>
                <Link href="/leave" className="text-xs font-medium text-accentstrong hover:underline">Manage leave</Link>
              </div>
              {leaves.length === 0 ? <EmptyState text="No leave requests" icon="ti-calendar-off" /> : (
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-contentsoft">Pending approval</span>
                    <span className={`font-semibold tabular-nums ${pendingLeaves > 0 ? 'text-amber-500' : 'text-content'}`}>
                      {pendingLeaves}
                    </span>
                  </div>
                  <div className="border-t border-line pt-3">
                    <p className="text-xs text-muted mb-2">On leave today</p>
                    {onLeaveToday.length === 0 ? (
                      <p className="text-xs text-muted2">Nobody out today</p>
                    ) : (
                      <div className="space-y-1.5">
                        {onLeaveToday.slice(0, 4).map((l) => (
                          <div key={l.id} className="flex items-center gap-2 text-xs">
                            <Avatar name={l.requester?.full_name || '?'} size={20} />
                            <span className="text-contentsoft truncate flex-1">{l.requester?.full_name || 'Unknown'}</span>
                            <Pill label={l.type} />
                          </div>
                        ))}
                        {onLeaveToday.length > 4 && (
                          <p className="text-2xs text-muted2">+{onLeaveToday.length - 4} more</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* onboarding progress */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 h-14 border-b border-line">
                <span className="text-sm font-semibold">Onboarding</span>
                <Link href="/onboarding" className="text-xs font-medium text-accentstrong hover:underline">View all</Link>
              </div>
              {activeHires.length === 0 ? (
                <EmptyState text="No active onboarding" icon="ti-user-check" />
              ) : (
                <div className="divide-y divide-line">
                  {activeHires.map((h) => {
                    const pct = h.total > 0 ? Math.round((h.done / h.total) * 100) : 0;
                    return (
                      <div key={h.uid} className="flex items-center gap-3 px-5 py-3">
                        <Avatar name={h.name} size={28} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{h.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
                              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-2xs text-muted tabular-nums shrink-0">{h.done}/{h.total}</span>
                          </div>
                        </div>
                        <span className="text-2xs font-medium text-muted2 tabular-nums shrink-0">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}

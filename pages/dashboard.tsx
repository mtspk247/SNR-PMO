import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import FirstRunChecklist from '@/components/FirstRunChecklist';
import WelcomeWizard from '@/components/WelcomeWizard';
import ProfileCompletion from '@/components/ProfileCompletion';
import { Pill, Spinner, EmptyState, Icon, Avatar, StatusBadge } from '@/components/ui';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { atLeast, can } from '@/lib/authz';
import {
  getProjects, getTasks, getDeals, getLedgerEntries,
  getEmployees, getLeaves, getOnboardingTasks,
  getDashboardLayouts, saveUserDashboard, saveOrgDashboard, resetUserDashboard,
} from '@/lib/db';
import {
  Project, Task, Deal, LedgerEntry, Employee, Leave, OnboardingTask, OrgRole, FeatureKey,
} from '@/lib/supabase';

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const isOverdue = (d: string | null) => !!d && new Date(d) < new Date(new Date().toDateString());

const STATUS_COLOR: Record<string, string> = {
  Active: '#3ECF8E', Planning: '#38bdf8', 'On Hold': '#f59e0b', Completed: '#a78bfa', Cancelled: '#f43f5e',
};
const STAGE_ORDER = ['Lead', 'Qualified', 'Proposal', 'Negotiation'];

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
    income: ledger.filter((e) => e.type === 'income' && (e.entry_date || '').slice(0, 7) === month).reduce((s, e) => s + (e.amount || 0), 0),
    expense: ledger.filter((e) => e.type === 'expense' && (e.entry_date || '').slice(0, 7) === month).reduce((s, e) => s + (e.amount || 0), 0),
  }));
}

function ClickCard({ href, className = '', children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div role="link" tabIndex={0} onClick={() => router.push(href)} onKeyDown={(e) => e.key === 'Enter' && router.push(href)}
      className={`cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl ${className}`}>
      {children}
    </div>
  );
}
function Spark({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2 || Math.max(...data) <= 0) return null;
  const max = Math.max(...data, 1), min = Math.min(...data, 0), rng = (max - min) || 1, w = 100, h = 26;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - min) / rng) * h).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-6 mt-3 overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
function Kpi({ href, label, value, hint, hintTone = 'muted', icon, series, seriesColor = 'var(--accent)' }:
  { href: string; label: string; value: React.ReactNode; hint?: string; hintTone?: 'muted' | 'up' | 'down'; icon: string; series?: number[]; seriesColor?: string }) {
  const router = useRouter();
  return (
    <button onClick={() => router.push(href)}
      className="card w-full text-left p-4 group transition hover:border-borderstrong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs uppercase tracking-wide text-muted2 font-medium truncate">{label}</p>
        <span className="w-7 h-7 rounded-md grid place-items-center bg-accent/10 text-accentstrong shrink-0"><Icon name={icon} className="text-sm" /></span>
      </div>
      <p className="text-2xl font-semibold mt-2 text-content tnum leading-none">{value}</p>
      {hint && <p className={`text-2xs mt-2 inline-flex items-center gap-1 font-medium ${hintTone === 'up' ? 'text-emerald-600' : hintTone === 'down' ? 'text-rose-600' : 'text-muted2'}`}>{hintTone === 'up' && <Icon name="ti-trending-up" className="text-xs" />}{hintTone === 'down' && <Icon name="ti-trending-down" className="text-xs" />}{hint}</p>}
      {series && <Spark data={series} color={seriesColor} />}
    </button>
  );
}

// Widget catalog — gated by plan feature + RBAC role. span is columns in the lg 4-col grid.
interface WidgetMeta { title: string; icon: string; span: 1 | 2; feature?: FeatureKey; minRole?: OrgRole }
const WIDGET_META: Record<string, WidgetMeta> = {
  kpi_projects:  { title: 'Active projects', icon: 'ti-folder', span: 1, feature: 'projects' },
  kpi_tasks:     { title: 'Open tasks', icon: 'ti-checkbox', span: 1, feature: 'projects' },
  kpi_deals:     { title: 'Open deals', icon: 'ti-target', span: 1, feature: 'crm' },
  kpi_pipeline:  { title: 'Pipeline value', icon: 'ti-currency-dollar', span: 1, feature: 'crm' },
  kpi_income:    { title: 'Income', icon: 'ti-trending-up', span: 1, feature: 'financial', minRole: 'admin' },
  kpi_expenses:  { title: 'Expenses', icon: 'ti-trending-down', span: 1, feature: 'financial', minRole: 'admin' },
  kpi_net:       { title: 'Net', icon: 'ti-scale', span: 1, feature: 'financial', minRole: 'admin' },
  kpi_spend_month:{ title: 'Spend / month', icon: 'ti-calendar-stats', span: 1, feature: 'financial', minRole: 'admin' },
  finance_trend: { title: 'Income vs. Expenses', icon: 'ti-chart-bar', span: 2, feature: 'financial', minRole: 'admin' },
  project_status:{ title: 'Project status', icon: 'ti-chart-donut-3', span: 1, feature: 'projects' },
  pipeline_stage:{ title: 'Pipeline by stage', icon: 'ti-target-arrow', span: 1, feature: 'crm' },
  due_soon:      { title: 'Due soon', icon: 'ti-calendar-due', span: 2, feature: 'projects' },
  my_tasks:      { title: 'My tasks', icon: 'ti-user-check', span: 2 },
  projects_list: { title: 'Projects', icon: 'ti-folder', span: 2, feature: 'projects' },
  headcount:     { title: 'Headcount', icon: 'ti-users', span: 1, feature: 'hr', minRole: 'admin' },
  leave:         { title: 'Leave', icon: 'ti-beach', span: 1, feature: 'attendance' },
  onboarding:    { title: 'Onboarding', icon: 'ti-user-plus', span: 1, feature: 'hr', minRole: 'admin' },
};
const DEFAULT_KEYS = [
  'kpi_projects', 'kpi_tasks', 'kpi_deals', 'kpi_pipeline',
  'kpi_income', 'kpi_expenses', 'kpi_net', 'kpi_spend_month',
  'finance_trend', 'project_status', 'pipeline_stage', 'due_soon',
  'my_tasks', 'projects_list', 'headcount', 'leave', 'onboarding',
];

export default function Dashboard() {
  const { user } = useAuthStore();
  const activeOrg = useActiveOrg();
  const isAdmin = can.manageOrg(activeOrg);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [onboardingTasks, setOnboardingTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(true);

  // layout state
  const [order, setOrder] = useState<string[]>(DEFAULT_KEYS);
  const [source, setSource] = useState<'personal' | 'org' | 'default'>('default');
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [msg, setMsg] = useState('');

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
      setProjects(p); setTasks(t); setDeals(d); setLedger(l); setEmployees(emp); setLeaves(lv); setOnboardingTasks(ob);
    }).finally(() => setLoading(false));
  }, []);

  // load the saved layout (personal > org default > built-in)
  useEffect(() => {
    if (!activeOrg?.id || !user?.id) return;
    getDashboardLayouts(activeOrg.id, user.id).then((dl) => {
      if (dl.personal) { setOrder(dl.personal); setSource('personal'); }
      else if (dl.orgDefault) { setOrder(dl.orgDefault); setSource('org'); }
      else { setOrder(DEFAULT_KEYS); setSource('default'); }
    }).catch(() => { setOrder(DEFAULT_KEYS); setSource('default'); });
  }, [activeOrg?.id, user?.id]);

  // ── derived ───────────────────────────────────────────────────────────────
  const activeProjects = projects.filter((p) => p.status === 'Active').length;
  const openTasks = tasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
  const overdue = openTasks.filter((t) => isOverdue(t.due_date)).length;
  const openDeals = deals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost');
  const pipeline = openDeals.reduce((s, d) => s + (d.value || 0), 0);
  const myTasks = user ? openTasks.filter((t) => t.assignee_id === user.id).sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0; if (!a.due_date) return 1; if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }) : [];
  const income = ledger.filter((e) => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0);
  const expense = ledger.filter((e) => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0);
  const net = income - expense;
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthExpense = ledger.filter((e) => e.type === 'expense' && (e.entry_date || '').slice(0, 7) === monthKey).reduce((s, e) => s + (e.amount || 0), 0);
  const trendBuckets = buildTrendBuckets(ledger);
  const maxTrend = Math.max(1, ...trendBuckets.flatMap((b) => [b.income, b.expense]));
  const hasLedger = ledger.length > 0;
  const statusCounts = projects.reduce<Record<string, number>>((m, p) => { m[p.status] = (m[p.status] || 0) + 1; return m; }, {});
  const statusEntries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
  const totalProjects = projects.length || 1;
  let acc = 0;
  const gradient = statusEntries.length
    ? statusEntries.map(([s, c]) => { const start = (acc / totalProjects) * 360; acc += c; const end = (acc / totalProjects) * 360; return `${STATUS_COLOR[s] || '#94a3b8'} ${start}deg ${end}deg`; }).join(', ')
    : 'rgb(var(--border)) 0deg 360deg';
  const stageTotals = STAGE_ORDER.map((stage) => ({ stage, value: openDeals.filter((d) => d.stage === stage).reduce((s, d) => s + (d.value || 0), 0), count: openDeals.filter((d) => d.stage === stage).length }));
  const maxStage = Math.max(1, ...stageTotals.map((s) => s.value));
  const headcount = employees.filter((e) => e.status === 'active').length;
  const deptMap = employees.filter((e) => e.status === 'active' && e.department).reduce<Record<string, number>>((m, e) => { const d = e.department!; m[d] = (m[d] || 0) + 1; return m; }, {});
  const topDepts = Object.entries(deptMap).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const pendingLeaves = leaves.filter((l) => l.status === 'Pending').length;
  const today = new Date().toISOString().slice(0, 10);
  const onLeaveToday = leaves.filter((l) => l.status === 'Approved' && l.start_date <= today && l.end_date >= today);
  const onboardingByUser = onboardingTasks.reduce<Record<string, OnboardingTask[]>>((m, t) => { (m[t.user_id] = m[t.user_id] || []).push(t); return m; }, {});
  const activeHires = Object.entries(onboardingByUser).map(([uid, ts]) => ({ uid, name: ts[0]?.hire?.full_name || 'New hire', done: ts.filter((t) => t.status === 'Done').length, total: ts.length })).filter((h) => h.done < h.total).slice(0, 4);

  // ── widget renderers ────────────────────────────────────────────────────
  const W: Record<string, () => JSX.Element> = {
    kpi_projects: () => <Kpi href="/projects" label="Active projects" value={activeProjects} hint={`${projects.length} total`} icon="ti-folder" />,
    kpi_tasks: () => <Kpi href="/tasks" label="Open tasks" value={openTasks.length} hint={overdue ? `${overdue} overdue` : 'On schedule'} hintTone={overdue ? 'down' : 'up'} icon="ti-checkbox" />,
    kpi_deals: () => <Kpi href="/crm" label="Open deals" value={openDeals.length} hint={`${deals.length} total`} icon="ti-target" />,
    kpi_pipeline: () => <Kpi href="/crm" label="Pipeline value" value={money(pipeline)} hint="Open opportunities" icon="ti-currency-dollar" />,
    kpi_income: () => <Kpi href="/accounting" label="Income" value={money(income)} hint="All time" icon="ti-trending-up" series={trendBuckets.map((b) => b.income)} />,
    kpi_expenses: () => <Kpi href="/accounting" label="Expenses" value={money(expense)} hint="Incl. payroll" icon="ti-trending-down" series={trendBuckets.map((b) => b.expense)} seriesColor="#f43f5e" />,
    kpi_net: () => <Kpi href="/accounting" label="Net" value={money(net)} hint={net >= 0 ? 'Profitable' : 'Negative'} hintTone={net >= 0 ? 'up' : 'down'} icon="ti-scale" series={trendBuckets.map((b) => b.income - b.expense)} />,
    kpi_spend_month: () => <Kpi href="/accounting" label="Spend / month" value={money(monthExpense)} hint={monthKey} icon="ti-calendar-stats" series={trendBuckets.map((b) => b.expense)} seriesColor="#f43f5e" />,
    finance_trend: () => (
      <ClickCard href="/accounting" className="card p-5 h-full">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-chart-bar" className="text-base text-muted2" />Income vs. Expenses &mdash; last 6 months</span>
          <span className="text-xs font-medium text-accentstrong">Accounting &rarr;</span>
        </div>
        {!hasLedger ? <EmptyState text="No ledger entries yet" icon="ti-chart-bar" /> : (
          <div className="w-full overflow-x-auto"><div className="min-w-[420px]">
            <div className="flex items-end gap-3 h-40 border-b border-line pb-px">
              {trendBuckets.map((b) => {
                const incH = Math.max(Math.round((b.income / maxTrend) * 100), b.income > 0 ? 2 : 0);
                const expH = Math.max(Math.round((b.expense / maxTrend) * 100), b.expense > 0 ? 2 : 0);
                return (
                  <div key={b.month} className="flex-1 h-full flex items-end justify-center gap-1.5">
                    <div className="w-1/2 max-w-[26px] rounded-t bg-accent transition-all hover:opacity-80" style={{ height: `${incH}%` }} title={`${shortMonth(b.month)} Income: ${money(b.income)}`} />
                    <div className="w-1/2 max-w-[26px] rounded-t bg-rose-500/70 transition-all hover:opacity-80" style={{ height: `${expH}%` }} title={`${shortMonth(b.month)} Expenses: ${money(b.expense)}`} />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 mt-2">{trendBuckets.map((b) => (<div key={b.month} className="flex-1 text-center text-2xs text-muted2 tabular-nums">{shortMonth(b.month)}</div>))}</div>
            <div className="flex items-center gap-4 mt-3 justify-end">
              <span className="flex items-center gap-1.5 text-xs text-contentsoft"><span className="w-3 h-2 rounded-sm bg-accent inline-block" />Income</span>
              <span className="flex items-center gap-1.5 text-xs text-contentsoft"><span className="w-3 h-2 rounded-sm bg-rose-500/70 inline-block" />Expenses</span>
            </div>
          </div></div>
        )}
      </ClickCard>
    ),
    project_status: () => (
      <ClickCard href="/projects" className="card p-5 h-full">
        <span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-chart-donut-3" className="text-base text-muted2" />Project status</span>
        {projects.length === 0 ? <EmptyState text="No data" icon="ti-chart-donut" /> : (
          <div className="flex items-center gap-5 mt-4">
            <div className="relative w-24 h-24 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
              <div className="absolute inset-[13px] rounded-full bg-surface grid place-items-center"><div className="text-center"><p className="text-lg font-semibold leading-none">{projects.length}</p><p className="text-2xs text-muted mt-0.5">total</p></div></div>
            </div>
            <div className="flex-1 space-y-2">
              {statusEntries.map(([st, c]) => (<div key={st} className="flex items-center gap-2.5 text-xs"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: STATUS_COLOR[st] || '#94a3b8' }} /><span className="flex-1 truncate text-contentsoft">{st}</span><span className="font-medium text-content tabular-nums">{c}</span></div>))}
            </div>
          </div>
        )}
      </ClickCard>
    ),
    pipeline_stage: () => (
      <ClickCard href="/crm" className="card p-5 h-full">
        <span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-target-arrow" className="text-base text-muted2" />Pipeline by stage</span>
        {openDeals.length === 0 ? <EmptyState text="No open deals" icon="ti-target" /> : (
          <div className="space-y-3.5 mt-4">
            {stageTotals.map((s) => (
              <div key={s.stage}>
                <div className="flex items-center justify-between mb-1.5 text-xs"><span className="flex items-center gap-2"><Pill label={s.stage} /><span className="text-muted2">{s.count}</span></span><span className="font-semibold text-content tabular-nums">{money(s.value)}</span></div>
                <div className="h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(s.value / maxStage) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </ClickCard>
    ),
    due_soon: () => (
      <div className="card overflow-hidden flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-calendar-due" className="text-base text-muted2" />Due soon</span>
          <Link href="/tasks" className="text-xs font-medium text-accentstrong hover:underline">All tasks &rarr;</Link>
        </div>
        <div className="divide-y divide-line flex-1">
          {openTasks.slice(0, 6).map((t) => (
            <Link key={t.id} href={`/tasks?task=${t.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface2/60">
              <span className={`w-2 h-2 rounded-full shrink-0 ${isOverdue(t.due_date) ? 'bg-rose-500' : 'bg-accent'}`} />
              <div className="min-w-0 flex-1"><p className="text-sm truncate">{t.name}</p><p className="text-2xs text-muted truncate mt-0.5">{t.projects?.name || '—'}</p></div>
              <span className={`text-2xs font-medium shrink-0 ${isOverdue(t.due_date) ? 'text-rose-500' : 'text-muted2'}`}>{t.due_date || ''}</span>
            </Link>
          ))}
          {openTasks.length === 0 && <EmptyState text="All caught up" icon="ti-checks" />}
        </div>
      </div>
    ),
    my_tasks: () => (
      <div className="card overflow-hidden flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-user-check" className="text-base text-muted2" />My tasks<span className="ml-1 text-2xs text-muted2 font-normal">{myTasks.length} open</span></span>
          <Link href="/tasks" className="text-xs font-medium text-accentstrong hover:underline">All tasks &rarr;</Link>
        </div>
        <div className="divide-y divide-line flex-1">
          {myTasks.slice(0, 6).map((t) => (
            <Link key={t.id} href={`/tasks?task=${t.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface2/60">
              <span className={`w-2 h-2 rounded-full shrink-0 ${isOverdue(t.due_date) ? 'bg-rose-500' : 'bg-accent'}`} />
              <div className="min-w-0 flex-1"><p className="text-sm truncate">{t.name}</p><p className="text-2xs text-muted truncate mt-0.5">{t.projects?.name || '—'}</p></div>
              <span className={`text-2xs font-medium shrink-0 ${isOverdue(t.due_date) ? 'text-rose-500' : 'text-muted2'}`}>{t.due_date || ''}</span>
            </Link>
          ))}
          {myTasks.length === 0 && <EmptyState text="Nothing assigned to you" icon="ti-checks" />}
        </div>
      </div>
    ),
    projects_list: () => (
      <div className="card overflow-hidden flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-folder" className="text-base text-muted2" />Projects<span className="ml-1 text-2xs text-muted2 font-normal">{projects.length} total</span></span>
          <Link href="/projects" className="text-xs font-medium text-accentstrong hover:underline">View all &rarr;</Link>
        </div>
        {projects.length === 0 ? <EmptyState text="No projects yet" icon="ti-folder" /> : (
          <div className="divide-y divide-line flex-1">
            {projects.slice(0, 5).map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-4 px-5 py-3 transition hover:bg-surface2/60 group">
                <Avatar name={p.name} size={32} />
                <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{p.name}</p><div className="flex items-center gap-2 mt-1"><StatusBadge status={p.status} /><Pill label={p.priority} /></div></div>
                <div className="hidden sm:flex items-center gap-2 w-32 shrink-0"><div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${p.progress || 0}%` }} /></div><span className="text-2xs text-muted w-8 text-right tabular-nums">{p.progress || 0}%</span></div>
                <Icon name="ti-chevron-right" className="text-base text-muted2 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        )}
      </div>
    ),
    headcount: () => (
      <ClickCard href="/employees" className="card p-5 h-full">
        <span className="text-sm font-semibold inline-flex items-center gap-2 mb-4"><Icon name="ti-users" className="text-base text-muted2" />Headcount</span>
        {employees.length === 0 ? <EmptyState text="No employees yet" icon="ti-users" /> : (
          <>
            <div className="flex items-end gap-2 mb-4"><p className="text-3xl font-semibold text-content tabular-nums">{headcount}</p><p className="text-sm text-muted mb-1">active</p></div>
            {topDepts.length > 0 && (
              <div className="space-y-2.5">
                {topDepts.map(([dept, count]) => (<div key={dept} className="flex items-center gap-2 text-xs"><div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((count / (headcount || 1)) * 100)}%` }} /></div><span className="text-contentsoft truncate w-24">{dept}</span><span className="font-medium text-content tabular-nums w-4 text-right">{count}</span></div>))}
              </div>
            )}
          </>
        )}
      </ClickCard>
    ),
    leave: () => (
      <ClickCard href="/leave" className="card overflow-hidden h-full">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line"><span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-beach" className="text-base text-muted2" />Leave</span></div>
        {leaves.length === 0 ? <EmptyState text="No leave requests" icon="ti-calendar-off" /> : (
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between text-sm"><span className="text-contentsoft">Pending approval</span><span className={`font-semibold tabular-nums ${pendingLeaves > 0 ? 'text-amber-500' : 'text-content'}`}>{pendingLeaves}</span></div>
            <div className="border-t border-line pt-3"><p className="text-xs text-muted mb-2">On leave today</p>
              {onLeaveToday.length === 0 ? <p className="text-xs text-muted2">Nobody out today</p> : (
                <div className="space-y-1.5">{onLeaveToday.slice(0, 4).map((l) => (<div key={l.id} className="flex items-center gap-2 text-xs"><Avatar name={l.requester?.full_name || '?'} size={20} /><span className="text-contentsoft truncate flex-1">{l.requester?.full_name || 'Unknown'}</span><Pill label={l.type} /></div>))}{onLeaveToday.length > 4 && <p className="text-2xs text-muted2">+{onLeaveToday.length - 4} more</p>}</div>
              )}
            </div>
          </div>
        )}
      </ClickCard>
    ),
    onboarding: () => (
      <ClickCard href="/onboarding" className="card overflow-hidden h-full">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line"><span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-user-plus" className="text-base text-muted2" />Onboarding</span></div>
        {activeHires.length === 0 ? <EmptyState text="No active onboarding" icon="ti-user-check" /> : (
          <div className="divide-y divide-line">
            {activeHires.map((h) => { const pct = h.total > 0 ? Math.round((h.done / h.total) * 100) : 0; return (
              <div key={h.uid} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={h.name} size={28} />
                <div className="min-w-0 flex-1"><p className="text-sm truncate">{h.name}</p><div className="flex items-center gap-2 mt-1"><div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div><span className="text-2xs text-muted tabular-nums shrink-0">{h.done}/{h.total}</span></div></div>
                <span className="text-2xs font-medium text-muted2 tabular-nums shrink-0">{pct}%</span>
              </div>
            ); })}
          </div>
        )}
      </ClickCard>
    ),
  };

  // visibility = catalog has it + plan grants the feature + role is high enough
  const visible = (k: string) => {
    const m = WIDGET_META[k];
    if (!m || !W[k]) return false;
    if (!hasFeature(activeOrg, m.feature)) return false;
    if (m.minRole && !atLeast(activeOrg?.member_role, m.minRole)) return false;
    return true;
  };
  const shown = order.filter(visible);
  const available = Object.keys(WIDGET_META).filter((k) => visible(k) && !order.includes(k));

  // edit ops
  const move = (k: string, dir: -1 | 1) => {
    setOrder((prev) => {
      const i = prev.indexOf(k); if (i < 0) return prev;
      const j = i + dir; if (j < 0 || j >= prev.length) return prev;
      const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
    });
  };
  const remove = (k: string) => setOrder((prev) => prev.filter((x) => x !== k));
  const add = (k: string) => { setOrder((prev) => [...prev, k]); setAddOpen(false); };
  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 2200); };
  const savePersonal = async () => { if (!activeOrg) return; try { await saveUserDashboard(activeOrg.id, order); setSource('personal'); setEditing(false); flash('Saved your dashboard'); } catch (e: any) { flash(e.message || 'Save failed'); } };
  const saveOrgDefault = async () => { if (!activeOrg) return; try { await saveOrgDashboard(activeOrg.id, order); flash('Saved as workspace default'); } catch (e: any) { flash(e.message || 'Save failed'); } };
  const resetMine = async () => { if (!activeOrg) return; try { await resetUserDashboard(activeOrg.id); const dl = await getDashboardLayouts(activeOrg.id, user!.id); const base = dl.orgDefault || DEFAULT_KEYS; setOrder(base); setSource(dl.orgDefault ? 'org' : 'default'); setEditing(false); flash('Reset to workspace default'); } catch (e: any) { flash(e.message || 'Reset failed'); } };

  const _hr = new Date().getHours();
  const greeting = _hr < 12 ? 'Good morning' : _hr < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const spanCls = (s: 1 | 2) => (s === 2 ? 'sm:col-span-2 lg:col-span-2' : '');

  return (
    <Layout flat title="Dashboard">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <p className="section-label mb-1.5">{todayLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting}, {user?.full_name?.split(' ')[0] || 'there'}</h1>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {msg && <span className="text-xs font-medium text-emerald-600">{msg}</span>}
          {!editing && <button onClick={() => setEditing(true)} className="btn btn-ghost border border-line"><Icon name="ti-layout-dashboard" className="text-base" />Customize</button>}
          <Link href="/tasks" className="btn btn-primary"><Icon name="ti-checkbox" className="text-base" />My tasks</Link>
        </div>
      </div>

      <WelcomeWizard />
      <FirstRunChecklist />
      <ProfileCompletion />

      {editing && (
        <div className="card p-3 mb-4 flex flex-wrap items-center gap-2 bg-accent/5 border-accent/30">
          <span className="text-xs text-muted inline-flex items-center gap-1.5"><Icon name="ti-info-circle" className="text-sm" />Editing — reorder with the arrows, remove with ×, then save.</span>
          <div className="flex-1" />
          <div className="relative">
            <button onClick={() => setAddOpen((v) => !v)} disabled={available.length === 0} className="btn btn-ghost border border-line h-8 py-0 disabled:opacity-50"><Icon name="ti-plus" />Add widget</button>
            {addOpen && available.length > 0 && (
              <div className="absolute right-0 mt-1 z-30 w-56 card p-1 shadow-lg">
                {available.map((k) => (<button key={k} onClick={() => add(k)} className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-surface2 flex items-center gap-2"><Icon name={WIDGET_META[k].icon} className="text-muted2" />{WIDGET_META[k].title}</button>))}
              </div>
            )}
          </div>
          {isAdmin && <button onClick={saveOrgDefault} className="btn btn-ghost border border-line h-8 py-0"><Icon name="ti-building" />Save as workspace default</button>}
          <button onClick={resetMine} className="btn btn-ghost border border-line h-8 py-0"><Icon name="ti-rotate" />Reset</button>
          <button onClick={savePersonal} className="btn btn-primary h-8 py-0"><Icon name="ti-check" />Done</button>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
          {shown.map((k) => {
            const m = WIDGET_META[k];
            return (
              <div key={k} className={`relative ${spanCls(m.span)}`}>
                {editing && (
                  <>
                    <div className="absolute inset-0 z-10 rounded-xl bg-transparent" />
                    <div className="absolute -top-2 right-1 z-20 flex items-center gap-1">
                      <button onClick={() => move(k, -1)} title="Move earlier" className="w-6 h-6 grid place-items-center rounded-md bg-surface border border-line text-muted hover:text-content shadow-sm"><Icon name="ti-arrow-up" className="text-xs" /></button>
                      <button onClick={() => move(k, 1)} title="Move later" className="w-6 h-6 grid place-items-center rounded-md bg-surface border border-line text-muted hover:text-content shadow-sm"><Icon name="ti-arrow-down" className="text-xs" /></button>
                      <button onClick={() => remove(k)} title="Remove" className="w-6 h-6 grid place-items-center rounded-md bg-surface border border-line text-rose-500 hover:bg-rose-50 shadow-sm"><Icon name="ti-x" className="text-xs" /></button>
                    </div>
                  </>
                )}
                <div className={editing ? 'ring-1 ring-dashed ring-line rounded-xl pointer-events-none' : ''}>{W[k]()}</div>
              </div>
            );
          })}
          {shown.length === 0 && <div className="lg:col-span-4"><EmptyState text="No widgets to show — click Customize to add some." icon="ti-layout-dashboard" /></div>}
        </div>
      )}
    </Layout>
  );
}

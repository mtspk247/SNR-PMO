import { useEffect, useState } from 'react';
import Link from 'next/link';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import OnboardingWizard from '@/components/OnboardingWizard';
import FirstRunChecklist from '@/components/FirstRunChecklist';
import QuickStart from '@/components/QuickStart';
import WelcomeWizard from '@/components/WelcomeWizard';
import ProfileCompletion from '@/components/ProfileCompletion';
import InstallPrompt from '@/components/InstallPrompt';
import KeyRotationNudge from '@/components/KeyRotationNudge';
import { Pill, Spinner, EmptyState, Icon, Avatar, StatusBadge } from '@/components/ui';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { hasFeature, isUpsellLocked } from '@/lib/entitlements';
import { computeRoi, AgentRoiSummary, DEFAULT_LABOR_RATE_USD } from '@/lib/agentRoi';
import { atLeast, can } from '@/lib/authz';
import {
  getProjects, getTasks, getDeals, getLedgerEntries,
  getEmployees, getLeaves, getOnboardingTasks,
  getDashboardLayouts, saveUserDashboard, saveOrgDashboard, resetUserDashboard,
  dashboardCounts, DashboardCounts, agentRoiSummary, upsellPromptsFor, UpsellPrompt,
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
const DEPT_COLOR = ['#3ECF8E', '#38bdf8', '#a78bfa', '#f59e0b', '#f43f5e', '#22d3ee'];
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
// Radial gauge (0–100). Used as an alternate KPI visual.
function Gauge({ pct, label, color = 'var(--accent)' }: { pct: number; label: string; color?: string }) {
  const r = 34, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <div className="relative w-[88px] h-[88px] shrink-0">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(var(--border))" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 grid place-items-center"><div className="text-center"><p className="text-lg font-semibold leading-none tabular-nums">{Math.round(pct)}%</p><p className="text-[9px] text-muted mt-0.5">{label}</p></div></div>
    </div>
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

interface WidgetMeta { title: string; icon: string; span: 1 | 2; feature?: FeatureKey; minRole?: OrgRole }
const WIDGET_META: Record<string, WidgetMeta> = {
  kpi_projects:  { title: 'Open projects', icon: 'ti-folder', span: 1, feature: 'projects' },
  kpi_tasks:     { title: 'Open tasks', icon: 'ti-checkbox', span: 1, feature: 'projects' },
  kpi_deals:     { title: 'Open deals', icon: 'ti-target', span: 1, feature: 'crm' },
  kpi_pipeline:  { title: 'Pipeline value', icon: 'ti-currency-dollar', span: 1, feature: 'crm' },
  kpi_income:    { title: 'Income', icon: 'ti-trending-up', span: 1, feature: 'financial', minRole: 'admin' },
  kpi_expenses:  { title: 'Expenses', icon: 'ti-trending-down', span: 1, feature: 'financial', minRole: 'admin' },
  kpi_net:       { title: 'Net', icon: 'ti-scale', span: 1, feature: 'financial', minRole: 'admin' },
  kpi_spend_month:{ title: 'Spend / month', icon: 'ti-calendar-stats', span: 1, feature: 'financial', minRole: 'admin' },
  finance_trend: { title: 'Income vs. Expenses', icon: 'ti-chart-bar', span: 2, feature: 'financial', minRole: 'admin' },
  project_status:{ title: 'Project status', icon: 'ti-chart-donut-3', span: 1, feature: 'projects' },
  task_progress: { title: 'Task completion', icon: 'ti-progress', span: 1, feature: 'projects' },
  pipeline_stage:{ title: 'Pipeline by stage', icon: 'ti-target-arrow', span: 1, feature: 'crm' },
  due_soon:      { title: 'Due soon', icon: 'ti-calendar-due', span: 2, feature: 'projects' },
  my_tasks:      { title: 'My tasks', icon: 'ti-user-check', span: 2 },
  projects_list: { title: 'Projects', icon: 'ti-folder', span: 2, feature: 'projects' },
  headcount:     { title: 'Headcount', icon: 'ti-users', span: 1, feature: 'hr', minRole: 'admin' },
  leave:         { title: 'Leave', icon: 'ti-beach', span: 1, feature: 'attendance' },
  onboarding:    { title: 'Onboarding', icon: 'ti-user-plus', span: 1, feature: 'hr', minRole: 'admin' },
  kpi_agent_approvals: { title: 'Agent approvals', icon: 'ti-robot', span: 1, feature: 'agents' },
  kpi_social:    { title: 'Social', icon: 'ti-speakerphone', span: 1, feature: 'social' },
  kpi_leads:     { title: 'New leads', icon: 'ti-user-plus', span: 1, feature: 'crm' },
  kpi_forms:     { title: 'Form submissions', icon: 'ti-forms', span: 1, feature: 'forms' },
  kpi_inbox:     { title: 'Inbox', icon: 'ti-inbox', span: 1, feature: 'social' },
  needs_attention: { title: 'Needs attention', icon: 'ti-alert-hexagon', span: 2 },
  agent_roi:     { title: 'AI agent ROI', icon: 'ti-robot', span: 2, feature: 'agents' },
  drive_storage: { title: 'Storage', icon: 'ti-cloud', span: 1, feature: 'drives' },
};
// Per-widget visual variants — first entry is the default.
const VARIANTS: Record<string, { id: string; label: string; icon: string }[]> = {
  finance_trend:  [{ id: 'bars', label: 'Bars', icon: 'ti-chart-bar' }, { id: 'area', label: 'Area', icon: 'ti-chart-area' }],
  project_status: [{ id: 'donut', label: 'Donut', icon: 'ti-chart-donut-3' }, { id: 'bars', label: 'Bars', icon: 'ti-chart-bar' }],
  task_progress:  [{ id: 'gauge', label: 'Gauge', icon: 'ti-gauge' }, { id: 'bars', label: 'Bars', icon: 'ti-chart-bar' }],
  pipeline_stage: [{ id: 'bars', label: 'Bars', icon: 'ti-chart-bar' }, { id: 'funnel', label: 'Funnel', icon: 'ti-filter' }],
  headcount:      [{ id: 'bars', label: 'Bars', icon: 'ti-chart-bar' }, { id: 'donut', label: 'Donut', icon: 'ti-chart-donut' }],
};
const GridW = WidthProvider(GridLayout);
const defVariant = (k: string) => VARIANTS[k]?.[0]?.id || '';
const splitKey = (entry: string): [string, string] => { const p = entry.split(':'); return [p[0], p[1] || defVariant(p[0])]; };
type Coords = { x: number; y: number; w: number; h: number };
const defW = (k: string) => (WIDGET_META[k]?.span === 2 ? 6 : 3);
const defH = (k: string) => (k.startsWith('kpi_') ? 2 : 4);
const coordsOf = (entry: string): Coords | null => { const p = entry.split(':'); return p.length >= 6 ? { x: +p[2], y: +p[3], w: +p[4], h: +p[5] } : null; };
const makeEntry = (k: string, variant: string, c: Coords): string => { const v = variant && variant !== defVariant(k) ? variant : ''; return `${k}:${v}:${c.x}:${c.y}:${c.w}:${c.h}`; };

// Bump when new default widgets are added → existing saved layouts get the new ones merged in once.
const DASH_VER = 3;
const DEFAULT_KEYS = [
  'kpi_projects', 'kpi_tasks', 'kpi_deals', 'kpi_pipeline',
  'kpi_agent_approvals', 'kpi_social', 'kpi_leads', 'kpi_forms', 'kpi_inbox', 'drive_storage',
  'needs_attention',
  'kpi_income', 'kpi_expenses', 'kpi_net', 'kpi_spend_month',
  'finance_trend', 'project_status', 'pipeline_stage', 'task_progress',
  'due_soon', 'agent_roi', 'my_tasks', 'projects_list', 'headcount', 'leave', 'onboarding',
];

// Features surfaced on the dashboard as locked "unlock more" cards when the plan lacks them.
const UPSELL_FEATURES: { feature: FeatureKey; title: string; icon: string; blurb: string }[] = [
  { feature: 'crm', title: 'CRM & Sales Pipeline', icon: 'ti-target-arrow', blurb: 'Track leads, deals and clients end-to-end.' },
  { feature: 'financial', title: 'Accounting & Invoicing', icon: 'ti-currency-dollar', blurb: 'Invoices, bills, ledger and reports.' },
  { feature: 'hr', title: 'HR & Recruiting', icon: 'ti-users', blurb: 'Jobs, applicants, onboarding and appraisals.' },
  { feature: 'agents', title: 'AI Agents', icon: 'ti-robot', blurb: 'Automate back-office work with approval-first AI.' },
  { feature: 'social', title: 'Social & Content', icon: 'ti-speakerphone', blurb: 'Plan, schedule and publish across channels.' },
  { feature: 'forms', title: 'Forms & Lead Capture', icon: 'ti-forms', blurb: 'Forms that create leads automatically.' },
  { feature: 'sequences', title: 'Drip Email Marketing', icon: 'ti-mail-forward', blurb: 'Nurture leads with multi-step campaigns.' },
  { feature: 'comms', title: 'SMS Messaging', icon: 'ti-message-2', blurb: 'Two-way SMS with your customers.' },
  { feature: 'booking', title: 'Booking', icon: 'ti-calendar-plus', blurb: 'Let clients book time with your team.' },
  { feature: 'recordings', title: 'Screen Recording', icon: 'ti-video', blurb: 'Record demos, bug reports and walkthroughs.' },
  { feature: 'drives', title: 'Drives & Files', icon: 'ti-cloud', blurb: 'Secure cloud storage with real-time docs.' },
  { feature: 'portal', title: 'Client Portal', icon: 'ti-layout-dashboard', blurb: 'A branded portal for your clients.' },
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
  const [counts, setCounts] = useState<DashboardCounts>({});
  const [roi, setRoi] = useState<AgentRoiSummary | null>(null);
  const [upsells, setUpsells] = useState<UpsellPrompt[]>([]);
  const [loading, setLoading] = useState(true);

  const [order, setOrder] = useState<string[]>(DEFAULT_KEYS);
  const [, setSource] = useState<'personal' | 'org' | 'default'>('default');
  const [editing, setEditing] = useState(false);
  const [dragEntry, setDragEntry] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [varOpen, setVarOpen] = useState('');
  const [msg, setMsg] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = () => setIsMobile(window.innerWidth < 768);
    mq(); window.addEventListener('resize', mq);
    return () => window.removeEventListener('resize', mq);
  }, []);

  useEffect(() => {
    if (!activeOrg?.id) return;          // refetch when the active workspace changes
    setLoading(true);
    Promise.all([
      getProjects().catch(() => [] as Project[]),
      getTasks().catch(() => [] as Task[]),
      getDeals().catch(() => [] as Deal[]),
      getLedgerEntries().catch(() => [] as LedgerEntry[]),
      getEmployees().catch(() => [] as Employee[]),
      getLeaves().catch(() => [] as Leave[]),
      getOnboardingTasks().catch(() => [] as OnboardingTask[]),
      dashboardCounts(activeOrg.id).catch(() => ({} as DashboardCounts)),
      hasFeature(activeOrg, 'agents') ? agentRoiSummary(activeOrg.id, 30).catch(() => null) : Promise.resolve(null),
      upsellPromptsFor(activeOrg.id).catch(() => [] as UpsellPrompt[]),
    ]).then(([p, t, d, l, emp, lv, ob, dc, ri, up]) => {
      setProjects(p); setTasks(t); setDeals(d); setLedger(l); setEmployees(emp); setLeaves(lv); setOnboardingTasks(ob); setCounts(dc as DashboardCounts); setRoi(ri as AgentRoiSummary | null); setUpsells((up as UpsellPrompt[]) || []);
    }).finally(() => setLoading(false));
  }, [activeOrg?.id]);

  useEffect(() => {
    if (!activeOrg?.id || !user?.id) return;
    getDashboardLayouts(activeOrg.id, user.id).then((dl) => {
      const saved = dl.personal || dl.orgDefault || null;
      const src: 'personal' | 'org' | 'default' = dl.personal ? 'personal' : dl.orgDefault ? 'org' : 'default';
      if (!saved) { setOrder(DEFAULT_KEYS); setSource('default'); return; }
      // Merge any newly-added default widgets into an existing saved layout, once per version.
      const have = new Set(saved.map((e) => splitKey(e)[0]));
      const missing = DEFAULT_KEYS.filter((k) => !have.has(k));
      const verKey = `snr_dashmerge_v${DASH_VER}_${activeOrg.id}_${user.id}`;
      let done = false; try { done = localStorage.getItem(verKey) === '1'; } catch { /* */ }
      if (missing.length && !done) {
        const merged = [...saved, ...missing];
        setOrder(merged); setSource(src);
        try { localStorage.setItem(verKey, '1'); } catch { /* */ }
        saveUserDashboard(activeOrg.id, merged).catch(() => {}); // persist so the new widgets stick
        return;
      }
      setOrder(saved); setSource(src);
    }).catch(() => { setOrder(DEFAULT_KEYS); setSource('default'); });
  }, [activeOrg?.id, user?.id]);

  // ── derived ───────────────────────────────────────────────────────────────
  const activeProjects = projects.filter((p) => !['Completed', 'Cancelled', 'Done', 'Archived'].includes(p.status)).length;
  const openTasks = tasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
  const doneTasks = tasks.filter((t) => t.status === 'Done').length;
  const taskPct = tasks.length ? (doneTasks / tasks.length) * 100 : 0;
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
  const topDepts = Object.entries(deptMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  let dacc = 0;
  const deptGradient = topDepts.length
    ? topDepts.map(([, c], i) => { const start = (dacc / (headcount || 1)) * 360; dacc += c; const end = (dacc / (headcount || 1)) * 360; return `${DEPT_COLOR[i % DEPT_COLOR.length]} ${start}deg ${end}deg`; }).join(', ')
    : 'rgb(var(--border)) 0deg 360deg';
  const pendingLeaves = leaves.filter((l) => l.status === 'Pending').length;
  const today = new Date().toISOString().slice(0, 10);
  const onLeaveToday = leaves.filter((l) => l.status === 'Approved' && l.start_date <= today && l.end_date >= today);
  const onboardingByUser = onboardingTasks.reduce<Record<string, OnboardingTask[]>>((m, t) => { (m[t.user_id] = m[t.user_id] || []).push(t); return m; }, {});
  const activeHires = Object.entries(onboardingByUser).map(([uid, ts]) => ({ uid, name: ts[0]?.hire?.full_name || 'New hire', done: ts.filter((t) => t.status === 'Done').length, total: ts.length })).filter((h) => h.done < h.total).slice(0, 4);

  // points for the area variant of the finance trend
  const n = trendBuckets.length;
  const ax = (i: number) => (n > 1 ? (i / (n - 1)) * 300 : 150);
  const ay = (val: number) => 115 - (val / maxTrend) * 105;
  const lineInc = trendBuckets.map((b, i) => `${ax(i).toFixed(1)},${ay(b.income).toFixed(1)}`).join(' ');
  const lineExp = trendBuckets.map((b, i) => `${ax(i).toFixed(1)},${ay(b.expense).toFixed(1)}`).join(' ');
  const areaInc = `0,115 ${lineInc} 300,115`;

  // ── widget renderers (v = visual variant) ─────────────────────────────────
  const W: Record<string, (v?: string) => JSX.Element> = {
    kpi_projects: () => <Kpi href="/projects" label="Open projects" value={activeProjects} hint={`${projects.length} total`} icon="ti-folder" />,
    kpi_tasks: () => <Kpi href="/tasks" label="Open tasks" value={openTasks.length} hint={overdue ? `${overdue} overdue` : 'On schedule'} hintTone={overdue ? 'down' : 'up'} icon="ti-checkbox" />,
    kpi_deals: () => <Kpi href="/crm" label="Open deals" value={openDeals.length} hint={`${deals.length} total`} icon="ti-target" />,
    kpi_pipeline: () => <Kpi href="/crm" label="Pipeline value" value={money(pipeline)} hint="Open opportunities" icon="ti-currency-dollar" />,
    kpi_income: () => <Kpi href="/accounting" label="Income" value={money(income)} hint="All time" icon="ti-trending-up" series={trendBuckets.map((b) => b.income)} />,
    kpi_expenses: () => <Kpi href="/accounting" label="Expenses" value={money(expense)} hint="Incl. payroll" icon="ti-trending-down" series={trendBuckets.map((b) => b.expense)} seriesColor="#f43f5e" />,
    kpi_net: () => <Kpi href="/accounting" label="Net" value={money(net)} hint={net >= 0 ? 'Profitable' : 'Negative'} hintTone={net >= 0 ? 'up' : 'down'} icon="ti-scale" series={trendBuckets.map((b) => b.income - b.expense)} />,
    kpi_spend_month: () => <Kpi href="/accounting" label="Spend / month" value={money(monthExpense)} hint={monthKey} icon="ti-calendar-stats" series={trendBuckets.map((b) => b.expense)} seriesColor="#f43f5e" />,
    kpi_agent_approvals: () => <Kpi href="/agent-approvals" label="Agent approvals" value={counts.agent_pending || 0} hint={(counts.agent_pending || 0) > 0 ? 'awaiting your review' : 'all clear'} hintTone={(counts.agent_pending || 0) > 0 ? 'down' : 'up'} icon="ti-robot" />,
    kpi_social: () => <Kpi href="/social" label="Social" value={(counts.social_scheduled || 0) + (counts.social_draft || 0)} hint={`${counts.social_scheduled || 0} scheduled · ${counts.social_draft || 0} drafts`} icon="ti-speakerphone" />,
    kpi_leads: () => <Kpi href="/leads" label="New leads" value={counts.leads_new_7d || 0} hint="last 7 days" hintTone={(counts.leads_new_7d || 0) > 0 ? 'up' : 'muted'} icon="ti-user-plus" />,
    kpi_forms: () => <Kpi href="/forms" label="Form submissions" value={counts.forms_subs_7d || 0} hint="last 7 days" icon="ti-forms" />,
    kpi_inbox: () => <Kpi href="/social/inbox" label="Inbox" value={counts.inbox_open || 0} hint={(counts.inbox_open || 0) > 0 ? 'open conversations' : 'no open threads'} icon="ti-inbox" />,
    finance_trend: (v) => (
      <ClickCard href="/accounting" className="card p-5 h-full">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-chart-bar" className="text-base text-muted2" />Income vs. Expenses &mdash; last 6 months</span>
          <span className="text-xs font-medium text-accentstrong">Accounting &rarr;</span>
        </div>
        {!hasLedger ? <EmptyState text="No ledger entries yet" icon="ti-chart-bar" /> : v === 'area' ? (
          <div>
            <svg viewBox="0 0 300 120" preserveAspectRatio="none" className="w-full h-40">
              <polygon points={areaInc} fill="rgb(var(--accent))" fillOpacity="0.12" />
              <polyline points={lineInc} fill="none" stroke="rgb(var(--accent))" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              <polyline points={lineExp} fill="none" stroke="#f43f5e" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            <div className="flex gap-3 mt-1">{trendBuckets.map((b) => (<div key={b.month} className="flex-1 text-center text-2xs text-muted2 tabular-nums">{shortMonth(b.month)}</div>))}</div>
            <div className="flex items-center gap-4 mt-2 justify-end">
              <span className="flex items-center gap-1.5 text-xs text-contentsoft"><span className="w-3 h-2 rounded-sm bg-accent inline-block" />Income</span>
              <span className="flex items-center gap-1.5 text-xs text-contentsoft"><span className="w-3 h-2 rounded-sm bg-rose-500/70 inline-block" />Expenses</span>
            </div>
          </div>
        ) : (
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
    project_status: (v) => (
      <ClickCard href="/projects" className="card p-5 h-full">
        <span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-chart-donut-3" className="text-base text-muted2" />Project status</span>
        {projects.length === 0 ? <EmptyState text="No data" icon="ti-chart-donut" /> : v === 'bars' ? (
          <div className="space-y-3 mt-4">
            {statusEntries.map(([st, c]) => (
              <div key={st}>
                <div className="flex items-center justify-between text-xs mb-1"><span className="text-contentsoft">{st}</span><span className="font-medium text-content tabular-nums">{c}</span></div>
                <div className="h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(c / totalProjects) * 100}%`, background: STATUS_COLOR[st] || '#94a3b8' }} /></div>
              </div>
            ))}
          </div>
        ) : (
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
    task_progress: (v) => (
      <ClickCard href="/tasks" className="card p-5 h-full">
        <span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-progress" className="text-base text-muted2" />Task completion</span>
        {tasks.length === 0 ? <EmptyState text="No tasks yet" icon="ti-checkbox" /> : v === 'bars' ? (
          <div className="mt-4 space-y-3">
            <div><div className="flex justify-between text-xs mb-1"><span className="text-contentsoft">Done</span><span className="tabular-nums font-medium">{doneTasks}</span></div><div className="h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${taskPct}%` }} /></div></div>
            <div><div className="flex justify-between text-xs mb-1"><span className="text-contentsoft">Open</span><span className="tabular-nums font-medium">{openTasks.length}</span></div><div className="h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-amber-400" style={{ width: `${100 - taskPct}%` }} /></div></div>
          </div>
        ) : (
          <div className="flex items-center gap-5 mt-4">
            <Gauge pct={taskPct} label="done" />
            <div className="flex-1 space-y-2 text-xs">
              <div className="flex items-center gap-2.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent shrink-0" /><span className="flex-1 text-contentsoft">Done</span><span className="font-medium tabular-nums">{doneTasks}</span></div>
              <div className="flex items-center gap-2.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 shrink-0" /><span className="flex-1 text-contentsoft">Open</span><span className="font-medium tabular-nums">{openTasks.length}</span></div>
              <div className="flex items-center gap-2.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500 shrink-0" /><span className="flex-1 text-contentsoft">Overdue</span><span className="font-medium tabular-nums">{overdue}</span></div>
            </div>
          </div>
        )}
      </ClickCard>
    ),
    pipeline_stage: (v) => (
      <ClickCard href="/crm" className="card p-5 h-full">
        <span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-target-arrow" className="text-base text-muted2" />Pipeline by stage</span>
        {openDeals.length === 0 ? <EmptyState text="No open deals" icon="ti-target" /> : v === 'funnel' ? (
          <div className="space-y-2 mt-4">
            {stageTotals.map((s) => { const w = Math.max((s.value / maxStage) * 100, 10); return (
              <div key={s.stage} className="flex items-center gap-2">
                <span className="w-20 text-2xs text-muted2 truncate shrink-0">{s.stage}</span>
                <div className="flex-1 flex justify-center"><div className="h-8 rounded bg-accent/85 grid place-items-center text-2xs text-white font-medium tabular-nums px-2" style={{ width: `${w}%` }}>{money(s.value)}</div></div>
              </div>
            ); })}
          </div>
        ) : (
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
    headcount: (v) => (
      <ClickCard href="/employees" className="card p-5 h-full">
        <span className="text-sm font-semibold inline-flex items-center gap-2 mb-4"><Icon name="ti-users" className="text-base text-muted2" />Headcount</span>
        {employees.length === 0 ? <EmptyState text="No employees yet" icon="ti-users" /> : v === 'donut' ? (
          <div className="flex items-center gap-5">
            <div className="relative w-24 h-24 shrink-0 rounded-full" style={{ background: `conic-gradient(${deptGradient})` }}>
              <div className="absolute inset-[13px] rounded-full bg-surface grid place-items-center"><div className="text-center"><p className="text-lg font-semibold leading-none">{headcount}</p><p className="text-2xs text-muted mt-0.5">active</p></div></div>
            </div>
            <div className="flex-1 space-y-1.5">
              {topDepts.map(([dept, c], i) => (<div key={dept} className="flex items-center gap-2 text-xs"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: DEPT_COLOR[i % DEPT_COLOR.length] }} /><span className="flex-1 truncate text-contentsoft">{dept}</span><span className="font-medium tabular-nums">{c}</span></div>))}
            </div>
          </div>
        ) : (
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
    needs_attention: () => {
      const items = [
        { show: hasFeature(activeOrg, 'projects'), n: counts.tasks_overdue || 0, label: 'Overdue tasks', icon: 'ti-calendar-x', href: '/tasks', tone: 'down' },
        { show: hasFeature(activeOrg, 'agents'), n: counts.agent_pending || 0, label: 'Agent actions to review', icon: 'ti-robot', href: '/agent-approvals', tone: 'down' },
        { show: isAdmin && hasFeature(activeOrg, 'attendance'), n: counts.leave_pending || 0, label: 'Leave requests to approve', icon: 'ti-beach', href: '/approvals', tone: 'muted' },
        { show: isAdmin && hasFeature(activeOrg, 'financial'), n: counts.expenses_pending || 0, label: 'Expense claims to approve', icon: 'ti-receipt-2', href: '/approvals', tone: 'muted' },
        { show: isAdmin && hasFeature(activeOrg, 'financial'), n: counts.invoices_overdue || 0, label: 'Overdue invoices', icon: 'ti-file-invoice', href: '/invoicing', tone: 'down' },
        { show: hasFeature(activeOrg, 'social'), n: counts.inbox_open || 0, label: 'Open inbox conversations', icon: 'ti-inbox', href: '/social/inbox', tone: 'muted' },
      ].filter((i) => i.show && i.n > 0);
      return (
        <div className="card p-5 h-full">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-alert-hexagon" className="text-base text-muted2" />Needs attention</span>
            {items.length > 0 && <span className="text-2xs font-medium text-muted2 tabular-nums">{items.reduce((s, i) => s + i.n, 0)} items</span>}
          </div>
          {items.length === 0 ? <EmptyState text="You're all caught up" icon="ti-circle-check" /> : (
            <div className="-mx-2">
              {items.map((i) => (
                <Link key={i.label} href={i.href} className="flex items-center gap-3 px-2 py-2.5 rounded-lg transition hover:bg-surface2">
                  <span className="w-8 h-8 rounded-md grid place-items-center bg-surface2 shrink-0"><Icon name={i.icon} className="text-muted2" /></span>
                  <span className="flex-1 text-sm text-content truncate">{i.label}</span>
                  <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-md text-2xs font-semibold tabular-nums ${i.tone === 'down' ? 'bg-rose-500/15 text-rose-600' : 'bg-accent/10 text-accentstrong'}`}>{i.n}</span>
                  <Icon name="ti-chevron-right" className="text-muted2 text-sm shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    },
    agent_roi: () => {
      const r = computeRoi(roi, DEFAULT_LABOR_RATE_USD);
      return (
        <ClickCard href="/agent-activity" className="card p-5 h-full">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-robot" className="text-base text-muted2" />AI agent ROI &mdash; last 30 days</span>
            <span className="text-xs font-medium text-accentstrong">Agent activity &rarr;</span>
          </div>
          {(!roi || r.executed === 0) ? <EmptyState text="No agent activity yet" icon="ti-robot" /> : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div><p className="text-2xs uppercase tracking-wide text-muted2 font-medium">Hours saved</p><p className="text-2xl font-semibold mt-1 text-content tnum leading-none">{r.hoursSaved.toFixed(1)}</p></div>
                <div><p className="text-2xs uppercase tracking-wide text-muted2 font-medium">Value created</p><p className="text-2xl font-semibold mt-1 text-content tnum leading-none">{money(r.valueCreated)}</p></div>
                <div><p className="text-2xs uppercase tracking-wide text-muted2 font-medium">Net of spend</p><p className={`text-2xl font-semibold mt-1 tnum leading-none ${r.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{money(r.net)}</p></div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-2xs text-muted2">
                <span>{r.executed} actions done</span>
                <span>{r.autoPct}% auto</span>
                <span>{r.reliabilityPct}% reliable</span>
                {r.roiX != null && <span className="font-medium text-accentstrong">{r.roiX.toFixed(1)}× ROI</span>}
              </div>
            </>
          )}
        </ClickCard>
      );
    },
    drive_storage: () => {
      const usedMb = (counts.drive_used_bytes || 0) / 1048576;
      const limitMb = counts.drive_limit_mb ?? null;
      const pct = limitMb && limitMb > 0 ? Math.min(100, Math.round((usedMb / limitMb) * 100)) : null;
      const fmtMb = (m: number) => m >= 1024 ? `${(m / 1024).toFixed(1)} GB` : `${m.toFixed(m < 10 ? 1 : 0)} MB`;
      return (
        <ClickCard href="/drives" className="card p-4 h-full flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs uppercase tracking-wide text-muted2 font-medium truncate">Storage</p>
            <span className="w-7 h-7 rounded-md grid place-items-center bg-accent/10 text-accentstrong shrink-0"><Icon name="ti-cloud" className="text-sm" /></span>
          </div>
          <p className="text-2xl font-semibold mt-2 text-content tnum leading-none">{fmtMb(usedMb)}</p>
          <p className="text-2xs text-muted2 mt-1">{limitMb ? `of ${fmtMb(limitMb)}` : 'Unlimited'}</p>
          {pct != null && <div className="h-2 rounded-full bg-surface2 overflow-hidden mt-3"><div className={`h-full rounded-full ${pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-400' : 'bg-accent'}`} style={{ width: `${pct}%` }} /></div>}
          <p className="text-2xs text-muted2 mt-auto pt-3">{counts.drive_files || 0} files · {counts.recordings_count || 0} recordings</p>
        </ClickCard>
      );
    },
  };

  const visible = (entry: string) => {
    const [k] = splitKey(entry);
    const m = WIDGET_META[k];
    if (!m || !W[k]) return false;
    if (!hasFeature(activeOrg, m.feature)) return false;
    if (m.minRole && !atLeast(activeOrg?.member_role, m.minRole)) return false;
    return true;
  };
  const baseKeys = order.map((e) => splitKey(e)[0]);
  const shown = order.filter(visible);
  const available = Object.keys(WIDGET_META).filter((k) => visible(k) && !baseKeys.includes(k));
  const lockedCards = UPSELL_FEATURES.filter((f) => isUpsellLocked(activeOrg, f.feature));
  const flPrompt = upsells.find((u) => u.trigger_type === 'feature_locked' && u.status === 'active');
  const upsellCta = { label: flPrompt?.cta_label || 'Upgrade', href: flPrompt?.cta_href || '/billing' };
  const upsellHeader = flPrompt?.title || 'Unlock more with an upgrade';
  const upsellSub = flPrompt?.body || 'These features are available on a higher plan — upgrade to switch them on for your whole team.';
  const canBill = can.manageBilling(activeOrg);

  const remove = (entry: string) => setOrder((prev) => prev.filter((x) => x !== entry));
  const add = (k: string) => { setOrder((prev) => [...prev, k]); setAddOpen(false); };
  const setVariant = (key: string, vid: string) => { setVarOpen(''); setOrder((prev) => prev.map((e) => { const [k] = splitKey(e); if (k !== key) return e; const c = coordsOf(e); return c ? makeEntry(k, vid, c) : (vid && vid !== defVariant(k) ? `${k}:${vid}` : k); })); };
  // Persist drag/resize results back into the layout entries (key:variant:x:y:w:h).
  const applyLayout = (l: any[]) => { setOrder((prev) => prev.map((e) => { const it = l.find((x) => x.i === e); if (!it) return e; const [k, v] = splitKey(e); return makeEntry(k, v, { x: it.x, y: it.y, w: it.w, h: it.h }); })); };
  // Build the free-form RGL layout from the order (auto-pack entries that lack coords).
  let _cx = 0, _cy = 0;
  const rglLayout = shown.map((entry) => {
    const [k] = splitKey(entry); const c = coordsOf(entry);
    const w = c?.w ?? defW(k); const h = c?.h ?? defH(k);
    let x: number; let y: number;
    if (c) { x = c.x; y = c.y; } else { if (_cx + w > 12) { _cx = 0; _cy += 4; } x = _cx; y = _cy; _cx += w; }
    const minH = k.startsWith('kpi_') ? 2 : 3; return { i: entry, x, y, w, h, minW: 2, minH };
  });
  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 2200); };
  const savePersonal = async () => { if (!activeOrg) return; try { await saveUserDashboard(activeOrg.id, order); setSource('personal'); setEditing(false); flash('Saved your dashboard'); } catch (e: any) { flash(e.message || 'Save failed'); } };
  const saveOrgDefault = async () => { if (!activeOrg) return; try { await saveOrgDashboard(activeOrg.id, order); flash('Saved as workspace default'); } catch (e: any) { flash(e.message || 'Save failed'); } };
  const resetMine = async () => { if (!activeOrg) return; try { await resetUserDashboard(activeOrg.id); const dl = await getDashboardLayouts(activeOrg.id, user!.id); const base = dl.orgDefault || DEFAULT_KEYS; setOrder(base); setSource(dl.orgDefault ? 'org' : 'default'); setEditing(false); flash('Reset to workspace default'); } catch (e: any) { flash(e.message || 'Reset failed'); } };

  const _hr = new Date().getHours();
  const greeting = _hr < 12 ? 'Good morning' : _hr < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const spanCls = (s: number) => (s >= 4 ? 'sm:col-span-2 lg:col-span-4' : s === 2 ? 'sm:col-span-2 lg:col-span-2' : '');

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
      <KeyRotationNudge />
      <InstallPrompt />
      <OnboardingWizard />
      <QuickStart />
      <FirstRunChecklist />
      <ProfileCompletion />

      {editing && (
        <div className="card p-3 mb-4 flex flex-wrap items-center gap-2 bg-accent/5 border-accent/30">
          <span className="text-xs text-muted inline-flex items-center gap-1.5"><Icon name="ti-info-circle" className="text-sm" />Editing — drag cards to move (others rearrange to fit), drag a card&rsquo;s bottom-right corner to resize, change its visual (palette), remove (×), then save.</span>
          <div className="flex-1" />
          <div className="relative">
            <button onClick={() => setAddOpen((v) => !v)} disabled={available.length === 0} className="btn btn-ghost border border-line h-8 py-0 disabled:opacity-50"><Icon name="ti-plus" />Add widget</button>
            {addOpen && <button type="button" aria-hidden className="fixed inset-0 z-20 cursor-default" onClick={() => setAddOpen(false)} />}
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

      {loading ? <Spinner /> : shown.length === 0 ? (
        <EmptyState text="No widgets to show — click Customize to add some." icon="ti-layout-dashboard" />
      ) : isMobile ? (
        <div className="flex flex-col gap-3">
          {shown.map((entry) => { const [k, variant] = splitKey(entry); const tall = !k.startsWith('kpi_'); return (
            <div key={entry} className={`dash-cell overflow-hidden ${tall ? 'min-h-[260px]' : ''}`}>{W[k](variant)}</div>
          ); })}
        </div>
      ) : (
        <GridW className="layout" layout={rglLayout} cols={12} rowHeight={64} margin={[12, 12]} containerPadding={[0, 0]}
          isDraggable={editing} isResizable={editing} resizeHandles={['se','s','e','sw']} draggableCancel=".rgl-no-drag" compactType="vertical"
          onDragStop={(l: any[]) => applyLayout(l)} onResizeStop={(l: any[]) => applyLayout(l)}>
          {shown.map((entry) => {
            const [k, variant] = splitKey(entry);
            const variants = VARIANTS[k];
            return (
              <div key={entry} className={`relative h-full ${editing ? 'ring-1 ring-dashed ring-line rounded-xl cursor-move' : ''}`}>
                {editing && (
                  <div className="absolute -top-2 right-1 z-20 flex items-center gap-1 rgl-no-drag">
                    {variants && variants.length > 1 && (
                      <div className="relative">
                        <button onClick={() => setVarOpen((o) => (o === entry ? '' : entry))} title="Change visual" className="w-6 h-6 grid place-items-center rounded-md bg-surface border border-line text-muted hover:text-content shadow-sm"><Icon name="ti-palette" className="text-xs" /></button>
                        {varOpen === entry && <button type="button" aria-hidden className="fixed inset-0 z-20 cursor-default" onClick={() => setVarOpen('')} />}
                        {varOpen === entry && (
                          <div className="absolute right-0 mt-1 z-30 w-40 card p-1 shadow-lg">
                            <p className="px-2 py-1 text-2xs text-muted2">Visual</p>
                            {variants.map((vv) => (<button key={vv.id} onClick={() => setVariant(k, vv.id)} className={`w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-surface2 flex items-center gap-2 ${vv.id === variant ? 'text-accentstrong' : ''}`}><Icon name={vv.icon} className="text-muted2" />{vv.label}{vv.id === variant && <Icon name="ti-check" className="ml-auto text-xs" />}</button>))}
                          </div>
                        )}
                      </div>
                    )}
                    <button onClick={() => remove(entry)} title="Remove" className="w-6 h-6 grid place-items-center rounded-md bg-surface border border-line text-rose-500 hover:bg-rose-50 shadow-sm"><Icon name="ti-x" className="text-xs" /></button>
                  </div>
                )}
                <div className={`dash-cell h-full overflow-hidden ${editing ? 'pointer-events-none' : ''}`}>{W[k](variant)}</div>
              </div>
            );
          })}
        </GridW>
      )}

      {!editing && lockedCards.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-content mb-1 inline-flex items-center gap-2"><Icon name="ti-lock-open" className="text-muted2" />{upsellHeader}</h2>
          <p className="text-2xs text-muted2 mb-3">{upsellSub}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {lockedCards.map((f) => (
              <div key={f.feature} className="card p-4 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-lg grid place-items-center bg-surface2 text-muted2"><Icon name={f.icon} /></span>
                  <span className="inline-flex items-center gap-1 text-2xs font-medium text-amber-600"><Icon name="ti-lock" className="text-xs" />Locked</span>
                </div>
                <p className="text-sm font-semibold text-content mt-2">{f.title}</p>
                <p className="text-2xs text-muted2 mt-0.5 flex-1">{f.blurb}</p>
                {canBill
                  ? <Link href={upsellCta.href} className="btn btn-sm btn-primary w-full mt-3"><Icon name="ti-arrow-up" className="text-sm" />{upsellCta.label}</Link>
                  : <p className="text-2xs text-muted2 mt-3">Ask an admin to upgrade.</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}

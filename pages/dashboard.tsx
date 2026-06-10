import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { StatCard, Pill, Spinner, EmptyState, Icon, Avatar } from '@/components/ui';
import { useAuthStore } from '@/lib/store';
import { getProjects, getTasks, getDeals } from '@/lib/db';
import { Project, Task, Deal } from '@/lib/supabase';

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const isOverdue = (d: string | null) => !!d && new Date(d) < new Date(new Date().toDateString());

// Status → swatch colour for the donut + legend (works on both themes).
const STATUS_COLOR: Record<string, string> = {
  Active: '#3ECF8E', Planning: '#38bdf8', 'On Hold': '#f59e0b', Completed: '#a78bfa', Cancelled: '#f43f5e',
};
const STAGE_ORDER = ['Lead', 'Qualified', 'Proposal', 'Negotiation'];

export default function Dashboard() {
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getProjects(), getTasks(), getDeals()])
      .then(([p, t, d]) => { setProjects(p); setTasks(t); setDeals(d); })
      .finally(() => setLoading(false));
  }, []);

  const activeProjects = projects.filter((p) => p.status === 'Active').length;
  const openTasks = tasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
  const overdue = openTasks.filter((t) => isOverdue(t.due_date)).length;
  const openDeals = deals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost');
  const pipeline = openDeals.reduce((s, d) => s + (d.value || 0), 0);

  // Project status breakdown for the donut.
  const statusCounts = projects.reduce<Record<string, number>>((m, p) => { m[p.status] = (m[p.status] || 0) + 1; return m; }, {});
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

  // Pipeline by stage.
  const stageTotals = STAGE_ORDER.map((stage) => ({
    stage,
    value: openDeals.filter((d) => d.stage === stage).reduce((s, d) => s + (d.value || 0), 0),
    count: openDeals.filter((d) => d.stage === stage).length,
  }));
  const maxStage = Math.max(1, ...stageTotals.map((s) => s.value));

  return (
    <Layout title="Dashboard">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome back, {user?.full_name?.split(' ')[0]}</h1>
          <p className="text-sm text-muted mt-1">Here's what's happening across the workspace.</p>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Active projects" value={activeProjects} hint={`${projects.length} total`} icon="ti-folder" />
            <StatCard label="Open tasks" value={openTasks.length} hint={overdue ? `${overdue} overdue` : 'On schedule'} hintTone={overdue ? 'down' : 'up'} icon="ti-checkbox" />
            <StatCard label="Open deals" value={openDeals.length} hint={`${deals.length} total`} icon="ti-target" />
            <StatCard label="Pipeline value" value={money(pipeline)} hint="Open opportunities" icon="ti-currency-dollar" />
          </div>

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

            {/* Project status donut */}
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

          <div className="grid lg:grid-cols-3 gap-5">
            {/* Pipeline by stage */}
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
                        <span className="flex items-center gap-2"><Pill label={s.stage} /><span className="text-muted2">{s.count} deal{s.count === 1 ? '' : 's'}</span></span>
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

            {/* Due soon */}
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
                    <span className={`text-2xs font-medium shrink-0 ${isOverdue(t.due_date) ? 'text-rose-500' : 'text-muted2'}`}>{t.due_date || ''}</span>
                  </div>
                ))}
                {openTasks.length === 0 && <EmptyState text="All caught up" icon="ti-checks" />}
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}

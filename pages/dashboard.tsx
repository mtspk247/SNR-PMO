import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { StatCard, Pill, Spinner, EmptyState, Icon } from '@/components/ui';
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
      <div className="mb-5">
        <h1 className="text-lg font-semibold">Welcome back, {user?.full_name?.split(' ')[0]}</h1>
        <p className="text-sm text-muted mt-0.5">Here's what's happening across the workspace.</p>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label="Active projects" value={activeProjects} hint={`${projects.length} total`} icon="ti-folder" />
            <StatCard label="Open tasks" value={openTasks.length} hint={overdue ? `${overdue} overdue` : 'On schedule'} hintTone={overdue ? 'down' : 'up'} icon="ti-checkbox" />
            <StatCard label="Open deals" value={openDeals.length} hint={`${deals.length} total`} icon="ti-target" />
            <StatCard label="Pipeline value" value={money(pipeline)} hint="Open opportunities" icon="ti-currency-dollar" />
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <div className="card lg:col-span-2 overflow-hidden">
              <div className="flex items-center justify-between px-4 h-12 border-b border-line">
                <span className="text-sm font-medium">Projects</span>
                <Link href="/projects" className="text-xs text-accentstrong hover:underline">View all</Link>
              </div>
              {projects.length === 0 ? <EmptyState text="No projects yet" /> : (
                <table className="w-full">
                  <thead><tr>
                    <th className="th">Project</th><th className="th">Status</th><th className="th">Priority</th><th className="th w-40">Progress</th>
                  </tr></thead>
                  <tbody>
                    {projects.slice(0, 6).map((p) => (
                      <tr key={p.id} className="row">
                        <td className="td font-medium">{p.name}</td>
                        <td className="td"><Pill label={p.status} /></td>
                        <td className="td"><Pill label={p.priority} /></td>
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded bg-surface2"><div className="h-1.5 rounded bg-accent" style={{ width: `${p.progress || 0}%` }} /></div>
                            <span className="text-2xs text-muted w-8 text-right">{p.progress || 0}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Project status donut */}
            <div className="card p-4">
              <span className="text-sm font-medium">Project status</span>
              {projects.length === 0 ? <EmptyState text="No data" icon="ti-chart-donut" /> : (
                <div className="flex items-center gap-5 mt-4">
                  <div className="relative w-28 h-28 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
                    <div className="absolute inset-[14px] rounded-full bg-surface grid place-items-center">
                      <div className="text-center">
                        <p className="text-xl font-semibold leading-none">{projects.length}</p>
                        <p className="text-2xs text-muted mt-0.5">total</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {statusEntries.map(([s, c]) => (
                      <div key={s} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: STATUS_COLOR[s] || '#94a3b8' }} />
                        <span className="flex-1 truncate text-contentsoft">{s}</span>
                        <span className="text-muted">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* Pipeline by stage */}
            <div className="card p-4 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium">Pipeline by stage</span>
                <Link href="/crm" className="text-xs text-accentstrong hover:underline">Open CRM</Link>
              </div>
              {openDeals.length === 0 ? <EmptyState text="No open deals" icon="ti-target" /> : (
                <div className="space-y-3">
                  {stageTotals.map((s) => (
                    <div key={s.stage}>
                      <div className="flex items-center justify-between mb-1 text-xs">
                        <span className="flex items-center gap-2"><Pill label={s.stage} /><span className="text-muted2">{s.count}</span></span>
                        <span className="font-medium text-contentsoft">{money(s.value)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(s.value / maxStage) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Due soon */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 h-12 border-b border-line">
                <span className="text-sm font-medium">Due soon</span>
                <Link href="/tasks" className="text-xs text-accentstrong hover:underline">All tasks</Link>
              </div>
              <div className="divide-y divide-line">
                {openTasks.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon name="ti-circle" className={`text-base ${isOverdue(t.due_date) ? 'text-rose-500' : 'text-muted2'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{t.name}</p>
                      <p className="text-2xs text-muted truncate">{t.projects?.name || '—'}</p>
                    </div>
                    <span className={`text-2xs ${isOverdue(t.due_date) ? 'text-rose-500' : 'text-muted2'}`}>{t.due_date || ''}</span>
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

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { StatCard, Pill, Spinner, EmptyState, Icon } from '@/components/ui';
import { useAuthStore } from '@/lib/store';
import { getProjects, getTasks, getDeals } from '@/lib/db';
import { Project, Task, Deal } from '@/lib/supabase';

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const isOverdue = (d: string | null) => !!d && new Date(d) < new Date(new Date().toDateString());

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

  return (
    <Layout title="Dashboard">
      <div className="mb-5">
        <h1 className="text-lg font-semibold">Welcome back, {user?.full_name?.split(' ')[0]}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Here's what's happening across the workspace.</p>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard label="Active projects" value={activeProjects} hint={`${projects.length} total`} icon="ti-folder" />
            <StatCard label="Open tasks" value={openTasks.length} hint={overdue ? `${overdue} overdue` : 'On schedule'} hintTone={overdue ? 'down' : 'up'} icon="ti-checkbox" />
            <StatCard label="Open deals" value={openDeals.length} hint={`${deals.length} total`} icon="ti-target" />
            <StatCard label="Pipeline value" value={money(pipeline)} hint="Open opportunities" icon="ti-currency-dollar" />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="card lg:col-span-2 overflow-hidden">
              <div className="flex items-center justify-between px-4 h-12 border-b border-line">
                <span className="text-sm font-medium">Projects</span>
                <Link href="/projects" className="text-xs text-sky-600">View all</Link>
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
                            <div className="flex-1 h-1.5 rounded bg-neutral-100"><div className="h-1.5 rounded bg-ink" style={{ width: `${p.progress || 0}%` }} /></div>
                            <span className="text-2xs text-neutral-500 w-8 text-right">{p.progress || 0}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 h-12 border-b border-line">
                <span className="text-sm font-medium">Due soon</span>
                <Link href="/tasks" className="text-xs text-sky-600">All tasks</Link>
              </div>
              <div className="divide-y divide-line">
                {openTasks.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon name="ti-circle" className={`text-base ${isOverdue(t.due_date) ? 'text-rose-500' : 'text-neutral-300'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{t.name}</p>
                      <p className="text-2xs text-neutral-500 truncate">{t.projects?.name || '—'}</p>
                    </div>
                    <span className={`text-2xs ${isOverdue(t.due_date) ? 'text-rose-600' : 'text-neutral-400'}`}>{t.due_date || ''}</span>
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

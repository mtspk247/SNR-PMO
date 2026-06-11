import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Pill, Spinner, EmptyState, StatCard, Icon } from '@/components/ui';
import CommentsThread from '@/components/Comments';
import {
  getProjectById, getTasks, getRisks, getFinancials,
  getOrgUsers, getOrgCompanies, getPortfolios,
} from '@/lib/db';
import { Project, Task, Risk, Financial, OrgUser, OrgCompany, Portfolio } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';

const fmtMoney = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function ProjectDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [financials, setFinancials] = useState<Financial[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [companies, setCompanies] = useState<OrgCompany[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true); setNotFound(false);
    Promise.all([
      getProjectById(id),
      getTasks().catch(() => [] as Task[]),
      getRisks().catch(() => [] as Risk[]),
      getFinancials().catch(() => [] as Financial[]),
      getOrgUsers().catch(() => [] as OrgUser[]),
      getOrgCompanies().catch(() => [] as OrgCompany[]),
      getPortfolios().catch(() => [] as Portfolio[]),
    ])
      .then(([p, t, r, f, u, c, pf]) => {
        if (!p) { setNotFound(true); return; }
        setProject(p);
        setTasks(t.filter((x) => x.project_id === id));
        setRisks(r.filter((x) => x.project_id === id));
        setFinancials(f.filter((x) => x.project_id === id));
        setUsers(u); setCompanies(c); setPortfolios(pf);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, org?.id]);

  const userName = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';
  const companyName = (cid?: string | null) => (cid ? companies.find((c) => c.id === cid)?.name : undefined);
  const portfolioName = (pid?: string | null) => (pid ? portfolios.find((pf) => pf.id === pid)?.name : undefined);

  const planned = financials.reduce((s, f) => s + (f.planned || 0), 0);
  const actual = financials.reduce((s, f) => s + (f.actual || 0), 0);
  const openTasks = tasks.filter((t) => t.status !== 'Completed' && t.status !== 'Done').length;

  if (loading) return <Layout title="Project"><Spinner /></Layout>;

  if (notFound || !project) {
    return (
      <Layout title="Project">
        <EmptyState icon="ti-folder-off" text="Project not found, or you don’t have access." />
        <div className="mt-4"><Link href="/projects" className="btn"><Icon name="ti-arrow-left" />Back to projects</Link></div>
      </Layout>
    );
  }

  const meta = [
    { label: 'Company', value: companyName(project.company_id) || '—', icon: 'ti-building' },
    { label: 'Portfolio', value: portfolioName(project.portfolio_id) || '—', icon: 'ti-stack-2' },
    { label: 'Project manager', value: userName(project.pm_id), icon: 'ti-user' },
    { label: 'Start', value: project.start_date || '—', icon: 'ti-calendar' },
    { label: 'End', value: project.end_date || '—', icon: 'ti-calendar-event' },
  ];

  return (
    <Layout title={project.name}>
      <div className="mb-4">
        <Link href="/projects" className="text-2xs text-neutral-500 hover:text-ink inline-flex items-center gap-1"><Icon name="ti-arrow-left" />Projects</Link>
      </div>
      <PageHeader title={project.name}
        subtitle={undefined}
        action={<div className="flex items-center gap-2"><Pill label={project.status} /><Pill label={project.priority} /></div>} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Progress" value={`${project.progress || 0}%`} icon="ti-progress" />
        <StatCard label="Open tasks" value={`${openTasks}/${tasks.length}`} icon="ti-checklist" />
        <StatCard label="Open risks" value={`${risks.length}`} icon="ti-alert-triangle" />
        <StatCard label="Budget actual / planned" value={`${fmtMoney(actual)} / ${fmtMoney(planned)}`} icon="ti-cash" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Overview</p>
            {project.description
              ? <p className="text-sm text-ink whitespace-pre-line">{project.description}</p>
              : <p className="text-sm text-neutral-400">No description.</p>}
            <div className="mt-4">
              <div className="flex items-center justify-between text-2xs text-neutral-500 mb-1"><span>Progress</span><span>{project.progress || 0}%</span></div>
              <div className="h-2 rounded bg-neutral-100"><div className="h-2 rounded bg-ink" style={{ width: `${project.progress || 0}%` }} /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-5">
              {meta.map((m) => (
                <div key={m.label} className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-md bg-neutral-100 grid place-items-center text-neutral-500 shrink-0"><Icon name={m.icon} /></span>
                  <div className="min-w-0">
                    <p className="text-2xs text-neutral-400">{m.label}</p>
                    <p className="text-sm truncate">{m.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-line flex items-center justify-between">
              <p className="text-sm font-semibold">Tasks</p>
              <Link href="/tasks" className="text-2xs text-neutral-500 hover:text-ink">All tasks →</Link>
            </div>
            {tasks.length === 0 ? <div className="p-5"><EmptyState icon="ti-checklist" text="No tasks for this project yet." /></div> : (
              <div className="overflow-x-auto"><table className="w-full">
                <thead><tr><th className="th">Name</th><th className="th">Status</th><th className="th">Assignee</th><th className="th">Due</th></tr></thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id} className="row">
                      <td className="td font-medium">{t.name}</td>
                      <td className="td"><Pill label={t.status} /></td>
                      <td className="td text-2xs text-neutral-500">{userName(t.assignee_id)}</td>
                      <td className="td text-2xs text-neutral-500">{t.due_date || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-line"><p className="text-sm font-semibold">Risks</p></div>
            {risks.length === 0 ? <div className="p-5"><EmptyState icon="ti-shield-check" text="No risks logged." /></div> : (
              <div className="overflow-x-auto"><table className="w-full">
                <thead><tr><th className="th">Title</th><th className="th">Category</th><th className="th">Impact × Prob</th><th className="th">Status</th></tr></thead>
                <tbody>
                  {risks.map((r) => (
                    <tr key={r.id} className="row">
                      <td className="td font-medium">{r.title}</td>
                      <td className="td text-2xs text-neutral-500">{r.category}</td>
                      <td className="td text-2xs text-neutral-500">{r.impact} × {r.probability}</td>
                      <td className="td"><Pill label={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-line"><p className="text-sm font-semibold">Financials</p></div>
            {financials.length === 0 ? <div className="p-5"><EmptyState icon="ti-cash" text="No financial records." /></div> : (
              <div className="overflow-x-auto"><table className="w-full">
                <thead><tr><th className="th">Period</th><th className="th">Category</th><th className="th text-right">Planned</th><th className="th text-right">Actual</th></tr></thead>
                <tbody>
                  {financials.map((f) => (
                    <tr key={f.id} className="row">
                      <td className="td text-2xs text-neutral-500">{f.period}</td>
                      <td className="td text-2xs text-neutral-500">{f.category}</td>
                      <td className="td text-right">{fmtMoney(f.planned || 0)}</td>
                      <td className="td text-right">{fmtMoney(f.actual || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="card p-5">
            <p className="text-sm font-semibold mb-3">Discussion</p>
            <CommentsThread entityType="project" entityId={project.id} orgId={org?.id} users={users} currentUserId={me?.id} />
          </div>
        </div>
      </div>
    </Layout>
  );
}

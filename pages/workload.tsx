import { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon, StatCard } from '@/components/ui';
import { useTasks, useProjects, useTeams, useOrgCompanies } from '@/lib/queries';
import { getOrgUsers } from '@/lib/db';
import { OrgUser, Task } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';

const isOverdue = (d: string | null) => !!d && new Date(d) < new Date(new Date().toDateString());
type Dim = 'person' | 'team' | 'project' | 'company';

interface Row { id: string; name: string; avatar: boolean; open: number; inProgress: number; overdue: number; estHours: number; }

export default function Workload() {
  const org = useActiveOrg();
  const { data: tasks = [], isLoading } = useTasks();
  const { data: projects = [] } = useProjects();
  const { data: teams = [] } = useTeams();
  const { data: companies = [] } = useOrgCompanies();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [dim, setDim] = useState<Dim>('person');
  const [q, setQ] = useState('');
  const [projectF, setProjectF] = useState('all');
  const [priorityF, setPriorityF] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  useEffect(() => { if (org?.id) getOrgUsers(org.id).then(setUsers).catch(() => {}); }, [org?.id]);

  const projCompany = useMemo(() => { const m = new Map<string, string>(); projects.forEach((p: any) => { if (p.company_id) m.set(p.id, p.company_id); }); return m; }, [projects]);
  const open = useMemo(() => tasks.filter((t) => !t.parent_task_id && t.status !== 'Done' && t.status !== 'Cancelled'), [tasks]);

  // Filters narrow the underlying task set; the KPI tiles reflect this scope.
  const filtered = useMemo(() => open.filter((t) => {
    if (projectF !== 'all' && (t.project_id || '') !== projectF) return false;
    if (priorityF !== 'all' && (t.priority || '') !== priorityF) return false;
    if (overdueOnly && !isOverdue(t.due_date)) return false;
    return true;
  }), [open, projectF, priorityF, overdueOnly]);

  const rows = useMemo<Row[]>(() => {
    const make = (id: string, name: string, avatar: boolean, items: Task[]): Row => ({
      id, name, avatar,
      open: items.length,
      inProgress: items.filter((t) => t.status === 'In Progress').length,
      overdue: items.filter((t) => isOverdue(t.due_date)).length,
      estHours: items.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0),
    });
    if (dim === 'person') {
      const list = users.map((u) => make(u.id, u.full_name, true, filtered.filter((t) => t.assignee_id === u.id)));
      const un = filtered.filter((t) => !t.assignee_id);
      if (un.length) list.push(make('_un', 'Unassigned', false, un));
      return list.filter((r) => r.open > 0).sort((a, b) => b.open - a.open);
    }
    if (dim === 'team') {
      const list = teams.map((tm: { id: string; name: string }) => make(tm.id, tm.name, false, filtered.filter((t) => t.team_id === tm.id)));
      const none = filtered.filter((t) => !t.team_id);
      if (none.length) list.push(make('_none', 'No team', false, none));
      return list.filter((r) => r.open > 0).sort((a, b) => b.open - a.open);
    }
    if (dim === 'company') {
      const list = companies.map((c: any) => make(c.id, c.name, false, filtered.filter((t) => projCompany.get(t.project_id || '') === c.id)));
      const none = filtered.filter((t) => !projCompany.get(t.project_id || ''));
      if (none.length) list.push(make('_none', 'No company', false, none));
      return list.filter((r) => r.open > 0).sort((a, b) => b.open - a.open);
    }
    const list = projects.map((p) => make(p.id, p.name, false, filtered.filter((t) => t.project_id === p.id)));
    const none = filtered.filter((t) => !t.project_id);
    if (none.length) list.push(make('_none', 'No project', false, none));
    return list.filter((r) => r.open > 0).sort((a, b) => b.open - a.open);
  }, [dim, users, teams, projects, companies, projCompany, filtered]);

  // Name search narrows the visible rows only (KPIs stay at filter scope).
  const visibleRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? rows.filter((r) => r.name.toLowerCase().includes(needle)) : rows;
  }, [rows, q]);

  const maxOpen = Math.max(1, ...rows.map((r) => r.open));
  const kOpen = filtered.length;
  const kInProgress = filtered.filter((t) => t.status === 'In Progress').length;
  const kOverdue = filtered.filter((t) => isOverdue(t.due_date)).length;
  const kEst = filtered.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0);
  const filtersActive = projectF !== 'all' || priorityF !== 'all' || overdueOnly || q.trim() !== '';
  const clearFilters = () => { setQ(''); setProjectF('all'); setPriorityF('all'); setOverdueOnly(false); };

  return (
    <Layout flat title="Workload">
      <PageHeader title="Workload" subtitle="Open work distribution across people, teams and projects" icon="ti-chart-bar" />
      {isLoading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard label="Open tasks" value={kOpen} icon="ti-checkbox" />
            <StatCard label="In progress" value={kInProgress} icon="ti-progress" />
            <StatCard label="Overdue" value={kOverdue} hint={kOverdue > 0 ? 'Needs attention' : 'On track'} hintTone={kOverdue > 0 ? 'down' : 'up'} icon="ti-alarm" />
            <StatCard label="Estimated hours" value={`${kEst}h`} icon="ti-clock" />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-surface w-full sm:w-56">
              <Icon name="ti-search" className="text-muted2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find row…"
                className="bg-transparent outline-none text-sm w-full text-content placeholder:text-muted2" />
            </div>
            <div className="w-auto"><Select value={projectF} onChange={(v) => setProjectF(v)} options={[{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} /></div>
            <div className="w-auto"><Select value={priorityF} onChange={(v) => setPriorityF(v)} options={[{ value: 'all', label: 'All priorities' }, ...['Urgent', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: titleCase(p) }))]} /></div>
            <button onClick={() => setOverdueOnly((v) => !v)}
              className={`btn h-9 ${overdueOnly ? 'border-rose-400 text-rose-600' : ''}`}>
              <Icon name="ti-alarm" className="text-sm" />Overdue only
            </button>
            {filtersActive && <button onClick={clearFilters} className="text-2xs text-muted hover:text-content underline">Clear</button>}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xs text-muted2">Group by</span>
            <div className="flex items-center rounded-lg border border-line overflow-hidden h-9">
              {(['person', 'team', 'project', 'company'] as const).map((d) => (
                <button key={d} onClick={() => setDim(d)}
                  className={`h-full px-3 text-xs capitalize transition ${dim === d ? 'bg-surface2 text-content font-medium' : 'text-muted hover:text-content'}`}>{d}</button>
              ))}
            </div>
          </div>

          <div className="bg-surface overflow-hidden">
            <div className="grid grid-cols-[minmax(160px,1fr)_1fr_88px_88px_88px] items-center gap-3 px-4 py-2 border-b border-line bg-surface2/60 text-2xs font-semibold uppercase tracking-wider text-muted2">
              <span>{dim === 'person' ? 'Person' : dim === 'team' ? 'Team' : dim === 'company' ? 'Company' : 'Project'}</span><span>Load</span><span className="text-right">Open</span><span className="text-right">Overdue</span><span className="text-right">Est. h</span>
            </div>
            {visibleRows.length === 0 ? <EmptyState text={filtersActive ? 'No work matches these filters' : 'No open work to distribute'} icon="ti-checks" /> : visibleRows.map((r) => {
              const real = !r.id.startsWith('_');
              const clickable = real && dim !== 'company';
              const cls = "grid grid-cols-[minmax(160px,1fr)_1fr_88px_88px_88px] items-center gap-3 px-4 py-3 border-b border-line bg-surface hover:bg-surface2 hover:shadow-md transition relative" + (clickable ? " cursor-pointer" : "");
              const inner = (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    {r.avatar ? <Avatar name={r.name} size={24} /> : <span className="w-6 h-6 rounded-md grid place-items-center bg-surface2 text-muted2 shrink-0"><Icon name={dim === 'team' ? 'ti-users-group' : dim === 'project' ? 'ti-folder' : dim === 'company' ? 'ti-building' : 'ti-user'} className="text-sm" /></span>}
                    <span className="text-sm font-medium text-content truncate">{r.name}</span>
                    {clickable && <Icon name="ti-arrow-up-right" className="text-2xs text-muted2 opacity-0 group-hover:opacity-100" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${(r.open / maxOpen) * 100}%` }} /></div>
                    <span className="text-2xs text-muted2 tabular-nums w-16">{r.inProgress} in prog.</span>
                  </div>
                  <span className="text-sm text-right tabular-nums">{r.open}</span>
                  <span className={`text-sm text-right tabular-nums ${r.overdue > 0 ? 'text-rose-500 font-medium' : 'text-muted2'}`}>{r.overdue}</span>
                  <span className="text-sm text-right tabular-nums text-muted">{r.estHours}</span>
                </>
              );
              return clickable
                ? <Link key={r.id} href={dim === 'team' ? `/teams/${r.id}` : `/workload/${dim}/${r.id}`} className={cls + " group"}>{inner}</Link>
                : <div key={r.id} className={cls}>{inner}</div>;
            })}
          </div>
        </>
      )}
    </Layout>
  );
}

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon, StatCard } from '@/components/ui';
import { useTasks, useProjects, useTeams } from '@/lib/queries';
import { getOrgUsers } from '@/lib/db';
import { OrgUser, Task } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';

const isOverdue = (d: string | null) => !!d && new Date(d) < new Date(new Date().toDateString());
type Dim = 'person' | 'team' | 'project';

interface Row { id: string; name: string; avatar: boolean; open: number; inProgress: number; overdue: number; estHours: number; }

export default function Workload() {
  const org = useActiveOrg();
  const { data: tasks = [], isLoading } = useTasks();
  const { data: projects = [] } = useProjects();
  const { data: teams = [] } = useTeams();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [dim, setDim] = useState<Dim>('person');
  useEffect(() => { if (org?.id) getOrgUsers(org.id).then(setUsers).catch(() => {}); }, [org?.id]);

  const open = useMemo(() => tasks.filter((t) => !t.parent_task_id && t.status !== 'Done' && t.status !== 'Cancelled'), [tasks]);

  const rows = useMemo<Row[]>(() => {
    const make = (id: string, name: string, avatar: boolean, items: Task[]): Row => ({
      id, name, avatar,
      open: items.length,
      inProgress: items.filter((t) => t.status === 'In Progress').length,
      overdue: items.filter((t) => isOverdue(t.due_date)).length,
      estHours: items.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0),
    });
    if (dim === 'person') {
      const list = users.map((u) => make(u.id, u.full_name, true, open.filter((t) => t.assignee_id === u.id)));
      const un = open.filter((t) => !t.assignee_id);
      if (un.length) list.push(make('_un', 'Unassigned', false, un));
      return list.filter((r) => r.open > 0).sort((a, b) => b.open - a.open);
    }
    if (dim === 'team') {
      const list = teams.map((tm: { id: string; name: string }) => make(tm.id, tm.name, false, open.filter((t) => t.team_id === tm.id)));
      const none = open.filter((t) => !t.team_id);
      if (none.length) list.push(make('_none', 'No team', false, none));
      return list.filter((r) => r.open > 0).sort((a, b) => b.open - a.open);
    }
    const list = projects.map((p) => make(p.id, p.name, false, open.filter((t) => t.project_id === p.id)));
    const none = open.filter((t) => !t.project_id);
    if (none.length) list.push(make('_none', 'No project', false, none));
    return list.filter((r) => r.open > 0).sort((a, b) => b.open - a.open);
  }, [dim, users, teams, projects, open]);

  const maxOpen = Math.max(1, ...rows.map((r) => r.open));
  const totalEst = rows.reduce((s, r) => s + r.estHours, 0);
  const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0);

  return (
    <Layout flat title="Workload">
      <PageHeader title="Workload" subtitle="Open work distribution across people, teams and projects" icon="ti-chart-bar" />
      {isLoading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <StatCard label="Open tasks" value={open.length} icon="ti-checkbox" />
            <StatCard label="Overdue" value={totalOverdue} hint={totalOverdue > 0 ? 'Needs attention' : 'On track'} hintTone={totalOverdue > 0 ? 'down' : 'up'} icon="ti-alarm" />
            <StatCard label="Estimated hours" value={`${totalEst}h`} icon="ti-clock" />
          </div>

          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xs text-muted2">Group by</span>
            <div className="flex items-center rounded-lg border border-line overflow-hidden h-9">
              {(['person', 'team', 'project'] as const).map((d) => (
                <button key={d} onClick={() => setDim(d)}
                  className={`h-full px-3 text-xs capitalize transition ${dim === d ? 'bg-surface2 text-content font-medium' : 'text-muted hover:text-content'}`}>{d}</button>
              ))}
            </div>
          </div>

          <div className="bg-surface overflow-hidden">
            <div className="grid grid-cols-[minmax(160px,1fr)_1fr_88px_88px_88px] items-center gap-3 px-4 py-2 border-b border-line bg-surface2/60 text-2xs font-semibold uppercase tracking-wider text-muted2">
              <span>{dim === 'person' ? 'Person' : dim === 'team' ? 'Team' : 'Project'}</span><span>Load</span><span className="text-right">Open</span><span className="text-right">Overdue</span><span className="text-right">Est. h</span>
            </div>
            {rows.length === 0 ? <EmptyState text="No open work to distribute" icon="ti-checks" /> : rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[minmax(160px,1fr)_1fr_88px_88px_88px] items-center gap-3 px-4 py-3 border-b border-line bg-surface hover:bg-surface2 hover:shadow-md transition relative">
                <div className="flex items-center gap-2 min-w-0">
                  {r.avatar ? <Avatar name={r.name} size={24} /> : <span className="w-6 h-6 rounded-md grid place-items-center bg-surface2 text-muted2 shrink-0"><Icon name={dim === 'team' ? 'ti-users-group' : dim === 'project' ? 'ti-folder' : 'ti-user'} className="text-sm" /></span>}
                  <span className="text-sm font-medium text-content truncate">{r.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${(r.open / maxOpen) * 100}%` }} /></div>
                  <span className="text-2xs text-muted2 tabular-nums w-16">{r.inProgress} in prog.</span>
                </div>
                <span className="text-sm text-right tabular-nums">{r.open}</span>
                <span className={`text-sm text-right tabular-nums ${r.overdue > 0 ? 'text-rose-500 font-medium' : 'text-muted2'}`}>{r.overdue}</span>
                <span className="text-sm text-right tabular-nums text-muted">{r.estHours}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}

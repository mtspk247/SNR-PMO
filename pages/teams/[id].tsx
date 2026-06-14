import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { Spinner, EmptyState, Avatar, Icon, StatCard, StatusBadge } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { getTeams, getTasks, getTimeEntriesRange } from '@/lib/db';
import { Team, Task, TimeEntry } from '@/lib/supabase';

const DAY = 86400000;
const isOpen = (t: Task) => t.status !== 'Done' && t.status !== 'Cancelled';
const isOverdue = (t: Task) => !!t.due_date && t.status !== 'Done' && t.status !== 'Cancelled' && new Date(t.due_date) < new Date(new Date().toDateString());
const minsToH = (m: number) => Math.round((m / 60) * 10) / 10;

function Section({ title, icon, children, right }: { title: string; icon: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="card overflow-hidden mb-5">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-line">
        <span className="flex items-center gap-2 text-sm font-semibold text-content"><Icon name={icon} className="text-muted" />{title}</span>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function TeamOverview() {
  const router = useRouter();
  const org = useActiveOrg();
  const id = (router.query.id as string) || '';
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<Team | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [times, setTimes] = useState<TimeEntry[]>([]);

  useEffect(() => {
    if (!org?.id || !id) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const tomorrow = new Date(Date.now() + DAY).toISOString().slice(0, 10);
      const [teams, tk, tm] = await Promise.all([
        getTeams().catch(() => [] as Team[]),
        getTasks().catch(() => [] as Task[]),
        getTimeEntriesRange(org.id, '2000-01-01', tomorrow).catch(() => [] as TimeEntry[]),
      ]);
      if (!alive) return;
      setTeam(teams.find((t) => t.id === id) || null);
      setTasks(tk); setTimes(tm); setLoading(false);
    })();
    return () => { alive = false; };
  }, [org?.id, id]);

  const members = useMemo(() => team?.members || [], [team]);
  const memberIds = useMemo(() => members.map((m) => m.user_id), [members]);

  const teamTasks = useMemo(
    () => tasks.filter((t) => !t.parent_task_id && (t.team_id === id || (!!t.assignee_id && memberIds.includes(t.assignee_id)))),
    [tasks, id, memberIds],
  );

  const m = useMemo(() => {
    const open = teamTasks.filter(isOpen);
    const done = teamTasks.filter((t) => t.status === 'Done');
    return {
      open: open.length,
      overdue: teamTasks.filter(isOverdue).length,
      done: done.length,
      total: teamTasks.length,
      completion: teamTasks.length ? Math.round((done.length / teamTasks.length) * 100) : 0,
      estOpen: open.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0),
      hours: minsToH(times.filter((e) => memberIds.includes(e.user_id)).reduce((s, e) => s + (e.duration_minutes || 0), 0)),
    };
  }, [teamTasks, times, memberIds]);

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of teamTasks) map.set(t.status, (map.get(t.status) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [teamTasks]);

  const maxLoad = Math.max(1, ...members.map((mem) => tasks.filter((t) => t.assignee_id === mem.user_id && !t.parent_task_id && isOpen(t)).length));

  if (!loading && !team) {
    return <Layout flat title="Teams"><Link href="/teams" className="inline-flex items-center gap-1 text-xs text-muted hover:text-content mb-3"><Icon name="ti-arrow-left" className="text-sm" />Back to Teams</Link><EmptyState icon="ti-users-group" text="Team not found." /></Layout>;
  }

  return (
    <Layout flat title={team?.name || 'Team'}>
      <Link href="/teams" className="inline-flex items-center gap-1 text-xs text-muted hover:text-content mb-3"><Icon name="ti-arrow-left" className="text-sm" />Back to Teams</Link>
      <div className="flex items-center gap-3 mb-5">
        <span className="w-11 h-11 rounded-lg grid place-items-center shrink-0" style={{ background: (team?.color || '#64748b') + '22', color: team?.color || '#64748b' }}><Icon name="ti-users-group" className="text-xl" /></span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-content truncate">{team?.name}</h1>
          <p className="text-sm text-muted2 truncate">{team?.description || `${members.length} member${members.length === 1 ? '' : 's'}`}</p>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard label="Members" value={members.length} icon="ti-users" />
            <StatCard label="Open tasks" value={m.open} icon="ti-checkbox" />
            <StatCard label="Overdue" value={m.overdue} hint={m.overdue > 0 ? 'Needs attention' : 'On track'} hintTone={m.overdue > 0 ? 'down' : 'up'} icon="ti-alarm" />
            <StatCard label="Hours logged" value={`${m.hours}h`} icon="ti-clock" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Completed" value={m.done} icon="ti-circle-check" hintTone="up" />
            <StatCard label="Completion rate" value={`${m.completion}%`} icon="ti-progress-check" />
            <StatCard label="Est. hours (open)" value={`${m.estOpen}h`} icon="ti-hourglass" />
            <StatCard label="Total tasks" value={m.total} icon="ti-list" />
          </div>

          <Section title="Analytics — status mix" icon="ti-chart-bar">
            {statusCounts.length === 0 ? <p className="text-sm text-muted2">No tasks yet.</p> : (
              <div className="flex flex-col gap-2">
                {statusCounts.map(([s, n]) => (
                  <div key={s} className="flex items-center gap-3">
                    <span className="w-28 shrink-0"><StatusBadge status={s} /></span>
                    <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${m.total ? (n / m.total) * 100 : 0}%` }} /></div>
                    <span className="text-2xs text-muted2 tabular-nums w-6 text-right">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title={`Workload — ${members.length} member${members.length === 1 ? '' : 's'}`} icon="ti-chart-bar">
            {members.length === 0 ? <p className="text-sm text-muted2">No members in this team.</p> : (
              <div className="flex flex-col gap-2.5">
                {members.map((mem) => {
                  const mine = tasks.filter((t) => t.assignee_id === mem.user_id && !t.parent_task_id);
                  const open = mine.filter(isOpen).length;
                  const od = mine.filter(isOverdue).length;
                  const hrs = minsToH(times.filter((e) => e.user_id === mem.user_id).reduce((s, e) => s + (e.duration_minutes || 0), 0));
                  return (
                    <div key={mem.user_id} className="flex items-center gap-3">
                      <Link href={`/workload/person/${mem.user_id}`} className="flex items-center gap-2 w-40 shrink-0 min-w-0 hover:text-accent">
                        <Avatar name={mem.users?.full_name || '?'} size={22} /><span className="text-sm text-content truncate">{mem.users?.full_name || 'Unknown'}</span>
                      </Link>
                      <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${(open / maxLoad) * 100}%` }} /></div>
                      <span className="text-2xs text-muted2 tabular-nums w-24 text-right">{open} open{od > 0 ? ` · ${od} late` : ''}</span>
                      <span className="text-2xs text-muted2 tabular-nums w-12 text-right">{hrs}h</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Personal priorities" icon="ti-flag">
            {members.length === 0 ? <p className="text-sm text-muted2">Add members to see their priorities.</p> : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {members.map((mem) => {
                  const mine = tasks.filter((t) => t.assignee_id === mem.user_id && !t.parent_task_id && isOpen(t))
                    .sort((a, b) => (isOverdue(a) ? 0 : 1) - (isOverdue(b) ? 0 : 1) || (a.due_date || '9999').localeCompare(b.due_date || '9999'))
                    .slice(0, 5);
                  return (
                    <div key={mem.user_id} className="rounded-lg border border-line p-3">
                      <div className="flex items-center gap-2 mb-2"><Avatar name={mem.users?.full_name || '?'} size={22} /><span className="text-sm font-medium text-content truncate">{mem.users?.full_name || 'Unknown'}</span></div>
                      {mine.length === 0 ? <p className="text-2xs text-muted2">No open tasks.</p> : (
                        <div className="space-y-1">
                          {mine.map((t) => (
                            <Link key={t.id} href={`/tasks?task=${t.id}`} className="flex items-center gap-2 text-sm hover:bg-surface2 rounded px-1 py-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOverdue(t) ? 'bg-rose-500' : 'bg-accent'}`} />
                              <span className="flex-1 truncate text-content">{t.name}</span>
                              {t.due_date && <span className={`text-2xs tabular-nums shrink-0 ${isOverdue(t) ? 'text-rose-500' : 'text-muted2'}`}>{t.due_date.slice(5)}</span>}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title={`Tasks (${teamTasks.length})`} icon="ti-checklist">
            {teamTasks.length === 0 ? <EmptyState text="No tasks for this team yet" icon="ti-checks" /> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="text-2xs uppercase tracking-wider text-muted2 border-b border-line">
                  <th className="text-left font-semibold px-3 py-2">Task</th><th className="text-left font-semibold px-3 py-2">Status</th><th className="text-left font-semibold px-3 py-2">Priority</th><th className="text-left font-semibold px-3 py-2">Due</th><th className="text-left font-semibold px-3 py-2">Project</th>
                </tr></thead>
                <tbody>
                  {[...teamTasks].sort((a, b) => (isOverdue(a) ? 0 : isOpen(a) ? 1 : 2) - (isOverdue(b) ? 0 : isOpen(b) ? 1 : 2) || (a.due_date || '9999').localeCompare(b.due_date || '9999')).map((t) => (
                    <tr key={t.id} className="border-b border-line hover:bg-surface2 transition">
                      <td className="px-3 py-2"><Link href={`/tasks?task=${t.id}`} className="text-content hover:text-accent">{t.name}</Link></td>
                      <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                      <td className="px-3 py-2 text-muted">{t.priority}</td>
                      <td className={`px-3 py-2 tabular-nums ${isOverdue(t) ? 'text-rose-500 font-medium' : 'text-muted'}`}>{t.due_date || '—'}</td>
                      <td className="px-3 py-2 text-muted truncate max-w-[160px]">{t.projects?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Section>
        </>
      )}
    </Layout>
  );
}

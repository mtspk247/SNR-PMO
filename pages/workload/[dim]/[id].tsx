import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon, StatCard, StatusBadge, Pill } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import {
  getTasks, getTimeEntriesRange, getLeaves, getAttendance,
  getEmployee, getEmployees, getEmployeeCompensation, getOrgUsers,
  getTeams, getProjectById, getLedgerEntries, getPayrollRuns, getPayslips,
} from '@/lib/db';
import {
  Task, TimeEntry, Leave, Attendance, Employee, EmployeeCompensation,
  Team, Project, LedgerEntry, OrgUser,
} from '@/lib/supabase';

type Dim = 'person' | 'team' | 'project';

const DAY = 86400000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const todayMid = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const isOverdue = (d: string | null, status: string) => !!d && status !== 'Done' && status !== 'Cancelled' && new Date(d) < todayMid();
const isOpen = (t: Task) => t.status !== 'Done' && t.status !== 'Cancelled';
const minsToH = (m: number) => Math.round((m / 60) * 10) / 10;
const money = (n: number, ccy = 'USD') => `${ccy === 'USD' ? '$' : ccy + ' '}${Math.round(n).toLocaleString()}`;

// ── Reusable bits ────────────────────────────────────────────────────────────
function StatusCounts({ tasks }: { tasks: Task[] }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) map.set(t.status, (map.get(t.status) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [tasks]);
  if (counts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {counts.map(([s, n]) => (
        <span key={s} className="inline-flex items-center gap-1.5"><StatusBadge status={s} /><span className="text-2xs text-muted2 tabular-nums">{n}</span></span>
      ))}
    </div>
  );
}

function TaskTable({ tasks, showAssignee, userName }: { tasks: Task[]; showAssignee?: boolean; userName?: Map<string, string> }) {
  if (tasks.length === 0) return <EmptyState text="No tasks here yet" icon="ti-checks" />;
  const rows = [...tasks].sort((a, b) => {
    const ao = isOverdue(a.due_date, a.status) ? 0 : isOpen(a) ? 1 : 2;
    const bo = isOverdue(b.due_date, b.status) ? 0 : isOpen(b) ? 1 : 2;
    if (ao !== bo) return ao - bo;
    return (a.due_date || '9999').localeCompare(b.due_date || '9999');
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-2xs uppercase tracking-wider text-muted2 border-b border-line">
            <th className="text-left font-semibold px-3 py-2">Task</th>
            {showAssignee && <th className="text-left font-semibold px-3 py-2">Assignee</th>}
            <th className="text-left font-semibold px-3 py-2">Status</th>
            <th className="text-left font-semibold px-3 py-2">Priority</th>
            <th className="text-left font-semibold px-3 py-2">Due</th>
            <th className="text-left font-semibold px-3 py-2">Project</th>
            <th className="text-right font-semibold px-3 py-2">Est/Act h</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const od = isOverdue(t.due_date, t.status);
            return (
              <tr key={t.id} className="border-b border-line hover:bg-surface2 transition">
                <td className="px-3 py-2"><Link href={`/tasks?task=${t.id}`} className="text-content hover:text-accent">{t.name}</Link></td>
                {showAssignee && <td className="px-3 py-2 text-muted">{t.assignee_id ? (userName?.get(t.assignee_id) || '—') : 'Unassigned'}</td>}
                <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                <td className="px-3 py-2 text-muted">{t.priority}</td>
                <td className={`px-3 py-2 tabular-nums ${od ? 'text-rose-500 font-medium' : 'text-muted'}`}>{t.due_date || '—'}</td>
                <td className="px-3 py-2 text-muted truncate max-w-[160px]">{t.projects?.name || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{t.estimated_hours ?? '—'}/{t.actual_hours ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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

function WeekBars({ entries }: { entries: TimeEntry[] }) {
  const weeks = useMemo(() => {
    const now = todayMid();
    const out: { label: string; h: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = new Date(now.getTime() - (i + 1) * 7 * DAY);
      const end = new Date(now.getTime() - i * 7 * DAY);
      const mins = entries.filter((e) => { const d = new Date(e.started_at); return d >= start && d < end; }).reduce((s, e) => s + (e.duration_minutes || 0), 0);
      out.push({ label: isoDay(end).slice(5), h: minsToH(mins) });
    }
    return out;
  }, [entries]);
  const max = Math.max(1, ...weeks.map((w) => w.h));
  return (
    <div className="flex items-end gap-2 h-28">
      {weeks.map((w, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-2xs text-muted2 tabular-nums">{w.h || ''}</span>
          <div className="w-full rounded-t bg-accent/80" style={{ height: `${(w.h / max) * 100}%`, minHeight: w.h ? 4 : 0 }} />
          <span className="text-2xs text-muted2">{w.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function WorkloadEntityPage() {
  const router = useRouter();
  const org = useActiveOrg();
  const dim = (router.query.dim as Dim) || 'person';
  const id = (router.query.id as string) || '';

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [times, setTimes] = useState<TimeEntry[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [comp, setComp] = useState<EmployeeCompensation | null>(null);
  const [reports, setReports] = useState<Employee[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [memberComp, setMemberComp] = useState<Record<string, EmployeeCompensation | null>>({});
  const [project, setProject] = useState<Project | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [paid, setPaid] = useState<{ net: number; hours: number } | null>(null);

  useEffect(() => {
    if (!org?.id || !id) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const tomorrow = isoDay(new Date(Date.now() + DAY));
      const [tk, tm, lv, at, us] = await Promise.all([
        getTasks().catch(() => [] as Task[]),
        getTimeEntriesRange(org.id, '2000-01-01', tomorrow).catch(() => [] as TimeEntry[]),
        getLeaves().catch(() => [] as Leave[]),
        getAttendance().catch(() => [] as Attendance[]),
        getOrgUsers().catch(() => [] as OrgUser[]),
      ]);
      if (!alive) return;
      setTasks(tk); setTimes(tm); setLeaves(lv); setAttendance(at); setUsers(us);

      if (dim === 'person') {
        const [emp, cmp, emps, runs] = await Promise.all([
          getEmployee(id).catch(() => null),
          getEmployeeCompensation(id).catch(() => null),
          getEmployees().catch(() => [] as Employee[]),
          getPayrollRuns().catch(() => [] as any[]),
        ]);
        if (!alive) return;
        setEmployee(emp); setComp(cmp);
        setReports(emps.filter((e) => e.reports_to === id));
        const posted = (runs as any[]).filter((r) => r.status === 'Processed' || r.status === 'Paid');
        const slips = (await Promise.all(posted.map((r) => getPayslips(r.id).catch(() => [] as any[])))).flat().filter((s: any) => s.user_id === id);
        if (!alive) return;
        setPaid({ net: slips.reduce((s: number, p: any) => s + (Number(p.net) || 0), 0), hours: slips.reduce((s: number, p: any) => s + (Number(p.hours_worked) || 0), 0) });
      } else if (dim === 'team') {
        const tms = await getTeams().catch(() => [] as Team[]);
        if (!alive) return;
        const t = tms.find((x) => x.id === id) || null;
        setTeam(t);
        const ids = (t?.members || []).map((mm) => mm.user_id);
        const comps = await Promise.all(ids.map((uid) => getEmployeeCompensation(uid).catch(() => null)));
        if (!alive) return;
        const map: Record<string, EmployeeCompensation | null> = {};
        ids.forEach((uid, i) => { map[uid] = comps[i]; });
        setMemberComp(map);
      } else if (dim === 'project') {
        const [pr, led] = await Promise.all([getProjectById(id).catch(() => null), getLedgerEntries().catch(() => [] as LedgerEntry[])]);
        if (!alive) return;
        setProject(pr); setLedger(led);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [org?.id, id, dim]);

  const userName = useMemo(() => new Map(users.map((u) => [u.id, u.full_name])), [users]);
  const memberIds = useMemo(() => (team?.members || []).map((mm) => mm.user_id), [team]);

  const scopedTasks = useMemo(() => {
    if (dim === 'person') return tasks.filter((t) => t.assignee_id === id);
    if (dim === 'team') return tasks.filter((t) => t.team_id === id || (!!t.assignee_id && memberIds.includes(t.assignee_id)));
    return tasks.filter((t) => t.project_id === id);
  }, [tasks, dim, id, memberIds]);
  const scopedTaskIds = useMemo(() => new Set(scopedTasks.map((t) => t.id)), [scopedTasks]);

  const scopedTimes = useMemo(() => {
    if (dim === 'person') return times.filter((e) => e.user_id === id);
    if (dim === 'team') return times.filter((e) => memberIds.includes(e.user_id));
    return times.filter((e) => e.project_id === id || (!!e.task_id && scopedTaskIds.has(e.task_id)));
  }, [times, dim, id, memberIds, scopedTaskIds]);

  const scopedLeaves = useMemo(() => {
    if (dim === 'person') return leaves.filter((l) => l.user_id === id);
    if (dim === 'team') return leaves.filter((l) => !!l.user_id && memberIds.includes(l.user_id));
    return [] as Leave[];
  }, [leaves, dim, id, memberIds]);

  const m = useMemo(() => {
    const top = scopedTasks.filter((t) => !t.parent_task_id);
    const open = top.filter(isOpen);
    return {
      open: open.length,
      done: top.filter((t) => t.status === 'Done').length,
      overdue: top.filter((t) => isOverdue(t.due_date, t.status)).length,
      inProgress: top.filter((t) => t.status === 'In Progress').length,
      estOpen: open.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0),
      hours: minsToH(scopedTimes.reduce((s, e) => s + (e.duration_minutes || 0), 0)),
      hours30: minsToH(scopedTimes.filter((e) => new Date(e.started_at) >= new Date(Date.now() - 30 * DAY)).reduce((s, e) => s + (e.duration_minutes || 0), 0)),
      leaveDays: scopedLeaves.filter((l) => l.status === 'Approved').reduce((s, l) => s + (Number(l.days) || 0), 0),
      leavePending: scopedLeaves.filter((l) => l.status === 'Pending').length,
    };
  }, [scopedTasks, scopedTimes, scopedLeaves]);

  const title = dim === 'person' ? (employee?.full_name || userName.get(id) || 'Person')
    : dim === 'team' ? (team?.name || 'Team')
    : (project?.name || 'Project');
  const subtitle = dim === 'person' ? ([employee?.job_title, employee?.department].filter(Boolean).join(' · ') || 'Team member')
    : dim === 'team' ? `${memberIds.length} member${memberIds.length === 1 ? '' : 's'}`
    : (project?.status || 'Project');

  if (!loading && dim === 'person' && !employee && !userName.get(id)) {
    return <Layout flat title="Workload"><EmptyState icon="ti-user-off" text="This person could not be found in your organization." /></Layout>;
  }

  return (
    <Layout flat title={title}>
      <Link href="/workload" className="inline-flex items-center gap-1 text-xs text-muted hover:text-content mb-3"><Icon name="ti-arrow-left" className="text-sm" />Back to Workload</Link>
      <div className="flex items-center gap-3 mb-5">
        {dim === 'person' ? <Avatar name={title} size={44} />
          : <span className="w-11 h-11 rounded-lg grid place-items-center bg-surface2 text-muted2 shrink-0" style={team?.color ? { background: team.color + '22', color: team.color } : undefined}><Icon name={dim === 'team' ? 'ti-users-group' : 'ti-folder'} className="text-xl" /></span>}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-content truncate">{title}</h1>
          <p className="text-sm text-muted2 truncate">{subtitle}</p>
        </div>
        {dim === 'project' && project && <span className="ml-auto"><StatusBadge status={project.status} /></span>}
        {dim === 'person' && employee && <span className="ml-auto"><Pill label={employee.status} /></span>}
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard label="Open tasks" value={m.open} icon="ti-checkbox" />
            <StatCard label="Completed" value={m.done} icon="ti-circle-check" hintTone="up" />
            <StatCard label="Overdue" value={m.overdue} hint={m.overdue > 0 ? 'Needs attention' : 'On track'} hintTone={m.overdue > 0 ? 'down' : 'up'} icon="ti-alarm" />
            <StatCard label="Hours logged" value={`${m.hours}h`} hint={`${m.hours30}h last 30d`} icon="ti-clock" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="In progress" value={m.inProgress} icon="ti-progress" />
            <StatCard label="Est. hours (open)" value={`${m.estOpen}h`} icon="ti-hourglass" />
            {dim === 'project' ? (
              <>
                <StatCard label="Income booked" value={money(ledger.filter((l) => l.project_id === id && l.type === 'income').reduce((s, l) => s + Number(l.amount || 0), 0))} icon="ti-trending-up" hintTone="up" />
                <StatCard label="Spend booked" value={money(ledger.filter((l) => l.project_id === id && l.type === 'expense').reduce((s, l) => s + Number(l.amount || 0), 0))} icon="ti-trending-down" hintTone="down" />
              </>
            ) : dim === 'team' ? (
              <>
                <StatCard label="Leave days" value={m.leaveDays} hint={`${m.leavePending} pending`} icon="ti-beach" />
                <StatCard label="Monthly cost" value={money(memberIds.reduce((s, uid) => s + (memberComp[uid]?.pay_type === 'monthly' ? Number(memberComp[uid]?.base_salary || 0) : 0), 0))} hint="From comp" icon="ti-cash" />
              </>
            ) : (
              <>
                <StatCard label="Leave days" value={m.leaveDays} hint={`${m.leavePending} pending`} icon="ti-beach" />
                <StatCard label="Paid to date" value={paid ? money(paid.net) : '—'} hint={paid && m.hours > 0 ? `${money(paid.net / m.hours)}/h logged` : 'Payroll'} icon="ti-cash" />
              </>
            )}
          </div>

          {dim === 'person' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Section title="Reporting" icon="ti-hierarchy-2">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted2">Reports to</span><span className="text-content">{employee?.manager?.full_name || '—'}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted2">Company</span><span className="text-content">{employee?.company?.name || '—'}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted2">Hire date</span><span className="text-content">{employee?.hire_date || '—'}</span></div>
                  <div className="pt-1">
                    <span className="text-muted2">Direct reports ({reports.length})</span>
                    {reports.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{reports.map((r) => (
                      <Link key={r.id} href={`/workload/person/${r.id}`} className="chip hover:text-content"><Avatar name={r.full_name} size={16} />{r.full_name}</Link>
                    ))}</div>}
                  </div>
                </div>
              </Section>
              <Section title="Compensation & cost" icon="ti-cash">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted2">Base salary</span><span className="text-content">{comp ? money(comp.base_salary, comp.currency) : '—'}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted2">Pay type</span><span className="text-content capitalize">{comp?.pay_type || comp?.pay_schedule || '—'}{comp?.pay_type === 'hourly' && comp?.hourly_rate ? ` · ${money(comp.hourly_rate, comp.currency)}/h` : ''}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted2">Paid to date</span><span className="text-content">{paid ? money(paid.net) : '—'}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted2">Cost / logged hour</span><span className="text-content">{paid && m.hours > 0 ? money(paid.net / m.hours) : '—'}</span></div>
                </div>
              </Section>
            </div>
          )}

          <Section title="Hours logged — last 8 weeks" icon="ti-clock" right={<span className="text-2xs text-muted2">{m.hours}h total</span>}>
            {scopedTimes.length === 0 ? <p className="text-sm text-muted2">No time logged yet.</p> : <WeekBars entries={scopedTimes} />}
          </Section>

          {dim === 'team' && (
            <Section title={`Members (${memberIds.length})`} icon="ti-users">
              {memberIds.length === 0 ? <p className="text-sm text-muted2">No members in this team.</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="text-2xs uppercase tracking-wider text-muted2 border-b border-line">
                    <th className="text-left font-semibold px-3 py-2">Member</th><th className="text-right font-semibold px-3 py-2">Open</th><th className="text-right font-semibold px-3 py-2">Overdue</th><th className="text-right font-semibold px-3 py-2">Hours</th>
                  </tr></thead>
                  <tbody>
                    {(team?.members || []).map((mem) => {
                      const uid = mem.user_id;
                      const mt = tasks.filter((t) => t.assignee_id === uid && !t.parent_task_id);
                      const oh = minsToH(times.filter((e) => e.user_id === uid).reduce((s, e) => s + (e.duration_minutes || 0), 0));
                      return (
                        <tr key={uid} className="border-b border-line hover:bg-surface2 transition">
                          <td className="px-3 py-2"><Link href={`/workload/person/${uid}`} className="inline-flex items-center gap-2 text-content hover:text-accent"><Avatar name={mem.users?.full_name || userName.get(uid) || 'U'} size={20} />{mem.users?.full_name || userName.get(uid) || 'Unknown'}</Link></td>
                          <td className="px-3 py-2 text-right tabular-nums">{mt.filter(isOpen).length}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-rose-500">{mt.filter((t) => isOverdue(t.due_date, t.status)).length}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted">{oh}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              )}
            </Section>
          )}

          {dim === 'project' && project && (
            <Section title="Project" icon="ti-folder" right={<span className="text-2xs text-muted2">{project.start_date || '—'} → {project.end_date || '—'}</span>}>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${project.progress ?? 0}%` }} /></div>
                <span className="text-sm tabular-nums text-muted">{project.progress ?? 0}%</span>
              </div>
            </Section>
          )}

          <Section title={`Tasks (${scopedTasks.length})`} icon="ti-checklist" right={<StatusCounts tasks={scopedTasks} />}>
            <TaskTable tasks={scopedTasks} showAssignee={dim !== 'person'} userName={userName} />
          </Section>
        </>
      )}
    </Layout>
  );
}

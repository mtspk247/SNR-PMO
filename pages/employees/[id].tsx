import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon, StatCard } from '@/components/ui';
import { useSetCrumbs } from '@/components/Breadcrumbs';
import CustomFields from '@/components/CustomFields';
import {
  getEmployee, getOnboardingTasks, getAttendance, getLeaves, getMyLeaveProfile,
  getEmployeeCompensation, setCompensation, getMyPayslips,
  getEmployees, getOrgCompanies, updateEmployeeProfile,
  uploadAvatar, getAvatarUrl, getTasks, getTimeEntriesRange,
} from '@/lib/db';
import EmployeeModal, { EmployeeFormValues } from '@/components/EmployeeModal';
import { OrgCompany, Task, TimeEntry } from '@/lib/supabase';
import { Employee, OnboardingTask, Attendance, Leave, EmployeeCompensation, Payslip } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

// ─── Lifecycle strip ──────────────────────────────────────────────────────────
interface LifecycleStripProps {
  hireDate?: string | null;
  obDone: number;
  obTotal: number;
  status: 'active' | 'suspended';
}
function LifecycleStrip({ hireDate, obDone, obTotal, status }: LifecycleStripProps) {
  const stages: { label: string; icon: string; caption: string; done: boolean }[] = [
    {
      label: 'Hired',
      icon: 'ti-user-plus',
      caption: hireDate || 'Pending',
      done: !!hireDate,
    },
    {
      label: 'Onboarding',
      icon: 'ti-list-check',
      caption: obTotal ? `${obDone}/${obTotal} tasks` : 'No tasks',
      done: obTotal > 0 && obDone === obTotal,
    },
    {
      label: 'Training',
      icon: 'ti-school',
      caption: obTotal > 0 && obDone === obTotal ? 'Complete' : 'In progress',
      done: obTotal > 0 && obDone === obTotal,
    },
    {
      label: 'Active',
      icon: 'ti-circle-check',
      caption: status === 'active' ? 'Active' : 'Suspended',
      done: status === 'active',
    },
  ];

  // find the furthest "active" stage index
  let currentIdx = -1;
  if (hireDate) currentIdx = 0;
  if (obTotal > 0) currentIdx = 1;
  if (obTotal > 0 && obDone === obTotal) currentIdx = 2;
  if (status === 'active') currentIdx = 3;

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center gap-0">
        {stages.map((s, i) => {
          const isCompleted = i < currentIdx || (i === currentIdx && s.done);
          const isActive = i === currentIdx && !s.done;
          return (
            <div key={s.label} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: 36, height: 36,
                    background: isCompleted
                      ? 'var(--brand-primary, #2D7FF9)'
                      : isActive
                      ? 'var(--color-accent-subtle, rgba(45,127,249,0.15))'
                      : 'var(--color-surface2, #f3f4f6)',
                    color: isCompleted
                      ? '#fff'
                      : isActive
                      ? 'var(--brand-primary, #2D7FF9)'
                      : 'var(--color-muted2, #9ca3af)',
                    border: isActive ? '2px solid var(--brand-primary, #2D7FF9)' : '2px solid transparent',
                  }}
                >
                  <Icon name={s.icon} className="text-base" />
                </div>
                <span className="text-2xs font-semibold truncate" style={{ color: isCompleted || isActive ? 'var(--color-content)' : 'var(--color-muted2)' }}>{s.label}</span>
                <span className="text-2xs text-muted2 truncate">{s.caption}</span>
              </div>
              {i < stages.length - 1 && (
                <div className="h-0.5 flex-shrink-0 mx-1" style={{
                  width: 24,
                  background: i < currentIdx ? 'var(--brand-primary, #2D7FF9)' : 'var(--color-line, #e5e7eb)',
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── KPIs tab ────────────────────────────────────────────────────────────────
interface KpiTabProps {
  employeeId: string;
  orgId: string;
}

interface WeekBucket { label: string; hours: number; }

function KpiTab({ employeeId, orgId }: KpiTabProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [kpiLoading, setKpiLoading] = useState(true);

  useEffect(() => {
    if (!employeeId || !orgId) return;
    setKpiLoading(true);
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromIso = from.toISOString();
    const toIso = now.toISOString();

    Promise.all([
      getTasks().catch(() => [] as Task[]),
      getTimeEntriesRange(orgId, fromIso, toIso).catch(() => [] as TimeEntry[]),
      getAttendance().catch(() => [] as Attendance[]),
      getLeaves().catch(() => [] as Leave[]),
    ]).then(([t, te, att, lv]) => {
      setTasks(t);
      setTimeEntries(te);
      setAttendance(att);
      setLeaves(lv);
    }).finally(() => setKpiLoading(false));
  }, [employeeId, orgId]);

  const stats = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = now.toISOString().slice(0, 10);

    const myTasks = tasks.filter((t) => t.assignee_id === employeeId);
    const doneTasks = myTasks.filter((t) => t.status === 'Done').length;
    const openTasks = myTasks.filter((t) => t.status !== 'Done').length;

    const myEntries = timeEntries.filter((te) => te.user_id === employeeId);
    const totalMinutes = myEntries.reduce((acc, te) => acc + (te.duration_minutes || 0), 0);
    const hoursTracked = Math.round((totalMinutes / 60) * 10) / 10;

    const myAttendance = attendance.filter((a) => a.user_id === employeeId && a.work_date >= fromStr && a.work_date <= toStr);
    const attendanceDays = myAttendance.length;

    const myLeaves = leaves.filter((l) => {
      if (l.user_id !== employeeId) return false;
      if (l.status !== 'Approved') return false;
      return l.start_date <= toStr && l.end_date >= fromStr;
    });
    const leavesTaken = myLeaves.length;

    // Per-week hours (4 buckets: week-4, week-3, week-2, week-1)
    const weeks: WeekBucket[] = [];
    for (let w = 3; w >= 0; w--) {
      const wEnd = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
      const wStart = new Date(wEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      const wStartIso = wStart.toISOString();
      const wEndIso = wEnd.toISOString();
      const wMinutes = myEntries.filter((te) => te.started_at >= wStartIso && te.started_at < wEndIso)
        .reduce((acc, te) => acc + (te.duration_minutes || 0), 0);
      const label = `W${4 - w}`;
      weeks.push({ label, hours: Math.round((wMinutes / 60) * 10) / 10 });
    }
    const maxHours = Math.max(...weeks.map((w) => w.hours), 1);

    return { doneTasks, openTasks, hoursTracked, attendanceDays, leavesTaken, weeks, maxHours };
  }, [tasks, timeEntries, attendance, leaves, employeeId]);

  if (kpiLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Tasks completed" value={stats.doneTasks} icon="ti-circle-check" hintTone="up" />
        <StatCard label="Open tasks" value={stats.openTasks} icon="ti-checkbox" />
        <StatCard label="Hours tracked" value={`${stats.hoursTracked} h`} icon="ti-clock" />
        <StatCard label="Attendance days" value={stats.attendanceDays} icon="ti-calendar-check" />
        <StatCard label="Leaves taken" value={stats.leavesTaken} icon="ti-beach" />
      </div>

      {/* Per-week hours bar chart (pure CSS) */}
      <div className="card p-5">
        <h4 className="text-sm font-semibold mb-4">Hours per week (last 4 weeks)</h4>
        <div className="flex items-end gap-3 h-24">
          {stats.weeks.map((w) => {
            const pct = stats.maxHours > 0 ? Math.round((w.hours / stats.maxHours) * 100) : 0;
            return (
              <div key={w.label} className="flex flex-col items-center gap-1 flex-1 h-full justify-end">
                <span className="text-2xs text-muted2">{w.hours}h</span>
                <div className="w-full rounded-t" style={{
                  height: `${Math.max(pct, 4)}%`,
                  background: 'var(--brand-primary, #2D7FF9)',
                  opacity: 0.8,
                  minHeight: 4,
                }} />
                <span className="text-2xs text-muted2">{w.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EmployeeProfilePage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const isAdmin = can.manageMembers(org);

  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [obTasks, setObTasks] = useState<OnboardingTask[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [comp, setComp] = useState<EmployeeCompensation | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [people, setPeople] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<OrgCompany[]>([]);

  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState<'overview' | 'kpis'>('overview');

  useEffect(() => {
    if (!showEdit) return;
    getEmployees().then(setPeople).catch(() => {});
    getOrgCompanies().then(setCompanies).catch(() => {});
  }, [showEdit]);

  const saveProfile = async (v: EmployeeFormValues) => {
    setEditBusy(true);
    try { const r = await updateEmployeeProfile(id, v); setEmployee(r); setShowEdit(false); }
    catch (e: any) { alert(e.message); } finally { setEditBusy(false); }
  };

  const isSelf = me?.id === id;
  const canViewPay = isAdmin || isSelf;
  const canUploadAvatar = isAdmin || isSelf;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getEmployee(id), getOnboardingTasks(), getAttendance(), getLeaves()])
      .then(([emp, ob, att, lv]) => {
        setEmployee(emp); setObTasks(ob); setAttendance(att); setLeaves(lv);
        // Resolve avatar signed URL
        if (emp?.avatar_url) {
          getAvatarUrl(emp.avatar_url).then(setAvatarUrl).catch(() => setAvatarUrl(null));
        }
      })
      .finally(() => setLoading(false));
  }, [id, org?.id]);

  useEffect(() => {
    if (!id || !canViewPay) return;
    getEmployeeCompensation(id).then(setComp).catch(() => {});
    getMyPayslips(id).then(setPayslips).catch(() => {});
  }, [id, canViewPay, org?.id]);

  // Onboarding checklist for this employee
  const myObTasks = useMemo(() => obTasks.filter((t) => t.user_id === id).sort((a, b) => a.sort_order - b.sort_order), [obTasks, id]);
  const obDone = myObTasks.filter((t) => t.status === 'Done').length;
  const obPct = myObTasks.length ? Math.round((obDone / myObTasks.length) * 100) : 0;

  // Attendance summary
  const myAttendance = useMemo(() => attendance.filter((a) => a.user_id === id), [attendance, id]);
  const month = new Date().toISOString().slice(0, 7);
  const monthHours = myAttendance.filter((a) => a.work_date.slice(0, 7) === month).reduce((acc, a) => acc + (Number(a.hours) || 0), 0);
  const recentAttendance = myAttendance.slice(0, 5);

  // Leave
  const [leaveProfile, setLeaveProfile] = useState<{ annual_balance: number; sick_balance: number; casual_balance: number } | null>(null);
  useEffect(() => {
    if (!id) return;
    getMyLeaveProfile(id).then(setLeaveProfile).catch(() => {});
  }, [id, org?.id]);
  const myLeaves = useMemo(() => leaves.filter((l) => l.user_id === id).slice(0, 5), [leaves, id]);

  // Avatar upload handler
  const handleAvatarFile = async (file: File) => {
    if (!org?.id || !id) return;
    setAvatarUploading(true);
    try {
      const path = await uploadAvatar(org.id, id, file);
      const url = await getAvatarUrl(path);
      setAvatarUrl(url);
      setEmployee((prev) => prev ? { ...prev, avatar_url: path } : prev);
    } catch (e: any) { alert(e.message); } finally { setAvatarUploading(false); }
  };

  useSetCrumbs(employee ? [{ label: 'Employees', href: '/employees' }, { label: employee.full_name }] : null);

  if (loading) return <Layout title="Employee"><Spinner /></Layout>;
  if (!employee) return <Layout title="Employee"><EmptyState icon="ti-user-x" text="Employee not found" /></Layout>;

  const initials = (employee.full_name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Layout title="Employee profile">
      <div className="mb-4">
        <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-muted hover:text-content">
          <Icon name="ti-arrow-left" />Back to directory
        </Link>
      </div>

      {/* Header with avatar */}
      <div className="flex items-center gap-4 mb-4">
        {/* Avatar circle with camera overlay */}
        <div className="relative shrink-0" style={{ width: 72, height: 72 }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={employee.full_name} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{
              width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--brand-primary, #2D7FF9)', color: '#fff', fontSize: 24, fontWeight: 700, flexShrink: 0,
            }}>
              {initials}
            </div>
          )}
          {canUploadAvatar && (
            <>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                title="Upload photo"
                style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'var(--color-surface, #fff)', border: '1.5px solid var(--color-line)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', padding: 0,
                }}
              >
                {avatarUploading
                  ? <Icon name="ti-loader-2" className="text-xs animate-spin" />
                  : <Icon name="ti-camera" className="text-xs" />}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = ''; }}
              />
            </>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{employee.full_name}</h1>
          <p className="text-sm text-muted truncate">{(employee.role || '').replace('_', ' ')}{employee.department ? ` · ${employee.department}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`pill ${employee.status === 'active' ? 'pill-green' : 'pill-red'}`}>{employee.status}</span>
          {isAdmin && <button onClick={() => setShowEdit(true)} className="btn"><Icon name="ti-user-edit" />Edit profile</button>}
        </div>
      </div>

      {/* Lifecycle strip */}
      <LifecycleStrip
        hireDate={employee.hire_date}
        obDone={obDone}
        obTotal={myObTasks.length}
        status={employee.status}
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-line">
        {(['overview', 'kpis'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2 text-sm font-medium capitalize transition-colors"
            style={{
              borderBottom: activeTab === tab ? '2px solid var(--brand-primary, #2D7FF9)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--brand-primary, #2D7FF9)' : 'var(--color-muted)',
              marginBottom: -1,
            }}
          >
            {tab === 'kpis' ? 'KPIs' : 'Overview'}
          </button>
        ))}
      </div>

      {activeTab === 'kpis' && org?.id ? (
        <KpiTab employeeId={id} orgId={org.id} />
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Left column: overview + onboarding */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-4">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={employee.full_name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <Avatar name={employee.full_name} size={48} />
                )}
                <div className="min-w-0">
                  <p className="font-semibold truncate">{employee.full_name}</p>
                  <p className="text-sm text-muted truncate">{employee.email}</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Role</p>
                  <p className="capitalize">{(employee.role || '').replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Department</p>
                  <p>{employee.department || '—'}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Reports to</p>
                  <p>{employee.manager?.full_name || '—'}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Status</p>
                  <p className="capitalize">{employee.status}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Job title</p>
                  <p>{employee.job_title || '—'}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Hire date</p>
                  <p>{employee.hire_date || '—'}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Company</p>
                  <p>{employee.company?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Phone</p>
                  <p>{employee.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Address</p>
                  <p>{employee.address || '—'}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Emergency contact</p>
                  <p>{employee.emergency_contact || '—'}</p>
                </div>
              </div>
            </div>

            {/* Onboarding */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Onboarding</h3>
                {myObTasks.length > 0 && (
                  <span className={`pill ${obPct === 100 ? 'pill-green' : 'pill-blue'}`}>{obDone}/{myObTasks.length} · {obPct}%</span>
                )}
              </div>
              {myObTasks.length === 0 ? (
                <EmptyState icon="ti-list-check" text="No onboarding checklist assigned" />
              ) : (
                <>
                  <div className="h-1.5 rounded-full bg-surface2 mb-3 overflow-hidden">
                    <div className="h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${obPct}%`, background: obPct === 100 ? 'var(--color-success, #10b981)' : 'var(--brand-primary, #2D7FF9)' }} />
                  </div>
                  <div className="space-y-1">
                    {myObTasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2.5 py-1">
                        <Icon name={t.status === 'Done' ? 'ti-circle-check-filled' : 'ti-circle'} className={`text-base shrink-0 ${t.status === 'Done' ? 'text-accentstrong' : 'text-muted2'}`} />
                        <span className={`text-sm flex-1 min-w-0 truncate ${t.status === 'Done' ? 'line-through text-muted2' : ''}`}>{t.title}</span>
                        {t.due_date && <span className="text-2xs text-muted2 shrink-0">{t.due_date}</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Attendance */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-3">Attendance</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <StatCard label="This month" value={`${Math.round(monthHours * 10) / 10} h`} icon="ti-calendar" />
                <StatCard label="Days logged" value={myAttendance.length} icon="ti-checklist" />
                <StatCard label="Status" value={myAttendance[0]?.status === 'OPEN' ? 'Checked in' : 'Checked out'} icon="ti-clock" />
              </div>
              {recentAttendance.length === 0 ? (
                <EmptyState icon="ti-clock" text="No attendance records" />
              ) : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead>
                    <tr className="text-2xs uppercase tracking-wide text-muted border-b border-line">
                      <th className="th text-left">Date</th>
                      <th className="th text-left">In</th>
                      <th className="th text-left">Out</th>
                      <th className="th text-left">Hours</th>
                      <th className="th text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentAttendance.map((a) => (
                      <tr key={a.id} className="row border-b border-line last:border-0">
                        <td className="td">{a.work_date}</td>
                        <td className="td">{a.check_in ? new Date(a.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td className="td">{a.check_out ? new Date(a.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td className="td">{a.hours ?? '—'}</td>
                        <td className="td"><span className="pill pill-gray">{a.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          </div>

          {/* Right column: leave + compensation */}
          <div className="space-y-4">
            {/* Leave balances */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-3">Leave balances</h3>
              {leaveProfile ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  <StatCard label="Annual" value={leaveProfile.annual_balance} icon="ti-calendar" />
                  <StatCard label="Sick" value={leaveProfile.sick_balance} icon="ti-vaccine" />
                  <StatCard label="Casual" value={leaveProfile.casual_balance} icon="ti-coffee" />
                </div>
              ) : <Spinner />}
              <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Recent requests</p>
              {myLeaves.length === 0 ? (
                <EmptyState icon="ti-beach" text="No leave requests" />
              ) : (
                <div className="space-y-1.5">
                  {myLeaves.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-sm py-1">
                      <span className="truncate">{l.type} · {l.start_date} → {l.end_date}</span>
                      <span className={`pill ${l.status === 'Approved' ? 'pill-green' : l.status === 'Pending' ? 'pill-amber' : l.status === 'Rejected' ? 'pill-red' : 'pill-gray'}`}>{l.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Compensation + payslips */}
            {canViewPay && (
              <CompensationCard
                employee={employee}
                comp={comp}
                payslips={payslips}
                isAdmin={isAdmin}
                orgId={org?.id}
                meId={me?.id}
                onSaved={(c) => setComp(c)}
              />
            )}

            {/* Custom fields (HR) — org-level employee fields, admin-managed */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold">Custom fields</h3>
              <CustomFields orgId={org?.id || ''} entityType="employee" entityId={employee.id} canManage={isAdmin} title="HR fields" />
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <EmployeeModal initial={employee} people={people} companies={companies} busy={editBusy}
          onClose={() => setShowEdit(false)} onSubmit={saveProfile} />
      )}
    </Layout>
  );
}

function CompensationCard({ employee, comp, payslips, isAdmin, orgId, meId, onSaved }: {
  employee: Employee; comp: EmployeeCompensation | null; payslips: Payslip[];
  isAdmin: boolean; orgId?: string; meId?: string;
  onSaved: (c: EmployeeCompensation) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [salary, setSalary] = useState(String(comp?.base_salary ?? ''));
  const [currency, setCurrency] = useState(comp?.currency || 'USD');
  const [schedule, setSchedule] = useState(comp?.pay_schedule || 'Monthly');
  const [payType, setPayType] = useState<'monthly' | 'hourly'>(comp?.pay_type || 'monthly');
  const [hourlyRate, setHourlyRate] = useState(String(comp?.hourly_rate ?? ''));

  useEffect(() => {
    setSalary(String(comp?.base_salary ?? ''));
    setCurrency(comp?.currency || 'USD');
    setSchedule(comp?.pay_schedule || 'Monthly');
    setPayType(comp?.pay_type || 'monthly');
    setHourlyRate(String(comp?.hourly_rate ?? ''));
  }, [comp?.id]);

  const save = async () => {
    if (!orgId) return;
    const value = parseFloat(salary);
    if (isNaN(value)) { alert('Enter a valid salary amount'); return; }
    const hr = payType === 'hourly' ? parseFloat(hourlyRate) : null;
    if (payType === 'hourly' && (isNaN(hr as number) || (hr as number) <= 0)) {
      alert('Enter a valid hourly rate'); return;
    }
    setBusy(true);
    try {
      const c = await setCompensation({
        org_id: orgId, user_id: employee.id, base_salary: value, currency, pay_schedule: schedule,
        pay_type: payType, hourly_rate: payType === 'hourly' ? hr : null,
        created_by: meId,
      });
      onSaved(c); setEditing(false);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Compensation</h3>
        {isAdmin && !editing && (
          <button onClick={() => setEditing(true)} className="btn btn-ghost h-7 px-2 text-xs">
            <Icon name="ti-pencil" />{comp ? 'Update' : 'Set up'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label">Base salary</label>
              <input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} className="input" />
            </div>
            <div className="w-24">
              <label className="label">Currency</label>
              <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Pay type</label>
            <select value={payType} onChange={(e) => setPayType(e.target.value as 'monthly' | 'hourly')} className="input">
              <option value="monthly">Monthly salary</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>
          {payType === 'hourly' && (
            <div>
              <label className="label">Hourly rate ({currency})</label>
              <input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="input" min={0} step={0.01} />
            </div>
          )}
          <div>
            <label className="label">Pay schedule</label>
            <select value={schedule} onChange={(e) => setSchedule(e.target.value)} className="input">
              <option>Monthly</option>
              <option>Biweekly</option>
              <option>Weekly</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="btn flex-1">Cancel</button>
            <button onClick={save} disabled={busy} className="btn btn-primary flex-1">{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : comp ? (
        <div className="space-y-1 text-sm mb-4">
          <p><span className="text-muted2">Base salary: </span><span className="font-medium">{comp.currency} {Number(comp.base_salary).toLocaleString()}</span></p>
          {comp.pay_type === 'hourly' && comp.hourly_rate != null && (
            <p><span className="text-muted2">Hourly rate: </span><span className="font-medium">{comp.currency} {Number(comp.hourly_rate).toFixed(2)}/h</span></p>
          )}
          <p><span className="text-muted2">Pay type: </span>{comp.pay_type === 'hourly' ? 'Hourly' : 'Monthly salary'}</p>
          <p><span className="text-muted2">Pay schedule: </span>{comp.pay_schedule}</p>
          <p><span className="text-muted2">Effective: </span>{comp.effective_date}</p>
        </div>
      ) : (
        <EmptyState icon="ti-cash" text="No compensation on file" />
      )}

      <p className="text-2xs uppercase tracking-wide text-muted2 mb-2 mt-2">Payslips</p>
      {payslips.length === 0 ? (
        <EmptyState icon="ti-receipt" text="No payslips yet" />
      ) : (
        <div className="space-y-1.5">
          {payslips.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm py-1">
              <span className="text-muted2">{p.created_at?.slice(0, 10)}</span>
              <span className="font-medium">Net {Number(p.net).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

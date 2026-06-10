import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon, StatCard } from '@/components/ui';
import {
  getEmployee, getOnboardingTasks, getAttendance, getLeaves, getMyLeaveProfile,
  getEmployeeCompensation, setCompensation, getMyPayslips,
} from '@/lib/db';
import { Employee, OnboardingTask, Attendance, Leave, EmployeeCompensation, Payslip } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

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

  const isSelf = me?.id === id;
  const canViewPay = isAdmin || isSelf;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getEmployee(id), getOnboardingTasks(), getAttendance(), getLeaves()])
      .then(([emp, ob, att, lv]) => {
        setEmployee(emp); setObTasks(ob); setAttendance(att); setLeaves(lv);
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

  if (loading) return <Layout title="Employee"><Spinner /></Layout>;
  if (!employee) return <Layout title="Employee"><EmptyState icon="ti-user-x" text="Employee not found" /></Layout>;

  return (
    <Layout title="Employee profile">
      <div className="mb-4">
        <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-muted hover:text-content">
          <Icon name="ti-arrow-left" />Back to directory
        </Link>
      </div>

      <PageHeader
        title={employee.full_name}
        subtitle={`${(employee.role || '').replace('_', ' ')}${employee.department ? ` · ${employee.department}` : ''}`}
        action={
          <div className="flex items-center gap-2">
            <span className={`pill ${employee.status === 'active' ? 'pill-green' : 'pill-red'}`}>{employee.status}</span>
          </div>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left column: overview + onboarding */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <Avatar name={employee.full_name} size={48} />
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
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatCard label="This month" value={`${Math.round(monthHours * 10) / 10} h`} icon="ti-calendar" />
              <StatCard label="Days logged" value={myAttendance.length} icon="ti-checklist" />
              <StatCard label="Status" value={myAttendance[0]?.status === 'OPEN' ? 'Checked in' : 'Checked out'} icon="ti-clock" />
            </div>
            {recentAttendance.length === 0 ? (
              <EmptyState icon="ti-clock" text="No attendance records" />
            ) : (
              <table className="w-full text-sm">
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
              </table>
            )}
          </div>
        </div>

        {/* Right column: leave + compensation */}
        <div className="space-y-4">
          {/* Leave balances */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold mb-3">Leave balances</h3>
            {leaveProfile ? (
              <div className="grid grid-cols-3 gap-2 mb-4">
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
        </div>
      </div>
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

  useEffect(() => {
    setSalary(String(comp?.base_salary ?? ''));
    setCurrency(comp?.currency || 'USD');
    setSchedule(comp?.pay_schedule || 'Monthly');
  }, [comp?.id]);

  const save = async () => {
    if (!orgId) return;
    const value = parseFloat(salary);
    if (isNaN(value)) { alert('Enter a valid salary amount'); return; }
    setBusy(true);
    try {
      const c = await setCompensation({
        org_id: orgId, user_id: employee.id, base_salary: value, currency, pay_schedule: schedule, created_by: meId,
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

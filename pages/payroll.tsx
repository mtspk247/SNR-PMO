import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Avatar } from '@/components/ui';
import { Modal, Field, useModalTabs } from '@/components/Modal';
import { usePagination, Pagination } from '@/components/Pagination';
import { usePayrollRuns } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import {
  createPayrollRun, updatePayrollRunStatus, deletePayrollRun,
  getPayslips, createPayslip, deletePayslip, getEmployees,
  preparePayrollRun, updatePayslip,
} from '@/lib/db';
import { PayrollRun, Payslip, Employee } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

const STATUS_PILL: Record<string, string> = {
  Draft: 'pill-gray', Processed: 'pill-blue', Paid: 'pill-green', Cancelled: 'pill-red',
};

const BONUS_TAGS = ['Performance', 'Overtime', 'Referral', 'Holiday', 'Commission', 'Other'];

function fmt(n: number | undefined | null) {
  return Number(n || 0).toLocaleString();
}

export default function PayrollPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const isAdmin = can.manageMembers(org);
  const qc = useQueryClient();

  const { data: runs = [], isLoading: loading } = usePayrollRuns();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showAddSlip, setShowAddSlip] = useState(false);
  const [slipsLoading, setSlipsLoading] = useState(false);
  const [editSlip, setEditSlip] = useState<Payslip | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    getEmployees().then(setEmployees);
  }, [org?.id, isAdmin]);

  useEffect(() => {
    if (runs.length && !selected) setSelected(runs[0].id);
  }, [runs, selected]);

  useEffect(() => {
    if (!selected) { setPayslips([]); return; }
    setSlipsLoading(true);
    getPayslips(selected).then(setPayslips).finally(() => setSlipsLoading(false));
  }, [selected]);

  const pg = usePagination(runs, 25);

  if (!isAdmin) {
    return (
      <Layout flat title="Payroll">
        <div className="card p-10 text-center text-sm text-muted">
          <Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />
          You need admin access to view payroll.
        </div>
      </Layout>
    );
  }

  const run = runs.find((r) => r.id === selected) || null;
  const isDraft = run?.status === 'Draft';

  const removeRun = async (id: string) => {
    if (!confirm('Delete this payroll run and its payslips?')) return;
    setBusy(true);
    try {
      await deletePayrollRun(id);
      qc.invalidateQueries({ queryKey: qk.payrollRuns(org?.id) });
      if (selected === id) setSelected(null);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const setStatus = async (r: PayrollRun, status: PayrollRun['status']) => {
    setBusy(true);
    try {
      await updatePayrollRunStatus(r.id, status);
      qc.invalidateQueries({ queryKey: qk.payrollRuns(org?.id) });
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const removeSlip = async (id: string) => {
    if (!confirm('Delete this payslip?')) return;
    try { await deletePayslip(id); setPayslips((p) => p.filter((x) => x.id !== id)); }
    catch (e: any) { alert(e.message); }
  };

  const loadEmployees = async () => {
    if (!run) return;
    setBusy(true);
    try {
      const count = await preparePayrollRun(run.id);
      alert(`Loaded ${count} employee${count === 1 ? '' : 's'}`);
      setSlipsLoading(true);
      getPayslips(run.id).then(setPayslips).finally(() => setSlipsLoading(false));
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const totals = payslips.reduce((acc, p) => ({
    gross: acc.gross + Number(p.gross || 0),
    bonus: acc.bonus + Number(p.bonus || 0),
    deductions: acc.deductions + Number(p.deductions || 0),
    net: acc.net + Number(p.net || 0),
  }), { gross: 0, bonus: 0, deductions: 0, net: 0 });

  return (
    <Layout flat title="Payroll">
      <PageHeader title="Payroll" subtitle="Manage payroll runs and employee payslips"
        action={<button onClick={() => setShowNew(true)} className="btn btn-primary"><Icon name="ti-plus" />New run</button>} />

      {loading ? <Spinner /> : (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* ── Run list ── */}
          <div className="card w-full lg:w-72 lg:shrink-0 overflow-y-auto" style={{ maxHeight: '72vh' }}>
            {pg.pageItems.map((r) => (
              <button key={r.id} onClick={() => setSelected(r.id)}
                className={`w-full text-left flex items-center justify-between gap-2 px-4 py-3 border-b border-line last:border-0 ${selected === r.id ? 'bg-surface2 border-l-2 border-l-accentstrong' : 'hover:bg-surface2/60 border-l-2 border-l-transparent'}`}>
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{r.period_label}</span>
                  <span className="block text-2xs text-muted2 truncate">{r.period_start} → {r.period_end}</span>
                </span>
                <span className={`pill ${STATUS_PILL[r.status] || 'pill-gray'} shrink-0`}>{r.status}</span>
              </button>
            ))}
            {runs.length === 0 && <EmptyState icon="ti-cash" text="No payroll runs yet" />}
            <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} start={pg.start} end={pg.end} onPage={pg.setPage} />
          </div>

          {/* ── Run detail ── */}
          {run ? (
            <div className="card flex-1 p-6 min-w-0">
              {/* Header */}
              <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
                <div className="min-w-0">
                  <h3 className="font-semibold">{run.period_label}</h3>
                  {run.notes && <p className="text-sm text-muted2 mt-0.5">{run.notes}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="pill pill-gray"><Icon name="ti-calendar" className="text-xs" />{run.period_start} → {run.period_end}</span>
                    <span className={`pill ${STATUS_PILL[run.status] || 'pill-gray'}`}>{run.status}</span>
                    <span className="pill pill-gray"><Icon name="ti-receipt" className="text-xs" />{payslips.length} slip{payslips.length !== 1 ? 's' : ''}</span>
                    <span className="pill pill-blue">Net {fmt(totals.net)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isDraft && (
                    <button onClick={loadEmployees} disabled={busy}
                      className="btn btn-primary h-9 px-3 text-sm gap-1.5">
                      <Icon name="ti-users-plus" />Load active employees
                    </button>
                  )}
                  <select value={run.status} disabled={busy} onChange={(e) => setStatus(run, e.target.value as PayrollRun['status'])} className="input w-36">
                    <option>Draft</option>
                    <option>Processed</option>
                    <option>Paid</option>
                    <option>Cancelled</option>
                  </select>
                  <button onClick={() => removeRun(run.id)} disabled={busy} className="btn btn-ghost h-9 px-2 text-rose-500"><Icon name="ti-trash" /></button>
                </div>
              </div>

              {/* Totals stat row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="stat">
                  <p className="text-xs text-muted">Gross</p>
                  <p className="text-xl font-semibold mt-1 text-content">{fmt(totals.gross)}</p>
                </div>
                <div className="stat">
                  <p className="text-xs text-muted">Bonus</p>
                  <p className="text-xl font-semibold mt-1 text-content">{fmt(totals.bonus)}</p>
                </div>
                <div className="stat">
                  <p className="text-xs text-muted">Deductions</p>
                  <p className="text-xl font-semibold mt-1 text-content">{fmt(totals.deductions)}</p>
                </div>
                <div className="stat">
                  <p className="text-xs text-muted">Net</p>
                  <p className="text-xl font-semibold mt-1 text-content">{fmt(totals.net)}</p>
                </div>
              </div>

              {/* Payslips toolbar */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Payslips</p>
                <button onClick={() => setShowAddSlip(true)} className="btn btn-ghost h-7 px-2 text-xs"><Icon name="ti-plus" />Add payslip</button>
              </div>

              {slipsLoading ? <Spinner /> : payslips.length === 0 ? (
                <EmptyState icon="ti-receipt" text="No payslips for this run yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-2xs uppercase tracking-wide text-muted border-b border-line">
                        <th className="th text-left">Employee</th>
                        <th className="th text-left">Pay</th>
                        <th className="th text-right">Hours</th>
                        <th className="th text-right">Days</th>
                        <th className="th text-right">Gross</th>
                        <th className="th text-right">Bonus</th>
                        <th className="th text-right">Deductions</th>
                        <th className="th text-right">Net</th>
                        <th className="th"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslips.map((p) => {
                        const payType = p.breakdown?.pay_type as string | undefined;
                        return (
                          <tr key={p.id} className="row border-b border-line last:border-0">
                            <td className="td">
                              <span className="inline-flex items-center gap-2">
                                <Avatar name={p.users?.full_name || '?'} size={22} />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{p.users?.full_name || '—'}</span>
                                  {(p.users?.job_title || p.users?.department) && (
                                    <span className="block text-2xs text-muted2 truncate">
                                      {[p.users?.job_title, p.users?.department].filter(Boolean).join(' · ')}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </td>
                            <td className="td">
                              {payType ? (
                                <span className={`pill ${payType === 'hourly' ? 'pill-blue' : 'pill-gray'} text-2xs`}>{payType}</span>
                              ) : '—'}
                            </td>
                            <td className="td text-right text-muted">{p.hours_worked != null ? Number(p.hours_worked).toLocaleString() : '—'}</td>
                            <td className="td text-right text-muted">{p.days_worked != null ? Number(p.days_worked).toLocaleString() : '—'}</td>
                            <td className="td text-right">{fmt(p.gross)}</td>
                            <td className="td text-right">
                              {Number(p.bonus || 0) > 0 ? (
                                <span className="inline-flex items-center gap-1">
                                  {fmt(p.bonus)}
                                  {p.bonus_tag && <span className="pill pill-green text-2xs">{p.bonus_tag}</span>}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="td text-right">{fmt(p.deductions)}</td>
                            <td className="td text-right font-semibold">{fmt(p.net)}</td>
                            <td className="td text-right">
                              <span className="inline-flex items-center gap-1">
                                {isDraft && (
                                  <button onClick={() => setEditSlip(p)} className="text-muted2 hover:text-accent" title="Edit">
                                    <Icon name="ti-pencil" className="text-sm" />
                                  </button>
                                )}
                                {isDraft && (
                                  <button onClick={() => removeSlip(p.id)} className="text-muted2 hover:text-rose-500" title="Delete">
                                    <Icon name="ti-trash" className="text-sm" />
                                  </button>
                                )}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Totals footer */}
                    <tfoot>
                      <tr className="border-t-2 border-line bg-surface2/40 text-sm font-semibold">
                        <td className="td" colSpan={4}>Totals</td>
                        <td className="td text-right">{fmt(totals.gross)}</td>
                        <td className="td text-right">{fmt(totals.bonus)}</td>
                        <td className="td text-right">{fmt(totals.deductions)}</td>
                        <td className="td text-right">{fmt(totals.net)}</td>
                        <td className="td"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="card flex-1 p-6 text-sm text-muted2">Select a payroll run, or create one to get started</div>
          )}
        </div>
      )}

      {showNew && (
        <NewRunModal busy={busy} onClose={() => setShowNew(false)}
          onSubmit={async (label, start, end) => {
            if (!org) return; setBusy(true);
            try {
              const r = await createPayrollRun({ org_id: org.id, period_label: label, period_start: start, period_end: end, created_by: me?.id });
              qc.invalidateQueries({ queryKey: qk.payrollRuns(org?.id) });
              setSelected(r.id); setShowNew(false);
            } catch (e: any) { alert(e.message); } finally { setBusy(false); }
          }} />
      )}

      {showAddSlip && run && (
        <AddPayslipModal employees={employees} busy={busy} onClose={() => setShowAddSlip(false)}
          onSubmit={async (userId, gross, deductions) => {
            if (!org) return; setBusy(true);
            try {
              const slip = await createPayslip({ org_id: org.id, run_id: run.id, user_id: userId, gross, deductions });
              setPayslips((p) => [...p, slip]); setShowAddSlip(false);
            } catch (e: any) { alert(e.message); } finally { setBusy(false); }
          }} />
      )}

      {editSlip && run && (
        <EditPayslipModal slip={editSlip} busy={busy} onClose={() => setEditSlip(null)}
          onSubmit={async (patch) => {
            setBusy(true);
            try {
              const updated = await updatePayslip(editSlip.id, patch);
              setPayslips((ps) => ps.map((x) => x.id === updated.id ? updated : x));
              setEditSlip(null);
            } catch (e: any) { alert(e.message); } finally { setBusy(false); }
          }} />
      )}
    </Layout>
  );
}

// ── New Run Modal ─────────────────────────────────────────────────────────────
function NewRunModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (label: string, start: string, end: string) => void }) {
  const [label, setLabel] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const valid = !!label.trim() && !!start && !!end;
  const submit = () => valid && onSubmit(label.trim(), start, end);
  return (
    <Modal open onClose={onClose} title="New payroll run" subtitle="Set up a pay period to add payslips against." icon="ti-cash"
      onSubmit={() => { if (!busy && valid) submit(); }}
      footer={
        <>
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy || !valid} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Creating…' : 'Create run'}</button>
        </>
      }>
      <div className="space-y-3.5">
        <Field label="Period label" required hint="A short, recognizable name for this run.">
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. June 2026" className="input" />
        </Field>
        <div className="flex gap-3">
          <Field label="Start" required className="flex-1"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input" /></Field>
          <Field label="End" required className="flex-1"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input" /></Field>
        </div>
      </div>
    </Modal>
  );
}

// ── Add Payslip Modal ─────────────────────────────────────────────────────────
function AddPayslipModal({ employees, busy, onClose, onSubmit }: { employees: Employee[]; busy: boolean; onClose: () => void; onSubmit: (userId: string, gross: number, deductions: number) => void }) {
  const [userId, setUserId] = useState('');
  const [gross, setGross] = useState('');
  const [deductions, setDeductions] = useState('0');
  const g = parseFloat(gross) || 0;
  const d = parseFloat(deductions) || 0;
  const net = g - d;
  const valid = !!userId && !!gross;
  const submit = () => valid && onSubmit(userId, g, d);
  return (
    <Modal open onClose={onClose} title="Add payslip" subtitle="Add a payslip for an employee in this run." icon="ti-receipt"
      onSubmit={() => { if (!busy && valid) submit(); }}
      footer={
        <>
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy || !valid} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Adding…' : 'Add payslip'}</button>
        </>
      }>
      <div className="space-y-3.5">
        <Field label="Employee" required>
          <select autoFocus value={userId} onChange={(e) => setUserId(e.target.value)} className="input">
            <option value="">Select…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </Field>
        <div className="flex gap-3">
          <Field label="Gross" required className="flex-1"><input type="number" value={gross} onChange={(e) => setGross(e.target.value)} className="input" /></Field>
          <Field label="Deductions" className="flex-1"><input type="number" value={deductions} onChange={(e) => setDeductions(e.target.value)} className="input" /></Field>
        </div>
        <p className="text-2xs text-muted2">Net: {net.toLocaleString()}</p>
      </div>
    </Modal>
  );
}

// ── Edit Payslip Modal ────────────────────────────────────────────────────────
type EditPatch = { gross: number; deductions: number; bonus: number; bonus_tag: string | null; bonus_note: string | null; net: number };

function EditPayslipModal({ slip, busy, onClose, onSubmit }: { slip: Payslip; busy: boolean; onClose: () => void; onSubmit: (patch: EditPatch) => void }) {
  const t = useModalTabs('pay');
  const [gross, setGross] = useState(String(slip.gross ?? ''));
  const [deductions, setDeductions] = useState(String(slip.deductions ?? '0'));
  const [bonus, setBonus] = useState(String(slip.bonus ?? '0'));
  const [bonusTag, setBonusTag] = useState<string>(slip.bonus_tag ?? '');
  const [bonusNote, setBonusNote] = useState(slip.bonus_note ?? '');

  const g = parseFloat(gross) || 0;
  const d = parseFloat(deductions) || 0;
  const b = parseFloat(bonus) || 0;
  const net = g + b - d;

  const submit = () => onSubmit({ gross: g, deductions: d, bonus: b, bonus_tag: bonusTag || null, bonus_note: bonusNote || null, net });

  return (
    <Modal open onClose={onClose} title="Edit payslip" subtitle={slip.users?.full_name ?? undefined} icon="ti-pencil"
      size="md"
      tabs={[
        { key: 'pay', label: 'Pay', icon: 'ti-cash' },
        { key: 'bonus', label: 'Bonus', icon: 'ti-gift' },
      ]}
      {...t.bind}
      onSubmit={() => { if (!busy) submit(); }}
      footer={
        <>
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">Net: {net.toLocaleString()}</span>
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Saving…' : 'Save'}</button>
        </>
      }>
      {t.tab === 'pay' && (
        <div className="space-y-3.5">
          <Field label="Gross" required hint="Custom disbursement amount for this period.">
            <input autoFocus type="number" value={gross} onChange={(e) => setGross(e.target.value)} className="input" />
          </Field>
          <Field label="Deductions">
            <input type="number" value={deductions} onChange={(e) => setDeductions(e.target.value)} className="input" />
          </Field>
          <p className="text-2xs text-muted2">Preview net (excl. bonus): {(g - d).toLocaleString()}</p>
        </div>
      )}
      {t.tab === 'bonus' && (
        <div className="space-y-3.5">
          <Field label="Bonus amount">
            <input autoFocus type="number" value={bonus} onChange={(e) => setBonus(e.target.value)} className="input" />
          </Field>
          <Field label="Bonus tag">
            <select value={bonusTag} onChange={(e) => setBonusTag(e.target.value)} className="input">
              <option value="">None</option>
              {BONUS_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </Field>
          <Field label="Bonus note">
            <input type="text" value={bonusNote} onChange={(e) => setBonusNote(e.target.value)} placeholder="Optional note…" className="input" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

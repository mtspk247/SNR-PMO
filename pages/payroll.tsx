import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Avatar } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import {
  getPayrollRuns, createPayrollRun, updatePayrollRunStatus, deletePayrollRun,
  getPayslips, createPayslip, deletePayslip, getEmployees,
} from '@/lib/db';
import { PayrollRun, Payslip, Employee } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

const STATUS_PILL: Record<string, string> = {
  Draft: 'pill-gray', Processed: 'pill-blue', Paid: 'pill-green', Cancelled: 'pill-red',
};

export default function PayrollPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const isAdmin = can.manageMembers(org);

  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showAddSlip, setShowAddSlip] = useState(false);
  const [slipsLoading, setSlipsLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    setLoading(true);
    Promise.all([getPayrollRuns(), getEmployees()])
      .then(([r, e]) => { setRuns(r); setEmployees(e); if (r.length) setSelected((s) => s || r[0].id); })
      .finally(() => setLoading(false));
  }, [org?.id, isAdmin]);

  useEffect(() => {
    if (!selected) { setPayslips([]); return; }
    setSlipsLoading(true);
    getPayslips(selected).then(setPayslips).finally(() => setSlipsLoading(false));
  }, [selected]);

  if (!isAdmin) {
    return (
      <Layout title="Payroll">
        <div className="card p-10 text-center text-sm text-muted">
          <Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />
          You need admin access to view payroll.
        </div>
      </Layout>
    );
  }

  const run = runs.find((r) => r.id === selected) || null;

  const removeRun = async (id: string) => {
    if (!confirm('Delete this payroll run and its payslips?')) return;
    setBusy(true);
    try {
      await deletePayrollRun(id);
      setRuns((p) => p.filter((r) => r.id !== id));
      if (selected === id) setSelected(null);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const setStatus = async (r: PayrollRun, status: PayrollRun['status']) => {
    setBusy(true);
    try {
      const u = await updatePayrollRunStatus(r.id, status);
      setRuns((p) => p.map((x) => (x.id === u.id ? u : x)));
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const removeSlip = async (id: string) => {
    if (!confirm('Delete this payslip?')) return;
    try { await deletePayslip(id); setPayslips((p) => p.filter((x) => x.id !== id)); }
    catch (e: any) { alert(e.message); }
  };

  const totals = payslips.reduce((acc, p) => ({
    gross: acc.gross + Number(p.gross || 0),
    deductions: acc.deductions + Number(p.deductions || 0),
    net: acc.net + Number(p.net || 0),
  }), { gross: 0, deductions: 0, net: 0 });

  return (
    <Layout title="Payroll">
      <PageHeader title="Payroll" subtitle="Manage payroll runs and employee payslips"
        action={<button onClick={() => setShowNew(true)} className="btn btn-primary"><Icon name="ti-plus" />New run</button>} />

      {loading ? <Spinner /> : (
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="card w-full lg:w-72 lg:shrink-0 overflow-y-auto" style={{ maxHeight: '72vh' }}>
            {runs.map((r) => (
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
          </div>

          {run ? (
            <div className="card flex-1 p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="font-semibold">{run.period_label}</h3>
                  <p className="text-sm text-muted">{run.period_start} → {run.period_end}</p>
                  {run.notes && <p className="text-sm text-muted2 mt-1">{run.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <select value={run.status} disabled={busy} onChange={(e) => setStatus(run, e.target.value as PayrollRun['status'])} className="input w-36">
                    <option>Draft</option>
                    <option>Processed</option>
                    <option>Paid</option>
                    <option>Cancelled</option>
                  </select>
                  <button onClick={() => removeRun(run.id)} disabled={busy} className="btn btn-ghost h-9 px-2 text-rose-500"><Icon name="ti-trash" /></button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <div className="stat">
                  <p className="text-xs text-muted">Gross</p>
                  <p className="text-2xl font-semibold mt-1.5 text-content">{totals.gross.toLocaleString()}</p>
                </div>
                <div className="stat">
                  <p className="text-xs text-muted">Deductions</p>
                  <p className="text-2xl font-semibold mt-1.5 text-content">{totals.deductions.toLocaleString()}</p>
                </div>
                <div className="stat">
                  <p className="text-xs text-muted">Net</p>
                  <p className="text-2xl font-semibold mt-1.5 text-content">{totals.net.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Payslips</p>
                <button onClick={() => setShowAddSlip(true)} className="btn btn-ghost h-7 px-2 text-xs"><Icon name="ti-plus" />Add payslip</button>
              </div>
              {slipsLoading ? <Spinner /> : payslips.length === 0 ? (
                <EmptyState icon="ti-receipt" text="No payslips for this run yet" />
              ) : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead>
                    <tr className="text-2xs uppercase tracking-wide text-muted border-b border-line">
                      <th className="th text-left">Employee</th>
                      <th className="th text-left">Gross</th>
                      <th className="th text-left">Deductions</th>
                      <th className="th text-left">Net</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payslips.map((p) => (
                      <tr key={p.id} className="row border-b border-line last:border-0">
                        <td className="td">
                          <span className="inline-flex items-center gap-2">
                            <Avatar name={p.users?.full_name || '?'} size={22} />{p.users?.full_name || '—'}
                          </span>
                        </td>
                        <td className="td">{Number(p.gross).toLocaleString()}</td>
                        <td className="td">{Number(p.deductions).toLocaleString()}</td>
                        <td className="td font-medium">{Number(p.net).toLocaleString()}</td>
                        <td className="td text-right">
                          <button onClick={() => removeSlip(p.id)} className="text-muted2 hover:text-rose-500"><Icon name="ti-trash" className="text-sm" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
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
              setRuns((p) => [r, ...p]); setSelected(r.id); setShowNew(false);
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
    </Layout>
  );
}

function NewRunModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (label: string, start: string, end: string) => void }) {
  const [label, setLabel] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const valid = !!label.trim() && !!start && !!end;
  const submit = () => valid && onSubmit(label.trim(), start, end);
  return (
    <Modal
      open
      onClose={onClose}
      title="New payroll run"
      subtitle="Set up a pay period to add payslips against."
      icon="ti-cash"
      onSubmit={() => { if (!busy && valid) submit(); }}
      footer={
        <>
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy || !valid} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Creating…' : 'Create run'}</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Period label" required hint="A short, recognizable name for this run."><input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. June 2026" className="input" /></Field>
        <div className="flex gap-3">
          <Field label="Start" required className="flex-1"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input" /></Field>
          <Field label="End" required className="flex-1"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input" /></Field>
        </div>
      </div>
    </Modal>
  );
}

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
    <Modal
      open
      onClose={onClose}
      title="Add payslip"
      subtitle="Add a payslip for an employee in this run."
      icon="ti-receipt"
      onSubmit={() => { if (!busy && valid) submit(); }}
      footer={
        <>
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy || !valid} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Adding…' : 'Add payslip'}</button>
        </>
      }
    >
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

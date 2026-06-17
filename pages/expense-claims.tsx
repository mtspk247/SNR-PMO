import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg } from '@/lib/store';
import { expenseClaims, expenseClaimSave, expenseClaimSetStatus, expenseClaimDelete, glAccounts, getOrgUsers, ExpenseClaim, CoaAccount } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';

const STATUS_PILL: Record<string, string> = { draft: 'pill-gray', submitted: 'pill-blue', approved: 'pill-amber', paid: 'pill-green', rejected: 'pill-red' };
const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Draft = { id?: string; employee_id: string; title: string; amount: string; currency: string; tax_rate: string; claim_date: string; expense_account_id: string; notes: string };

export default function ExpenseClaimsPage() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const [rows, setRows] = useState<ExpenseClaim[]>([]);
  const [accts, setAccts] = useState<CoaAccount[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = () => { if (!orgId) return; expenseClaims(orgId).then(setRows).catch((e) => setErr(e.message)); };
  useEffect(() => { if (!orgId) return; setLoading(true); Promise.all([expenseClaims(orgId).then(setRows), glAccounts(orgId).then(setAccts).catch(() => {}), getOrgUsers(orgId).then(setUsers).catch(() => {})]).catch((e) => setErr(e.message)).finally(() => setLoading(false)); }, [orgId]);

  const expenseAccts = useMemo(() => accts.filter((a) => a.type === 'expense' && a.is_active).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })), [accts]);
  const userName = (id: string | null) => users.find((u) => u.id === id)?.full_name || '—';
  const pending = useMemo(() => rows.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.amount) * (1 + Number(r.tax_rate) / 100), 0), [rows]);

  const openNew = () => setDraft({ employee_id: '', title: '', amount: '', currency: 'USD', tax_rate: '', claim_date: new Date().toISOString().slice(0, 10), expense_account_id: '', notes: '' });
  const openEdit = (c: ExpenseClaim) => setDraft({ id: c.id, employee_id: c.employee_id || '', title: c.title, amount: String(c.amount), currency: c.currency, tax_rate: c.tax_rate ? String(c.tax_rate) : '', claim_date: c.claim_date, expense_account_id: c.expense_account_id || '', notes: c.notes || '' });
  const save = async () => {
    if (!orgId || !draft || busy) return; setBusy(true); setErr('');
    try { await expenseClaimSave(orgId, { id: draft.id, employee_id: draft.employee_id || null, title: draft.title, amount: parseFloat(draft.amount) || 0, currency: draft.currency, tax_rate: parseFloat(draft.tax_rate) || 0, claim_date: draft.claim_date || null, expense_account_id: draft.expense_account_id || null, notes: draft.notes || null }); setDraft(null); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const setStatus = async (c: ExpenseClaim, status: string) => { if (!orgId) return; setBusy(true); setErr(''); try { await expenseClaimSetStatus(orgId, c.id, status); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const del = async (c: ExpenseClaim) => { if (!orgId || !confirm(`Delete claim "${c.title}"?`)) return; try { await expenseClaimDelete(orgId, c.id); load(); } catch (e: any) { setErr(e.message); } };

  if (!org) return <Layout flat title="Expense Claims"><Spinner /></Layout>;

  return (
    <Layout flat title="Expense Claims">
      <PageHeader title="Expense Claims" subtitle="Employee reimbursements — approve to accrue payable, pay to settle. Posts to the ledger." icon="ti-receipt-2"
        action={<button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New claim</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Claims" value={String(rows.length)} icon="ti-receipt-2" />
        <StatCard label="Awaiting payment" value={String(rows.filter((r) => r.status === 'approved').length)} icon="ti-clock" />
        <StatCard label="Owed to staff" value={money(pending)} icon="ti-cash" hintTone={pending > 0 ? 'down' : 'muted'} />
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon="ti-receipt-2" text="No expense claims yet." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm list-card">
            <thead><tr><th className="px-4 py-2 text-left">Claim</th><th className="px-4 py-2 text-left">Employee</th><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const total = Number(c.amount) * (1 + Number(c.tax_rate) / 100);
                const editable = ['draft', 'submitted', 'rejected'].includes(c.status);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2 text-content font-medium">{c.title}</td>
                    <td className="px-4 py-2 text-muted">{userName(c.employee_id)}</td>
                    <td className="px-4 py-2 text-2xs text-muted2">{c.claim_date}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(total)}</td>
                    <td className="px-4 py-2"><span className={`pill ${STATUS_PILL[c.status] || 'pill-gray'}`}>{c.status}</span></td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {(c.status === 'draft' || c.status === 'submitted') && <button className="btn-ghost text-2xs text-emerald-600" disabled={busy} onClick={() => setStatus(c, 'approved')}><Icon name="ti-check" />Approve</button>}
                      {c.status === 'approved' && <button className="btn-ghost text-2xs text-emerald-600" disabled={busy} onClick={() => setStatus(c, 'paid')}><Icon name="ti-cash" />Pay</button>}
                      {(c.status === 'draft' || c.status === 'submitted') && <button className="btn-ghost text-2xs" disabled={busy} onClick={() => setStatus(c, 'rejected')} title="Reject"><Icon name="ti-x" /></button>}
                      {editable && <button className="btn-ghost text-2xs ml-1" onClick={() => openEdit(c)}><Icon name="ti-pencil" /></button>}
                      {editable && <button className="btn-ghost text-2xs text-rose-600 ml-1" onClick={() => del(c)}><Icon name="ti-trash" /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} size="md" icon="ti-receipt-2" title={draft?.id ? 'Edit claim' : 'New expense claim'}
        footer={<><button className="btn" onClick={() => setDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !draft?.title.trim()} onClick={save}>{busy ? 'Saving…' : 'Save claim'}</button></>}>
        {draft && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title" required className="col-span-2"><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Client travel — taxi & meals" /></Field>
            <Field label="Employee"><Select value={draft.employee_id} onChange={(v) => setDraft({ ...draft, employee_id: v })} options={[{ value: '', label: '—' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} search /></Field>
            <Field label="Claim date"><input type="date" className="input" value={draft.claim_date} onChange={(e) => setDraft({ ...draft, claim_date: e.target.value })} /></Field>
            <Field label="Amount"><input className="input text-right" inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="0.00" /></Field>
            <Field label="Tax rate %"><input className="input text-right" inputMode="decimal" value={draft.tax_rate} onChange={(e) => setDraft({ ...draft, tax_rate: e.target.value })} placeholder="0" /></Field>
            <Field label="Expense account" className="col-span-2"><Select value={draft.expense_account_id} onChange={(v) => setDraft({ ...draft, expense_account_id: v })} options={[{ value: '', label: 'Default expense' }, ...expenseAccts]} search /></Field>
            <Field label="Notes" className="col-span-2"><input className="input" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional" /></Field>
          </div>
        )}
      </Modal>
    </Layout>
  );
}

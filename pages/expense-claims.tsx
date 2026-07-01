import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import AgentPanel from '@/components/AgentPanel';
import { PageHeader, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg } from '@/lib/store';
import { expenseClaims, expenseClaimSave, expenseClaimSetStatus, expenseClaimDelete, glAccounts, getOrgUsers, ExpenseClaim, CoaAccount } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const STATUS_PILL: Record<string, string> = { draft: 'pill-gray', submitted: 'pill-blue', approved: 'pill-amber', paid: 'pill-green', rejected: 'pill-red' };
const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Draft = { id?: string; employee_id: string; title: string; amount: string; currency: string; tax_rate: string; claim_date: string; expense_account_id: string; notes: string };

const STATUS_ORDER = ['draft', 'submitted', 'approved', 'paid', 'rejected'] as const;
const GROUPS: GroupMeta[] = STATUS_ORDER.map((st) => ({ value: st, label: st.charAt(0).toUpperCase() + st.slice(1), pill: STATUS_PILL[st] || 'pill-gray' }));

const COLS: ColDef[] = [
  { id: 'title', label: 'Claim', locked: true },
  { id: 'employee', label: 'Employee' },
  { id: 'claim_date', label: 'Date' },
  { id: 'amount', label: 'Amount' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: '' },
];

const CLAIM_FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [
    { value: 'all', label: 'All statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'approved', label: 'Approved' },
    { value: 'paid', label: 'Paid' },
    { value: 'rejected', label: 'Rejected' },
  ]},
];

export default function ExpenseClaimsPage() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const [rows, setRows] = useState<ExpenseClaim[] | null>(null);
  const [accts, setAccts] = useState<CoaAccount[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const prefs = useListPrefs('snrpmo.expense_claims.cols', COLS, { entity: 'expense_claims', orgId: org?.id, canManage: ['owner', 'admin'].includes(org?.member_role || '') });
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';

  const router = useRouter();
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    const id = router.query.id;
    if (!id || typeof id !== 'string' || !rows) return;
    if (openedRef.current === id) return;
    const row = rows.find((c) => c.id === id);
    if (row) { openedRef.current = id; openEdit(row); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, router.query.id]);
  const load = () => {
    if (!orgId) return;
    expenseClaims(orgId).then(setRows).catch((e) => { setErr(e.message); setRows([]); });
  };

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      expenseClaims(orgId).then(setRows),
      glAccounts(orgId).then(setAccts).catch(() => {}),
      getOrgUsers(orgId).then(setUsers).catch(() => {}),
    ]).catch((e) => { setErr(e.message); setRows([]); });
  }, [orgId]);

  const expenseAccts = useMemo(() => accts.filter((a) => a.type === 'expense' && a.is_active).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })), [accts]);
  const userName = (id: string | null) => users.find((u) => u.id === id)?.full_name || '—';
  const pending = useMemo(() => (rows || []).filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.amount) * (1 + Number(r.tax_rate) / 100), 0), [rows]);

  const shown = useMemo(() =>
    (rows || []).filter((c) =>
      (statusF === 'all' || c.status === statusF) &&
      (!q.trim() || `${c.title} ${userName(c.employee_id)}`.toLowerCase().includes(q.toLowerCase()))
    ),
    // eslint-disable-next-line
    [rows, q, statusF, users]
  );

  const rs = useRowSelection(shown);

  const openNew = () => setDraft({ employee_id: '', title: '', amount: '', currency: 'USD', tax_rate: '', claim_date: new Date().toISOString().slice(0, 10), expense_account_id: '', notes: '' });
  const openEdit = (c: ExpenseClaim) => setDraft({ id: c.id, employee_id: c.employee_id || '', title: c.title, amount: String(c.amount), currency: c.currency, tax_rate: c.tax_rate ? String(c.tax_rate) : '', claim_date: c.claim_date, expense_account_id: c.expense_account_id || '', notes: c.notes || '' });

  const save = async () => {
    if (!orgId || !draft || busy) return; setBusy(true); setErr('');
    try {
      await expenseClaimSave(orgId, { id: draft.id, employee_id: draft.employee_id || null, title: draft.title, amount: parseFloat(draft.amount) || 0, currency: draft.currency, tax_rate: parseFloat(draft.tax_rate) || 0, claim_date: draft.claim_date || null, expense_account_id: draft.expense_account_id || null, notes: draft.notes || null });
      setDraft(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const setStatus = async (c: ExpenseClaim, status: string) => {
    if (!orgId) return; setBusy(true); setErr('');
    try { await expenseClaimSetStatus(orgId, c.id, status); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const del = async (c: ExpenseClaim) => {
    if (!orgId || !confirm(`Delete claim "${c.title}"?`)) return;
    try { await expenseClaimDelete(orgId, c.id); load(); } catch (e: any) { setErr(e.message); }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} claim${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try {
      for (const c of rs.selected) {
        if (['draft', 'submitted', 'rejected'].includes(c.status)) {
          await expenseClaimDelete(orgId!, c.id);
        }
      }
      rs.clear(); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const cell = (id: string, c: ExpenseClaim) => {
    const total = Number(c.amount) * (1 + Number(c.tax_rate) / 100);
    const isEditable = ['draft', 'submitted', 'rejected'].includes(c.status);
    switch (id) {
      case 'title': return <span className="font-medium text-content">{c.title}</span>;
      case 'employee': return userName(c.employee_id);
      case 'claim_date': return c.claim_date || '—';
      case 'amount': return <span className="tabular-nums">{money(total)}</span>;
      case 'status': return <span className={`pill ${STATUS_PILL[c.status] || 'pill-gray'}`}>{c.status}</span>;
      case 'actions': return (
        <span className="flex items-center gap-1 justify-end whitespace-nowrap">
          {(c.status === 'draft' || c.status === 'submitted') && (
            <button className="btn-ghost text-2xs text-emerald-600" disabled={busy} onClick={(e) => { e.stopPropagation(); setStatus(c, 'approved'); }}>
              <Icon name="ti-check" />Approve
            </button>
          )}
          {c.status === 'approved' && (
            <button className="btn-ghost text-2xs text-emerald-600" disabled={busy} onClick={(e) => { e.stopPropagation(); setStatus(c, 'paid'); }}>
              <Icon name="ti-cash" />Pay
            </button>
          )}
          {(c.status === 'draft' || c.status === 'submitted') && (
            <button className="btn-ghost text-2xs" disabled={busy} onClick={(e) => { e.stopPropagation(); setStatus(c, 'rejected'); }} title="Reject">
              <Icon name="ti-x" />
            </button>
          )}
          {isEditable && (
            <button className="btn-ghost text-2xs ml-1" onClick={(e) => { e.stopPropagation(); openEdit(c); }}>
              <Icon name="ti-pencil" />
            </button>
          )}
          {isEditable && (
            <button className="btn-ghost text-2xs text-rose-600 ml-1" onClick={(e) => { e.stopPropagation(); del(c); }}>
              <Icon name="ti-trash" />
            </button>
          )}
        </span>
      );
      default: return '—';
    }
  };

  const exportValue = (id: string, c: ExpenseClaim) => {
    const total = Number(c.amount) * (1 + Number(c.tax_rate) / 100);
    switch (id) {
      case 'title': return c.title;
      case 'employee': return userName(c.employee_id);
      case 'claim_date': return c.claim_date || '';
      case 'amount': return money(total);
      case 'status': return c.status;
      default: return '';
    }
  };

  return (
    <Layout flat title="Expense Claims">
      <PageHeader title="Expense Claims" subtitle="Employee reimbursements — approve to accrue payable, pay to settle. Posts to the ledger." icon="ti-receipt-2"
        action={<button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New claim</button>} />
      <AgentPanel domain="accounting" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Claims" value={String((rows || []).length)} icon="ti-receipt-2" />
        <StatCard label="Awaiting payment" value={String((rows || []).filter((r) => r.status === 'approved').length)} icon="ti-clock" />
        <StatCard label="Owed to staff" value={money(pending)} icon="ti-cash" hintTone={pending > 0 ? 'down' : 'muted'} />
      </div>

      <ListView
        rows={rows === null ? null : shown}
        rowKey={(c) => c.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={CLAIM_FILTERS}
        searchPlaceholder="Search claims…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(c) => c.status}
        groups={GROUPS}
        onRowClick={(c) => { if (['draft', 'submitted', 'rejected'].includes(c.status)) openEdit(c); }}
        exportName="expense-claims"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={true}
        busy={busy}
        emptyIcon="ti-receipt-2"
        emptyText="No expense claims yet."
      />

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

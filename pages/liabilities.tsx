import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { liabilities, liabilitySave, liabilityDelete, glAccounts, Liability, CoaAccount } from '@/lib/db';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta, EditSpec } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const TYPES = [
  { value: 'loan', label: 'Loan' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'payable', label: 'Payable' },
  { value: 'accrued', label: 'Accrued' },
  { value: 'other', label: 'Other' },
];
const STATUSES = [{ value: 'active', label: 'Active' }, { value: 'paid', label: 'Paid' }, { value: 'closed', label: 'Closed' }];
const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label || t;

const STATUS_PILL: Record<string, string> = {
  active: 'pill-amber',
  paid: 'pill-green',
  closed: 'pill-gray',
};

const GROUPS: GroupMeta[] = [
  { value: 'active', label: 'Active', pill: 'pill-amber' },
  { value: 'paid', label: 'Paid', pill: 'pill-green' },
  { value: 'closed', label: 'Closed', pill: 'pill-gray' },
];

const COLS: ColDef[] = [
  { id: 'name', label: 'Name', locked: true },
  { id: 'type', label: 'Type' },
  { id: 'lender', label: 'Lender' },
  { id: 'balance', label: 'Balance' },
  { id: 'rate', label: 'Rate' },
  { id: 'due_date', label: 'Due' },
  { id: 'status', label: 'Status' },
];

const LIAB_FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'paid', label: 'Paid' }, { value: 'closed', label: 'Closed' }] },
  { id: 'type', label: 'Type', options: [{ value: 'all', label: 'All types' }, ...TYPES] },
];

type Draft = { id?: string; name: string; type: string; lender: string; principal: string; balance: string; interest_rate: string; start_date: string; due_date: string; account_id: string; status: string; notes: string; post_opening: boolean };

export default function LiabilitiesPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const orgId = org?.id;
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const [rows, setRows] = useState<Liability[] | null>(null);
  const [accts, setAccts] = useState<CoaAccount[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const prefs = useListPrefs('snrpmo.liabilities.cols', COLS, { entity: 'liabilities', orgId: org?.id, canManage: ['owner', 'admin'].includes(org?.member_role || '') });
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';
  const typeF = prefs.filters.type || 'all';

  const load = () => {
    if (!orgId) return;
    liabilities(orgId).then(setRows).catch((e) => { setErr(e.message); setRows([]); });
  };

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      liabilities(orgId).then(setRows).catch((e) => { setErr(e.message); setRows([]); }),
      glAccounts(orgId).then(setAccts).catch(() => {}),
    ]);
  }, [orgId]);

  const liabilityAccts = useMemo(() => accts.filter((a) => a.type === 'liability' && a.is_active).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })), [accts]);
  const totalBalance = useMemo(() => (rows || []).filter((r) => r.status === 'active').reduce((s, r) => s + Number(r.balance), 0), [rows]);

  const shown = useMemo(() =>
    (rows || []).filter((r) =>
      (statusF === 'all' || r.status === statusF) &&
      (typeF === 'all' || r.type === typeF) &&
      (!q.trim() || `${r.name} ${r.lender || ''}`.toLowerCase().includes(q.toLowerCase()))
    ),
    [rows, q, statusF, typeF]
  );

  const rs = useRowSelection(shown);

  const cell = (id: string, r: Liability) => {
    switch (id) {
      case 'name': return <span className="font-medium text-content">{r.name}</span>;
      case 'type': return <span className="pill pill-gray">{typeLabel(r.type)}</span>;
      case 'lender': return r.lender || '—';
      case 'balance': return <span className="tabular-nums">{money(Number(r.balance))}</span>;
      case 'rate': return r.interest_rate != null ? <span className="tabular-nums text-muted">{(r.interest_rate * 100).toFixed(2)}%</span> : '—';
      case 'due_date': return r.due_date || '—';
      case 'status': return <span className={`pill ${STATUS_PILL[r.status] || 'pill-gray'}`}>{r.status}</span>;
      default: return '—';
    }
  };

  const exportValue = (id: string, r: Liability) => {
    switch (id) {
      case 'name': return r.name;
      case 'type': return typeLabel(r.type);
      case 'lender': return r.lender || '';
      case 'balance': return money(Number(r.balance));
      case 'rate': return r.interest_rate != null ? `${(r.interest_rate * 100).toFixed(2)}%` : '';
      case 'due_date': return r.due_date || '';
      case 'status': return r.status;
      default: return '';
    }
  };

  const editable: Record<string, EditSpec> = {
    name: { type: 'text' },
    lender: { type: 'text' },
    balance: { type: 'number' },
    status: { type: 'select', options: STATUSES },
  };

  const rawValue = (id: string, r: Liability) => {
    switch (id) {
      case 'name': return r.name;
      case 'lender': return r.lender || '';
      case 'balance': return String(r.balance);
      case 'status': return r.status;
      default: return '';
    }
  };

  const onInlineEdit = async (r: Liability, id: string, value: string) => {
    try {
      await liabilitySave(orgId!, {
        id: r.id, name: r.name, type: r.type, lender: r.lender || null,
        principal: Number(r.principal), balance: id === 'balance' ? (parseFloat(value) || 0) : Number(r.balance),
        interest_rate: r.interest_rate,
        start_date: r.start_date || null, due_date: r.due_date || null,
        account_id: r.account_id || null,
        status: id === 'status' ? value : r.status,
        notes: r.notes || null, post_opening: false,
        ...(id === 'name' ? { name: value } : {}),
        ...(id === 'lender' ? { lender: value || null } : {}),
      });
      load();
    } catch (e: any) { setErr(e.message); }
  };

  const openNew = () => setDraft({ name: '', type: 'loan', lender: '', principal: '', balance: '', interest_rate: '', start_date: new Date().toISOString().slice(0, 10), due_date: '', account_id: liabilityAccts[0]?.value || '', status: 'active', notes: '', post_opening: false });
  const openEdit = (r: Liability) => setDraft({ id: r.id, name: r.name, type: r.type, lender: r.lender || '', principal: String(r.principal), balance: String(r.balance), interest_rate: r.interest_rate != null ? String(r.interest_rate * 100) : '', start_date: r.start_date || '', due_date: r.due_date || '', account_id: r.account_id || '', status: r.status, notes: r.notes || '', post_opening: false });

  const save = async () => {
    if (!orgId || !draft || busy) return;
    setBusy(true); setErr('');
    try {
      await liabilitySave(orgId, {
        id: draft.id, name: draft.name, type: draft.type, lender: draft.lender || null,
        principal: parseFloat(draft.principal) || 0, balance: parseFloat(draft.balance || draft.principal) || 0,
        interest_rate: draft.interest_rate ? (parseFloat(draft.interest_rate) || 0) / 100 : null,
        start_date: draft.start_date || null, due_date: draft.due_date || null,
        account_id: draft.account_id || null, status: draft.status, notes: draft.notes || null, post_opening: draft.post_opening,
      });
      setDraft(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const bulkDelete = async () => {
    if (!orgId || !rs.count || !confirm(`Delete ${rs.count} liabilit${rs.count > 1 ? 'ies' : 'y'}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const r of rs.selected) await liabilityDelete(orgId, r.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Layout flat title="Liabilities">
      <PageHeader title="Liabilities" subtitle="Loans, credit cards and other amounts owed" icon="ti-businessplan"
        action={<button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New liability</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Active liabilities" value={String((rows || []).filter((r) => r.status === 'active').length)} icon="ti-businessplan" />
        <StatCard label="Outstanding balance" value={money(totalBalance)} icon="ti-cash" />
      </div>

      <ListView
        rows={rows === null ? null : shown}
        rowKey={(r) => r.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={LIAB_FILTERS}
        searchPlaceholder="Search liabilities…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(r) => r.status}
        groups={GROUPS}
        editable={editable}
        rawValue={rawValue}
        onEdit={onInlineEdit}
        onRowClick={(r) => openEdit(r)}
        exportName="liabilities"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        busy={busy}
        emptyIcon="ti-businessplan"
        emptyText="No liabilities recorded yet."
      />

      <Modal open={!!draft} onClose={() => setDraft(null)} size="md" icon="ti-businessplan" title={draft?.id ? 'Edit liability' : 'New liability'}
        footer={<><button className="btn" onClick={() => setDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !draft?.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save liability'}</button></>}>
        {draft && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required className="col-span-2"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Equipment loan" /></Field>
            <Field label="Type"><Select value={draft.type} onChange={(v) => setDraft({ ...draft, type: v })} options={TYPES} /></Field>
            <Field label="Lender"><input className="input" value={draft.lender} onChange={(e) => setDraft({ ...draft, lender: e.target.value })} placeholder="Bank / vendor" /></Field>
            <Field label="Principal"><input className="input text-right" inputMode="decimal" value={draft.principal} onChange={(e) => setDraft({ ...draft, principal: e.target.value })} placeholder="0.00" /></Field>
            <Field label="Current balance"><input className="input text-right" inputMode="decimal" value={draft.balance} onChange={(e) => setDraft({ ...draft, balance: e.target.value })} placeholder="0.00" /></Field>
            <Field label="Interest rate %"><input className="input text-right" inputMode="decimal" value={draft.interest_rate} onChange={(e) => setDraft({ ...draft, interest_rate: e.target.value })} placeholder="8" /></Field>
            <Field label="Status"><Select value={draft.status} onChange={(v) => setDraft({ ...draft, status: v })} options={STATUSES} /></Field>
            <Field label="Start date"><input type="date" className="input" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></Field>
            <Field label="Due date"><input type="date" className="input" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></Field>
            <Field label="Linked GL account" className="col-span-2" hint="Liability account this maps to in the ledger"><Select value={draft.account_id} onChange={(v) => setDraft({ ...draft, account_id: v })} options={[{ value: '', label: 'None' }, ...liabilityAccts]} search /></Field>
            <Field label="Notes" className="col-span-2"><input className="input" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional" /></Field>
            {!draft.id && (
              <label className="col-span-2 flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-line p-3">
                <input type="checkbox" className="accent-accent w-4 h-4 mt-0.5" checked={draft.post_opening} onChange={(e) => setDraft({ ...draft, post_opening: e.target.checked })} />
                <span><span className="text-content">Post opening entry to the ledger</span><span className="block text-2xs text-muted">Records cash received: debit Bank, credit the linked liability account (uses the principal). Requires a chart of accounts and a linked account.</span></span>
              </label>
            )}
          </div>
        )}
      </Modal>
    </Layout>
  );
}

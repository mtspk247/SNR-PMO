import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg } from '@/lib/store';
import { liabilities, liabilitySave, liabilityDelete, glAccounts, Liability, CoaAccount } from '@/lib/db';

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

type Draft = { id?: string; name: string; type: string; lender: string; principal: string; balance: string; interest_rate: string; start_date: string; due_date: string; account_id: string; status: string; notes: string; post_opening: boolean };

export default function LiabilitiesPage() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const [rows, setRows] = useState<Liability[]>([]);
  const [accts, setAccts] = useState<CoaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = () => orgId ? liabilities(orgId).then(setRows).catch((e) => setErr(e.message)) : Promise.resolve();
  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    Promise.all([liabilities(orgId).then(setRows), glAccounts(orgId).then(setAccts).catch(() => {})]).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [orgId]);

  const liabilityAccts = useMemo(() => accts.filter((a) => a.type === 'liability' && a.is_active).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })), [accts]);
  const totalBalance = useMemo(() => rows.filter((r) => r.status === 'active').reduce((s, r) => s + Number(r.balance), 0), [rows]);

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
      setDraft(null); await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const del = async (r: Liability) => { if (!orgId || !confirm(`Delete liability "${r.name}"?`)) return; try { await liabilityDelete(orgId, r.id); await load(); } catch (e: any) { setErr(e.message); } };

  if (!org) return <Layout flat title="Liabilities"><Spinner /></Layout>;

  return (
    <Layout flat title="Liabilities">
      <PageHeader title="Liabilities" subtitle="Loans, credit cards and other amounts owed" icon="ti-businessplan"
        action={<button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New liability</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Active liabilities" value={String(rows.filter((r) => r.status === 'active').length)} icon="ti-businessplan" />
        <StatCard label="Outstanding balance" value={money(totalBalance)} icon="ti-cash" />
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon="ti-businessplan" text="No liabilities recorded yet." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm list-card">
            <thead><tr><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Type</th><th className="px-4 py-2 text-left">Lender</th><th className="px-4 py-2 text-right">Balance</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-left">Due</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-content font-medium">{r.name}</td>
                  <td className="px-4 py-2"><span className="pill pill-gray">{typeLabel(r.type)}</span></td>
                  <td className="px-4 py-2 text-muted">{r.lender || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(Number(r.balance))}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{r.interest_rate != null ? `${(r.interest_rate * 100).toFixed(2)}%` : '—'}</td>
                  <td className="px-4 py-2 text-2xs text-muted2">{r.due_date || '—'}</td>
                  <td className="px-4 py-2"><span className={`pill ${r.status === 'active' ? 'pill-amber' : r.status === 'paid' ? 'pill-green' : 'pill-gray'}`}>{r.status}</span></td>
                  <td className="px-4 py-2 text-right whitespace-nowrap"><button className="btn-ghost text-2xs" onClick={() => openEdit(r)}><Icon name="ti-pencil" /></button><button className="btn-ghost text-2xs text-rose-600 ml-1" onClick={() => del(r)}><Icon name="ti-trash" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import Select from '@/components/Select';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listBills, createBill, updateBill, deleteBill, getBill,
  listBillLines, addBillLine, deleteBillLine, listBillPayments, addBillPayment, deleteBillPayment,
  Bill, BillLine, BillPayment, products, Product, listBankAccounts, BankAccount, getProjects,
} from '@/lib/db';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const STATUS_PILL: Record<string, string> = { draft: 'pill-gray', open: 'pill-blue', partial: 'pill-amber', paid: 'pill-green', overdue: 'pill-red', void: 'pill-gray' };
const STATUSES = ['draft', 'open', 'partial', 'paid', 'void'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtMoney = (n: number, c = 'USD') => `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isOverdue = (b: Bill) => b.due_date && new Date(b.due_date) < new Date() && !['paid', 'void'].includes(b.status);

const GROUP_ORDER = ['overdue', 'open', 'partial', 'draft', 'paid', 'void'];
const GROUPS: GroupMeta[] = GROUP_ORDER.map((st) => ({ value: st, label: cap(st), pill: STATUS_PILL[st] || 'pill-gray' }));

const COLS: ColDef[] = [
  { id: 'bill_number', label: 'Bill', locked: true },
  { id: 'vendor', label: 'Vendor' },
  { id: 'bill_date', label: 'Date' },
  { id: 'due_date', label: 'Due' },
  { id: 'total', label: 'Total' },
  { id: 'balance', label: 'Balance' },
  { id: 'status', label: 'Status' },
];

const BILL_FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: cap(s) })), { value: 'overdue', label: 'Overdue' }] },
];

export default function BillsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'financial');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const prefs = useListPrefs('snrpmo.bills.cols', COLS, { entity: 'bills', orgId: org?.id, canManage: ['owner', 'admin'].includes(org?.member_role || '') });
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';

  const load = () => { if (!org) return; listBills(org.id).then(setBills).catch((e) => { setErr(e.message); setBills([]); }); };
  useEffect(() => { if (org?.id && enabled) load(); /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const shown = useMemo(() =>
    (bills || []).filter((b) => {
      const eff = isOverdue(b) ? 'overdue' : b.status;
      return (statusF === 'all' || eff === statusF || b.status === statusF) &&
        (!q.trim() || `${b.bill_number || ''} ${b.vendor_name || ''}`.toLowerCase().includes(q.toLowerCase()));
    }),
    [bills, q, statusF]
  );

  const rs = useRowSelection(shown);

  const kpis = useMemo(() => {
    const v = bills || [];
    return {
      payable: v.filter((b) => !['void', 'draft'].includes(b.status)).reduce((t, b) => t + (Number(b.total) - Number(b.amount_paid)), 0),
      paid: v.reduce((t, b) => t + Number(b.amount_paid), 0),
      overdue: v.filter(isOverdue).length,
      draft: v.filter((b) => b.status === 'draft').length,
    };
  }, [bills]);

  const cell = (id: string, b: Bill) => {
    switch (id) {
      case 'bill_number': return <span className="font-medium text-content">{b.bill_number}</span>;
      case 'vendor': return b.vendor_name || '—';
      case 'bill_date': return b.bill_date || '—';
      case 'due_date': return <span className={isOverdue(b) ? 'text-rose-600' : 'text-muted'}>{b.due_date || '—'}</span>;
      case 'total': return <span className="tabular-nums">{fmtMoney(b.total, b.currency)}</span>;
      case 'balance': return <span className="tabular-nums">{fmtMoney(Number(b.total) - Number(b.amount_paid), b.currency)}</span>;
      case 'status': { const eff = isOverdue(b) ? 'overdue' : b.status; return <span className={`pill ${STATUS_PILL[eff] || 'pill-gray'}`}>{eff}</span>; }
      default: return '—';
    }
  };

  const exportValue = (id: string, b: Bill) => {
    switch (id) {
      case 'bill_number': return b.bill_number || '';
      case 'vendor': return b.vendor_name || '';
      case 'bill_date': return b.bill_date || '';
      case 'due_date': return b.due_date || '';
      case 'total': return fmtMoney(b.total, b.currency);
      case 'balance': return fmtMoney(Number(b.total) - Number(b.amount_paid), b.currency);
      case 'status': return isOverdue(b) ? 'overdue' : b.status;
      default: return '';
    }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} bill${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const b of rs.selected) await deleteBill(b.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const newBill = async () => {
    if (!org || !me || busy) return; setBusy(true); setErr('');
    const num = 'BILL-' + String((bills?.length || 0) + 1).padStart(4, '0');
    try { const b = await createBill({ org_id: org.id, bill_number: num, status: 'draft', bill_date: new Date().toISOString().slice(0, 10), created_by: me.id }); load(); setDetailId(b.id); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return <Layout flat title="Bills"><EmptyState icon="ti-file-dollar" title="Purchases not in your plan" text="Upgrade to record bills and track what you owe." /></Layout>;

  return (
    <Layout flat title="Bills / Purchases">
      <PageHeader title="Bills / Purchases" subtitle="Record vendor bills and track accounts payable" icon="ti-file-dollar"
        action={<button className="btn btn-primary" disabled={busy} onClick={newBill}><Icon name="ti-plus" />New bill</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Payable" value={fmtMoney(kpis.payable)} icon="ti-cash" hintTone={kpis.payable > 0 ? 'down' : 'muted'} />
        <StatCard label="Paid" value={fmtMoney(kpis.paid)} icon="ti-check" hintTone="up" />
        <StatCard label="Overdue" value={String(kpis.overdue)} icon="ti-alert-triangle" hintTone={kpis.overdue ? 'down' : 'muted'} />
        <StatCard label="Drafts" value={String(kpis.draft)} icon="ti-file-pencil" />
      </div>

      <ListView
        rows={bills === null ? null : shown}
        rowKey={(b) => b.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={BILL_FILTERS}
        searchPlaceholder="Search bills…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(b) => isOverdue(b) ? 'overdue' : b.status}
        groups={GROUPS}
        onRowClick={(b) => setDetailId(b.id)}
        exportName="bills"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        busy={busy}
        emptyIcon="ti-file-dollar"
        emptyText="No bills yet."
      />

      {detailId && <BillDetail id={detailId} orgId={org?.id} me={me?.id} onClose={() => { setDetailId(null); load(); }} onDeleted={() => { setDetailId(null); load(); }} />}
    </Layout>
  );
}

function BillDetail({ id, orgId, me, onClose, onDeleted }: { id: string; orgId?: string; me?: string; onClose: () => void; onDeleted: () => void }) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [lines, setLines] = useState<BillLine[]>([]);
  const [pays, setPays] = useState<BillPayment[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [hdr, setHdr] = useState<Partial<Bill>>({});
  const [line, setLine] = useState<{ description: string; qty: number; unit_price: number; product_id: string }>({ description: '', qty: 1, unit_price: 0, product_id: '' });
  const [prods, setProds] = useState<Product[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [pay, setPay] = useState<{ amount: number; paid_on: string; method: string; reference: string; bank_account_id: string }>({ amount: 0, paid_on: new Date().toISOString().slice(0, 10), method: '', reference: '', bank_account_id: '' });

  const reload = async () => { const b = await getBill(id); setBill(b); if (b) setHdr(b); setLines(await listBillLines(id)); setPays(await listBillPayments(id)); };
  useEffect(() => { reload().catch((e) => setErr(e.message)); if (orgId) { products(orgId).then(setProds).catch(() => {}); listBankAccounts(orgId).then(setBanks).catch(() => {}); getProjects().then((ps: any) => setProjects(ps)).catch(() => {}); } /* eslint-disable-next-line */ }, [id]);

  const saveHdr = async () => { setBusy(true); setErr(''); try { await updateBill(id, { vendor_name: hdr.vendor_name || null, vendor_email: hdr.vendor_email || null, bill_date: hdr.bill_date || undefined, due_date: hdr.due_date || null, currency: hdr.currency || 'USD', tax_rate: Number(hdr.tax_rate) || 0, status: hdr.status, notes: hdr.notes || null, project_id: hdr.project_id || null }); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const addLn = async () => { if (!orgId || !me || !line.description.trim()) return; setBusy(true); try { await addBillLine({ org_id: orgId, bill_id: id, description: line.description.trim(), qty: Number(line.qty) || 0, unit_price: Number(line.unit_price) || 0, created_by: me, product_id: line.product_id || null }); setLine({ description: '', qty: 1, unit_price: 0, product_id: '' }); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const delLn = async (lid: string) => { setBusy(true); try { await deleteBillLine(lid); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const addPay = async () => { if (!orgId || !me || !pay.amount) return; setBusy(true); try { await addBillPayment({ org_id: orgId, bill_id: id, amount: Number(pay.amount), paid_on: pay.paid_on, method: pay.method || undefined, reference: pay.reference || undefined, created_by: me, bank_account_id: pay.bank_account_id || null }); setPay({ amount: 0, paid_on: new Date().toISOString().slice(0, 10), method: '', reference: '', bank_account_id: '' }); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const delPay = async (pid: string) => { setBusy(true); try { await deleteBillPayment(pid); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const removeBill = async () => { if (!confirm('Delete this bill?')) return; try { await deleteBill(id); onDeleted(); } catch (e: any) { setErr(e.message); } };

  const cur = bill?.currency || 'USD';
  const balance = bill ? Number(bill.total) - Number(bill.amount_paid) : 0;

  return (
    <Modal open onClose={onClose} size="lg" icon="ti-file-dollar" title={bill?.bill_number || 'Bill'} subtitle={bill ? `${fmtMoney(bill.total, cur)} · ${bill.status}` : undefined}
      footer={<><button className="btn btn-danger mr-auto" onClick={removeBill}><Icon name="ti-trash" />Delete</button><button className="btn btn-primary" onClick={saveHdr} disabled={busy}>Save</button></>}>
      {!bill ? null : <>
        {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Vendor"><input className="input" value={hdr.vendor_name || ''} onChange={(e) => setHdr({ ...hdr, vendor_name: e.target.value })} /></Field>
          <Field label="Vendor email"><input className="input" value={hdr.vendor_email || ''} onChange={(e) => setHdr({ ...hdr, vendor_email: e.target.value })} /></Field>
          <Field label="Bill date"><input className="input" type="date" value={hdr.bill_date || ''} onChange={(e) => setHdr({ ...hdr, bill_date: e.target.value })} /></Field>
          <Field label="Due date"><input className="input" type="date" value={hdr.due_date || ''} onChange={(e) => setHdr({ ...hdr, due_date: e.target.value })} /></Field>
          <Field label="Currency"><input className="input" value={hdr.currency || 'USD'} onChange={(e) => setHdr({ ...hdr, currency: e.target.value })} /></Field>
          <Field label="Tax rate %"><input className="input" type="number" value={hdr.tax_rate ?? 0} onChange={(e) => setHdr({ ...hdr, tax_rate: Number(e.target.value) })} /></Field>
          <Field label="Status"><Select value={hdr.status || 'draft'} onChange={(v) => setHdr({ ...hdr, status: v })} options={STATUSES.map((s) => ({ value: s, label: cap(s) }))} /></Field>
          <Field label="Project"><Select value={hdr.project_id || ''} onChange={(v) => setHdr({ ...hdr, project_id: v || null })} options={[{ value: '', label: 'No project' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} search /></Field>
          <Field label="Notes"><input className="input" value={hdr.notes || ''} onChange={(e) => setHdr({ ...hdr, notes: e.target.value })} /></Field>
        </div>

        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Line items</p>
          {lines.map((l) => (
            <div key={l.id} className="group flex items-center gap-2 text-sm py-1">
              <span className="flex-1 truncate">{l.description}</span>
              <span className="text-2xs text-muted2 tabular-nums">{l.qty} × {fmtMoney(l.unit_price, cur)}</span>
              <span className="tabular-nums font-medium w-24 text-right">{fmtMoney(l.amount, cur)}</span>
              <button onClick={() => delLn(l.id)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500"><Icon name="ti-x" className="text-sm" /></button>
            </div>
          ))}
          <div className="flex items-end gap-1.5 mt-2">
            {prods.length > 0 && <div className="w-40"><Select value={line.product_id} onChange={(v) => { const p = prods.find((x) => x.id === v); setLine({ ...line, product_id: v, description: p ? p.name : line.description, unit_price: p ? Number(p.unit_price) : line.unit_price }); }} options={[{ value: '', label: '— item —' }, ...prods.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name }))]} search /></div>}
            <input className="input h-8 text-xs flex-1" placeholder="Description" value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} />
            <input className="input h-8 text-xs w-16" type="number" placeholder="Qty" value={line.qty} onChange={(e) => setLine({ ...line, qty: Number(e.target.value) })} />
            <input className="input h-8 text-xs w-24" type="number" placeholder="Price" value={line.unit_price} onChange={(e) => setLine({ ...line, unit_price: Number(e.target.value) })} />
            <button className="btn h-8 px-2 text-xs" disabled={busy || !line.description.trim()} onClick={addLn}><Icon name="ti-plus" /></button>
          </div>
          <div className="mt-3 ml-auto w-48 text-sm space-y-1">
            <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular-nums">{fmtMoney(bill.subtotal, cur)}</span></div>
            <div className="flex justify-between text-muted"><span>Tax ({bill.tax_rate}%)</span><span className="tabular-nums">{fmtMoney(bill.tax, cur)}</span></div>
            <div className="flex justify-between font-semibold border-t border-line pt-1"><span>Total</span><span className="tabular-nums">{fmtMoney(bill.total, cur)}</span></div>
            <div className="flex justify-between text-emerald-600"><span>Paid</span><span className="tabular-nums">{fmtMoney(bill.amount_paid, cur)}</span></div>
            <div className="flex justify-between font-medium"><span>Balance</span><span className="tabular-nums">{fmtMoney(balance, cur)}</span></div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Payments</p>
          {pays.map((p) => (
            <div key={p.id} className="group flex items-center gap-2 text-sm py-1">
              <span className="text-2xs text-muted2 w-24 tabular-nums">{p.paid_on}</span>
              <span className="tabular-nums font-medium">{fmtMoney(p.amount, cur)}</span>
              <span className="text-2xs text-muted truncate flex-1">{[p.method, p.reference].filter(Boolean).join(' · ')}</span>
              <button onClick={() => delPay(p.id)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500"><Icon name="ti-x" className="text-sm" /></button>
            </div>
          ))}
          <div className="flex items-end gap-1.5 mt-2">
            {banks.length > 0 && <div className="w-32"><Select value={pay.bank_account_id} onChange={(v) => setPay({ ...pay, bank_account_id: v })} options={[{ value: '', label: 'Bank…' }, ...banks.map((b) => ({ value: b.id, label: b.label }))]} /></div>}
            <input className="input h-8 text-xs w-28" type="date" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} />
            <input className="input h-8 text-xs w-24" type="number" placeholder="Amount" value={pay.amount || ''} onChange={(e) => setPay({ ...pay, amount: Number(e.target.value) })} />
            <input className="input h-8 text-xs flex-1" placeholder="Method / ref" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} />
            <button className="btn h-8 px-2 text-xs" disabled={busy || !pay.amount} onClick={addPay}><Icon name="ti-plus" /></button>
          </div>
        </div>
      </>}
    </Modal>
  );
}

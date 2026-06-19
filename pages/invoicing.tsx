import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import Select from '@/components/Select';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import Attachments from '@/components/Attachments';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listInvoices, createInvoice, updateInvoice, deleteInvoice, getInvoice,
  listInvoiceLines, addInvoiceLine, deleteInvoiceLine, listPayments, addPayment, deletePayment,
  Invoice, InvoiceLine, Payment, products, Product, listBankAccounts, BankAccount, getProjects,
} from '@/lib/db';

const STATUS_PILL: Record<string, string> = { draft: 'pill-gray', sent: 'pill-blue', partial: 'pill-amber', paid: 'pill-green', overdue: 'pill-red', void: 'pill-gray' };
const STATUSES = ['draft', 'sent', 'partial', 'paid', 'overdue', 'void'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtMoney = (n: number, c = 'USD') => `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isOverdue = (i: Invoice) => i.due_date && new Date(i.due_date) < new Date() && !['paid', 'void'].includes(i.status);

export default function InvoicingPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'financial');
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [q, setQ] = useState(''); const [statusF, setStatusF] = useState('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  const load = () => { if (!org) return; listInvoices(org.id).then(setInvoices).catch((e) => { setErr(e.message); setInvoices([]); }); };
  useEffect(() => { if (org?.id && enabled) load(); /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const shown = useMemo(() => (invoices || []).filter((i) => (statusF === 'all' || i.status === statusF) && (!q.trim() || `${i.invoice_number} ${i.client_name || ''}`.toLowerCase().includes(q.toLowerCase()))), [invoices, q, statusF]);
  const kpis = useMemo(() => {
    const v = invoices || [];
    return {
      outstanding: v.filter((i) => !['void', 'draft'].includes(i.status)).reduce((t, i) => t + (Number(i.total) - Number(i.amount_paid)), 0),
      paid: v.reduce((t, i) => t + Number(i.amount_paid), 0),
      overdue: v.filter(isOverdue).length,
      draft: v.filter((i) => i.status === 'draft').length,
    };
  }, [invoices]);

  const newInvoice = async () => {
    if (!org || !me || busy) return; setBusy(true); setErr('');
    const num = 'INV-' + String((invoices?.length || 0) + 1).padStart(4, '0');
    try { const inv = await createInvoice({ org_id: org.id, invoice_number: num, status: 'draft', issue_date: new Date().toISOString().slice(0, 10), created_by: me.id }); load(); setDetailId(inv.id); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return <Layout flat title="Invoicing"><EmptyState icon="ti-file-invoice" title="Invoicing not in your plan" text="Upgrade to create and track invoices." /></Layout>;

  return (
    <Layout flat title="Invoicing">
      <PageHeader help="tracking" title="Invoicing" subtitle="Create invoices, track payments and balances" icon="ti-file-invoice"
        action={<button className="btn btn-primary" disabled={busy} onClick={newInvoice}><Icon name="ti-plus" />New invoice</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Outstanding" value={fmtMoney(kpis.outstanding)} icon="ti-cash" hintTone={kpis.outstanding > 0 ? 'down' : 'muted'} />
        <StatCard label="Collected" value={fmtMoney(kpis.paid)} icon="ti-check" hintTone="up" />
        <StatCard label="Overdue" value={String(kpis.overdue)} icon="ti-alert-triangle" hintTone={kpis.overdue ? 'down' : 'muted'} />
        <StatCard label="Drafts" value={String(kpis.draft)} icon="ti-file-pencil" />
      </div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input className="input h-9 w-56" placeholder="Search invoices…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="w-40"><Select value={statusF} onChange={setStatusF} options={[{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: cap(s) }))]} /></div>
      </div>
      <div className="card overflow-hidden">
        {invoices === null ? <div className="p-8"><Spinner /></div> : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-file-invoice" text="No invoices yet." /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
              <tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Issued</th><th className="px-4 py-3">Due</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className="border-t border-line hover:bg-surface2/50 cursor-pointer" onClick={() => setDetailId(i.id)}>
                  <td className="px-4 py-3 font-medium text-content">{i.invoice_number}</td>
                  <td className="px-4 py-3 text-muted">{i.client_name || '—'}</td>
                  <td className="px-4 py-3 text-2xs text-muted">{i.issue_date || '—'}</td>
                  <td className="px-4 py-3 text-2xs"><span className={isOverdue(i) ? 'text-rose-600' : 'text-muted'}>{i.due_date || '—'}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(i.total, i.currency)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(Number(i.total) - Number(i.amount_paid), i.currency)}</td>
                  <td className="px-4 py-3"><span className={`pill ${STATUS_PILL[isOverdue(i) ? 'overdue' : i.status] || 'pill-gray'}`}>{isOverdue(i) ? 'overdue' : i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {detailId && <InvoiceDetail id={detailId} orgId={org?.id} me={me?.id} onClose={() => { setDetailId(null); load(); }} onDeleted={() => { setDetailId(null); load(); }} />}
    </Layout>
  );
}

function InvoiceDetail({ id, orgId, me, onClose, onDeleted }: { id: string; orgId?: string; me?: string; onClose: () => void; onDeleted: () => void }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [pays, setPays] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [hdr, setHdr] = useState<Partial<Invoice>>({});
  const [line, setLine] = useState<{ description: string; qty: number; unit_price: number; product_id: string }>({ description: '', qty: 1, unit_price: 0, product_id: '' });
  const [prods, setProds] = useState<Product[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [pay, setPay] = useState<{ amount: number; paid_on: string; method: string; reference: string; bank_account_id: string }>({ amount: 0, paid_on: new Date().toISOString().slice(0, 10), method: '', reference: '', bank_account_id: '' });

  const reload = async () => { const i = await getInvoice(id); setInv(i); if (i) setHdr(i); setLines(await listInvoiceLines(id)); setPays(await listPayments(id)); };
  useEffect(() => { reload().catch((e) => setErr(e.message)); if (orgId) { products(orgId).then(setProds).catch(() => {}); listBankAccounts(orgId).then(setBanks).catch(() => {}); getProjects().then((ps: any) => setProjects(ps)).catch(() => {}); } /* eslint-disable-next-line */ }, [id]);

  const saveHdr = async () => { setBusy(true); setErr(''); try { await updateInvoice(id, { client_name: hdr.client_name || null, client_email: hdr.client_email || null, issue_date: hdr.issue_date || null, due_date: hdr.due_date || null, currency: hdr.currency || 'USD', tax_rate: Number(hdr.tax_rate) || 0, status: hdr.status, notes: hdr.notes || null, project_id: hdr.project_id || null }); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const addLn = async () => { if (!orgId || !me || !line.description.trim()) return; setBusy(true); try { await addInvoiceLine({ org_id: orgId, invoice_id: id, description: line.description.trim(), qty: Number(line.qty) || 0, unit_price: Number(line.unit_price) || 0, created_by: me, product_id: line.product_id || null }); setLine({ description: '', qty: 1, unit_price: 0, product_id: '' }); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const delLn = async (lid: string) => { setBusy(true); try { await deleteInvoiceLine(lid); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const addPay = async () => { if (!orgId || !me || !pay.amount) return; setBusy(true); try { await addPayment({ org_id: orgId, invoice_id: id, amount: Number(pay.amount), paid_on: pay.paid_on, method: pay.method || undefined, reference: pay.reference || undefined, created_by: me, bank_account_id: pay.bank_account_id || null }); setPay({ amount: 0, paid_on: new Date().toISOString().slice(0, 10), method: '', reference: '', bank_account_id: '' }); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const delPay = async (pid: string) => { setBusy(true); try { await deletePayment(pid); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

  const cur = inv?.currency || 'USD';
  const balance = inv ? Number(inv.total) - Number(inv.amount_paid) : 0;

  return (
    <Modal open onClose={onClose} size="lg" icon="ti-file-invoice" title={inv?.invoice_number || 'Invoice'} subtitle={inv ? `${fmtMoney(inv.total, cur)} · ${inv.status}` : undefined}
      footer={<><ConfirmDelete entityType="invoice" id={id} name={inv?.invoice_number} className="btn btn-danger mr-auto" onDeleted={onDeleted} /><button className="btn" onClick={() => window.print()}><Icon name="ti-printer" />Print</button><button className="btn btn-primary" onClick={saveHdr} disabled={busy}>Save</button></>}>
      {!inv ? <Spinner /> : <>
        {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Client"><input className="input" value={hdr.client_name || ''} onChange={(e) => setHdr({ ...hdr, client_name: e.target.value })} /></Field>
          <Field label="Client email"><input className="input" value={hdr.client_email || ''} onChange={(e) => setHdr({ ...hdr, client_email: e.target.value })} /></Field>
          <Field label="Issue date"><input className="input" type="date" value={hdr.issue_date || ''} onChange={(e) => setHdr({ ...hdr, issue_date: e.target.value })} /></Field>
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
            <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular-nums">{fmtMoney(inv.subtotal, cur)}</span></div>
            <div className="flex justify-between text-muted"><span>Tax ({inv.tax_rate}%)</span><span className="tabular-nums">{fmtMoney(inv.tax, cur)}</span></div>
            <div className="flex justify-between font-semibold border-t border-line pt-1"><span>Total</span><span className="tabular-nums">{fmtMoney(inv.total, cur)}</span></div>
            <div className="flex justify-between text-emerald-600"><span>Paid</span><span className="tabular-nums">{fmtMoney(inv.amount_paid, cur)}</span></div>
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

        <div className="mt-4 pt-3 border-t border-line">
          <Attachments entityType="invoice" entityId={id} orgId={orgId} currentUserId={me} />
        </div>
      </>}
    </Modal>
  );
}

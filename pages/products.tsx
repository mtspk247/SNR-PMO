import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg } from '@/lib/store';
import { products, productSave, productDelete, glAccounts, Product, CoaAccount } from '@/lib/db';

const TYPES = [{ value: 'service', label: 'Service' }, { value: 'product', label: 'Product' }, { value: 'subscription', label: 'Subscription' }];
const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Draft = { id?: string; sku: string; name: string; description: string; type: string; unit_price: string; currency: string; income_account_id: string; expense_account_id: string; tax_rate: string; track_inventory: boolean; is_active: boolean };

export default function ProductsPage() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const [rows, setRows] = useState<Product[]>([]);
  const [accts, setAccts] = useState<CoaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = () => orgId ? products(orgId).then(setRows).catch((e) => setErr(e.message)) : Promise.resolve();
  useEffect(() => { if (!orgId) return; setLoading(true); Promise.all([products(orgId).then(setRows), glAccounts(orgId).then(setAccts).catch(() => {})]).catch((e) => setErr(e.message)).finally(() => setLoading(false)); }, [orgId]);

  const incomeAccts = useMemo(() => accts.filter((a) => a.type === 'income' && a.is_active).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })), [accts]);
  const expenseAccts = useMemo(() => accts.filter((a) => (a.type === 'expense') && a.is_active).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })), [accts]);

  const openNew = () => setDraft({ sku: '', name: '', description: '', type: 'service', unit_price: '', currency: 'USD', income_account_id: incomeAccts[0]?.value || '', expense_account_id: '', tax_rate: '', track_inventory: false, is_active: true });
  const openEdit = (p: Product) => setDraft({ id: p.id, sku: p.sku || '', name: p.name, description: p.description || '', type: p.type, unit_price: String(p.unit_price), currency: p.currency, income_account_id: p.income_account_id || '', expense_account_id: p.expense_account_id || '', tax_rate: p.tax_rate ? String(p.tax_rate * 100) : '', track_inventory: p.track_inventory, is_active: p.is_active });
  const save = async () => {
    if (!orgId || !draft || busy) return; setBusy(true); setErr('');
    try {
      await productSave(orgId, { id: draft.id, sku: draft.sku || null, name: draft.name, description: draft.description || null, type: draft.type, unit_price: parseFloat(draft.unit_price) || 0, currency: draft.currency, income_account_id: draft.income_account_id || null, expense_account_id: draft.expense_account_id || null, tax_rate: draft.tax_rate ? (parseFloat(draft.tax_rate) || 0) / 100 : 0, track_inventory: draft.track_inventory, is_active: draft.is_active });
      setDraft(null); await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const del = async (p: Product) => { if (!orgId || !confirm(`Delete "${p.name}"? It will be archived if already used on a document.`)) return; try { await productDelete(orgId, p.id); await load(); } catch (e: any) { setErr(e.message); } };
  const acctName = (id: string | null) => { const a = accts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : '—'; };

  if (!org) return <Layout flat title="Products & Services"><Spinner /></Layout>;

  return (
    <Layout flat title="Products & Services">
      <PageHeader title="Products & Services" subtitle="Item catalog with default accounts, pricing and tax — reused on invoices, bills and subscriptions" icon="ti-box"
        action={<button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New item</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon="ti-box" text="No products or services yet." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm list-card">
            <thead><tr><th className="px-4 py-2 text-left">Item</th><th className="px-4 py-2 text-left">Type</th><th className="px-4 py-2 text-right">Price</th><th className="px-4 py-2 text-right">Tax</th><th className="px-4 py-2 text-left">Income acct</th><th className="px-4 py-2 text-left">Expense acct</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={p.is_active ? '' : 'opacity-50'}>
                  <td className="px-4 py-2 text-content">{p.sku && <span className="font-mono text-2xs text-muted2 mr-2">{p.sku}</span>}{p.name}{p.track_inventory && <span className="pill pill-gray ml-2">stock {money(Number(p.stock_qty))}</span>}{!p.is_active && <span className="pill pill-gray ml-2">archived</span>}</td>
                  <td className="px-4 py-2"><span className="pill pill-gray capitalize">{p.type}</span></td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(Number(p.unit_price))}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{p.tax_rate ? `${(p.tax_rate * 100).toFixed(1)}%` : '—'}</td>
                  <td className="px-4 py-2 text-2xs text-muted2">{acctName(p.income_account_id)}</td>
                  <td className="px-4 py-2 text-2xs text-muted2">{acctName(p.expense_account_id)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap"><button className="btn-ghost text-2xs" onClick={() => openEdit(p)}><Icon name="ti-pencil" /></button><button className="btn-ghost text-2xs text-rose-600 ml-1" onClick={() => del(p)}><Icon name="ti-trash" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} size="md" icon="ti-box" title={draft?.id ? 'Edit item' : 'New item'}
        footer={<><button className="btn" onClick={() => setDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !draft?.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save item'}</button></>}>
        {draft && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required className="col-span-2"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Consulting hour" /></Field>
            <Field label="SKU / code"><input className="input font-mono" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} placeholder="SVC-001" /></Field>
            <Field label="Type"><Select value={draft.type} onChange={(v) => setDraft({ ...draft, type: v })} options={TYPES} /></Field>
            <Field label="Unit price"><input className="input text-right" inputMode="decimal" value={draft.unit_price} onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })} placeholder="0.00" /></Field>
            <Field label="Tax rate %"><input className="input text-right" inputMode="decimal" value={draft.tax_rate} onChange={(e) => setDraft({ ...draft, tax_rate: e.target.value })} placeholder="0" /></Field>
            <Field label="Income account" hint="Used when sold"><Select value={draft.income_account_id} onChange={(v) => setDraft({ ...draft, income_account_id: v })} options={[{ value: '', label: 'Default revenue' }, ...incomeAccts]} search /></Field>
            <Field label="Expense / COGS account" hint="Used when purchased"><Select value={draft.expense_account_id} onChange={(v) => setDraft({ ...draft, expense_account_id: v })} options={[{ value: '', label: 'Default expense' }, ...expenseAccts]} search /></Field>
            <Field label="Description" className="col-span-2"><input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Optional" /></Field>
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={draft.track_inventory} onChange={(e) => setDraft({ ...draft, track_inventory: e.target.checked })} />Track inventory</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />Active</label>
          </div>
        )}
      </Modal>
    </Layout>
  );
}

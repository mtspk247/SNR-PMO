import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { products, productSave, productDelete, glAccounts, Product, CoaAccount } from '@/lib/db';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta, EditSpec } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const TYPES = [{ value: 'service', label: 'Service' }, { value: 'product', label: 'Product' }, { value: 'subscription', label: 'Subscription' }];
const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Draft = { id?: string; sku: string; name: string; description: string; type: string; unit_price: string; currency: string; income_account_id: string; expense_account_id: string; tax_rate: string; track_inventory: boolean; is_active: boolean };

const TYPE_PILL: Record<string, string> = {
  service: 'pill-blue',
  product: 'pill-green',
  subscription: 'pill-amber',
};

const GROUPS: GroupMeta[] = TYPES.map((t) => ({ value: t.value, label: t.label, pill: TYPE_PILL[t.value] || 'pill-gray' }));

const COLS: ColDef[] = [
  { id: 'name', label: 'Item', locked: true },
  { id: 'type', label: 'Type' },
  { id: 'unit_price', label: 'Price' },
  { id: 'tax_rate', label: 'Tax' },
  { id: 'income_account', label: 'Income acct' },
  { id: 'expense_account', label: 'Expense acct' },
];

const PRODUCT_FILTERS: FilterDef[] = [
  { id: 'type', label: 'Type', options: [{ value: 'all', label: 'All types' }, { value: 'service', label: 'Service' }, { value: 'product', label: 'Product' }, { value: 'subscription', label: 'Subscription' }] },
  { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }] },
];

export default function ProductsPage() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [rows, setRows] = useState<Product[] | null>(null);
  const [accts, setAccts] = useState<CoaAccount[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const prefs = useListPrefs('snrpmo.products.cols', COLS);
  const q = prefs.query;
  const typeF = prefs.filters.type || 'all';
  const statusF = prefs.filters.status || 'all';

  const load = () => {
    if (!orgId) return;
    products(orgId).then(setRows).catch((e) => { setErr(e.message); setRows([]); });
  };

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      products(orgId).then(setRows),
      glAccounts(orgId).then(setAccts).catch(() => {}),
    ]).catch((e) => setErr(e.message));
  }, [orgId]);

  const incomeAccts = useMemo(() => accts.filter((a) => a.type === 'income' && a.is_active).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })), [accts]);
  const expenseAccts = useMemo(() => accts.filter((a) => a.type === 'expense' && a.is_active).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })), [accts]);
  const acctName = (id: string | null) => { const a = accts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : '—'; };

  const shown = useMemo(() =>
    (rows || []).filter((p) =>
      (typeF === 'all' || p.type === typeF) &&
      (statusF === 'all' || (statusF === 'active' ? p.is_active : !p.is_active)) &&
      (!q.trim() || `${p.name} ${p.sku || ''} ${p.description || ''}`.toLowerCase().includes(q.toLowerCase()))
    ),
    [rows, q, typeF, statusF]
  );

  const rs = useRowSelection(shown);

  const cell = (id: string, p: Product) => {
    switch (id) {
      case 'name': return (
        <span className="font-medium text-content">
          {p.sku && <span className="font-mono text-2xs text-muted2 mr-2">{p.sku}</span>}
          {p.name}
          {p.track_inventory && <span className="pill pill-gray ml-2">stock {money(Number(p.stock_qty))}</span>}
          {!p.is_active && <span className="pill pill-gray ml-2">archived</span>}
        </span>
      );
      case 'type': return <span className={`pill ${TYPE_PILL[p.type] || 'pill-gray'} capitalize`}>{p.type}</span>;
      case 'unit_price': return <span className="tabular-nums">{money(Number(p.unit_price))}</span>;
      case 'tax_rate': return <span className="tabular-nums text-muted">{p.tax_rate ? `${(Number(p.tax_rate) * 100).toFixed(1)}%` : '—'}</span>;
      case 'income_account': return <span className="text-2xs text-muted2">{acctName(p.income_account_id)}</span>;
      case 'expense_account': return <span className="text-2xs text-muted2">{acctName(p.expense_account_id)}</span>;
      default: return '—';
    }
  };

  const exportValue = (id: string, p: Product) => {
    switch (id) {
      case 'name': return p.name;
      case 'type': return p.type;
      case 'unit_price': return money(Number(p.unit_price));
      case 'tax_rate': return p.tax_rate ? `${(Number(p.tax_rate) * 100).toFixed(1)}%` : '';
      case 'income_account': return acctName(p.income_account_id);
      case 'expense_account': return acctName(p.expense_account_id);
      default: return '';
    }
  };

  const editable: Record<string, EditSpec> = {
    name: { type: 'text' },
    unit_price: { type: 'number' },
    type: { type: 'select', options: TYPES },
  };

  const rawValue = (id: string, p: Product) => {
    switch (id) {
      case 'name': return p.name;
      case 'unit_price': return String(p.unit_price);
      case 'type': return p.type;
      default: return '';
    }
  };

  const onInlineEdit = async (p: Product, id: string, value: string) => {
    const patch: Record<string, unknown> =
      id === 'unit_price' ? { unit_price: parseFloat(value) || 0 } : { [id]: value || null };
    try {
      await productSave(orgId!, { ...p, ...patch } as any);
      load();
    } catch (e: any) { setErr(e.message); }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} item${rs.count > 1 ? 's' : ''}? Items already used on documents will be archived instead.`)) return;
    setBusy(true); setErr('');
    try { for (const p of rs.selected) await productDelete(orgId!, p.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const openNew = () => setDraft({ sku: '', name: '', description: '', type: 'service', unit_price: '', currency: 'USD', income_account_id: incomeAccts[0]?.value || '', expense_account_id: '', tax_rate: '', track_inventory: false, is_active: true });
  const openEdit = (p: Product) => setDraft({ id: p.id, sku: p.sku || '', name: p.name, description: p.description || '', type: p.type, unit_price: String(p.unit_price), currency: p.currency, income_account_id: p.income_account_id || '', expense_account_id: p.expense_account_id || '', tax_rate: p.tax_rate ? String(Number(p.tax_rate) * 100) : '', track_inventory: p.track_inventory, is_active: p.is_active });

  const save = async () => {
    if (!orgId || !draft || busy) return; setBusy(true); setErr('');
    try {
      await productSave(orgId, { id: draft.id, sku: draft.sku || null, name: draft.name, description: draft.description || null, type: draft.type, unit_price: parseFloat(draft.unit_price) || 0, currency: draft.currency, income_account_id: draft.income_account_id || null, expense_account_id: draft.expense_account_id || null, tax_rate: draft.tax_rate ? (parseFloat(draft.tax_rate) || 0) / 100 : 0, track_inventory: draft.track_inventory, is_active: draft.is_active });
      setDraft(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Layout flat title="Products & Services">
      <PageHeader
        title="Products & Services"
        subtitle="Item catalog with default accounts, pricing and tax — reused on invoices, bills and subscriptions"
        icon="ti-box"
        action={<button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New item</button>}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <ListView
        rows={rows === null ? null : shown}
        rowKey={(p) => p.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={PRODUCT_FILTERS}
        searchPlaceholder="Search products…"
        groupField={{ value: 'type', label: 'Type' }}
        groupOf={(p) => p.type}
        groups={GROUPS}
        editable={editable}
        rawValue={rawValue}
        onEdit={onInlineEdit}
        onRowClick={(p) => openEdit(p)}
        exportName="products"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        busy={busy}
        emptyIcon="ti-box"
        emptyText="No products or services yet."
      />

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

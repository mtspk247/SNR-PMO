import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg } from '@/lib/store';
import { inventoryValue, inventoryAdjust, inventoryMoves, InventoryValueRow, InventoryMove } from '@/lib/db';
import { useListPrefs, ColDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { ListView } from '@/components/ListView';

const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
type Adj = { product: InventoryValueRow; qty: string; unit_cost: string; reason: string; date: string };

const COLS: ColDef[] = [
  { id: 'name',     label: 'Item',     locked: true },
  { id: 'stock',    label: 'On hand' },
  { id: 'avg_cost', label: 'Avg cost' },
  { id: 'value',    label: 'Value' },
  { id: 'adjust',   label: '',         locked: true },
];

export default function InventoryPage() {
  const org = useActiveOrg();
  const orgId = org?.id;
  // null = loading, array = loaded (ListView null→skeleton, array→rows)
  const [rows, setRows] = useState<InventoryValueRow[] | null>(null);
  const [moves, setMoves] = useState<InventoryMove[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [adj, setAdj] = useState<Adj | null>(null);

  const load = () => {
    if (!orgId) return;
    inventoryValue(orgId).then(setRows).catch((e) => { setErr(e.message); setRows([]); });
    inventoryMoves(orgId).then(setMoves).catch(() => {});
  };
  useEffect(() => {
    if (!orgId) return;
    setRows(null);
    Promise.all([
      inventoryValue(orgId).then(setRows),
      inventoryMoves(orgId).then(setMoves).catch(() => {}),
    ]).catch((e) => { setErr(e.message); setRows([]); });
    // eslint-disable-next-line
  }, [orgId]);

  const totalValue = useMemo(() => (rows || []).reduce((s, r) => s + Number(r.value), 0), [rows]);
  const lowStock   = useMemo(() => (rows || []).filter((r) => Number(r.stock_qty) <= 0).length, [rows]);

  const prefs = useListPrefs('snrpmo.inventory.cols', COLS);
  const q = prefs.query;

  const shown = useMemo(() =>
    (rows || []).filter((r) =>
      !q.trim() ||
      `${r.name} ${r.sku || ''}`.toLowerCase().includes(q.toLowerCase())
    ),
    [rows, q]
  );

  const rs = useRowSelection(shown);

  const openAdj = (p: InventoryValueRow) =>
    setAdj({ product: p, qty: '', unit_cost: String(p.avg_cost || ''), reason: '', date: today() });

  const save = async () => {
    if (!orgId || !adj || busy) return;
    const q = parseFloat(adj.qty);
    if (!q) { setErr('Enter a quantity (use a negative number to remove stock)'); return; }
    setBusy(true); setErr('');
    try {
      await inventoryAdjust(orgId, adj.product.product_id, q, parseFloat(adj.unit_cost) || 0, adj.reason || 'adjustment', adj.date);
      setAdj(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const prodName = (id: string) => (rows || []).find((r) => r.product_id === id)?.name || id.slice(0, 8);

  const cell = (id: string, r: InventoryValueRow) => {
    switch (id) {
      case 'name':
        return (
          <span className="text-content">
            {r.sku && <span className="font-mono text-2xs text-muted2 mr-2">{r.sku}</span>}
            {r.name}
          </span>
        );
      case 'stock':
        return (
          <span className={`tabular-nums ${Number(r.stock_qty) <= 0 ? 'text-rose-600' : ''}`}>
            {qty(Number(r.stock_qty))}
          </span>
        );
      case 'avg_cost':
        return <span className="tabular-nums text-muted">{money(Number(r.avg_cost))}</span>;
      case 'value':
        return <span className="tabular-nums font-medium">{money(Number(r.value))}</span>;
      case 'adjust':
        return (
          <button className="btn-ghost text-2xs" onClick={(e) => { e.stopPropagation(); openAdj(r); }}>
            <Icon name="ti-adjustments" />Adjust
          </button>
        );
      default:
        return '—';
    }
  };

  const exportValue = (id: string, r: InventoryValueRow) => {
    switch (id) {
      case 'name':     return r.name;
      case 'stock':    return String(r.stock_qty);
      case 'avg_cost': return String(r.avg_cost);
      case 'value':    return String(r.value);
      default:         return '';
    }
  };

  return (
    <Layout flat title="Inventory">
      <PageHeader
        title="Inventory"
        subtitle="Stock levels and valuation (weighted-average cost). Purchases & sales of tracked items post automatically."
        icon="ti-packages"
        help="inventory"
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Tracked items"   value={String((rows || []).length)} icon="ti-packages" />
        <StatCard label="Inventory value" value={money(totalValue)}           icon="ti-cash" />
        <StatCard label="Out of stock"    value={String(lowStock)}            icon="ti-alert-triangle" hintTone={lowStock ? 'down' : 'muted'} />
      </div>

      <ListView
        rows={rows === null ? null : shown}
        rowKey={(r) => r.product_id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        searchPlaceholder="Search inventory…"
        exportName="inventory"
        exportValue={exportValue}
        onRowClick={(r) => openAdj(r)}
        emptyIcon="ti-packages"
        emptyText="No tracked items yet. Enable 'Track inventory' on a product to start."
        busy={busy}
      />

      {/* Total value summary strip shown once rows are loaded */}
      {rows !== null && rows.length > 0 && (
        <div className="flex justify-end px-4 py-2.5 text-sm font-semibold text-content border-t border-line -mt-px">
          <span className="text-muted mr-3">Total inventory value</span>
          <span className="tabular-nums">{money(totalValue)}</span>
        </div>
      )}

      {/* Stock movements log — supplementary audit table, not a managed list */}
      {moves.length > 0 && (
        <div className="card overflow-hidden mt-5">
          <div className="px-4 py-2.5 border-b border-line">
            <span className="text-sm font-semibold text-content">Recent stock movements</span>
          </div>
          <table className="w-full text-sm list-card">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Item</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Unit cost</th>
                <th className="px-4 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 text-2xs text-muted2">{m.move_date}</td>
                  <td className="px-4 py-2 text-content">{prodName(m.product_id)}</td>
                  <td className="px-4 py-2"><span className="pill pill-gray capitalize">{m.kind}</span></td>
                  <td className={`px-4 py-2 text-right tabular-nums ${Number(m.qty) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {Number(m.qty) > 0 ? '+' : ''}{qty(Number(m.qty))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{money(Number(m.unit_cost))}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(Number(m.value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!adj}
        onClose={() => setAdj(null)}
        size="sm"
        icon="ti-adjustments"
        title={adj ? `Adjust — ${adj.product.name}` : 'Adjust'}
        footer={
          <>
            <button className="btn" onClick={() => setAdj(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Apply adjustment'}
            </button>
          </>
        }
      >
        {adj && (
          <div className="space-y-3">
            <p className="text-2xs text-muted">
              On hand: <span className="text-content font-medium">{qty(Number(adj.product.stock_qty))}</span> · avg cost {money(Number(adj.product.avg_cost))}
            </p>
            <Field label="Quantity change" required hint="Positive to add stock, negative to remove">
              <input className="input text-right" inputMode="decimal" value={adj.qty} onChange={(e) => setAdj({ ...adj, qty: e.target.value })} placeholder="e.g. 5 or -2" />
            </Field>
            <Field label="Unit cost" hint="Used for additions (weighted average)">
              <input className="input text-right" inputMode="decimal" value={adj.unit_cost} onChange={(e) => setAdj({ ...adj, unit_cost: e.target.value })} placeholder="0.00" />
            </Field>
            <Field label="Date">
              <input type="date" className="input" value={adj.date} onChange={(e) => setAdj({ ...adj, date: e.target.value })} />
            </Field>
            <Field label="Reason">
              <input className="input" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} placeholder="stock count, breakage…" />
            </Field>
          </div>
        )}
      </Modal>
    </Layout>
  );
}

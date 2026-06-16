import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg } from '@/lib/store';
import { subscriptionSchedules, subscriptionSave, subscriptionDelete, subscriptionGenerateDue, subscriptionRuns, products, SubscriptionSchedule, SubscriptionRun, Product } from '@/lib/db';

const CYCLES = [{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'annual', label: 'Annual' }];
const DIRS = [{ value: 'expense', label: 'Expense — we pay (→ Bill)' }, { value: 'revenue', label: 'Revenue — we charge (→ Invoice)' }];
const STATUSES = [{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'ended', label: 'Ended' }];
const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
type Draft = { id?: string; name: string; direction: string; counterparty: string; product_id: string; amount: string; currency: string; tax_rate: string; cycle: string; start_date: string; next_run: string; end_date: string; status: string; notes: string };

export default function RecurringBillingPage() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const [rows, setRows] = useState<SubscriptionSchedule[]>([]);
  const [runs, setRuns] = useState<SubscriptionRun[]>([]);
  const [prods, setProds] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = () => { if (!orgId) return; subscriptionSchedules(orgId).then(setRows).catch((e) => setErr(e.message)); subscriptionRuns(orgId).then(setRuns).catch(() => {}); };
  useEffect(() => { if (!orgId) return; setLoading(true); Promise.all([subscriptionSchedules(orgId).then(setRows), subscriptionRuns(orgId).then(setRuns).catch(() => {}), products(orgId).then(setProds).catch(() => {})]).catch((e) => setErr(e.message)).finally(() => setLoading(false)); }, [orgId]);

  const dueCount = useMemo(() => rows.filter((r) => r.status === 'active' && r.next_run && r.next_run <= today()).length, [rows]);
  const mrr = useMemo(() => rows.filter((r) => r.status === 'active').reduce((s, r) => { const m = r.cycle === 'weekly' ? 4.33 : r.cycle === 'monthly' ? 1 : r.cycle === 'quarterly' ? 1 / 3 : 1 / 12; return s + (r.direction === 'revenue' ? 1 : -1) * Number(r.amount) * m; }, 0), [rows]);

  const openNew = () => setDraft({ name: '', direction: 'expense', counterparty: '', product_id: '', amount: '', currency: 'USD', tax_rate: '', cycle: 'monthly', start_date: today(), next_run: today(), end_date: '', status: 'active', notes: '' });
  const openEdit = (r: SubscriptionSchedule) => setDraft({ id: r.id, name: r.name, direction: r.direction, counterparty: r.counterparty || '', product_id: r.product_id || '', amount: String(r.amount), currency: r.currency, tax_rate: r.tax_rate ? String(r.tax_rate) : '', cycle: r.cycle, start_date: r.start_date, next_run: r.next_run || '', end_date: r.end_date || '', status: r.status, notes: r.notes || '' });
  const save = async () => {
    if (!orgId || !draft || busy) return; setBusy(true); setErr('');
    try { await subscriptionSave(orgId, { id: draft.id, name: draft.name, direction: draft.direction, counterparty: draft.counterparty || null, product_id: draft.product_id || null, amount: parseFloat(draft.amount) || 0, currency: draft.currency, tax_rate: parseFloat(draft.tax_rate) || 0, cycle: draft.cycle, start_date: draft.start_date || null, next_run: draft.next_run || null, end_date: draft.end_date || null, status: draft.status, notes: draft.notes || null }); setDraft(null); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const del = async (r: SubscriptionSchedule) => { if (!orgId || !confirm(`Delete subscription "${r.name}"? Already-generated invoices/bills are kept.`)) return; try { await subscriptionDelete(orgId, r.id); load(); } catch (e: any) { setErr(e.message); } };
  const generate = async () => { if (!orgId || busy) return; setBusy(true); setErr(''); setMsg(''); try { const r = await subscriptionGenerateDue(orgId); setMsg(`Generated ${r.generated} invoice/bill${r.generated === 1 ? '' : 's'} from due subscriptions.`); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

  if (!org) return <Layout flat title="Recurring Billing"><Spinner /></Layout>;

  return (
    <Layout flat title="Recurring Billing">
      <PageHeader title="Recurring Billing" subtitle="Subscriptions & recurring charges — auto-generate invoices (revenue) or bills (expense) that post to the ledger" icon="ti-refresh"
        action={<div className="flex items-center gap-2"><button onClick={generate} disabled={busy} className="btn"><Icon name="ti-player-play" />Generate due{dueCount ? ` (${dueCount})` : ''}</button><button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New subscription</button></div>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {msg && <p className="text-sm text-emerald-600 mb-3">{msg}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Active subscriptions" value={String(rows.filter((r) => r.status === 'active').length)} icon="ti-refresh" />
        <StatCard label="Due now" value={String(dueCount)} icon="ti-clock" hintTone={dueCount ? 'down' : 'muted'} />
        <StatCard label="Net monthly" value={money(mrr)} icon="ti-cash" hintTone={mrr >= 0 ? 'up' : 'down'} />
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon="ti-refresh" text="No subscriptions yet." />
      ) : (
        <div className="card overflow-hidden mb-5">
          <table className="w-full text-sm list-card">
            <thead><tr><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Type</th><th className="px-4 py-2 text-left">Counterparty</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-left">Cycle</th><th className="px-4 py-2 text-left">Next run</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>
              {rows.map((r) => { const due = r.status === 'active' && r.next_run && r.next_run <= today(); return (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-content font-medium">{r.name}</td>
                  <td className="px-4 py-2"><span className={`pill ${r.direction === 'revenue' ? 'pill-green' : 'pill-blue'}`}>{r.direction === 'revenue' ? 'Revenue' : 'Expense'}</span></td>
                  <td className="px-4 py-2 text-muted">{r.counterparty || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(Number(r.amount))}</td>
                  <td className="px-4 py-2 capitalize">{r.cycle}</td>
                  <td className="px-4 py-2 text-2xs"><span className={due ? 'text-rose-600 font-medium' : 'text-muted2'}>{r.next_run || '—'}</span></td>
                  <td className="px-4 py-2"><span className={`pill ${r.status === 'active' ? 'pill-green' : r.status === 'paused' ? 'pill-amber' : 'pill-gray'}`}>{r.status}</span></td>
                  <td className="px-4 py-2 text-right whitespace-nowrap"><button className="btn-ghost text-2xs" onClick={() => openEdit(r)}><Icon name="ti-pencil" /></button><button className="btn-ghost text-2xs text-rose-600 ml-1" onClick={() => del(r)}><Icon name="ti-trash" /></button></td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}

      {runs.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line"><span className="text-sm font-semibold text-content">Recently generated</span></div>
          <table className="w-full text-sm list-card">
            <thead><tr><th className="px-4 py-2 text-left">Generated</th><th className="px-4 py-2 text-left">Period</th><th className="px-4 py-2 text-left">Document</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-2xs text-muted2">{new Date(r.generated_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-2xs text-muted2">{r.period}</td>
                  <td className="px-4 py-2"><span className="pill pill-gray capitalize">{r.document_type}</span></td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(Number(r.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} size="md" icon="ti-refresh" title={draft?.id ? 'Edit subscription' : 'New subscription'}
        footer={<><button className="btn" onClick={() => setDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !draft?.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
        {draft && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required className="col-span-2"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Hosting plan / Client retainer" /></Field>
            <Field label="Direction" className="col-span-2"><Select value={draft.direction} onChange={(v) => setDraft({ ...draft, direction: v })} options={DIRS} /></Field>
            <Field label={draft.direction === 'revenue' ? 'Customer' : 'Vendor'}><input className="input" value={draft.counterparty} onChange={(e) => setDraft({ ...draft, counterparty: e.target.value })} /></Field>
            <Field label="Item (optional)"><Select value={draft.product_id} onChange={(v) => { const p = prods.find((x) => x.id === v); setDraft({ ...draft, product_id: v, amount: p ? String(p.unit_price) : draft.amount, name: p && !draft.name ? p.name : draft.name }); }} options={[{ value: '', label: 'None' }, ...prods.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name }))]} search /></Field>
            <Field label="Amount"><input className="input text-right" inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="0.00" /></Field>
            <Field label="Tax rate %"><input className="input text-right" inputMode="decimal" value={draft.tax_rate} onChange={(e) => setDraft({ ...draft, tax_rate: e.target.value })} placeholder="0" /></Field>
            <Field label="Cycle"><Select value={draft.cycle} onChange={(v) => setDraft({ ...draft, cycle: v })} options={CYCLES} /></Field>
            <Field label="Status"><Select value={draft.status} onChange={(v) => setDraft({ ...draft, status: v })} options={STATUSES} /></Field>
            <Field label="Next run" hint="When the next invoice/bill is generated"><input type="date" className="input" value={draft.next_run} onChange={(e) => setDraft({ ...draft, next_run: e.target.value })} /></Field>
            <Field label="End date (optional)"><input type="date" className="input" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} /></Field>
            <Field label="Notes" className="col-span-2"><input className="input" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional" /></Field>
          </div>
        )}
      </Modal>
    </Layout>
  );
}

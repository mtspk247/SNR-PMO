import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, StatCard, Icon } from '@/components/ui';
import { usePagination, Pagination } from '@/components/Pagination';
import { Modal, Field, useModalTabs } from '@/components/Modal';
import CustomFields from '@/components/CustomFields';
import { useLedgerEntries, useProjects, useOrgCompanies } from '@/lib/queries';
import { createLedgerEntry, updateLedgerEntry, deleteLedgerEntry, LEDGER_CATEGORIES } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { LedgerEntry } from '@/lib/supabase';

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const todayStr = () => new Date().toISOString().slice(0, 10);

type FormState = {
  type: 'income' | 'expense'; category: string; amount: string; entry_date: string;
  project_id: string; company_id: string; notes: string;
};
const emptyForm = (): FormState => ({
  type: 'expense', category: 'Tools', amount: '', entry_date: todayStr(),
  project_id: '', company_id: '', notes: '',
});

export default function AccountingPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const isAdmin = org?.member_role === 'owner' || org?.member_role === 'admin';

  const { data: entries = [], isLoading } = useLedgerEntries();
  const { data: projects = [] } = useProjects();
  const { data: companies = [] } = useOrgCompanies();

  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [catFilter, setCatFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);

  const tabs = useModalTabs('details');

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // Category options: curated lists + anything already used (covers payroll-posted rows).
  const allCategories = useMemo(() => {
    const s = new Set<string>([...LEDGER_CATEGORIES.income, ...LEDGER_CATEGORIES.expense]);
    entries.forEach((e) => s.add(e.category));
    return Array.from(s).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (catFilter !== 'all' && e.category !== catFilter) return false;
      if (!term) return true;
      return (
        e.category.toLowerCase().includes(term) ||
        (e.notes || '').toLowerCase().includes(term) ||
        (e.project?.name || '').toLowerCase().includes(term) ||
        (e.company?.name || '').toLowerCase().includes(term)
      );
    });
  }, [entries, q, typeFilter, catFilter]);

  const pg = usePagination(filtered, 25);

  // ---- Stats (over ALL entries, not the filtered view) ----
  const income = entries.filter((e) => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0);
  const expense = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0);
  const net = income - expense;
  const monthKey = todayStr().slice(0, 7);
  const monthExpense = entries
    .filter((e) => e.type === 'expense' && e.entry_date?.slice(0, 7) === monthKey)
    .reduce((s, e) => s + (e.amount || 0), 0);

  const openNew = () => { setEditing(null); setForm(emptyForm()); tabs.setTab('details'); setShowModal(true); };
  const openEdit = (e: LedgerEntry) => {
    setEditing(e);
    setForm({
      type: e.type, category: e.category, amount: String(e.amount ?? ''),
      entry_date: e.entry_date || todayStr(), project_id: e.project_id || '',
      company_id: e.company_id || '', notes: e.notes || '',
    });
    tabs.setTab('details');
    setShowModal(true);
  };

  const save = async () => {
    if (!org) return;
    const amount = parseFloat(form.amount);
    if (!form.category.trim() || !isFinite(amount) || amount < 0) {
      tabs.setTab('details');
      alert('Enter a category and a non-negative amount.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        type: form.type, category: form.category.trim(), amount,
        entry_date: form.entry_date || todayStr(),
        project_id: form.project_id || null, company_id: form.company_id || null,
        notes: form.notes.trim() || null,
      };
      if (editing) await updateLedgerEntry(editing.id, payload);
      else await createLedgerEntry({ org_id: org.id, created_by: me?.id || null, ...payload });
      qc.invalidateQueries({ queryKey: qk.ledger(org.id) });
      setShowModal(false);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const remove = async (e: LedgerEntry) => {
    if (!org || !confirm(`Delete this ${e.type} entry (${money(e.amount)})?`)) return;
    try {
      await deleteLedgerEntry(e.id);
      qc.invalidateQueries({ queryKey: qk.ledger(org.id) });
    } catch (err: any) { alert(err.message); }
  };

  return (
    <Layout title="Accounting">
      <PageHeader
        title="Accounting"
        subtitle="Income & expense ledger across the workspace — payroll posts Salaries here automatically."
        action={
          <button className="btn btn-primary" onClick={openNew}>
            <Icon name="ti-plus" /> New entry
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Income" value={money(income)} hint="All time" icon="ti-trending-up" />
        <StatCard label="Expenses" value={money(expense)} hint="All time" icon="ti-trending-down" />
        <StatCard label="Net" value={money(net)} hint={net >= 0 ? 'Profitable' : 'Running negative'} hintTone={net >= 0 ? 'up' : 'down'} icon="ti-scale" />
        <StatCard label="Spend this month" value={money(monthExpense)} hint={monthKey} icon="ti-calendar-stats" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 border-b border-line">
          <div className="relative flex-1 max-w-xs">
            <Icon name="ti-search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted2" />
            <input className="input pl-8 w-full" placeholder="Search ledger…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
            <option value="all">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select className="input w-auto" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="all">All categories</option>
            {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {isLoading ? <div className="p-8"><Spinner /></div> : filtered.length === 0 ? (
          <div className="p-5"><EmptyState icon="ti-report-money" text="No ledger entries match." /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Date</th><th className="th">Type</th><th className="th">Category</th>
                    <th className="th">Project</th><th className="th">Company</th><th className="th">Notes</th>
                    <th className="th text-right">Amount</th><th className="th w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {pg.pageItems.map((e) => (
                    <tr key={e.id} className="row">
                      <td className="td text-2xs text-muted tabular-nums">{e.entry_date}</td>
                      <td className="td"><span className={`pill ${e.type === 'income' ? 'pill-green' : 'pill-red'}`}>{e.type}</span></td>
                      <td className="td font-medium">{e.category}</td>
                      <td className="td text-2xs text-muted">{e.project?.name || '—'}</td>
                      <td className="td text-2xs text-muted">{e.company?.name || '—'}</td>
                      <td className="td text-2xs text-muted max-w-[16rem] truncate">{e.notes || '—'}</td>
                      <td className={`td text-right font-medium tabular-nums ${e.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {e.type === 'income' ? '+' : '−'}{money(e.amount)}
                      </td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-1">
                          <button className="btn-ghost p-1.5" title="Edit" onClick={() => openEdit(e)}><Icon name="ti-pencil" /></button>
                          {!e.payroll_run_id && (
                            <button className="btn-ghost p-1.5 text-rose-500" title="Delete" onClick={() => remove(e)}><Icon name="ti-trash" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} start={pg.start} end={pg.end} onPage={pg.setPage} />
          </>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={save}
        title={editing ? 'Edit ledger entry' : 'New ledger entry'}
        subtitle={editing ? `${editing.type} · ${editing.category}` : 'Record income or an expense'}
        icon="ti-report-money"
        size="md"
        tabs={[
          { key: 'details', label: 'Details', icon: 'ti-receipt' },
          { key: 'links', label: 'Links', icon: 'ti-link' },
          ...(editing ? [{ key: 'custom', label: 'Custom fields', icon: 'ti-list-details' }] : []),
        ]}
        {...tabs.bind}
        footer={
          <>
            <span className="hidden sm:block text-2xs text-muted2 mr-auto">↵ to save</span>
            <button className="btn" onClick={() => setShowModal(false)} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add entry'}
            </button>
          </>
        }
      >
        {tabs.tab === 'details' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Type" required>
              <select className="input w-full" value={form.type}
                onChange={(e) => {
                  const t = e.target.value as 'income' | 'expense';
                  set({ type: t, category: LEDGER_CATEGORIES[t].includes(form.category) ? form.category : LEDGER_CATEGORIES[t][0] });
                }}>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </Field>
            <Field label="Category" required>
              <select className="input w-full" value={form.category} onChange={(e) => set({ category: e.target.value })}>
                {LEDGER_CATEGORIES[form.type].map((c) => <option key={c} value={c}>{c}</option>)}
                {!LEDGER_CATEGORIES[form.type].includes(form.category) && <option value={form.category}>{form.category}</option>}
              </select>
            </Field>
            <Field label="Amount (USD)" required>
              <input className="input w-full" type="number" min="0" step="0.01" value={form.amount}
                onChange={(e) => set({ amount: e.target.value })} placeholder="0.00" />
            </Field>
            <Field label="Date" required>
              <input className="input w-full" type="date" value={form.entry_date} onChange={(e) => set({ entry_date: e.target.value })} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea className="input w-full" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
          </div>
        )}
        {tabs.tab === 'links' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Project" hint="Optional — links spend to a project">
              <select className="input w-full" value={form.project_id} onChange={(e) => set({ project_id: e.target.value })}>
                <option value="">—</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Company" hint="Optional">
              <select className="input w-full" value={form.company_id} onChange={(e) => set({ company_id: e.target.value })}>
                <option value="">—</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        )}
        {tabs.tab === 'custom' && editing && (
          <CustomFields orgId={org?.id || ''} entityType="ledger_entry" entityId={editing.id} canManage={isAdmin} title="Custom fields" />
        )}
      </Modal>
    </Layout>
  );
}

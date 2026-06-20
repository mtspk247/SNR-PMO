import { useMemo, useState, useEffect } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, StatCard, Icon, Tabs } from '@/components/ui';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { Modal, Field, useModalTabs } from '@/components/Modal';
import CustomFields from '@/components/CustomFields';
import EntityTags from '@/components/EntityTags';
import { useLedgerEntries, useProjects, useOrgCompanies } from '@/lib/queries';
import { createLedgerEntry, updateLedgerEntry, deleteLedgerEntry, LEDGER_CATEGORIES, getOrgOptions } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { LedgerEntry } from '@/lib/supabase';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const todayStr = () => new Date().toISOString().slice(0, 10);

// ── P&L helpers ──────────────────────────────────────────────────────────────

/** Build an array of N calendar month keys ('YYYY-MM'), oldest first, ending at `anchorMonth`. */
function buildMonthRange(anchorMonth: string, n: number): string[] {
  const [y, m] = anchorMonth.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function shortMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' });
}

function shiftAnchor(current: string, delta: number): string {
  const [y, m] = current.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportEntries(entries: LedgerEntry[]) {
  const header = ['Date', 'Type', 'Category', 'Amount', 'Project', 'Company', 'Notes', 'Payroll Run'];
  const rows = entries.map((e) => [
    e.entry_date || '', e.type, e.category, String(e.amount ?? 0),
    e.project?.name || '', e.company?.name || '', e.notes || '',
    e.payroll_run_id || '',
  ]);
  downloadCSV('ledger-entries.csv', [header, ...rows]);
}

function exportPnL(months: string[], incomeRows: Record<string, Record<string, number>>,
  expenseRows: Record<string, Record<string, number>>,
  incomeTotals: Record<string, number>, expenseTotals: Record<string, number>) {
  const header = ['', ...months.map(shortMonth), 'Total'];
  const rows: string[][] = [header, ['INCOME']];
  Object.entries(incomeRows).forEach(([cat, byMonth]) => {
    rows.push([cat, ...months.map((mo) => String(byMonth[mo] ?? 0)), String(months.reduce((s, mo) => s + (byMonth[mo] ?? 0), 0))]);
  });
  rows.push(['Total Income', ...months.map((mo) => String(incomeTotals[mo] ?? 0)), String(Object.values(incomeTotals).reduce((s, v) => s + v, 0))]);
  rows.push(['EXPENSES']);
  Object.entries(expenseRows).forEach(([cat, byMonth]) => {
    rows.push([cat, ...months.map((mo) => String(byMonth[mo] ?? 0)), String(months.reduce((s, mo) => s + (byMonth[mo] ?? 0), 0))]);
  });
  rows.push(['Total Expenses', ...months.map((mo) => String(expenseTotals[mo] ?? 0)), String(Object.values(expenseTotals).reduce((s, v) => s + v, 0))]);
  rows.push(['Net', ...months.map((mo) => String((incomeTotals[mo] ?? 0) - (expenseTotals[mo] ?? 0))),
    String(Object.values(incomeTotals).reduce((s, v) => s + v, 0) - Object.values(expenseTotals).reduce((s, v) => s + v, 0))]);
  downloadCSV('pl-summary.csv', rows);
}

// ── Form types ────────────────────────────────────────────────────────────────

type FormState = {
  type: 'income' | 'expense'; category: string; amount: string; entry_date: string;
  project_id: string; company_id: string; notes: string;
};
const emptyForm = (): FormState => ({
  type: 'expense', category: 'Tools', amount: '', entry_date: todayStr(),
  project_id: '', company_id: '', notes: '',
});

// ── Page ──────────────────────────────────────────────────────────────────────

const LEDGER_COLS: ColDef[] = [
  { id: 'date', label: 'Date', locked: true },
  { id: 'type', label: 'Type' },
  { id: 'category', label: 'Category' },
  { id: 'project', label: 'Project' },
  { id: 'company', label: 'Company' },
  { id: 'notes', label: 'Notes' },
  { id: 'amount', label: 'Amount' },
];

const LEDGER_GROUPS: GroupMeta[] = [
  { value: 'income', label: 'Income', pill: 'pill-green' },
  { value: 'expense', label: 'Expense', pill: 'pill-red' },
];

export default function AccountingPage() {
  const org = useActiveOrg();
  const [cats, setCats] = useState<{ income: string[]; expense: string[] }>(LEDGER_CATEGORIES);
  useEffect(() => {
    if (!org) return;
    Promise.all([getOrgOptions(org.id, 'ledger_income'), getOrgOptions(org.id, 'ledger_expense')])
      .then(([inc, exp]) => setCats({
        income: inc.filter((x) => x.active).map((x) => x.label).length ? inc.filter((x) => x.active).map((x) => x.label) : LEDGER_CATEGORIES.income,
        expense: exp.filter((x) => x.active).map((x) => x.label).length ? exp.filter((x) => x.active).map((x) => x.label) : LEDGER_CATEGORIES.expense,
      })).catch(() => {});
  }, [org?.id]);
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const isAdmin = org?.member_role === 'owner' || org?.member_role === 'admin';

  const { data: entries = [], isLoading } = useLedgerEntries();
  const { data: projects = [] } = useProjects();
  const { data: companies = [] } = useOrgCompanies();

  // ── page view ──
  const [pageView, setPageView] = useState<'entries' | 'pl'>('entries');

  // ── Entries tab state ──
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);

  // ── P&L tab state ──
  const currentMonthKey = todayStr().slice(0, 7);
  const [plAnchor, setPlAnchor] = useState(currentMonthKey); // last month in the window
  const PL_WINDOW = 6;

  const modalTabs = useModalTabs('details');

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // Category options: curated lists + anything already used (covers payroll-posted rows).
  const allCategories = useMemo(() => {
    const s = new Set<string>([...cats.income, ...cats.expense]);
    entries.forEach((e) => s.add(e.category));
    return Array.from(s).sort();
  }, [entries]);

  const lp = useListPrefs(`snr-accounting-view-${me?.id || 'anon'}`, LEDGER_COLS);
  const FILTERS: FilterDef[] = useMemo(() => [
    { id: 'type', label: 'Type', options: [{ value: 'all', label: 'All types' }, { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }] },
    { id: 'category', label: 'Category', options: [{ value: 'all', label: 'All categories' }, ...allCategories.map((c) => ({ value: c, label: titleCase(c) }))] },
  ], [allCategories]);

  const filtered = useMemo(() => {
    const term = lp.query.trim().toLowerCase();
    const fs = lp.filters;
    return entries.filter((e) => {
      if (fs.type && fs.type !== 'all' && e.type !== fs.type) return false;
      if (fs.category && fs.category !== 'all' && e.category !== fs.category) return false;
      if (!term) return true;
      return (
        e.category.toLowerCase().includes(term) ||
        (e.notes || '').toLowerCase().includes(term) ||
        (e.project?.name || '').toLowerCase().includes(term) ||
        (e.company?.name || '').toLowerCase().includes(term)
      );
    });
  }, [entries, lp.query, lp.filters]);

  const rs = useRowSelection(filtered);

  // ---- Stats (over ALL entries) ----
  const income = entries.filter((e) => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0);
  const expense = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0);
  const net = income - expense;
  const monthKey = todayStr().slice(0, 7);
  const monthExpense = entries
    .filter((e) => e.type === 'expense' && e.entry_date?.slice(0, 7) === monthKey)
    .reduce((s, e) => s + (e.amount || 0), 0);

  // ── P&L matrix (client-side) ──
  const plMonths = useMemo(() => buildMonthRange(plAnchor, PL_WINDOW), [plAnchor]);

  const plData = useMemo(() => {
    // Only entries within the displayed window
    const inWindow = entries.filter((e) => plMonths.includes((e.entry_date || '').slice(0, 7)));

    // category → month → total
    const incomeRows: Record<string, Record<string, number>> = {};
    const expenseRows: Record<string, Record<string, number>> = {};

    inWindow.forEach((e) => {
      const mo = (e.entry_date || '').slice(0, 7);
      const amt = e.amount || 0;
      if (e.type === 'income') {
        if (!incomeRows[e.category]) incomeRows[e.category] = {};
        incomeRows[e.category][mo] = (incomeRows[e.category][mo] || 0) + amt;
      } else {
        if (!expenseRows[e.category]) expenseRows[e.category] = {};
        expenseRows[e.category][mo] = (expenseRows[e.category][mo] || 0) + amt;
      }
    });

    const incomeTotals: Record<string, number> = {};
    const expenseTotals: Record<string, number> = {};
    plMonths.forEach((mo) => {
      incomeTotals[mo] = Object.values(incomeRows).reduce((s, r) => s + (r[mo] || 0), 0);
      expenseTotals[mo] = Object.values(expenseRows).reduce((s, r) => s + (r[mo] || 0), 0);
    });

    const trendMax = Math.max(1, ...plMonths.flatMap((mo) => [incomeTotals[mo], expenseTotals[mo]]));

    return { incomeRows, expenseRows, incomeTotals, expenseTotals, trendMax };
  }, [entries, plMonths]);

  // ── Modal helpers ──
  const openNew = () => { setEditing(null); setForm(emptyForm()); modalTabs.setTab('details'); setShowModal(true); };
  const openEdit = (e: LedgerEntry) => {
    setEditing(e);
    setForm({
      type: e.type, category: e.category, amount: String(e.amount ?? ''),
      entry_date: e.entry_date || todayStr(), project_id: e.project_id || '',
      company_id: e.company_id || '', notes: e.notes || '',
    });
    modalTabs.setTab('details');
    setShowModal(true);
  };

  const save = async () => {
    if (!org) return;
    const amount = parseFloat(form.amount);
    if (!form.category.trim() || !isFinite(amount) || amount < 0) {
      modalTabs.setTab('details');
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

  // ── Cell renderer (top-level — no :ReactNode annotation) ──
  const cell = (id: string, e: LedgerEntry) => {
    switch (id) {
      case 'date': return <span className="text-2xs text-muted tabular-nums">{e.entry_date}</span>;
      case 'type': return <span className={`pill ${e.type === 'income' ? 'pill-green' : 'pill-red'}`}>{e.type}</span>;
      case 'category': return <span className="font-medium">{e.category}{e.payroll_run_id && <Icon name="ti-lock" className="ml-1 text-2xs text-muted2" />}</span>;
      case 'project': return <span className="text-2xs text-muted">{e.project?.name || '—'}</span>;
      case 'company': return <span className="text-2xs text-muted">{e.company?.name || '—'}</span>;
      case 'notes': return <span className="text-2xs text-muted block max-w-[16rem] truncate">{e.notes || '—'}</span>;
      case 'amount': return <span className={`block text-right font-medium tabular-nums ${e.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>{e.type === 'income' ? '+' : '−'}{money(e.amount)}</span>;
      default: return null;
    }
  };

  const exportValue = (id: string, e: LedgerEntry) => {
    switch (id) {
      case 'date': return e.entry_date || '';
      case 'type': return e.type;
      case 'category': return e.category;
      case 'project': return e.project?.name || '';
      case 'company': return e.company?.name || '';
      case 'notes': return e.notes || '';
      case 'amount': return String(e.amount ?? 0);
      default: return '';
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout flat title="Accounting">
      <div className="card p-3.5 mb-4 flex flex-wrap items-center gap-3 border-amber-400/40 bg-amber-500/5">
        <Icon name="ti-info-circle" className="text-base text-amber-600 shrink-0" />
        <span className="text-sm text-content flex-1 min-w-0">This is the classic single-entry ledger, superseded by the double-entry <strong>General Ledger</strong> (journal, trial balance, P&amp;L, periods, multi-currency). New work should use the General Ledger.</span>
        <a href="/ledger" className="btn btn-primary shrink-0"><Icon name="ti-book-2" />Open General Ledger</a>
      </div>
      <PageHeader
        title="Accounting (classic ledger)"
        subtitle="Legacy income & expense ledger — kept for historical entries. Use the General Ledger for new accounting."
        action={
          <div className="flex items-center gap-2">
            {pageView === 'entries' ? (
              <>
                <button className="btn btn-ghost text-xs" onClick={() => exportEntries(filtered)}>
                  <Icon name="ti-download" /> Export CSV
                </button>
                <button className="btn btn-primary" onClick={openNew}>
                  <Icon name="ti-plus" /> New entry
                </button>
              </>
            ) : (
              <button
                className="btn btn-ghost text-xs"
                onClick={() => exportPnL(plMonths, plData.incomeRows, plData.expenseRows, plData.incomeTotals, plData.expenseTotals)}
              >
                <Icon name="ti-download" /> Export CSV
              </button>
            )}
          </div>
        }
      />

      {/* Stat row — always visible */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Income" value={money(income)} hint="All time" icon="ti-trending-up" />
        <StatCard label="Expenses" value={money(expense)} hint="All time" icon="ti-trending-down" />
        <StatCard label="Net" value={money(net)} hint={net >= 0 ? 'Profitable' : 'Running negative'} hintTone={net >= 0 ? 'up' : 'down'} icon="ti-scale" />
        <StatCard label="Spend this month" value={money(monthExpense)} hint={monthKey} icon="ti-calendar-stats" />
      </div>

      {/* Page-level view switch */}
      <Tabs
        tabs={[
          { key: 'entries', label: 'Entries', icon: 'ti-list', count: entries.length },
          { key: 'pl', label: 'P&L', icon: 'ti-chart-bar' },
        ]}
        active={pageView}
        onChange={(k) => setPageView(k as 'entries' | 'pl')}
      />

      {/* ── ENTRIES VIEW ─────────────────────────────────────────────────────── */}
      {pageView === 'entries' && (
        <ListView
          rows={isLoading ? null : filtered}
          rowKey={(e) => e.id}
          cols={LEDGER_COLS}
          prefs={lp}
          cell={cell}
          selection={rs}
          filters={FILTERS}
          searchPlaceholder="Search ledger…"
          groupField={{ value: 'type', label: 'Type' }}
          groupOf={(e) => e.type}
          groups={LEDGER_GROUPS}
          onRowClick={openEdit}
          exportName="accounting"
          exportValue={exportValue}
          canDelete={false}
          emptyIcon="ti-report-money"
          emptyText="No ledger entries match."
        />
      )}

      {/* ── P&L VIEW ─────────────────────────────────────────────────────────── */}
      {pageView === 'pl' && (
        <div className="space-y-4">
          {/* Month range navigator */}
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost text-xs" onClick={() => setPlAnchor((a) => shiftAnchor(a, -1))}>
              <Icon name="ti-chevron-left" /> Prev
            </button>
            <span className="text-sm font-medium tabular-nums">
              {shortMonth(plMonths[0])} {plMonths[0].slice(0, 4)} – {shortMonth(plMonths[plMonths.length - 1])} {plMonths[plMonths.length - 1].slice(0, 4)}
            </span>
            <button className="btn btn-ghost text-xs" onClick={() => setPlAnchor((a) => shiftAnchor(a, 1))}
              disabled={plAnchor >= currentMonthKey}>
              Next <Icon name="ti-chevron-right" />
            </button>
          </div>

          {/* Mini grouped bar chart */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold">Income vs. Expenses</span>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="w-3 h-2 rounded-sm bg-accent inline-block" />Income
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="w-3 h-2 rounded-sm bg-rose-500/70 inline-block" />Expenses
                </span>
              </div>
            </div>
            <div className="w-full overflow-x-auto">
              <div className="min-w-[360px]">
                {/* bars */}
                <div className="flex items-end gap-2 h-32">
                  {plMonths.map((mo) => {
                    const inc = plData.incomeTotals[mo] || 0;
                    const exp = plData.expenseTotals[mo] || 0;
                    const incH = Math.round((inc / plData.trendMax) * 100);
                    const expH = Math.round((exp / plData.trendMax) * 100);
                    return (
                      <div key={mo} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="w-full flex items-end justify-center gap-1" style={{ height: '100%' }}>
                          <div className="flex-1 rounded-t bg-accent transition-all"
                            style={{ height: `${incH}%`, minHeight: inc > 0 ? 3 : 0 }}
                            title={`Income ${money(inc)}`} />
                          <div className="flex-1 rounded-t bg-rose-500/70 transition-all"
                            style={{ height: `${expH}%`, minHeight: exp > 0 ? 3 : 0 }}
                            title={`Expense ${money(exp)}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* month labels */}
                <div className="flex gap-2 mt-2">
                  {plMonths.map((mo) => (
                    <div key={mo} className="flex-1 text-center text-2xs text-muted2 tabular-nums">{shortMonth(mo)}</div>
                  ))}
                </div>
                {/* amounts */}
                <div className="flex gap-2 mt-1">
                  {plMonths.map((mo) => {
                    const inc = plData.incomeTotals[mo] || 0;
                    const exp = plData.expenseTotals[mo] || 0;
                    return (
                      <div key={mo} className="flex-1 flex flex-col items-center gap-0.5">
                        {inc > 0 && <span className="text-2xs tabular-nums text-accent font-medium truncate w-full text-center">{money(inc)}</span>}
                        {exp > 0 && <span className="text-2xs tabular-nums text-rose-500 truncate w-full text-center">{money(exp)}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* P&L table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm list-card">
                <thead>
                  <tr>
                    <th className="th text-left w-48">Category</th>
                    {plMonths.map((mo) => <th key={mo} className="th text-right tabular-nums">{shortMonth(mo)}</th>)}
                    <th className="th text-right tabular-nums">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ── Income section ── */}
                  <tr className="bg-surface2">
                    <td colSpan={plMonths.length + 2} className="td py-1.5 font-semibold text-xs uppercase tracking-wide text-accent">
                      Income
                    </td>
                  </tr>
                  {Object.keys(plData.incomeRows).length === 0 ? (
                    <tr>
                      <td className="td text-muted2 text-xs" colSpan={plMonths.length + 2}>No income in this period</td>
                    </tr>
                  ) : Object.entries(plData.incomeRows).map(([cat, byMonth]) => {
                    const rowTotal = plMonths.reduce((s, mo) => s + (byMonth[mo] || 0), 0);
                    return (
                      <tr key={cat} className="row">
                        <td className="td">{cat}</td>
                        {plMonths.map((mo) => (
                          <td key={mo} className="td text-right tabular-nums text-emerald-600">
                            {byMonth[mo] ? money(byMonth[mo]) : <span className="text-muted2">—</span>}
                          </td>
                        ))}
                        <td className="td text-right tabular-nums font-medium text-emerald-600">{money(rowTotal)}</td>
                      </tr>
                    );
                  })}
                  {/* Income subtotal */}
                  <tr className="bg-emerald-50/40 dark:bg-emerald-900/10 font-medium">
                    <td className="td text-xs">Total Income</td>
                    {plMonths.map((mo) => (
                      <td key={mo} className="td text-right tabular-nums text-emerald-700">{money(plData.incomeTotals[mo] || 0)}</td>
                    ))}
                    <td className="td text-right tabular-nums text-emerald-700 font-semibold">
                      {money(plMonths.reduce((s, mo) => s + (plData.incomeTotals[mo] || 0), 0))}
                    </td>
                  </tr>

                  {/* ── Expenses section ── */}
                  <tr className="bg-surface2">
                    <td colSpan={plMonths.length + 2} className="td py-1.5 font-semibold text-xs uppercase tracking-wide text-rose-500">
                      Expenses
                    </td>
                  </tr>
                  {Object.keys(plData.expenseRows).length === 0 ? (
                    <tr>
                      <td className="td text-muted2 text-xs" colSpan={plMonths.length + 2}>No expenses in this period</td>
                    </tr>
                  ) : Object.entries(plData.expenseRows).map(([cat, byMonth]) => {
                    const rowTotal = plMonths.reduce((s, mo) => s + (byMonth[mo] || 0), 0);
                    return (
                      <tr key={cat} className="row">
                        <td className="td">{cat}</td>
                        {plMonths.map((mo) => (
                          <td key={mo} className="td text-right tabular-nums text-rose-600">
                            {byMonth[mo] ? money(byMonth[mo]) : <span className="text-muted2">—</span>}
                          </td>
                        ))}
                        <td className="td text-right tabular-nums font-medium text-rose-600">{money(rowTotal)}</td>
                      </tr>
                    );
                  })}
                  {/* Expenses subtotal */}
                  <tr className="bg-rose-50/40 dark:bg-rose-900/10 font-medium">
                    <td className="td text-xs">Total Expenses</td>
                    {plMonths.map((mo) => (
                      <td key={mo} className="td text-right tabular-nums text-rose-700">{money(plData.expenseTotals[mo] || 0)}</td>
                    ))}
                    <td className="td text-right tabular-nums text-rose-700 font-semibold">
                      {money(plMonths.reduce((s, mo) => s + (plData.expenseTotals[mo] || 0), 0))}
                    </td>
                  </tr>

                  {/* ── Net row ── */}
                  {(() => {
                    const totalInc = plMonths.reduce((s, mo) => s + (plData.incomeTotals[mo] || 0), 0);
                    const totalExp = plMonths.reduce((s, mo) => s + (plData.expenseTotals[mo] || 0), 0);
                    const totalNet = totalInc - totalExp;
                    return (
                      <tr className="border-t-2 border-line font-semibold text-sm">
                        <td className="td">Net</td>
                        {plMonths.map((mo) => {
                          const n = (plData.incomeTotals[mo] || 0) - (plData.expenseTotals[mo] || 0);
                          return (
                            <td key={mo} className={`td text-right tabular-nums ${n >= 0 ? 'text-accent' : 'text-rose-600'}`}>
                              {n !== 0 ? money(n) : <span className="text-muted2">—</span>}
                            </td>
                          );
                        })}
                        <td className={`td text-right tabular-nums font-bold ${totalNet >= 0 ? 'text-accent' : 'text-rose-600'}`}>
                          {money(totalNet)}
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal (shared) ──────────────────────────────────────────────────── */}
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
          ...(editing ? [{ key: 'tags', label: 'Tags', icon: 'ti-tags' }, { key: 'custom', label: 'Custom fields', icon: 'ti-list-details' }] : []),
        ]}
        {...modalTabs.bind}
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
        {modalTabs.tab === 'details' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Type" required>
              <div className="w-full"><Select value={form.type} onChange={(v) => {
                  const t = v as 'income' | 'expense';
                  set({ type: t, category: cats[t].includes(form.category) ? form.category : cats[t][0] });
                }} options={[{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }]} /></div>
            </Field>
            <Field label="Category" required>
              <Select value={form.category} onChange={(v) => set({ category: v })} options={[...cats[form.type].map((c) => ({ value: c, label: titleCase(c) })), ...(!cats[form.type].includes(form.category) ? [{ value: form.category, label: form.category }] : [])]} />
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
        {modalTabs.tab === 'links' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Project" hint="Optional — links spend to a project">
              <div className="w-full"><Select value={form.project_id} onChange={(v) => set({ project_id: v })} options={[{ value: '', label: 'None' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} /></div>
            </Field>
            <Field label="Company" hint="Optional">
              <div className="w-full"><Select value={form.company_id} onChange={(v) => set({ company_id: v })} options={[{ value: '', label: 'None' }, ...companies.map((c) => ({ value: c.id, label: c.name }))]} /></div>
            </Field>
          </div>
        )}
        {modalTabs.tab === 'tags' && editing && (
          <EntityTags entityType="ledger_entry" entityId={editing.id} orgId={org?.id} bare />
        )}
        {modalTabs.tab === 'custom' && editing && (
          <CustomFields orgId={org?.id || ''} entityType="ledger_entry" entityId={editing.id} canManage={isAdmin} title="Custom fields" />
        )}
      </Modal>
    </Layout>
  );
}

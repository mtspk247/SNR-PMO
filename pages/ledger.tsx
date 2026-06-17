import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Tabs } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg } from '@/lib/store';
import {
  glAccounts, glSeedCoa, glAccountSave, glAccountDelete, glPostEntry, glJournal, glTrialBalance, glBackfill,
  taxRates, taxRateSave, taxRateDelete, glTaxSummary,
  glPL, glBalanceSheet, glCashFlow, budgetSave, glBudgetVsActual, glCashForecast, glProjectsSummary,
  accountingSettingsGet, accountingSettingsSave, AcctSettings, fxRates, fxRateSave, fxRateDelete, fxRevalue, FxRate,
  glPeriods, glClosePeriod, glReopenPeriod, glReverseEntry, glAudit,
  getOrgProfile, CoaAccount, JournalEntryRow, TrialBalanceRow, TaxRate, TaxSummaryRow, PLRow, BSRow, CashFlowRow, BudgetRow, ForecastRow, FiscalPeriod, AuditSummary, ProjectSummaryRow,
} from '@/lib/db';

const TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];
const NB_DEFAULT: Record<string, string> = { asset: 'debit', expense: 'debit', liability: 'credit', equity: 'credit', income: 'credit' };
const TYPE_ORDER = ['asset', 'liability', 'equity', 'income', 'expense'];
const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type AcctDraft = { id?: string; code: string; name: string; type: string; subtype: string; normal_balance: string; currency: string; is_active: boolean };
type JLine = { account_id: string; debit: string; credit: string; description: string };

export default function LedgerPage() {
  const org = useActiveOrg();
  const [tab, setTab] = useState<'coa' | 'journal' | 'tb' | 'taxes' | 'reports' | 'audit' | 'fx'>('coa');
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<CoaAccount[]>([]);
  const [journal, setJournal] = useState<JournalEntryRow[]>([]);
  const [tb, setTb] = useState<TrialBalanceRow[]>([]);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [taxList, setTaxList] = useState<TaxRate[]>([]);
  const [taxSum, setTaxSum] = useState<TaxSummaryRow[]>([]);
  const [taxFrom, setTaxFrom] = useState('');
  const [taxTo, setTaxTo] = useState(new Date().toISOString().slice(0, 10));
  const [taxDraft, setTaxDraft] = useState<{ id?: string; name: string; rate: string; kind: string; account_id: string; is_active: boolean } | null>(null);
  const [rptType, setRptType] = useState<'pl' | 'bs' | 'cf' | 'budget' | 'forecast' | 'projects'>('pl');
  const [rptFrom, setRptFrom] = useState('');
  const [rptTo, setRptTo] = useState(new Date().toISOString().slice(0, 10));
  const [rptAsOf, setRptAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [plRows, setPlRows] = useState<PLRow[]>([]);
  const [bsRows, setBsRows] = useState<BSRow[]>([]);
  const [cfRows, setCfRows] = useState<CashFlowRow[]>([]);
  const [rptMonth, setRptMonth] = useState(new Date().toISOString().slice(0, 7));
  const [fcMonths, setFcMonths] = useState(6);
  const [budRows, setBudRows] = useState<BudgetRow[]>([]);
  const [budEdit, setBudEdit] = useState<Record<string, string>>({});
  const [fcRows, setFcRows] = useState<ForecastRow[]>([]);
  const [projRows, setProjRows] = useState<ProjectSummaryRow[]>([]);
  const [plBasis, setPlBasis] = useState<'accrual' | 'cash'>('accrual');
  const [settings, setSettings] = useState<AcctSettings | null>(null);
  const [sDraft, setSDraft] = useState<AcctSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fxList, setFxList] = useState<FxRate[]>([]);
  const [fxDraft, setFxDraft] = useState({ currency: '', rate: '', as_of: new Date().toISOString().slice(0, 10) });
  const loadFx = () => { if (orgId) fxRates(orgId).then(setFxList).catch((e) => setErr(e.message)); };
  useEffect(() => { if (orgId && tab === 'fx') loadFx(); /* eslint-disable-next-line */ }, [orgId, tab]);
  const saveFx = async () => { if (!orgId || !fxDraft.currency.trim() || busy) return; setBusy(true); setErr(''); try { await fxRateSave(orgId, fxDraft.currency.trim().toUpperCase(), parseFloat(fxDraft.rate) || 0, fxDraft.as_of); setFxDraft({ currency: '', rate: '', as_of: new Date().toISOString().slice(0, 10) }); loadFx(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const delFx = async (id: string) => { if (!orgId) return; try { await fxRateDelete(orgId, id); loadFx(); } catch (e: any) { setErr(e.message); } };
  const [revalDate, setRevalDate] = useState(new Date().toISOString().slice(0, 10));
  const revalue = async () => { if (!orgId || busy) return; setBusy(true); setErr(''); setMsg(''); try { const r = await fxRevalue(orgId, revalDate); setMsg(`Posted ${r.entries} FX revaluation entr${r.entries === 1 ? 'y' : 'ies'} as of ${revalDate}.`); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const [auditData, setAuditData] = useState<AuditSummary>({});
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [closeMonth, setCloseMonth] = useState(new Date().toISOString().slice(0, 7));
  const monthBounds = (ym: string) => { const [y, m] = ym.split('-').map(Number); return { start: `${ym}-01`, end: new Date(y, m, 0).toISOString().slice(0, 10) }; };
  const loadBudget = () => { if (!orgId) return; const { start, end } = monthBounds(rptMonth); glBudgetVsActual(orgId, start, end).then((r) => { setBudRows(r); setBudEdit(Object.fromEntries(r.map((x) => [x.account_id, x.budget ? String(x.budget) : '']))); }).catch((e) => setErr(e.message)); };
  const [industry, setIndustry] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const orgId = org?.id;
  const loadAccounts = () => orgId ? glAccounts(orgId).then(setAccounts).catch((e) => setErr(e.message)) : Promise.resolve();
  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    Promise.all([
      glAccounts(orgId).then(setAccounts),
      getOrgProfile(orgId).then((p: any) => setIndustry(p?.industry || null)).catch(() => {}),
      accountingSettingsGet(orgId).then((st) => { setSettings(st); setPlBasis(st.basis === 'cash' ? 'cash' : 'accrual'); }).catch(() => {}),
    ]).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [orgId]);
  useEffect(() => { if (orgId && tab === 'journal') glJournal(orgId).then(setJournal).catch((e) => setErr(e.message)); }, [orgId, tab]);
  useEffect(() => { if (orgId && tab === 'tb') glTrialBalance(orgId, asOf).then(setTb).catch((e) => setErr(e.message)); }, [orgId, tab, asOf]);
  useEffect(() => { if (orgId && tab === 'taxes') { taxRates(orgId).then(setTaxList).catch((e) => setErr(e.message)); glTaxSummary(orgId, taxFrom || null, taxTo || null).then(setTaxSum).catch(() => {}); } }, [orgId, tab, taxFrom, taxTo]);
  useEffect(() => {
    if (!orgId || tab !== 'reports') return;
    if (rptType === 'pl') glPL(orgId, rptFrom || null, rptTo || null, plBasis).then(setPlRows).catch((e) => setErr(e.message));
    else if (rptType === 'bs') glBalanceSheet(orgId, rptAsOf || null).then(setBsRows).catch((e) => setErr(e.message));
    else if (rptType === 'cf') glCashFlow(orgId, rptFrom || null, rptTo || null).then(setCfRows).catch((e) => setErr(e.message));
    else if (rptType === 'budget') loadBudget();
    else if (rptType === 'forecast') glCashForecast(orgId, fcMonths).then(setFcRows).catch((e) => setErr(e.message));
    else glProjectsSummary(orgId, rptFrom || null, rptTo || null).then(setProjRows).catch((e) => setErr(e.message));
  }, [orgId, tab, rptType, rptFrom, rptTo, rptAsOf, rptMonth, fcMonths, plBasis]);
  const loadAudit = () => { if (!orgId) return; glAudit(orgId).then(setAuditData).catch((e) => setErr(e.message)); glPeriods(orgId).then(setPeriods).catch(() => {}); };
  useEffect(() => { if (orgId && tab === 'audit') loadAudit(); /* eslint-disable-next-line */ }, [orgId, tab]);
  const reverseEntry = async (eid: string) => { if (!orgId || !confirm('Post a reversing entry for this journal entry?')) return; try { await glReverseEntry(orgId, eid, new Date().toISOString().slice(0, 10)); glJournal(orgId).then(setJournal); } catch (e: any) { setErr(e.message); } };
  const closePeriod = async () => { if (!orgId) return; try { await glClosePeriod(orgId, closeMonth + '-01'); loadAudit(); } catch (e: any) { setErr(e.message); } };
  const reopenPeriod = async (p: FiscalPeriod) => { if (!orgId) return; try { await glReopenPeriod(orgId, p.period_start); loadAudit(); } catch (e: any) { setErr(e.message); } };
  const saveBudget = async (accountId: string) => {
    if (!orgId) return; const { start } = monthBounds(rptMonth);
    try { await budgetSave(orgId, accountId, start, parseFloat(budEdit[accountId]) || 0); loadBudget(); } catch (e: any) { setErr(e.message); }
  };

  // ── seed ──
  const seed = async () => {
    if (!orgId || busy) return;
    setBusy(true); setErr('');
    try { await glSeedCoa(orgId, industry); await loadAccounts(); }
    catch (e: any) { setErr(e.message || 'Could not seed accounts'); } finally { setBusy(false); }
  };
  const importExisting = async () => {
    if (!orgId || busy) return;
    if (!confirm('Import existing invoices, payments, expenses, credit notes and assets into the ledger? Safe to run repeatedly.')) return;
    setBusy(true); setErr('');
    try { const r = await glBackfill(orgId); glJournal(orgId).then(setJournal); alert(`Imported. ${r.entries} transaction(s) now in the ledger.`); }
    catch (e: any) { setErr(e.message || 'Could not import'); } finally { setBusy(false); }
  };

  // ── account modal ──
  const [acct, setAcct] = useState<AcctDraft | null>(null);
  const openNewAcct = () => setAcct({ code: '', name: '', type: 'expense', subtype: '', normal_balance: 'debit', currency: 'USD', is_active: true });
  const openEditAcct = (a: CoaAccount) => setAcct({ id: a.id, code: a.code, name: a.name, type: a.type, subtype: a.subtype || '', normal_balance: a.normal_balance, currency: a.currency, is_active: a.is_active });
  const saveAcct = async () => {
    if (!orgId || !acct || busy) return;
    setBusy(true); setErr('');
    try { await glAccountSave(orgId, acct); setAcct(null); await loadAccounts(); }
    catch (e: any) { setErr(e.message || 'Could not save account'); } finally { setBusy(false); }
  };
  const delAcct = async (a: CoaAccount) => {
    if (!orgId) return;
    if (!confirm(`Delete account ${a.code} ${a.name}? If it has entries it will be archived instead.`)) return;
    try { await glAccountDelete(orgId, a.id); await loadAccounts(); } catch (e: any) { setErr(e.message); }
  };

  // ── journal modal ──
  const [jOpen, setJOpen] = useState(false);
  const [jDate, setJDate] = useState(new Date().toISOString().slice(0, 10));
  const [jMemo, setJMemo] = useState('');
  const [jLines, setJLines] = useState<JLine[]>([{ account_id: '', debit: '', credit: '', description: '' }, { account_id: '', debit: '', credit: '', description: '' }]);
  const acctOptions = useMemo(() => accounts.filter((a) => a.is_active).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })), [accounts]);
  const jTotals = useMemo(() => jLines.reduce((t, l) => ({ d: t.d + (parseFloat(l.debit) || 0), c: t.c + (parseFloat(l.credit) || 0) }), { d: 0, c: 0 }), [jLines]);
  const jBalanced = jTotals.d > 0 && Math.abs(jTotals.d - jTotals.c) < 0.005;
  const jValid = jBalanced && jLines.filter((l) => l.account_id && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0)).length >= 2;
  const openJournal = () => { setJDate(new Date().toISOString().slice(0, 10)); setJMemo(''); setJLines([{ account_id: '', debit: '', credit: '', description: '' }, { account_id: '', debit: '', credit: '', description: '' }]); setJOpen(true); setErr(''); };
  const setLine = (i: number, p: Partial<JLine>) => setJLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...p } : l));
  const postJournal = async () => {
    if (!orgId || !jValid || busy) return;
    setBusy(true); setErr('');
    try {
      const lines = jLines.filter((l) => l.account_id && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
        .map((l) => ({ account_id: l.account_id, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0, description: l.description || undefined }));
      await glPostEntry(orgId, jDate, jMemo, lines);
      setJOpen(false);
      if (tab === 'journal') glJournal(orgId).then(setJournal);
    } catch (e: any) { setErr(e.message || 'Could not post entry'); } finally { setBusy(false); }
  };

  const grouped = useMemo(() => TYPE_ORDER.map((t) => ({ type: t, items: accounts.filter((a) => a.type === t) })).filter((g) => g.items.length), [accounts]);
  const tbTotals = useMemo(() => tb.reduce((t, r) => ({ d: t.d + Number(r.debit), c: t.c + Number(r.credit) }), { d: 0, c: 0 }), [tb]);
  const taxOut = useMemo(() => taxSum.filter((r) => r.kind === 'output').reduce((s2, r) => s2 + Number(r.amount), 0), [taxSum]);
  const taxIn = useMemo(() => taxSum.filter((r) => r.kind === 'input').reduce((s2, r) => s2 + Number(r.amount), 0), [taxSum]);
  const plIncome = useMemo(() => plRows.filter((r) => r.section === 'income').reduce((s2, r) => s2 + Number(r.amount), 0), [plRows]);
  const plExpense = useMemo(() => plRows.filter((r) => r.section === 'expense').reduce((s2, r) => s2 + Number(r.amount), 0), [plRows]);
  const bsAssets = useMemo(() => bsRows.filter((r) => r.section === 'asset').reduce((s2, r) => s2 + Number(r.amount), 0), [bsRows]);
  const bsLE = useMemo(() => bsRows.filter((r) => r.section !== 'asset').reduce((s2, r) => s2 + Number(r.amount), 0), [bsRows]);
  const cfMap = (l: string) => Number(cfRows.find((r) => r.label === l)?.amount || 0);
  const saveTax = async () => {
    if (!orgId || !taxDraft || busy) return;
    setBusy(true); setErr('');
    try { await taxRateSave(orgId, { id: taxDraft.id, name: taxDraft.name, rate: (parseFloat(taxDraft.rate) || 0) / 100, kind: taxDraft.kind, account_id: taxDraft.account_id || null, is_active: taxDraft.is_active }); setTaxDraft(null); taxRates(orgId).then(setTaxList); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const delTax = async (id: string) => { if (!orgId || !confirm('Delete this tax rate?')) return; try { await taxRateDelete(orgId, id); taxRates(orgId).then(setTaxList); } catch (e: any) { setErr(e.message); } };

  if (!org) return <Layout flat title="General Ledger"><Spinner /></Layout>;

  return (
    <Layout flat title="General Ledger">
      <PageHeader title="General Ledger" subtitle="Double-entry chart of accounts, journal and trial balance" icon="ti-book-2"
        action={<div className="flex items-center gap-2">
          {tab === 'coa' && accounts.length > 0 && <button onClick={openNewAcct} className="btn btn-primary"><Icon name="ti-plus" />New account</button>}
          {tab === 'journal' && accounts.length > 0 && (<><button onClick={importExisting} disabled={busy} className="btn"><Icon name="ti-download" />Import existing</button><button onClick={openJournal} className="btn btn-primary"><Icon name="ti-plus" />New journal entry</button></>)}
          <button onClick={() => { setSDraft(settings || { fiscal_year_start_month: 1, base_currency: 'USD', basis: 'accrual', lock_date: null }); setSettingsOpen(true); }} className="btn" title="Accounting settings"><Icon name="ti-settings" /></button>
        </div>} />

      <Tabs tabs={[
        { key: 'coa', label: 'Chart of Accounts', icon: 'ti-list-tree' },
        { key: 'journal', label: 'Journal', icon: 'ti-notebook' },
        { key: 'tb', label: 'Trial Balance', icon: 'ti-scale' },
        { key: 'taxes', label: 'Taxes', icon: 'ti-receipt-tax' },
        { key: 'reports', label: 'Reports', icon: 'ti-chart-bar' },
        { key: 'audit', label: 'Close / Audit', icon: 'ti-lock-check' },
        { key: 'fx', label: 'Currencies', icon: 'ti-currency' },
      ]} active={tab} onChange={(k) => setTab(k as 'coa' | 'journal' | 'tb' | 'taxes' | 'reports' | 'audit' | 'fx')} />

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {msg && <p className="text-sm text-emerald-600 mb-3">{msg}</p>}
      {loading ? <Spinner /> : (
        <>
          {tab === 'coa' && (accounts.length === 0 ? (
            <div className="card p-10 text-center">
              <Icon name="ti-book-2" className="text-3xl text-muted2 block mb-2" />
              <p className="text-sm font-medium text-content mb-1">No chart of accounts yet</p>
              <p className="text-2xs text-muted mb-4">Generate a ready-made chart of accounts{industry ? ` tailored for ${industry}` : ''}, then customise it.</p>
              <button onClick={seed} disabled={busy} className="btn btn-primary mx-auto"><Icon name="ti-wand" />{busy ? 'Generating…' : 'Generate chart of accounts'}</button>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map((g) => (
                <div key={g.type} className="card overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-line bg-surface2/50 flex items-center gap-2"><span className="text-sm font-semibold text-content capitalize">{g.type}s</span><span className="text-2xs text-muted2">{g.items.length}</span></div>
                  <table className="w-full text-sm list-card">
                    <thead><tr><th className="px-4 py-2 text-left w-24">Code</th><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Subtype</th><th className="px-4 py-2 text-left w-28">Normal</th><th className="px-4 py-2"></th></tr></thead>
                    <tbody>
                      {g.items.map((a) => (
                        <tr key={a.id} className={a.is_active ? '' : 'opacity-50'}>
                          <td className="px-4 py-2 font-mono text-2xs text-muted">{a.code}</td>
                          <td className="px-4 py-2 text-content">{a.name}{a.is_system && <span className="pill pill-gray ml-2">system</span>}{!a.is_active && <span className="pill pill-gray ml-2">archived</span>}</td>
                          <td className="px-4 py-2 text-2xs text-muted2">{(a.subtype || '').replace(/_/g, ' ')}</td>
                          <td className="px-4 py-2"><span className={`pill ${a.normal_balance === 'debit' ? 'pill-blue' : 'pill-violet'}`}>{a.normal_balance}</span></td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            <button onClick={() => openEditAcct(a)} className="btn-ghost text-2xs" title="Edit"><Icon name="ti-pencil" /></button>
                            <button onClick={() => delAcct(a)} className="btn-ghost text-2xs text-rose-600 ml-1" title="Delete / archive"><Icon name="ti-trash" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}

          {tab === 'journal' && (journal.length === 0 ? <EmptyState icon="ti-notebook" text={accounts.length === 0 ? 'Set up your chart of accounts first.' : 'No journal entries yet.'} /> : (
            <div className="space-y-3">
              {journal.map((e) => {
                const td = e.journal_lines.reduce((s, l) => s + Number(l.debit), 0);
                return (
                  <div key={e.id} className="card overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-line flex items-center gap-3 flex-wrap">
                      <span className="pill pill-gray">#{e.entry_no}</span>
                      <span className="text-sm font-medium text-content">{e.memo || '—'}</span>
                      <span className="text-2xs text-muted2">{e.entry_date}</span>
                      <span className="text-2xs text-muted2 capitalize">· {e.source}</span>
                      <span className="ml-auto inline-flex items-center gap-2">
                        {e.reversed_by && <span className="pill pill-gray">reversed</span>}
                        {e.source === 'reversal' && <span className="pill pill-violet">reversal</span>}
                        {e.status === 'posted' && e.source !== 'reversal' && !e.reversed_by && <button className="btn-ghost text-2xs" onClick={() => reverseEntry(e.id)} title="Reverse"><Icon name="ti-arrow-back-up" />Reverse</button>}
                        <span className="text-2xs text-muted">Total {money(td)}</span>
                      </span>
                    </div>
                    <table className="w-full text-sm list-card">
                      <tbody>
                        {e.journal_lines.map((l) => (
                          <tr key={l.id}>
                            <td className="px-4 py-1.5 w-1/2"><span className="font-mono text-2xs text-muted2 mr-2">{l.coa_accounts?.code}</span>{l.coa_accounts?.name}{l.description ? <span className="text-2xs text-muted2"> — {l.description}</span> : ''}</td>
                            <td className="px-4 py-1.5 text-right tabular-nums text-content w-1/4">{Number(l.debit) ? money(Number(l.debit)) : ''}</td>
                            <td className="px-4 py-1.5 text-right tabular-nums text-content w-1/4">{Number(l.credit) ? money(Number(l.credit)) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          ))}

          {tab === 'tb' && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line flex items-center gap-2">
                <span className="text-2xs text-muted">As of</span>
                <input type="date" className="input h-8 w-40" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                <span className={`ml-auto text-2xs font-medium ${Math.abs(tbTotals.d - tbTotals.c) < 0.005 ? 'text-emerald-600' : 'text-rose-600'}`}>{Math.abs(tbTotals.d - tbTotals.c) < 0.005 ? 'Balanced' : 'Out of balance'}</span>
              </div>
              {tb.length === 0 ? <EmptyState icon="ti-scale" text="No accounts to report." /> : (
                <table className="w-full text-sm list-card">
                  <thead><tr><th className="px-4 py-2 text-left w-24">Code</th><th className="px-4 py-2 text-left">Account</th><th className="px-4 py-2 text-right w-32">Debit</th><th className="px-4 py-2 text-right w-32">Credit</th></tr></thead>
                  <tbody>
                    {tb.filter((r) => Number(r.debit) || Number(r.credit)).map((r) => (
                      <tr key={r.account_id}>
                        <td className="px-4 py-2 font-mono text-2xs text-muted">{r.code}</td>
                        <td className="px-4 py-2 text-content">{r.name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{Number(r.debit) ? money(Number(r.debit)) : ''}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{Number(r.credit) ? money(Number(r.credit)) : ''}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold border-t-2 border-line">
                      <td className="px-4 py-2.5" colSpan={2}>Total</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(tbTotals.d)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(tbTotals.c)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'taxes' && (
        <div className="space-y-5">
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line flex items-center justify-between"><span className="text-sm font-semibold text-content">Tax rates</span><button className="btn btn-primary h-8 py-0" onClick={() => setTaxDraft({ name: '', rate: '', kind: 'output', account_id: '', is_active: true })}><Icon name="ti-plus" />New rate</button></div>
            {taxList.length === 0 ? <EmptyState icon="ti-receipt-tax" text="No tax rates yet." /> : (
              <table className="w-full text-sm list-card">
                <thead><tr><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-right w-24">Rate</th><th className="px-4 py-2 text-left w-28">Kind</th><th className="px-4 py-2 text-left">Account</th><th className="px-4 py-2"></th></tr></thead>
                <tbody>{taxList.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2 text-content">{t.name}{!t.is_active && <span className="pill pill-gray ml-2">off</span>}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{(Number(t.rate) * 100).toFixed(2)}%</td>
                    <td className="px-4 py-2 capitalize">{t.kind}</td>
                    <td className="px-4 py-2 text-2xs text-muted2">{accounts.find((a) => a.id === t.account_id) ? `${accounts.find((a) => a.id === t.account_id)!.code} ${accounts.find((a) => a.id === t.account_id)!.name}` : '—'}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap"><button className="btn-ghost text-2xs" onClick={() => setTaxDraft({ id: t.id, name: t.name, rate: String(Number(t.rate) * 100), kind: t.kind, account_id: t.account_id || '', is_active: t.is_active })}><Icon name="ti-pencil" /></button><button className="btn-ghost text-2xs text-rose-600 ml-1" onClick={() => delTax(t.id)}><Icon name="ti-trash" /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line flex items-center gap-2 flex-wrap"><span className="text-sm font-semibold text-content">Tax summary</span><span className="text-2xs text-muted ml-2">From</span><input type="date" className="input h-8 w-36" value={taxFrom} onChange={(e) => setTaxFrom(e.target.value)} /><span className="text-2xs text-muted">To</span><input type="date" className="input h-8 w-36" value={taxTo} onChange={(e) => setTaxTo(e.target.value)} /></div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-line p-3"><p className="text-2xs text-muted">Output tax (collected)</p><p className="text-lg font-semibold tabular-nums text-content">{money(taxOut)}</p></div>
              <div className="rounded-lg border border-line p-3"><p className="text-2xs text-muted">Input tax (paid)</p><p className="text-lg font-semibold tabular-nums text-content">{money(taxIn)}</p></div>
              <div className="rounded-lg border border-line p-3"><p className="text-2xs text-muted">Net payable</p><p className={`text-lg font-semibold tabular-nums ${taxOut - taxIn >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(taxOut - taxIn)}</p></div>
            </div>
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
              {([['pl', 'P&L'], ['bs', 'Balance Sheet'], ['cf', 'Cash Flow'], ['budget', 'Budget'], ['forecast', 'Forecast'], ['projects', 'By project']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setRptType(v)} className={`h-8 px-3 rounded text-sm transition ${rptType === v ? 'bg-accent/15 text-accentstrong font-medium' : 'text-muted hover:text-content'}`}>{l}</button>
              ))}
            </div>
            {rptType === 'bs' ? (
              <><span className="text-2xs text-muted ml-1">As of</span><input type="date" className="input h-8 w-40" value={rptAsOf} onChange={(e) => setRptAsOf(e.target.value)} /></>
            ) : rptType === 'budget' ? (
              <><span className="text-2xs text-muted ml-1">Month</span><input type="month" className="input h-8 w-40" value={rptMonth} onChange={(e) => setRptMonth(e.target.value)} /></>
            ) : rptType === 'forecast' ? (
              <><span className="text-2xs text-muted ml-1">Horizon</span><Select value={String(fcMonths)} onChange={(v) => setFcMonths(Number(v))} options={[3, 6, 12].map((n) => ({ value: String(n), label: `${n} months` }))} /></>
            ) : (
              <><span className="text-2xs text-muted ml-1">From</span><input type="date" className="input h-8 w-36" value={rptFrom} onChange={(e) => setRptFrom(e.target.value)} /><span className="text-2xs text-muted">To</span><input type="date" className="input h-8 w-36" value={rptTo} onChange={(e) => setRptTo(e.target.value)} /></>
            )}
            {rptType === 'pl' && (
              <div className="inline-flex rounded-md border border-line bg-surface p-0.5 ml-1">
                {(['accrual', 'cash'] as const).map((b) => (<button key={b} onClick={() => setPlBasis(b)} className={`h-8 px-2.5 rounded text-2xs capitalize transition ${plBasis === b ? 'bg-accent/15 text-accentstrong font-medium' : 'text-muted hover:text-content'}`}>{b}</button>))}
              </div>
            )}
          </div>

          {rptType === 'pl' && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line"><span className="text-sm font-semibold text-content">Profit &amp; Loss</span></div>
              <table className="w-full text-sm list-card"><tbody>
                <tr><td className="px-4 py-2 font-semibold text-content" colSpan={2}>Income</td></tr>
                {plRows.filter((r) => r.section === 'income').map((r) => (<tr key={r.account_id}><td className="px-4 py-1.5 pl-8 text-content">{r.code} {r.name}</td><td className="px-4 py-1.5 text-right tabular-nums w-44">{money(Number(r.amount))}</td></tr>))}
                <tr className="font-medium"><td className="px-4 py-1.5 pl-8">Total income</td><td className="px-4 py-1.5 text-right tabular-nums">{money(plIncome)}</td></tr>
                <tr><td className="px-4 py-2 font-semibold text-content" colSpan={2}>Expenses</td></tr>
                {plRows.filter((r) => r.section === 'expense').map((r) => (<tr key={r.account_id}><td className="px-4 py-1.5 pl-8 text-content">{r.code} {r.name}</td><td className="px-4 py-1.5 text-right tabular-nums">{money(Number(r.amount))}</td></tr>))}
                <tr className="font-medium"><td className="px-4 py-1.5 pl-8">Total expenses</td><td className="px-4 py-1.5 text-right tabular-nums">{money(plExpense)}</td></tr>
                <tr className="font-semibold border-t-2 border-line"><td className="px-4 py-2.5">Net profit</td><td className={`px-4 py-2.5 text-right tabular-nums ${plIncome - plExpense >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{money(plIncome - plExpense)}</td></tr>
              </tbody></table>
            </div>
          )}

          {rptType === 'bs' && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line flex items-center justify-between"><span className="text-sm font-semibold text-content">Balance Sheet</span><span className={`text-2xs font-medium ${Math.abs(bsAssets - bsLE) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>{Math.abs(bsAssets - bsLE) < 0.01 ? 'Balanced' : 'Out of balance'}</span></div>
              <table className="w-full text-sm list-card"><tbody>
                {(['asset', 'liability', 'equity'] as const).flatMap((sec) => {
                  const rows = bsRows.filter((r) => r.section === sec);
                  const tot = rows.reduce((s2, r) => s2 + Number(r.amount), 0);
                  const lbl = sec === 'asset' ? 'Assets' : sec === 'liability' ? 'Liabilities' : 'Equity';
                  return [
                    <tr key={sec + '-h'}><td className="px-4 py-2 font-semibold text-content" colSpan={2}>{lbl}</td></tr>,
                    ...rows.map((r, i) => (<tr key={sec + i}><td className="px-4 py-1.5 pl-8 text-content">{r.code} {r.name}</td><td className="px-4 py-1.5 text-right tabular-nums w-44">{money(Number(r.amount))}</td></tr>)),
                    <tr key={sec + '-t'} className="font-medium"><td className="px-4 py-1.5 pl-8">Total {lbl.toLowerCase()}</td><td className="px-4 py-1.5 text-right tabular-nums">{money(tot)}</td></tr>,
                  ];
                })}
                <tr className="font-semibold border-t-2 border-line"><td className="px-4 py-2.5">Assets vs Liabilities + Equity</td><td className="px-4 py-2.5 text-right tabular-nums">{money(bsAssets)} / {money(bsLE)}</td></tr>
              </tbody></table>
            </div>
          )}

          {rptType === 'cf' && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line"><span className="text-sm font-semibold text-content">Cash Flow</span></div>
              <table className="w-full text-sm list-card"><tbody>
                <tr><td className="px-4 py-2 text-content">Opening cash</td><td className="px-4 py-2 text-right tabular-nums w-44">{money(cfMap('opening'))}</td></tr>
                <tr><td className="px-4 py-2 pl-8 text-content">Cash in</td><td className="px-4 py-2 text-right tabular-nums text-emerald-600">{money(cfMap('inflows'))}</td></tr>
                <tr><td className="px-4 py-2 pl-8 text-content">Cash out</td><td className="px-4 py-2 text-right tabular-nums text-rose-600">{money(cfMap('outflows'))}</td></tr>
                <tr className="font-medium"><td className="px-4 py-2">Net change</td><td className="px-4 py-2 text-right tabular-nums">{money(cfMap('net'))}</td></tr>
                <tr className="font-semibold border-t-2 border-line"><td className="px-4 py-2.5">Closing cash</td><td className="px-4 py-2.5 text-right tabular-nums">{money(cfMap('closing'))}</td></tr>
              </tbody></table>
            </div>
          )}
        </div>
      )}

      {tab === 'reports' && rptType === 'budget' && (
        <div className="card overflow-hidden mt-1">
          <div className="px-4 py-2.5 border-b border-line"><span className="text-sm font-semibold text-content">Budget vs Actual</span><span className="text-2xs text-muted ml-2">edit the budget column; saved per month</span></div>
          {budRows.length === 0 ? <EmptyState icon="ti-chart-bar" text="No income or expense accounts yet." /> : (
            <table className="w-full text-sm list-card">
              <thead><tr><th className="px-4 py-2 text-left">Account</th><th className="px-4 py-2 text-right w-36">Budget</th><th className="px-4 py-2 text-right w-36">Actual</th><th className="px-4 py-2 text-right w-36">Variance</th></tr></thead>
              <tbody>{budRows.map((r) => { const bud = parseFloat(budEdit[r.account_id]) || 0; const variance = r.type === 'expense' ? bud - Number(r.actual) : Number(r.actual) - bud; return (
                <tr key={r.account_id}>
                  <td className="px-4 py-1.5 text-content"><span className="font-mono text-2xs text-muted2 mr-2">{r.code}</span>{r.name}</td>
                  <td className="px-4 py-1.5 text-right"><input className="input h-8 text-right tabular-nums w-28 ml-auto" inputMode="decimal" value={budEdit[r.account_id] ?? ''} onChange={(e) => setBudEdit({ ...budEdit, [r.account_id]: e.target.value })} onBlur={() => saveBudget(r.account_id)} onKeyDown={(e) => { if (e.key === 'Enter') saveBudget(r.account_id); }} placeholder="0.00" /></td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{money(Number(r.actual))}</td>
                  <td className={`px-4 py-1.5 text-right tabular-nums ${variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{money(variance)}</td>
                </tr>
              ); })}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'reports' && rptType === 'forecast' && (
        <div className="card overflow-hidden mt-1">
          <div className="px-4 py-2.5 border-b border-line"><span className="text-sm font-semibold text-content">Cash-flow forecast</span><span className="text-2xs text-muted ml-2">projected from receivables due, payables due and recurring expenses</span></div>
          {fcRows.length === 0 ? <EmptyState icon="ti-chart-line" text="Nothing to forecast yet." /> : (
            <table className="w-full text-sm list-card">
              <thead><tr><th className="px-4 py-2 text-left">Month</th><th className="px-4 py-2 text-right w-32">Cash in</th><th className="px-4 py-2 text-right w-32">Cash out</th><th className="px-4 py-2 text-right w-32">Net</th><th className="px-4 py-2 text-right w-36">Projected cash</th></tr></thead>
              <tbody>{fcRows.map((r) => (
                <tr key={r.period}>
                  <td className="px-4 py-2 text-content">{r.period}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{money(Number(r.inflow))}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-rose-600">{money(Number(r.outflow))}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(Number(r.net))}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${Number(r.running) >= 0 ? 'text-content' : 'text-rose-600'}`}>{money(Number(r.running))}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'reports' && rptType === 'projects' && (
        <div className="card overflow-hidden mt-1">
          <div className="px-4 py-2.5 border-b border-line"><span className="text-sm font-semibold text-content">Profitability by project</span><span className="text-2xs text-muted ml-2">revenue, cost and margin from the ledger (tag invoices/bills/expenses with a project)</span></div>
          {projRows.length === 0 ? <EmptyState icon="ti-chart-bar" text="No project-tagged transactions yet." /> : (
            <table className="w-full text-sm list-card">
              <thead><tr><th className="px-4 py-2 text-left">Project</th><th className="px-4 py-2 text-right w-36">Revenue</th><th className="px-4 py-2 text-right w-36">Cost</th><th className="px-4 py-2 text-right w-36">Margin</th></tr></thead>
              <tbody>{projRows.map((r) => (
                <tr key={r.project_id}>
                  <td className="px-4 py-2 text-content">{r.project_name || r.project_id.slice(0, 8)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{money(Number(r.revenue))}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-rose-600">{money(Number(r.cost))}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${Number(r.margin) >= 0 ? 'text-content' : 'text-rose-600'}`}>{money(Number(r.margin))}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'fx' && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-content">Exchange rates</span>
            <span className="text-2xs text-muted2">Base currency: <span className="font-medium text-content">{settings?.base_currency || 'USD'}</span> · rate = base units per 1 unit</span>
            <span className="ml-auto inline-flex items-center gap-1.5"><span className="text-2xs text-muted">Revalue as of</span><input type="date" className="input h-8 w-36" value={revalDate} onChange={(e) => setRevalDate(e.target.value)} /><button className="btn h-8 py-0" disabled={busy} onClick={revalue} title="Post unrealized FX gain/loss on open foreign balances"><Icon name="ti-refresh" />Revalue</button></span>
          </div>
          <div className="p-4 flex items-end gap-2 flex-wrap border-b border-line">
            <Field label="Currency"><input className="input h-9 w-28 uppercase" value={fxDraft.currency} onChange={(e) => setFxDraft({ ...fxDraft, currency: e.target.value })} placeholder="EUR" /></Field>
            <Field label="Rate"><input className="input h-9 w-32 text-right" inputMode="decimal" value={fxDraft.rate} onChange={(e) => setFxDraft({ ...fxDraft, rate: e.target.value })} placeholder="1.10" /></Field>
            <Field label="As of"><input type="date" className="input h-9 w-40" value={fxDraft.as_of} onChange={(e) => setFxDraft({ ...fxDraft, as_of: e.target.value })} /></Field>
            <button className="btn btn-primary h-9" disabled={busy || !fxDraft.currency.trim() || !fxDraft.rate} onClick={saveFx}><Icon name="ti-plus" />Add rate</button>
          </div>
          {fxList.length === 0 ? <EmptyState icon="ti-currency" text="No exchange rates yet. Add one to record foreign-currency transactions." /> : (
            <table className="w-full text-sm list-card">
              <thead><tr><th className="px-4 py-2 text-left">Currency</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-left">As of</th><th className="px-4 py-2"></th></tr></thead>
              <tbody>{fxList.map((r) => (
                <tr key={r.id}><td className="px-4 py-2 font-medium text-content">{r.currency}</td><td className="px-4 py-2 text-right tabular-nums">{Number(r.rate)}</td><td className="px-4 py-2 text-2xs text-muted2">{r.as_of}</td><td className="px-4 py-2 text-right"><button className="btn-ghost text-2xs text-rose-600" onClick={() => delFx(r.id)}><Icon name="ti-trash" /></button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-3"><p className="text-2xs text-muted">Journal entries</p><p className="text-lg font-semibold text-content">{auditData.entries || 0}</p></div>
            <div className="card p-3"><p className="text-2xs text-muted">Reversals</p><p className="text-lg font-semibold text-content">{auditData.reversals || 0}</p></div>
            <div className="card p-3"><p className="text-2xs text-muted">Closed periods</p><p className="text-lg font-semibold text-content">{auditData.closed_periods || 0}</p></div>
            <div className="card p-3"><p className="text-2xs text-muted">Out of balance</p><p className={`text-lg font-semibold ${(auditData.unbalanced || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{auditData.unbalanced || 0}</p></div>
          </div>
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line"><span className="text-sm font-semibold text-content">Entries by source</span></div>
            <div className="p-4 flex flex-wrap gap-2">
              {Object.entries(auditData.by_source || {}).map(([k, v]) => (<span key={k} className="pill pill-gray capitalize">{k.replace(/_/g, ' ')}: {v}</span>))}
              {Object.keys(auditData.by_source || {}).length === 0 && <span className="text-2xs text-muted">No entries yet.</span>}
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line flex items-center gap-2 flex-wrap"><span className="text-sm font-semibold text-content">Period close</span><span className="text-2xs text-muted ml-2">Closing a month locks it — no new entries can post into it.</span></div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input type="month" className="input h-8 w-40" value={closeMonth} onChange={(e) => setCloseMonth(e.target.value)} />
                <button className="btn btn-primary h-8 py-0" onClick={closePeriod}><Icon name="ti-lock" />Close month</button>
              </div>
              {periods.length > 0 && (
                <table className="w-full text-sm list-card">
                  <thead><tr><th className="px-4 py-2 text-left">Closed period</th><th className="px-4 py-2 text-left">Closed at</th><th className="px-4 py-2"></th></tr></thead>
                  <tbody>{periods.map((p) => (<tr key={p.id}><td className="px-4 py-2 text-content">{p.label}</td><td className="px-4 py-2 text-2xs text-muted2">{p.closed_at ? new Date(p.closed_at).toLocaleDateString() : ''}</td><td className="px-4 py-2 text-right"><button className="btn-ghost text-2xs" onClick={() => reopenPeriod(p)}><Icon name="ti-lock-open" />Reopen</button></td></tr>))}</tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Accounting settings modal */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} size="md" icon="ti-settings" title="Accounting settings"
        footer={<><button className="btn" onClick={() => setSettingsOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={async () => { if (!orgId || !sDraft) return; setBusy(true); setErr(''); try { await accountingSettingsSave(orgId, sDraft); setSettings(sDraft); setPlBasis(sDraft.basis === 'cash' ? 'cash' : 'accrual'); setSettingsOpen(false); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}>Save</button></>}>
        {sDraft && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fiscal year starts" hint="month the financial year begins"><Select value={String(sDraft.fiscal_year_start_month)} onChange={(v) => setSDraft({ ...sDraft, fiscal_year_start_month: Number(v) })} options={['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => ({ value: String(i + 1), label: m }))} /></Field>
            <Field label="Base currency"><input className="input" value={sDraft.base_currency} onChange={(e) => setSDraft({ ...sDraft, base_currency: e.target.value })} placeholder="USD" /></Field>
            <Field label="Default basis" hint="for statements"><Select value={sDraft.basis} onChange={(v) => setSDraft({ ...sDraft, basis: v })} options={[{ value: 'accrual', label: 'Accrual' }, { value: 'cash', label: 'Cash' }]} /></Field>
            <Field label="Lock date" hint="block posting on/before this date"><input type="date" className="input" value={sDraft.lock_date || ''} onChange={(e) => setSDraft({ ...sDraft, lock_date: e.target.value || null })} /></Field>
          </div>
        )}
      </Modal>

      {/* Tax rate modal */}
      <Modal open={!!taxDraft} onClose={() => setTaxDraft(null)} size="sm" icon="ti-receipt-tax" title={taxDraft?.id ? 'Edit tax rate' : 'New tax rate'}
        footer={<><button className="btn" onClick={() => setTaxDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !taxDraft?.name.trim()} onClick={saveTax}>{busy ? 'Saving…' : 'Save'}</button></>}>
        {taxDraft && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required className="col-span-2"><input className="input" value={taxDraft.name} onChange={(e) => setTaxDraft({ ...taxDraft, name: e.target.value })} placeholder="VAT 20%" /></Field>
            <Field label="Rate %" required><input className="input text-right" inputMode="decimal" value={taxDraft.rate} onChange={(e) => setTaxDraft({ ...taxDraft, rate: e.target.value })} placeholder="20" /></Field>
            <Field label="Kind"><Select value={taxDraft.kind} onChange={(v) => setTaxDraft({ ...taxDraft, kind: v })} options={[{ value: 'output', label: 'Output (sales)' }, { value: 'input', label: 'Input (purchases)' }, { value: 'both', label: 'Both' }]} /></Field>
            <Field label="Linked account" className="col-span-2"><Select value={taxDraft.account_id} onChange={(v) => setTaxDraft({ ...taxDraft, account_id: v })} options={[{ value: '', label: 'None' }, ...acctOptions]} search /></Field>
            <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={taxDraft.is_active} onChange={(e) => setTaxDraft({ ...taxDraft, is_active: e.target.checked })} />Active</label>
          </div>
        )}
      </Modal>

      {/* Account modal */}
      <Modal open={!!acct} onClose={() => setAcct(null)} size="md" icon="ti-list-tree" title={acct?.id ? 'Edit account' : 'New account'}
        footer={<><button className="btn" onClick={() => setAcct(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !acct?.code.trim() || !acct?.name.trim()} onClick={saveAcct}>{busy ? 'Saving…' : 'Save account'}</button></>}>
        {acct && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" required><input className="input font-mono" value={acct.code} onChange={(e) => setAcct({ ...acct, code: e.target.value })} placeholder="6300" /></Field>
            <Field label="Currency"><input className="input" value={acct.currency} onChange={(e) => setAcct({ ...acct, currency: e.target.value })} placeholder="USD" /></Field>
            <Field label="Name" required className="col-span-2"><input className="input" value={acct.name} onChange={(e) => setAcct({ ...acct, name: e.target.value })} placeholder="Office Supplies" /></Field>
            <Field label="Type" required><Select value={acct.type} onChange={(v) => setAcct({ ...acct, type: v, normal_balance: NB_DEFAULT[v] || acct.normal_balance })} options={TYPES} /></Field>
            <Field label="Normal balance" required hint="Flip for contra accounts"><Select value={acct.normal_balance} onChange={(v) => setAcct({ ...acct, normal_balance: v })} options={[{ value: 'debit', label: 'Debit' }, { value: 'credit', label: 'Credit' }]} /></Field>
            <Field label="Subtype" className="col-span-2"><input className="input" value={acct.subtype} onChange={(e) => setAcct({ ...acct, subtype: e.target.value })} placeholder="operating_expense" /></Field>
            <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={acct.is_active} onChange={(e) => setAcct({ ...acct, is_active: e.target.checked })} />Active</label>
          </div>
        )}
      </Modal>

      {/* Journal entry modal */}
      <Modal open={jOpen} onClose={() => setJOpen(false)} size="lg" icon="ti-notebook" title="New journal entry"
        footer={<><span className={`text-2xs mr-auto ${jBalanced ? 'text-emerald-600' : 'text-muted2'}`}>Debits {money(jTotals.d)} · Credits {money(jTotals.c)} {jBalanced ? '· balanced' : ''}</span><button className="btn" onClick={() => setJOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy || !jValid} onClick={postJournal}>{busy ? 'Posting…' : 'Post entry'}</button></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required><input type="date" className="input" value={jDate} onChange={(e) => setJDate(e.target.value)} /></Field>
            <Field label="Memo"><input className="input" value={jMemo} onChange={(e) => setJMemo(e.target.value)} placeholder="Description of the entry" /></Field>
          </div>
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_7rem_7rem_2rem] gap-2 text-2xs uppercase tracking-wide text-muted2 px-1"><span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span></span></div>
            {jLines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_7rem_2rem] gap-2 items-center">
                <Select value={l.account_id} onChange={(v) => setLine(i, { account_id: v })} options={acctOptions} placeholder="Select account…" search />
                <input className="input h-9 text-right tabular-nums" inputMode="decimal" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} placeholder="0.00" />
                <input className="input h-9 text-right tabular-nums" inputMode="decimal" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} placeholder="0.00" />
                <button className="btn-ghost text-2xs text-rose-600" title="Remove line" onClick={() => setJLines((ls) => ls.length > 2 ? ls.filter((_, idx) => idx !== i) : ls)}><Icon name="ti-x" /></button>
              </div>
            ))}
            <button className="btn-ghost text-2xs" onClick={() => setJLines((ls) => [...ls, { account_id: '', debit: '', credit: '', description: '' }])}><Icon name="ti-plus" />Add line</button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}

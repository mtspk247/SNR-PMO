import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg } from '@/lib/store';
import { recognitionSchedules, recognitionSave, recognitionGenerateDue, recognitionDelete, RecognitionSchedule } from '@/lib/db';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const KINDS = [{ value: 'deferred_revenue', label: 'Deferred revenue — prepaid by customer' }, { value: 'prepaid_expense', label: 'Prepaid expense — we paid upfront' }];
const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
type Draft = { id?: string; kind: string; title: string; counterparty: string; total_amount: string; currency: string; start_date: string; months: string; status: string; notes: string; post_opening: boolean };

const STATUS_PILL: Record<string, string> = {
  active: 'pill-green',
  complete: 'pill-gray',
  paused: 'pill-amber',
};
const STATUS_ORDER = ['active', 'paused', 'complete'] as const;
const GROUPS: GroupMeta[] = STATUS_ORDER.map((st) => ({ value: st, label: st.charAt(0).toUpperCase() + st.slice(1), pill: STATUS_PILL[st] || 'pill-gray' }));

const COLS: ColDef[] = [
  { id: 'title',      label: 'Title',      locked: true },
  { id: 'kind',       label: 'Type' },
  { id: 'total',      label: 'Total' },
  { id: 'recognized', label: 'Recognized' },
  { id: 'next_run',   label: 'Next run' },
  { id: 'status',     label: 'Status' },
];

const RR_FILTERS: FilterDef[] = [
  {
    id: 'status',
    label: 'Status',
    options: [
      { value: 'all',      label: 'All statuses' },
      { value: 'active',   label: 'Active' },
      { value: 'paused',   label: 'Paused' },
      { value: 'complete', label: 'Complete' },
    ],
  },
  {
    id: 'kind',
    label: 'Type',
    options: [
      { value: 'all',              label: 'All types' },
      { value: 'deferred_revenue', label: 'Deferred revenue' },
      { value: 'prepaid_expense',  label: 'Prepaid expense' },
    ],
  },
];

export default function RevenueRecognitionPage() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const [rows, setRows] = useState<RecognitionSchedule[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const prefs = useListPrefs('snrpmo.revenue_recognition.cols', COLS);
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';
  const kindF = prefs.filters.kind || 'all';

  const load = () => {
    if (!orgId) return;
    recognitionSchedules(orgId).then(setRows).catch((e) => setErr(e.message));
  };

  useEffect(() => {
    if (!orgId) return;
    setRows(null);
    recognitionSchedules(orgId)
      .then(setRows)
      .catch((e) => { setErr(e.message); setRows([]); });
  }, [orgId]);

  const dueCount = useMemo(() => (rows || []).filter((r) => r.status === 'active' && r.next_run && r.next_run <= today()).length, [rows]);
  const deferred = useMemo(() => (rows || []).filter((r) => r.kind === 'deferred_revenue' && r.status === 'active').reduce((s, r) => s + (Number(r.total_amount) - Number(r.recognized_amount)), 0), [rows]);

  const shown = useMemo(() =>
    (rows || []).filter((r) =>
      (statusF === 'all' || r.status === statusF) &&
      (kindF === 'all' || r.kind === kindF) &&
      (!q.trim() || `${r.title} ${r.counterparty || ''}`.toLowerCase().includes(q.toLowerCase()))
    ),
    [rows, q, statusF, kindF]
  );

  const rs = useRowSelection(shown);

  const cell = (id: string, r: RecognitionSchedule) => {
    switch (id) {
      case 'title':
        return (
          <span className="font-medium text-content">
            {r.title}
            {r.counterparty ? <span className="block text-2xs text-muted2">{r.counterparty}</span> : null}
          </span>
        );
      case 'kind':
        return <span className={`pill ${r.kind === 'deferred_revenue' ? 'pill-green' : 'pill-blue'}`}>{r.kind === 'deferred_revenue' ? 'Deferred rev' : 'Prepaid exp'}</span>;
      case 'total':
        return <span className="tabular-nums">{money(Number(r.total_amount))}</span>;
      case 'recognized': {
        const pct = Number(r.total_amount) > 0 ? Math.round(Number(r.recognized_amount) / Number(r.total_amount) * 100) : 0;
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
              <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-2xs text-muted2 tabular-nums w-8 text-right">{pct}%</span>
          </div>
        );
      }
      case 'next_run':
        return (
          <span className={r.status === 'active' && r.next_run && r.next_run <= today() ? 'text-rose-600 font-medium text-2xs' : 'text-muted2 text-2xs'}>
            {r.next_run || '—'}
          </span>
        );
      case 'status':
        return <span className={`pill ${STATUS_PILL[r.status] || 'pill-gray'}`}>{r.status}</span>;
      default:
        return '—';
    }
  };

  const exportValue = (id: string, r: RecognitionSchedule) => {
    switch (id) {
      case 'title':      return r.title;
      case 'kind':       return r.kind === 'deferred_revenue' ? 'Deferred revenue' : 'Prepaid expense';
      case 'total':      return money(Number(r.total_amount));
      case 'recognized': return Number(r.total_amount) > 0 ? `${Math.round(Number(r.recognized_amount) / Number(r.total_amount) * 100)}%` : '0%';
      case 'next_run':   return r.next_run || '';
      case 'status':     return r.status;
      default:           return '';
    }
  };

  const bulkDelete = async () => {
    if (!rs.count || !orgId || !confirm(`Delete ${rs.count} schedule${rs.count > 1 ? 's' : ''}? Already-recognized entries are kept.`)) return;
    setBusy(true); setErr('');
    try { for (const r of rs.selected) await recognitionDelete(orgId, r.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const openNew = () => setDraft({ kind: 'deferred_revenue', title: '', counterparty: '', total_amount: '', currency: 'USD', start_date: today(), months: '12', status: 'active', notes: '', post_opening: true });
  const openEdit = (r: RecognitionSchedule) => setDraft({ id: r.id, kind: r.kind, title: r.title, counterparty: r.counterparty || '', total_amount: String(r.total_amount), currency: r.currency, start_date: r.start_date, months: String(r.months), status: r.status, notes: r.notes || '', post_opening: false });

  const save = async () => {
    if (!orgId || !draft || busy) return; setBusy(true); setErr('');
    try {
      await recognitionSave(orgId, { id: draft.id, kind: draft.kind, title: draft.title, counterparty: draft.counterparty || null, total_amount: parseFloat(draft.total_amount) || 0, currency: draft.currency, start_date: draft.start_date || null, months: parseInt(draft.months) || 12, status: draft.status, notes: draft.notes || null, post_opening: draft.post_opening });
      setDraft(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const generate = async () => {
    if (!orgId || busy) return; setBusy(true); setErr(''); setMsg('');
    try { const r = await recognitionGenerateDue(orgId); setMsg(`Posted ${r.recognized} recognition entr${r.recognized === 1 ? 'y' : 'ies'}.`); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!org) return <Layout flat title="Revenue Recognition"><EmptyState icon="ti-calendar-stats" text="No organisation active." /></Layout>;

  return (
    <Layout flat title="Revenue Recognition">
      <PageHeader
        title="Revenue Recognition"
        subtitle="Spread prepaid revenue or prepaid expenses over time — posts the monthly entry automatically."
        icon="ti-calendar-stats"
        action={
          <div className="flex items-center gap-2">
            <button onClick={generate} disabled={busy} className="btn">
              <Icon name="ti-player-play" />Recognize due{dueCount ? ` (${dueCount})` : ''}
            </button>
            <button onClick={openNew} className="btn btn-primary">
              <Icon name="ti-plus" />New schedule
            </button>
          </div>
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {msg && <p className="text-sm text-emerald-600 mb-3">{msg}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Active schedules" value={String((rows || []).filter((r) => r.status === 'active').length)} icon="ti-calendar-stats" />
        <StatCard label="Due now" value={String(dueCount)} icon="ti-clock" hintTone={dueCount ? 'down' : 'muted'} />
        <StatCard label="Unearned (deferred)" value={money(deferred)} icon="ti-lock" />
      </div>

      <ListView
        rows={rows === null ? null : shown}
        rowKey={(r) => r.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={RR_FILTERS}
        searchPlaceholder="Search schedules…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(r) => r.status}
        groups={GROUPS}
        onRowClick={openEdit}
        exportName="revenue-recognition"
        exportValue={exportValue}
        onDelete={bulkDelete}
        canDelete
        busy={busy}
        emptyIcon="ti-calendar-stats"
        emptyText="No recognition schedules yet."
      />

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        size="md"
        icon="ti-calendar-stats"
        title={draft?.id ? 'Edit schedule' : 'New recognition schedule'}
        footer={
          <>
            <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !draft?.title.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          </>
        }
      >
        {draft && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" className="col-span-2">
              <Select value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })} options={KINDS} />
            </Field>
            <Field label="Title" required className="col-span-2">
              <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Annual plan / Annual insurance" />
            </Field>
            <Field label={draft.kind === 'deferred_revenue' ? 'Customer' : 'Vendor'}>
              <input className="input" value={draft.counterparty} onChange={(e) => setDraft({ ...draft, counterparty: e.target.value })} />
            </Field>
            <Field label="Total amount">
              <input className="input text-right" inputMode="decimal" value={draft.total_amount} onChange={(e) => setDraft({ ...draft, total_amount: e.target.value })} placeholder="1200.00" />
            </Field>
            <Field label="Start date">
              <input type="date" className="input" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
            </Field>
            <Field label="Months to spread">
              <input className="input text-right" inputMode="numeric" value={draft.months} onChange={(e) => setDraft({ ...draft, months: e.target.value })} placeholder="12" />
            </Field>
            <Field label="Notes" className="col-span-2">
              <input className="input" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional" />
            </Field>
            {!draft.id && (
              <label className="col-span-2 flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-line p-3">
                <input type="checkbox" className="accent-accent w-4 h-4 mt-0.5" checked={draft.post_opening} onChange={(e) => setDraft({ ...draft, post_opening: e.target.checked })} />
                <span>
                  <span className="text-content">Record the upfront cash now</span>
                  <span className="block text-2xs text-muted">{draft.kind === 'deferred_revenue' ? 'Dr Bank / Cr Deferred Revenue' : 'Dr Prepaid Expense / Cr Bank'} for the total. Leave off if the cash is already booked elsewhere.</span>
                </span>
              </label>
            )}
          </div>
        )}
      </Modal>
    </Layout>
  );
}

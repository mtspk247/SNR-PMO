import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg } from '@/lib/store';
import { recognitionSchedules, recognitionSave, recognitionGenerateDue, recognitionDelete, RecognitionSchedule } from '@/lib/db';

const KINDS = [{ value: 'deferred_revenue', label: 'Deferred revenue — prepaid by customer' }, { value: 'prepaid_expense', label: 'Prepaid expense — we paid upfront' }];
const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
type Draft = { id?: string; kind: string; title: string; counterparty: string; total_amount: string; currency: string; start_date: string; months: string; status: string; notes: string; post_opening: boolean };

export default function RevenueRecognitionPage() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const [rows, setRows] = useState<RecognitionSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = () => { if (!orgId) return; recognitionSchedules(orgId).then(setRows).catch((e) => setErr(e.message)); };
  useEffect(() => { if (!orgId) return; setLoading(true); recognitionSchedules(orgId).then(setRows).catch((e) => setErr(e.message)).finally(() => setLoading(false)); }, [orgId]);

  const dueCount = useMemo(() => rows.filter((r) => r.status === 'active' && r.next_run && r.next_run <= today()).length, [rows]);
  const deferred = useMemo(() => rows.filter((r) => r.kind === 'deferred_revenue' && r.status === 'active').reduce((s, r) => s + (Number(r.total_amount) - Number(r.recognized_amount)), 0), [rows]);

  const openNew = () => setDraft({ kind: 'deferred_revenue', title: '', counterparty: '', total_amount: '', currency: 'USD', start_date: today(), months: '12', status: 'active', notes: '', post_opening: true });
  const openEdit = (r: RecognitionSchedule) => setDraft({ id: r.id, kind: r.kind, title: r.title, counterparty: r.counterparty || '', total_amount: String(r.total_amount), currency: r.currency, start_date: r.start_date, months: String(r.months), status: r.status, notes: r.notes || '', post_opening: false });
  const save = async () => {
    if (!orgId || !draft || busy) return; setBusy(true); setErr('');
    try { await recognitionSave(orgId, { id: draft.id, kind: draft.kind, title: draft.title, counterparty: draft.counterparty || null, total_amount: parseFloat(draft.total_amount) || 0, currency: draft.currency, start_date: draft.start_date || null, months: parseInt(draft.months) || 12, status: draft.status, notes: draft.notes || null, post_opening: draft.post_opening }); setDraft(null); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const del = async (r: RecognitionSchedule) => { if (!orgId || !confirm(`Delete schedule "${r.title}"? Already-recognized entries are kept.`)) return; try { await recognitionDelete(orgId, r.id); load(); } catch (e: any) { setErr(e.message); } };
  const generate = async () => { if (!orgId || busy) return; setBusy(true); setErr(''); setMsg(''); try { const r = await recognitionGenerateDue(orgId); setMsg(`Posted ${r.recognized} recognition entr${r.recognized === 1 ? 'y' : 'ies'}.`); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

  if (!org) return <Layout flat title="Revenue Recognition"><Spinner /></Layout>;

  return (
    <Layout flat title="Revenue Recognition">
      <PageHeader title="Revenue Recognition" subtitle="Spread prepaid revenue or prepaid expenses over time — posts the monthly entry automatically." icon="ti-calendar-stats"
        action={<div className="flex items-center gap-2"><button onClick={generate} disabled={busy} className="btn"><Icon name="ti-player-play" />Recognize due{dueCount ? ` (${dueCount})` : ''}</button><button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New schedule</button></div>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {msg && <p className="text-sm text-emerald-600 mb-3">{msg}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Active schedules" value={String(rows.filter((r) => r.status === 'active').length)} icon="ti-calendar-stats" />
        <StatCard label="Due now" value={String(dueCount)} icon="ti-clock" hintTone={dueCount ? 'down' : 'muted'} />
        <StatCard label="Unearned (deferred)" value={money(deferred)} icon="ti-lock" />
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon="ti-calendar-stats" text="No recognition schedules yet." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm list-card">
            <thead><tr><th className="px-4 py-2 text-left">Title</th><th className="px-4 py-2 text-left">Type</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-left w-40">Recognized</th><th className="px-4 py-2 text-left">Next</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>
              {rows.map((r) => { const pct = Number(r.total_amount) > 0 ? Math.round(Number(r.recognized_amount) / Number(r.total_amount) * 100) : 0; return (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-content font-medium">{r.title}{r.counterparty ? <span className="block text-2xs text-muted2">{r.counterparty}</span> : ''}</td>
                  <td className="px-4 py-2"><span className={`pill ${r.kind === 'deferred_revenue' ? 'pill-green' : 'pill-blue'}`}>{r.kind === 'deferred_revenue' ? 'Deferred rev' : 'Prepaid exp'}</span></td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(Number(r.total_amount))}</td>
                  <td className="px-4 py-2"><div className="flex items-center gap-2"><div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div><span className="text-2xs text-muted2 tabular-nums w-8 text-right">{pct}%</span></div></td>
                  <td className="px-4 py-2 text-2xs"><span className={r.status === 'active' && r.next_run && r.next_run <= today() ? 'text-rose-600 font-medium' : 'text-muted2'}>{r.next_run || '—'}</span></td>
                  <td className="px-4 py-2"><span className={`pill ${r.status === 'active' ? 'pill-green' : r.status === 'complete' ? 'pill-gray' : 'pill-amber'}`}>{r.status}</span></td>
                  <td className="px-4 py-2 text-right whitespace-nowrap"><button className="btn-ghost text-2xs" onClick={() => openEdit(r)}><Icon name="ti-pencil" /></button><button className="btn-ghost text-2xs text-rose-600 ml-1" onClick={() => del(r)}><Icon name="ti-trash" /></button></td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} size="md" icon="ti-calendar-stats" title={draft?.id ? 'Edit schedule' : 'New recognition schedule'}
        footer={<><button className="btn" onClick={() => setDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !draft?.title.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
        {draft && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" className="col-span-2"><Select value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })} options={KINDS} /></Field>
            <Field label="Title" required className="col-span-2"><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Annual plan / Annual insurance" /></Field>
            <Field label={draft.kind === 'deferred_revenue' ? 'Customer' : 'Vendor'}><input className="input" value={draft.counterparty} onChange={(e) => setDraft({ ...draft, counterparty: e.target.value })} /></Field>
            <Field label="Total amount"><input className="input text-right" inputMode="decimal" value={draft.total_amount} onChange={(e) => setDraft({ ...draft, total_amount: e.target.value })} placeholder="1200.00" /></Field>
            <Field label="Start date"><input type="date" className="input" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></Field>
            <Field label="Months to spread"><input className="input text-right" inputMode="numeric" value={draft.months} onChange={(e) => setDraft({ ...draft, months: e.target.value })} placeholder="12" /></Field>
            <Field label="Notes" className="col-span-2"><input className="input" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional" /></Field>
            {!draft.id && (
              <label className="col-span-2 flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-line p-3">
                <input type="checkbox" className="accent-accent w-4 h-4 mt-0.5" checked={draft.post_opening} onChange={(e) => setDraft({ ...draft, post_opening: e.target.checked })} />
                <span><span className="text-content">Record the upfront cash now</span><span className="block text-2xs text-muted">{draft.kind === 'deferred_revenue' ? 'Dr Bank / Cr Deferred Revenue' : 'Dr Prepaid Expense / Cr Bank'} for the total. Leave off if the cash is already booked elsewhere.</span></span>
              </label>
            )}
          </div>
        )}
      </Modal>
    </Layout>
  );
}

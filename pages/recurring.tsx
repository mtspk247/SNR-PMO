import { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listRecurringExpenses, createRecurringExpense, updateRecurringExpense, deleteRecurringExpense,
  getOrgUsers, RecurringExpense,
} from '@/lib/db';
import { OrgUser } from '@/lib/supabase';

const STATUS_PILL: Record<string, string> = { active: 'pill-green', paused: 'pill-amber', ended: 'pill-gray' };
const STATUSES = ['active', 'paused', 'ended'];
const CYCLES = ['weekly', 'monthly', 'quarterly', 'annual'];
const CYCLE_SUFFIX: Record<string, string> = { weekly: 'wk', monthly: 'mo', quarterly: 'qtr', annual: 'yr' };

const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const toMonthly = (r: RecurringExpense) => {
  const a = r.amount || 0;
  if (r.cycle === 'weekly') return a * 4.33;
  if (r.cycle === 'monthly') return a;
  if (r.cycle === 'quarterly') return a / 3;
  if (r.cycle === 'annual') return a / 12;
  return 0;
};

const daysTo = (d: string | null) =>
  d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;

type Draft = Partial<RecurringExpense>;
const emptyDraft = (): Draft => ({
  name: '', category: '', amount: 0, currency: 'USD', cycle: 'monthly',
  next_due: '', vendor: '', payment_method: '', paid_by_company: '',
  status: 'active', owner_id: null, notes: '',
});

export default function RecurringPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'financial');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [items, setItems] = useState<RecurringExpense[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    listRecurringExpenses(org.id).then(setItems).catch((e) => { setErr(e.message); setItems([]); });
  };

  useEffect(() => {
    if (org?.id && enabled) {
      load();
      getOrgUsers(org.id).then(setUsers).catch(() => {});
    }
    // eslint-disable-next-line
  }, [org?.id, enabled]);

  const name = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';

  const shown = useMemo(() =>
    (items || []).filter((r) =>
      (statusF === 'all' || r.status === statusF) &&
      (!q.trim() || `${r.name} ${r.category || ''} ${r.vendor || ''}`.toLowerCase().includes(q.toLowerCase()))
    ),
    [items, q, statusF]
  );

  const kpis = useMemo(() => {
    const active = (items || []).filter((r) => r.status === 'active');
    const monthlyCost = active.reduce((t, r) => t + toMonthly(r), 0);
    const today = Date.now();
    const soon = active.filter((r) => {
      const d = daysTo(r.next_due);
      return d != null && d >= 0 && d <= 14;
    }).length;
    const byStatus = (s: string) => (items || []).filter((r) => r.status === s).length;
    return { active: active.length, monthlyCost, soon, paused: byStatus('paused') };
  }, [items]);

  const setD = (patch: Draft) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.name?.trim() || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    const payload: Partial<RecurringExpense> = {
      name: d.name!.trim(),
      category: d.category || null,
      amount: Number(d.amount) || 0,
      currency: d.currency || 'USD',
      cycle: d.cycle || 'monthly',
      next_due: d.next_due || null,
      vendor: d.vendor || null,
      payment_method: d.payment_method || null,
      paid_by_company: d.paid_by_company || null,
      status: d.status || 'active',
      owner_id: d.owner_id || null,
      notes: d.notes || null,
    };
    try {
      if (editor.mode === 'edit' && d.id) {
        await updateRecurringExpense(d.id, payload);
      } else {
        await createRecurringExpense({ org_id: org.id, created_by: me.id, ...payload } as any);
      }
      setEditor(null);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const remove = async (r: RecurringExpense) => {
    if (!confirm(`Delete "${r.name}"?`)) return;
    setBusy(true);
    try { await deleteRecurringExpense(r.id); setEditor(null); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) {
    return (
      <Layout flat title="Recurring">
        <EmptyState icon="ti-repeat-off" title="Not in your plan" text="Upgrade to track recurring expenses." />
      </Layout>
    );
  }

  return (
    <Layout flat title="Recurring">
      <PageHeader
        title="Recurring Expenses"
        subtitle="Track recurring costs, cycles, due dates and owners"
        icon="ti-repeat"
        action={
          <button className="btn btn-primary" onClick={() => setEditor({ mode: 'add', draft: emptyDraft() })}>
            <Icon name="ti-plus" />Add
          </button>
        }
      />

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Active" value={String(kpis.active)} icon="ti-circle-check" />
        <StatCard label="Monthly cost" value={fmtMoney(kpis.monthlyCost)} hint="Active, normalized to /mo" icon="ti-calendar-dollar" />
        <StatCard label="Due ≤14 days" value={String(kpis.soon)} icon="ti-clock-exclamation" hintTone={kpis.soon ? 'down' : 'muted'} />
        <StatCard label="Paused" value={String(kpis.paused)} icon="ti-player-pause" hintTone="muted" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="input h-9 w-56"
          placeholder="Search expenses…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="w-40"><Select value={statusF} onChange={(v) => setStatusF(v)} options={[{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: titleCase(s) }))]} /></div>
      </div>

      <div className="card overflow-hidden">
        {items === null ? (
          <div className="p-8"><Spinner /></div>
        ) : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-repeat" text="No recurring expenses yet." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Next due</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const d = daysTo(r.next_due);
                  const dueCls = d != null && d < 0
                    ? 'text-rose-600'
                    : d != null && d <= 14
                    ? 'text-amber-600'
                    : 'text-muted';
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-line hover:bg-surface2/50 cursor-pointer"
                      onClick={() => setEditor({ mode: 'edit', draft: { ...r } })}
                    >
                      <td className="px-4 py-3 font-medium text-content">{r.name}</td>
                      <td className="px-4 py-3 text-muted">{r.category || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtMoney(r.amount, r.currency)}
                        <span className="text-2xs text-muted2">/{CYCLE_SUFFIX[r.cycle] || r.cycle}</span>
                      </td>
                      <td className="px-4 py-3 text-2xs">
                        {r.next_due ? (
                          <span className={dueCls}>
                            {r.next_due}
                            {d != null && d < 0 ? ' · overdue' : d != null && d <= 14 ? ` · ${d}d` : ''}
                          </span>
                        ) : (
                          <span className="text-muted2">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{r.vendor || '—'}</td>
                      <td className="px-4 py-3 text-2xs text-muted">{r.owner_id ? name(r.owner_id) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`pill ${STATUS_PILL[r.status] || 'pill-gray'}`}>{r.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          size="lg"
          icon="ti-repeat"
          title={editor.mode === 'edit' ? 'Edit recurring expense' : 'Add recurring expense'}
          onSubmit={() => save()}
          footer={
            <>
              {editor.mode === 'edit' && editor.draft.id && (
                <button
                  className="btn btn-danger mr-auto"
                  disabled={busy}
                  onClick={() => editor.draft.id && remove(editor.draft as RecurringExpense)}
                >
                  <Icon name="ti-trash" />Delete
                </button>
              )}
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={busy || !editor.draft.name?.trim()}
                onClick={save}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" required>
              <input
                className="input"
                autoFocus
                value={editor.draft.name || ''}
                onChange={(e) => setD({ name: e.target.value })}
                placeholder="e.g. AWS hosting"
              />
            </Field>
            <Field label="Category">
              <input
                className="input"
                value={editor.draft.category || ''}
                onChange={(e) => setD({ category: e.target.value })}
                placeholder="Infrastructure"
              />
            </Field>
            <Field label="Amount">
              <input
                className="input"
                type="number"
                value={editor.draft.amount ?? 0}
                onChange={(e) => setD({ amount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Currency">
              <input
                className="input"
                value={editor.draft.currency || 'USD'}
                onChange={(e) => setD({ currency: e.target.value })}
              />
            </Field>
            <Field label="Cycle">
              <Select value={editor.draft.cycle || 'monthly'} onChange={(v) => setD({ cycle: v })} options={[...CYCLES.map((c) => ({ value: c, label: titleCase(c) }))]} />
            </Field>
            <Field label="Next due">
              <input
                className="input"
                type="date"
                value={editor.draft.next_due || ''}
                onChange={(e) => setD({ next_due: e.target.value })}
              />
            </Field>
            <Field label="Vendor">
              <input
                className="input"
                value={editor.draft.vendor || ''}
                onChange={(e) => setD({ vendor: e.target.value })}
                placeholder="Amazon Web Services"
              />
            </Field>
            <Field label="Payment method">
              <input
                className="input"
                value={editor.draft.payment_method || ''}
                onChange={(e) => setD({ payment_method: e.target.value })}
                placeholder="Visa ••42"
              />
            </Field>
            <Field label="Paid by (company)">
              <input
                className="input"
                value={editor.draft.paid_by_company || ''}
                onChange={(e) => setD({ paid_by_company: e.target.value })}
              />
            </Field>
            <Field label="Owner">
              <Select value={editor.draft.owner_id || ''} onChange={(v) => setD({ owner_id: v || null })} options={[{ value: '', label: 'None' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
            </Field>
            <Field label="Status">
              <Select value={editor.draft.status || 'active'} onChange={(v) => setD({ status: v })} options={[...STATUSES.map((s) => ({ value: s, label: titleCase(s) }))]} />
            </Field>
            <Field label="Notes">
              <input
                className="input"
                value={editor.draft.notes || ''}
                onChange={(e) => setD({ notes: e.target.value })}
                placeholder="Optional notes"
              />
            </Field>
          </div>
        </Modal>
      )}
    </Layout>
  );
}

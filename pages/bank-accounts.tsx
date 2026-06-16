import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import Select from '@/components/Select';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listBankAccounts, createBankAccount, updateBankAccount, deleteBankAccount, getOrgUsers,
  BankAccount,
} from '@/lib/db';
import { OrgUser } from '@/lib/supabase';

const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'wallet', 'other'] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
type AccountType = typeof ACCOUNT_TYPES[number];

const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

type Draft = Partial<BankAccount>;
const emptyDraft = (): Draft => ({
  label: '', bank_name: '', account_type: 'checking', last4: '', currency: 'USD',
  balance: 0, owner_id: undefined, notes: '',
});

export default function BankAccountsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'financial');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('all');
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    listBankAccounts(org.id).then(setAccounts).catch((e) => { setErr(e.message); setAccounts([]); });
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
    (accounts || []).filter((a) =>
      (typeF === 'all' || a.account_type === typeF) &&
      (!q.trim() || `${a.label} ${a.bank_name || ''}`.toLowerCase().includes(q.toLowerCase()))
    ), [accounts, q, typeF]);

  const kpis = useMemo(() => {
    const all = accounts || [];
    const totalBalance = all.reduce((t, a) => t + Number(a.balance || 0), 0);
    const currencies = new Set(all.map((a) => a.currency || 'USD')).size;
    const creditCount = all.filter((a) => a.account_type === 'credit').length;
    return { count: all.length, totalBalance, currencies, creditCount };
  }, [accounts]);

  const setD = (patch: Draft) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.label?.trim() || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    const payload: any = {
      label: d.label!.trim(),
      bank_name: d.bank_name || null,
      account_type: d.account_type || 'checking',
      last4: d.last4 ? d.last4.slice(0, 4) : null,
      currency: d.currency || 'USD',
      balance: Number(d.balance) || 0,
      owner_id: d.owner_id || null,
      notes: d.notes || null,
    };
    try {
      if (editor.mode === 'edit' && d.id) {
        await updateBankAccount(d.id, payload);
      } else {
        await createBankAccount({ org_id: org.id, created_by: me.id, ...payload });
      }
      setEditor(null);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const remove = async (a: BankAccount) => {
    if (!confirm(`Delete "${a.label}"?`)) return;
    setBusy(true);
    try { await deleteBankAccount(a.id); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return (
    <Layout flat title="Bank accounts">
      <EmptyState icon="ti-building-bank" title="Financial module not in your plan" text="Upgrade to track bank accounts and balances." />
    </Layout>
  );

  return (
    <Layout flat title="Bank accounts">
      <PageHeader title="Bank accounts" subtitle="Track accounts, balances, and ownership" icon="ti-building-bank"
        action={
          <button className="btn btn-primary" onClick={() => setEditor({ mode: 'add', draft: emptyDraft() })}>
            <Icon name="ti-plus" />Add account
          </button>
        } />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Accounts" value={String(kpis.count)} icon="ti-building-bank" />
        <StatCard label="Total balance" value={fmtMoney(kpis.totalBalance)} icon="ti-wallet" />
        <StatCard label="Currencies" value={String(kpis.currencies)} icon="ti-currency-dollar" hint="Distinct currencies" />
        <StatCard label="Credit accounts" value={String(kpis.creditCount)} icon="ti-credit-card" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input className="input h-9 w-56" placeholder="Search accounts…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="w-40"><Select value={typeF} onChange={setTypeF} options={[{ value: 'all', label: 'All types' }, ...ACCOUNT_TYPES.map((t) => ({ value: t, label: cap(t) }))]} /></div>
      </div>

      <div className="card overflow-hidden">
        {accounts === null ? <div className="p-8"><Spinner /></div> : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-building-bank" text="No accounts found." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Bank</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Owner</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id} className="border-t border-line hover:bg-surface2/50 cursor-pointer"
                    onClick={() => setEditor({ mode: 'edit', draft: { ...a } })}>
                    <td className="px-4 py-3 font-medium text-content">{a.label}</td>
                    <td className="px-4 py-3 text-muted">{a.bank_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="pill pill-gray capitalize">{a.account_type || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-muted tabular-nums">
                      {a.last4 ? `•••• ${a.last4}` : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${Number(a.balance) < 0 ? 'text-rose-600' : ''}`}>
                      {fmtMoney(Number(a.balance || 0), a.currency || 'USD')}
                    </td>
                    <td className="px-4 py-3 text-2xs text-muted">{name(a.owner_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editor && (
        <Modal open onClose={() => setEditor(null)} size="lg" icon="ti-building-bank"
          title={editor.mode === 'edit' ? 'Edit account' : 'Add account'}
          onSubmit={() => save()}
          footer={
            <>
              {editor.mode === 'edit' && editor.draft.id && (
                <button className="btn btn-danger mr-auto" disabled={busy}
                  onClick={() => { const d = editor.draft as BankAccount; setEditor(null); remove(d); }}>
                  <Icon name="ti-trash" />Delete
                </button>
              )}
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !editor.draft.label?.trim()} onClick={save}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          }>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Label" required>
              <input className="input" autoFocus value={editor.draft.label || ''}
                onChange={(e) => setD({ label: e.target.value })} placeholder="e.g. Main checking" />
            </Field>
            <Field label="Bank name">
              <input className="input" value={editor.draft.bank_name || ''}
                onChange={(e) => setD({ bank_name: e.target.value })} placeholder="e.g. Chase" />
            </Field>
            <Field label="Account type">
              <Select value={editor.draft.account_type || 'checking'} onChange={(v) => setD({ account_type: v as AccountType })} options={ACCOUNT_TYPES.map((t) => ({ value: t, label: cap(t) }))} />
            </Field>
            <Field label="Last 4 digits">
              <input className="input" value={editor.draft.last4 || ''} maxLength={4}
                onChange={(e) => setD({ last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="1234" inputMode="numeric" />
            </Field>
            <Field label="Currency">
              <input className="input" value={editor.draft.currency || 'USD'}
                onChange={(e) => setD({ currency: e.target.value })} placeholder="USD" />
            </Field>
            <Field label="Balance">
              <input className="input" type="number" value={editor.draft.balance ?? 0}
                onChange={(e) => setD({ balance: Number(e.target.value) })} />
            </Field>
            <Field label="Owner">
              <Select value={editor.draft.owner_id || ''} onChange={(v) => setD({ owner_id: v || undefined })} search placeholder="Unassigned" options={[{ value: '', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
            </Field>
            <Field label="Notes">
              <input className="input" value={editor.draft.notes || ''}
                onChange={(e) => setD({ notes: e.target.value })} placeholder="Optional notes" />
            </Field>
          </div>
        </Modal>
      )}
    </Layout>
  );
}

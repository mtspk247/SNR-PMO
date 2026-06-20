import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import Select from '@/components/Select';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listBankAccounts, createBankAccount, updateBankAccount, deleteBankAccount, getOrgUsers,
  bankEnsureAccount, bankGlBalance, bankRecon, bankLineReconcile,
  BankAccount, BankReconLine,
} from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta, EditSpec } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'wallet', 'other'] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
type AccountType = typeof ACCOUNT_TYPES[number];

const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const TYPE_PILL: Record<string, string> = {
  checking: 'pill-blue',
  savings: 'pill-green',
  credit: 'pill-amber',
  wallet: 'pill-purple',
  other: 'pill-gray',
};

const GROUPS: GroupMeta[] = ACCOUNT_TYPES.map((t) => ({
  value: t,
  label: cap(t),
  pill: TYPE_PILL[t] || 'pill-gray',
}));

const COLS: ColDef[] = [
  { id: 'label', label: 'Label', locked: true },
  { id: 'bank', label: 'Bank' },
  { id: 'type', label: 'Type' },
  { id: 'account', label: 'Account' },
  { id: 'balance', label: 'Balance' },
  { id: 'ledger_balance', label: 'Ledger balance' },
  { id: 'owner', label: 'Owner' },
  { id: 'actions', label: '' },
];

const BANK_FILTERS: FilterDef[] = [
  {
    id: 'account_type',
    label: 'Type',
    options: [
      { value: 'all', label: 'All types' },
      ...ACCOUNT_TYPES.map((t) => ({ value: t, label: cap(t) })),
    ],
  },
];

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
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [glBalances, setGlBalances] = useState<Record<string, number>>({});
  const [reconAcct, setReconAcct] = useState<BankAccount | null>(null);
  const [reconLines, setReconLines] = useState<BankReconLine[]>([]);

  const prefs = useListPrefs('snrpmo.bank_accounts.cols', COLS);
  const q = prefs.query;
  const typeF = prefs.filters.account_type || 'all';

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

  useEffect(() => {
    if (!org || !accounts) return;
    const linked = accounts.filter((a) => a.account_id);
    Promise.all(
      linked.map((a) =>
        bankGlBalance(org.id, a.account_id!)
          .then((b) => [a.id, b] as [string, number])
          .catch(() => [a.id, 0] as [string, number])
      )
    ).then((pairs) => setGlBalances(Object.fromEntries(pairs)));
    // eslint-disable-next-line
  }, [accounts]);

  const linkLedger = async (a: BankAccount) => {
    if (!org) return;
    try { await bankEnsureAccount(org.id, a.id); load(); } catch (e: any) { setErr(e.message); }
  };

  const openRecon = async (a: BankAccount) => {
    if (!org || !a.account_id) return;
    setReconAcct(a);
    try { setReconLines(await bankRecon(org.id, a.account_id)); } catch (e: any) { setErr(e.message); }
  };

  const toggleRecon = async (line: BankReconLine) => {
    if (!org) return;
    try {
      await bankLineReconcile(org.id, line.id, !line.reconciled);
      setReconLines((ls) => ls.map((l) => l.id === line.id ? { ...l, reconciled: !l.reconciled } : l));
    } catch (e: any) { setErr(e.message); }
  };

  const nameOf = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';

  const shown = useMemo(() =>
    (accounts || []).filter((a) =>
      (typeF === 'all' || a.account_type === typeF) &&
      (!q.trim() || `${a.label} ${a.bank_name || ''}`.toLowerCase().includes(q.toLowerCase()))
    ),
    [accounts, q, typeF]
  );

  const rs = useRowSelection(shown);

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

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} account${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const a of rs.selected) await deleteBankAccount(a.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const cell = (id: string, a: BankAccount) => {
    switch (id) {
      case 'label': return <span className="font-medium text-content">{a.label}</span>;
      case 'bank': return <span className="text-muted">{a.bank_name || '—'}</span>;
      case 'type': return <span className={`pill ${TYPE_PILL[a.account_type] || 'pill-gray'} capitalize`}>{a.account_type || '—'}</span>;
      case 'account': return <span className="text-muted tabular-nums">{a.last4 ? `•••• ${a.last4}` : '—'}</span>;
      case 'balance': return (
        <span className={`tabular-nums font-medium${Number(a.balance) < 0 ? ' text-rose-600' : ''}`}>
          {fmtMoney(Number(a.balance || 0), a.currency || 'USD')}
        </span>
      );
      case 'ledger_balance': return (
        <span onClick={(e) => e.stopPropagation()}>
          {a.account_id
            ? <span className="text-content font-medium tabular-nums">{fmtMoney(glBalances[a.id] ?? 0, a.currency || 'USD')}</span>
            : <button className="btn-ghost text-2xs" onClick={() => linkLedger(a)}><Icon name="ti-link" />Link to ledger</button>
          }
        </span>
      );
      case 'owner': return <span className="text-2xs text-muted">{nameOf(a.owner_id)}</span>;
      case 'actions': return (
        <span className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          {a.account_id && (
            <button className="btn-ghost text-2xs" onClick={() => openRecon(a)}>
              <Icon name="ti-checkbox" />Reconcile
            </button>
          )}
        </span>
      );
      default: return '—';
    }
  };

  const editable: Record<string, EditSpec> = {
    label: { type: 'text' },
    bank: { type: 'text' },
    type: { type: 'select', options: ACCOUNT_TYPES.map((t) => ({ value: t, label: cap(t) })) },
  };

  const rawValue = (id: string, a: BankAccount) =>
    id === 'label' ? a.label :
    id === 'bank' ? (a.bank_name || '') :
    id === 'type' ? (a.account_type || '') : '';

  const onInlineEdit = async (a: BankAccount, id: string, value: string) => {
    const field = id === 'bank' ? 'bank_name' : id === 'type' ? 'account_type' : id;
    try { await updateBankAccount(a.id, { [field]: value || null } as any); load(); } catch (e: any) { setErr(e.message); }
  };

  const exportValue = (id: string, a: BankAccount) =>
    id === 'label' ? a.label :
    id === 'bank' ? (a.bank_name || '') :
    id === 'type' ? (a.account_type || '') :
    id === 'account' ? (a.last4 ? `•••• ${a.last4}` : '') :
    id === 'balance' ? String(a.balance || 0) :
    id === 'ledger_balance' ? String(glBalances[a.id] ?? '') :
    id === 'owner' ? nameOf(a.owner_id) : '';

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
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Accounts" value={String(kpis.count)} icon="ti-building-bank" />
        <StatCard label="Total balance" value={fmtMoney(kpis.totalBalance)} icon="ti-wallet" />
        <StatCard label="Currencies" value={String(kpis.currencies)} icon="ti-currency-dollar" hint="Distinct currencies" />
        <StatCard label="Credit accounts" value={String(kpis.creditCount)} icon="ti-credit-card" />
      </div>

      <ListView
        rows={accounts === null ? null : shown}
        rowKey={(a) => a.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={BANK_FILTERS}
        searchPlaceholder="Search accounts…"
        groupField={{ value: 'account_type', label: 'Type' }}
        groupOf={(a) => a.account_type}
        groups={GROUPS}
        editable={editable}
        rawValue={rawValue}
        onEdit={onInlineEdit}
        onRowClick={(a) => setEditor({ mode: 'edit', draft: { ...a } })}
        exportName="bank-accounts"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        busy={busy}
        emptyIcon="ti-building-bank"
        emptyText="No accounts found."
      />

      {reconAcct && (() => {
        const book = reconLines.reduce((t, l) => t + Number(l.debit) - Number(l.credit), 0);
        const cleared = reconLines.filter((l) => l.reconciled).reduce((t, l) => t + Number(l.debit) - Number(l.credit), 0);
        return (
          <Modal open onClose={() => setReconAcct(null)} size="lg" icon="ti-checkbox"
            title={`Reconcile — ${reconAcct.label}`}
            subtitle={`Book ${fmtMoney(book, reconAcct.currency || 'USD')} · Cleared ${fmtMoney(cleared, reconAcct.currency || 'USD')}`}
            footer={<button className="btn" onClick={() => setReconAcct(null)}>Done</button>}>
            {reconLines.length === 0
              ? <EmptyState icon="ti-checkbox" text="No ledger movement on this account yet." />
              : (
                <table className="w-full text-sm list-card">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Entry</th>
                      <th className="px-3 py-2 text-right">In</th>
                      <th className="px-3 py-2 text-right">Out</th>
                      <th className="px-3 py-2 text-center">Cleared</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconLines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-1.5 text-2xs text-muted2">{l.entry_date}</td>
                        <td className="px-3 py-1.5 text-content"><span className="font-mono text-2xs text-muted2 mr-1">#{l.entry_no}</span>{l.memo}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{Number(l.debit) ? fmtMoney(Number(l.debit), reconAcct.currency || 'USD') : ''}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{Number(l.credit) ? fmtMoney(Number(l.credit), reconAcct.currency || 'USD') : ''}</td>
                        <td className="px-3 py-1.5 text-center"><input type="checkbox" className="accent-accent w-4 h-4" checked={l.reconciled} onChange={() => toggleRecon(l)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </Modal>
        );
      })()}

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

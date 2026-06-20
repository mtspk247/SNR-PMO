import { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listCreditNotes, createCreditNote, updateCreditNote, deleteCreditNote, CreditNote } from '@/lib/db';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const STATUS_PILL: Record<string, string> = { open: 'pill-amber', applied: 'pill-green', void: 'pill-gray' };
const STATUSES = ['open', 'applied', 'void'] as const;
type CNStatus = typeof STATUSES[number];

const GROUPS: GroupMeta[] = STATUSES.map((st) => ({ value: st, label: titleCase(st), pill: STATUS_PILL[st] || 'pill-gray' }));

const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const COLS: ColDef[] = [
  { id: 'credit_number', label: 'Credit #', locked: true },
  { id: 'client_name', label: 'Client' },
  { id: 'amount', label: 'Amount' },
  { id: 'issue_date', label: 'Issue date' },
  { id: 'reason', label: 'Reason' },
  { id: 'status', label: 'Status' },
];

const CN_FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: titleCase(s) }))] },
];

type Draft = Partial<CreditNote>;
const emptyDraft = (nextNum: string): Draft => ({
  credit_number: nextNum,
  client_name: '',
  amount: 0,
  issue_date: new Date().toISOString().slice(0, 10),
  reason: '',
  status: 'open',
  notes: '',
});

export default function CreditNotesPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'financial');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [list, setList] = useState<CreditNote[] | null>(null);
  const prefs = useListPrefs('snrpmo.credit_notes.cols', COLS);
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    listCreditNotes(org.id).then(setList).catch((e) => { setErr(e.message); setList([]); });
  };
  useEffect(() => { if (org?.id && enabled) load(); /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const shown = useMemo(
    () => (list || []).filter((c) =>
      (statusF === 'all' || c.status === statusF) &&
      (!q.trim() || `${c.credit_number} ${c.client_name}`.toLowerCase().includes(q.toLowerCase()))
    ),
    [list, q, statusF]
  );

  const rs = useRowSelection(shown);

  const kpis = useMemo(() => {
    const all = list || [];
    return {
      total: all.length,
      openCount: all.filter((c) => c.status === 'open').length,
      openValue: all.filter((c) => c.status === 'open').reduce((t, c) => t + Number(c.amount || 0), 0),
      appliedValue: all.filter((c) => c.status === 'applied').reduce((t, c) => t + Number(c.amount || 0), 0),
    };
  }, [list]);

  const nextNumber = () => 'CN-' + String((list?.length || 0) + 1).padStart(4, '0');

  const setD = (patch: Draft) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.credit_number?.trim() || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    const payload = {
      credit_number: d.credit_number!.trim(),
      client_name: d.client_name || '',
      amount: Number(d.amount) || 0,
      issue_date: d.issue_date || null,
      reason: d.reason || null,
      status: (d.status as CreditNote['status']) || 'open',
      notes: d.notes || null,
      invoice_id: d.invoice_id || null,
    };
    try {
      if (editor.mode === 'edit' && d.id) {
        await updateCreditNote(d.id, payload);
      } else {
        await createCreditNote({ org_id: org.id, created_by: me.id, ...payload });
      }
      setEditor(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const cell = (id: string, cn: CreditNote) => {
    switch (id) {
      case 'credit_number': return <span className="font-medium text-content">{cn.credit_number}</span>;
      case 'client_name': return cn.client_name || '—';
      case 'amount': return fmtMoney(cn.amount);
      case 'issue_date': return cn.issue_date || '—';
      case 'reason': return cn.reason || '—';
      case 'status': return <span className={`pill ${STATUS_PILL[cn.status] || 'pill-gray'}`}>{cn.status}</span>;
      default: return '—';
    }
  };

  const exportValue = (id: string, cn: CreditNote) => {
    switch (id) {
      case 'credit_number': return cn.credit_number;
      case 'client_name': return cn.client_name || '';
      case 'amount': return String(cn.amount);
      case 'issue_date': return cn.issue_date || '';
      case 'reason': return cn.reason || '';
      case 'status': return cn.status;
      default: return '';
    }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} credit note${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const cn of rs.selected) await deleteCreditNote(cn.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return (
    <Layout flat title="Credit Notes">
      <EmptyState icon="ti-receipt-refund" title="Financial module not in your plan" text="Upgrade to manage credit notes." />
    </Layout>
  );

  return (
    <Layout flat title="Credit Notes">
      <PageHeader
        title="Credit Notes"
        subtitle="Issue and track credit notes against clients"
        icon="ti-receipt-refund"
        action={
          <button className="btn btn-primary" onClick={() => setEditor({ mode: 'add', draft: emptyDraft(nextNumber()) })}>
            <Icon name="ti-plus" />New credit note
          </button>
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total credit notes" value={String(kpis.total)} icon="ti-receipt-refund" />
        <StatCard label="Open" value={String(kpis.openCount)} icon="ti-clock" />
        <StatCard label="Open value" value={fmtMoney(kpis.openValue)} icon="ti-currency-dollar" />
        <StatCard label="Applied value" value={fmtMoney(kpis.appliedValue)} icon="ti-circle-check" />
      </div>

      <ListView
        rows={list === null ? null : shown}
        rowKey={(cn) => cn.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={CN_FILTERS}
        searchPlaceholder="Search credit #, client…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(cn) => cn.status}
        groups={GROUPS}
        onRowClick={(cn) => setEditor({ mode: 'edit', draft: { ...cn } })}
        exportName="credit-notes"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        busy={busy}
        emptyIcon="ti-receipt-refund"
        emptyText="No credit notes found."
      />

      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          size="md"
          icon="ti-receipt-refund"
          title={editor.mode === 'edit' ? 'Edit credit note' : 'New credit note'}
          onSubmit={save}
          footer={
            <>
              {editor.mode === 'edit' && editor.draft.id && (
                <ConfirmDelete entityType="credit_note" id={editor.draft.id!} name={editor.draft.credit_number}
                  className="btn btn-danger mr-auto" onDeleted={() => { setEditor(null); load(); }} />
              )}
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={busy || !editor.draft.credit_number?.trim()}
                onClick={save}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Credit number" required>
              <input
                className="input"
                autoFocus
                value={editor.draft.credit_number || ''}
                onChange={(e) => setD({ credit_number: e.target.value })}
                placeholder="CN-0001"
              />
            </Field>
            <Field label="Client name">
              <input
                className="input"
                value={editor.draft.client_name || ''}
                onChange={(e) => setD({ client_name: e.target.value })}
                placeholder="Acme Corp"
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
            <Field label="Issue date">
              <input
                className="input"
                type="date"
                value={editor.draft.issue_date || ''}
                onChange={(e) => setD({ issue_date: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <Select value={editor.draft.status || 'open'} onChange={(v) => setD({ status: v as CNStatus })} options={[...STATUSES.map((s) => ({ value: s, label: titleCase(s) }))]} />
            </Field>
            <Field label="Reason">
              <input
                className="input"
                value={editor.draft.reason || ''}
                onChange={(e) => setD({ reason: e.target.value })}
                placeholder="e.g. Overcharge, returned goods"
              />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea
                className="input"
                rows={3}
                value={editor.draft.notes || ''}
                onChange={(e) => setD({ notes: e.target.value })}
                placeholder="Additional notes…"
              />
            </Field>
          </div>
        </Modal>
      )}
    </Layout>
  );
}

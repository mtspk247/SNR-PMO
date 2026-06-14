import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard, Avatar } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Attachments from '@/components/Attachments';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listVendorSubscriptions, createVendorSubscription, updateVendorSubscription, deleteVendorSubscription,
  requestVendorSubscription, listReconciliations, addReconciliation, deleteReconciliation, getOrgUsers,
  VendorSubscription, VendorSubReconciliation,
} from '@/lib/db';
import { OrgUser } from '@/lib/supabase';

const STATUS_PILL: Record<string, string> = { requested: 'pill-violet', active: 'pill-green', trial: 'pill-blue', paused: 'pill-amber', cancelled: 'pill-gray', expired: 'pill-red', rejected: 'pill-red' };
const STATUSES = ['active', 'trial', 'paused', 'cancelled', 'expired'];
const PLAN_TYPES = ['monthly', 'annual', 'one-time', 'usage'];
const fmtMoney = (n: number, c = 'USD') => `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const monthly = (s: VendorSubscription) => s.plan_type === 'annual' ? (s.cost || 0) / 12 : s.plan_type === 'one-time' ? 0 : (s.cost || 0);
const daysTo = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;

type Draft = Partial<VendorSubscription>;
const emptyDraft = (): Draft => ({ service: '', category: '', plan_type: 'monthly', plan_name: '', cost: 0, currency: 'USD', email: '', status: 'active', shared_with: [] });

export default function SubscriptionsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'subscriptions');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [subs, setSubs] = useState<VendorSubscription[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [q, setQ] = useState(''); const [statusF, setStatusF] = useState('all');
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit' | 'request'; draft: Draft } | null>(null);
  const [detail, setDetail] = useState<VendorSubscription | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  const load = () => { if (!org) return; listVendorSubscriptions(org.id).then(setSubs).catch((e) => { setErr(e.message); setSubs([]); }); };
  useEffect(() => { if (org?.id && enabled) { load(); getOrgUsers(org.id).then(setUsers).catch(() => {}); } /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const name = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';
  const shown = useMemo(() => (subs || []).filter((s) => (statusF === 'all' || s.status === statusF) && (!q.trim() || `${s.service} ${s.category || ''} ${s.plan_name || ''}`.toLowerCase().includes(q.toLowerCase()))), [subs, q, statusF]);

  const kpis = useMemo(() => {
    const a = (subs || []).filter((s) => s.status === 'active');
    return { active: a.length, monthly: a.reduce((t, s) => t + monthly(s), 0), soon: a.filter((s) => { const d = daysTo(s.next_renewal); return d != null && d >= 0 && d <= 30; }).length, total: (subs || []).reduce((t, s) => t + Number(s.total_spending || 0), 0) };
  }, [subs]);

  const setD = (patch: Draft) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });
  const save = async () => {
    if (!org || !me || !editor || !editor.draft.service?.trim() || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    const payload: any = { service: d.service!.trim(), category: d.category || null, plan_type: d.plan_type || null, plan_name: d.plan_name || null, cost: Number(d.cost) || 0, currency: d.currency || 'USD', email: d.email || null, subscribed_on: d.subscribed_on || null, next_renewal: d.next_renewal || null, payment_method: d.payment_method || null, paid_by_company: d.paid_by_company || null, owner_id: d.owner_id || null, status: d.status || 'active', shared_with: d.shared_with || [], total_spending: Number(d.total_spending) || 0, remarks: d.remarks || null };
    try {
      if (editor.mode === 'edit' && d.id) await updateVendorSubscription(d.id, payload);
      else if (editor.mode === 'request') await requestVendorSubscription({ org_id: org.id, created_by: me.id, ...payload });
      else await createVendorSubscription({ org_id: org.id, created_by: me.id, ...payload });
      setEditor(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (s: VendorSubscription) => { if (!confirm(`Delete "${s.service}"?`)) return; setBusy(true); try { await deleteVendorSubscription(s.id); setDetail(null); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

  if (!enabled) return <Layout flat title="Subscriptions"><EmptyState icon="ti-credit-card-off" title="Subscriptions not in your plan" text="Upgrade to track your SaaS subscriptions." /></Layout>;

  return (
    <Layout flat title="Subscriptions">
      <PageHeader title="Subscriptions" subtitle="Track every SaaS subscription, cost, renewal and owner" icon="ti-credit-card"
        action={<div className="flex gap-2">
          <button className="btn" onClick={() => setEditor({ mode: 'request', draft: emptyDraft() })}><Icon name="ti-send" />Request</button>
          {isAdmin && <button className="btn btn-primary" onClick={() => setEditor({ mode: 'add', draft: emptyDraft() })}><Icon name="ti-plus" />Add</button>}
        </div>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Active" value={String(kpis.active)} icon="ti-circle-check" />
        <StatCard label="Monthly cost" value={fmtMoney(kpis.monthly)} hint="Active, annualized ÷ 12" icon="ti-calendar-dollar" />
        <StatCard label="Renewing ≤30d" value={String(kpis.soon)} icon="ti-clock-exclamation" hintTone={kpis.soon ? 'down' : 'muted'} />
        <StatCard label="Total spent" value={fmtMoney(kpis.total)} icon="ti-receipt" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input className="input h-9 w-56" placeholder="Search subscriptions…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input h-9 w-40" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="all">All statuses</option>{['requested', ...STATUSES, 'rejected'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {subs === null ? <div className="p-8"><Spinner /></div> : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-credit-card" text="No subscriptions yet." /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
              <tr><th className="px-4 py-3">Service</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3">Renews</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody>
              {shown.map((s) => { const d = daysTo(s.next_renewal); return (
                <tr key={s.id} className="border-t border-line hover:bg-surface2/50 cursor-pointer" onClick={() => setDetail(s)}>
                  <td className="px-4 py-3 font-medium text-content">{s.service}</td>
                  <td className="px-4 py-3 text-muted">{s.category || '—'}</td>
                  <td className="px-4 py-3 text-muted">{[s.plan_name, s.plan_type].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(s.cost, s.currency)}<span className="text-2xs text-muted2">{s.plan_type ? `/${s.plan_type === 'annual' ? 'yr' : s.plan_type === 'monthly' ? 'mo' : ''}` : ''}</span></td>
                  <td className="px-4 py-3 text-2xs">{s.next_renewal ? <span className={d != null && d < 0 ? 'text-rose-600' : d != null && d <= 30 ? 'text-amber-600' : 'text-muted'}>{s.next_renewal}{d != null && d >= 0 && d <= 30 ? ` · ${d}d` : d != null && d < 0 ? ' · overdue' : ''}</span> : <span className="text-muted2">—</span>}</td>
                  <td className="px-4 py-3 text-2xs text-muted">{s.owner_id ? name(s.owner_id) : '—'}</td>
                  <td className="px-4 py-3"><span className={`pill ${STATUS_PILL[s.status] || 'pill-gray'}`}>{s.status}</span></td>
                </tr>
              ); })}
            </tbody>
          </table></div>
        )}
      </div>

      {/* Add / Edit / Request editor */}
      {editor && (
        <Modal open onClose={() => setEditor(null)} size="lg" icon="ti-credit-card"
          title={editor.mode === 'request' ? 'Request a subscription' : editor.mode === 'edit' ? 'Edit subscription' : 'Add subscription'}
          subtitle={editor.mode === 'request' ? 'Sent to admins for approval' : undefined} onSubmit={() => save()}
          footer={<><button className="btn" onClick={() => setEditor(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !editor.draft.service?.trim()} onClick={save}>{busy ? 'Saving…' : editor.mode === 'request' ? 'Submit request' : 'Save'}</button></>}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Service" required><input className="input" autoFocus value={editor.draft.service || ''} onChange={(e) => setD({ service: e.target.value })} placeholder="e.g. Figma" /></Field>
            <Field label="Category"><input className="input" value={editor.draft.category || ''} onChange={(e) => setD({ category: e.target.value })} placeholder="Design" /></Field>
            <Field label="Plan type"><select className="input" value={editor.draft.plan_type || ''} onChange={(e) => setD({ plan_type: e.target.value })}>{PLAN_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
            <Field label="Plan name"><input className="input" value={editor.draft.plan_name || ''} onChange={(e) => setD({ plan_name: e.target.value })} placeholder="Professional" /></Field>
            <Field label="Cost"><input className="input" type="number" value={editor.draft.cost ?? 0} onChange={(e) => setD({ cost: Number(e.target.value) })} /></Field>
            <Field label="Currency"><input className="input" value={editor.draft.currency || 'USD'} onChange={(e) => setD({ currency: e.target.value })} /></Field>
            <Field label="Account email"><input className="input" value={editor.draft.email || ''} onChange={(e) => setD({ email: e.target.value })} placeholder="billing@company.com" /></Field>
            <Field label="Remarks"><input className="input" value={editor.draft.remarks || ''} onChange={(e) => setD({ remarks: e.target.value })} /></Field>
            {editor.mode !== 'request' && <>
              <Field label="Subscribed on"><input className="input" type="date" value={editor.draft.subscribed_on || ''} onChange={(e) => setD({ subscribed_on: e.target.value })} /></Field>
              <Field label="Next renewal"><input className="input" type="date" value={editor.draft.next_renewal || ''} onChange={(e) => setD({ next_renewal: e.target.value })} /></Field>
              <Field label="Payment method"><input className="input" value={editor.draft.payment_method || ''} onChange={(e) => setD({ payment_method: e.target.value })} placeholder="Visa ••42" /></Field>
              <Field label="Paid by (company)"><input className="input" value={editor.draft.paid_by_company || ''} onChange={(e) => setD({ paid_by_company: e.target.value })} /></Field>
              <Field label="Owner"><select className="input" value={editor.draft.owner_id || ''} onChange={(e) => setD({ owner_id: e.target.value || null })}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></Field>
              <Field label="Status"><select className="input" value={editor.draft.status || 'active'} onChange={(e) => setD({ status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
              <Field label="Total spending"><input className="input" type="number" value={editor.draft.total_spending ?? 0} onChange={(e) => setD({ total_spending: Number(e.target.value) })} /></Field>
            </>}
          </div>
        </Modal>
      )}

      {detail && <DetailModal sub={detail} users={users} me={me?.id} canEdit={isAdmin || detail.created_by === me?.id || detail.owner_id === me?.id} orgId={org?.id}
        onClose={() => setDetail(null)} onEdit={() => { setEditor({ mode: 'edit', draft: detail }); setDetail(null); }} onDelete={() => remove(detail)} nameOf={name} />}
    </Layout>
  );
}

function DetailModal({ sub, users, me, canEdit, orgId, onClose, onEdit, onDelete, nameOf }:
  { sub: VendorSubscription; users: OrgUser[]; me?: string; canEdit: boolean; orgId?: string; onClose: () => void; onEdit: () => void; onDelete: () => void; nameOf: (id?: string | null) => string }) {
  const [recon, setRecon] = useState<VendorSubReconciliation[]>([]);
  const [rd, setRd] = useState({ recon_date: new Date().toISOString().slice(0, 10), amount: 0, note: '' });
  const [busy, setBusy] = useState(false);
  const load = () => listReconciliations(sub.id).then(setRecon).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sub.id]);
  const addR = async () => { if (!orgId || !me || !rd.amount) return; setBusy(true); try { await addReconciliation({ org_id: orgId, subscription_id: sub.id, recon_date: rd.recon_date, amount: Number(rd.amount), note: rd.note || undefined, created_by: me }); setRd({ recon_date: new Date().toISOString().slice(0, 10), amount: 0, note: '' }); load(); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };
  const delR = async (id: string) => { setBusy(true); try { await deleteReconciliation(id); load(); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };
  const reconciledTotal = recon.reduce((t, r) => t + Number(r.amount || 0), 0);
  const row = (k: string, v: any) => <div className="flex justify-between gap-3 py-1.5 border-b border-line/60"><span className="text-2xs text-muted2">{k}</span><span className="text-sm text-content text-right">{v || '—'}</span></div>;

  return (
    <Modal open onClose={onClose} size="lg" icon="ti-credit-card" title={sub.service} subtitle={[sub.plan_name, sub.plan_type].filter(Boolean).join(' · ') || undefined}
      footer={<><button className="btn btn-danger mr-auto" onClick={onDelete} disabled={!canEdit}><Icon name="ti-trash" />Delete</button><button className="btn" onClick={onClose}>Close</button>{canEdit && <button className="btn btn-primary" onClick={onEdit}><Icon name="ti-pencil" />Edit</button>}</>}>
      <div className="grid sm:grid-cols-2 gap-x-6">
        {row('Status', <span className={`pill ${STATUS_PILL[sub.status] || 'pill-gray'}`}>{sub.status}</span>)}
        {row('Category', sub.category)}
        {row('Cost', `${fmtMoney(sub.cost, sub.currency)}${sub.plan_type ? ' / ' + sub.plan_type : ''}`)}
        {row('Account email', sub.email)}
        {row('Subscribed on', sub.subscribed_on)}
        {row('Next renewal', sub.next_renewal)}
        {row('Payment method', sub.payment_method)}
        {row('Paid by', sub.paid_by_company)}
        {row('Owner', sub.owner_id ? nameOf(sub.owner_id) : '—')}
        {row('Total spending', fmtMoney(sub.total_spending, sub.currency))}
      </div>
      {sub.shared_with?.length > 0 && <div className="mt-2"><span className="text-2xs text-muted2">Shared with: </span>{sub.shared_with.map((u) => <span key={u} className="chip mr-1">{nameOf(u)}</span>)}</div>}
      {sub.remarks && <p className="text-sm text-muted mt-2 whitespace-pre-wrap">{sub.remarks}</p>}

      <div className="mt-4 pt-3 border-t border-line">
        <div className="flex items-center justify-between mb-2"><p className="text-2xs uppercase tracking-wide text-muted2">Reconciliations</p><span className="text-2xs text-muted">Reconciled: {fmtMoney(reconciledTotal, sub.currency)}</span></div>
        <div className="flex items-end gap-1.5 mb-2">
          <input className="input h-8 text-xs w-36" type="date" value={rd.recon_date} onChange={(e) => setRd({ ...rd, recon_date: e.target.value })} />
          <input className="input h-8 text-xs w-24" type="number" placeholder="Amount" value={rd.amount || ''} onChange={(e) => setRd({ ...rd, amount: Number(e.target.value) })} />
          <input className="input h-8 text-xs flex-1" placeholder="Note" value={rd.note} onChange={(e) => setRd({ ...rd, note: e.target.value })} />
          <button className="btn h-8 px-2 text-xs" disabled={busy || !rd.amount} onClick={addR}><Icon name="ti-plus" /></button>
        </div>
        {recon.map((r) => (
          <div key={r.id} className="group flex items-center gap-2 text-sm py-1">
            <span className="text-2xs text-muted2 w-24 tabular-nums">{r.recon_date}</span>
            <span className="tabular-nums font-medium">{fmtMoney(r.amount, sub.currency)}</span>
            <span className="text-2xs text-muted truncate flex-1">{r.note}</span>
            <button onClick={() => delR(r.id)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500"><Icon name="ti-x" className="text-sm" /></button>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-line">
        <Attachments entityType="vendor_subscription" entityId={sub.id} orgId={orgId} currentUserId={me} />
      </div>
    </Modal>
  );
}

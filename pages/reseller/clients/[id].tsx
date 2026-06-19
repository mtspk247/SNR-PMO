import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, StatCard, Icon } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { resellerListOrgs, resellerListPrices, resellerSetSubPlan, resellerSetSubActive, adminImpersonateLink, ResellerOrg, ResellerPlanPrice } from '@/lib/db';

// Reseller-scoped sub-tenant management — mirrors the platform tenant detail, but a
// reseller can only manage THEIR sub-tenants, only assign plans they offer, behind an
// edit-lock. All writes go through reseller_set_sub_* RPCs (authorized server-side).
export default function ResellerClientDetail() {
  const org = useActiveOrg();
  const router = useRouter();
  const subId = typeof router.query.id === 'string' ? router.query.id : '';
  const [sub, setSub] = useState<ResellerOrg | null | undefined>(undefined);
  const [prices, setPrices] = useState<ResellerPlanPrice[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [planSel, setPlanSel] = useState('');
  const [viewMsg, setViewMsg] = useState('');

  const load = () => {
    if (!org || !subId) return;
    resellerListOrgs(org.id).then((list) => { const s = list.find((x) => x.org_id === subId) || null; setSub(s); setPlanSel(s?.plan_key || 'free'); }).catch((e) => { setErr(e.message); setSub(null); });
    resellerListPrices(org.id).then(setPrices).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id, subId]);

  if (!org?.is_reseller || !can.manageMembers(org)) return <Layout flat title="Client"><EmptyState icon="ti-lock" title="Not available" text="Reseller access required." /></Layout>;
  if (sub === undefined) return <Layout flat title="Client"><div className="p-8"><Spinner /></div></Layout>;
  if (!sub) return <Layout flat title="Client"><EmptyState icon="ti-building-off" title="Client not found" text="This workspace isn’t one of your sub-tenants." /><div className="mt-4"><button className="btn" onClick={() => router.push('/reseller/clients')}><Icon name="ti-arrow-left" />Back to clients</button></div></Layout>;

  const planOpts = ['free', ...prices.map((p) => p.plan_key)].filter((v, i, a) => a.indexOf(v) === i);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const guard = () => { if (!editMode) { flash('Turn on Edit mode (top-right) to make changes.'); return false; } return true; };
  const changePlan = async () => { if (!guard() || planSel === sub.plan_key) return; setBusy(true); setErr(''); try { await resellerSetSubPlan(sub!.org_id, planSel); flash('Plan updated'); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const toggleActive = async () => { if (!guard()) return; setBusy(true); setErr(''); try { await resellerSetSubActive(sub!.org_id, sub!.sub_status !== 'active'); flash('Updated'); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const viewAs = async () => { setViewMsg('Generating sign-in link…'); try { const r = await adminImpersonateLink({ sub: sub!.org_id }); try { await navigator.clipboard?.writeText(r.link); } catch { /* */ } setViewMsg('Sign-in link copied — open it in a private window.'); setTimeout(() => setViewMsg(''), 8000); } catch (e: any) { setViewMsg(e.message || 'Failed'); } };

  const suspended = !!sub.sub_status && sub.sub_status !== 'active';
  return (
    <Layout flat title={sub.org_name}>
      <PageHeader title={sub.org_name} subtitle={sub.slug} icon="ti-building"
        action={<div className="flex items-center gap-2">
          <button onClick={() => setEditMode((v) => !v)} title={editMode ? 'Changes enabled — click to lock' : 'Locked (read-only). Click to enable changes.'} className={`btn h-8 py-0 ${editMode ? 'border border-amber-400 text-amber-700 bg-amber-500/10' : 'border border-line text-muted'}`}><Icon name={editMode ? 'ti-lock-open' : 'ti-lock'} />{editMode ? 'Editing' : 'Locked'}</button>
          <button onClick={viewAs} className="btn h-8 py-0"><Icon name="ti-login-2" />View as</button>
          <button onClick={() => router.push('/reseller/clients')} className="btn h-8 py-0"><Icon name="ti-arrow-left" />Back</button>
        </div>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {viewMsg && <p className="text-2xs text-accentstrong mb-3 inline-flex items-center gap-1.5"><Icon name="ti-info-circle" />{viewMsg}</p>}
      {msg && <p className="text-2xs text-emerald-600 mb-3">{msg}</p>}
      {!editMode && <div className="flex items-center gap-2 mb-4 rounded-lg border border-line bg-surface2/40 px-3 py-2 text-2xs text-muted"><Icon name="ti-lock" className="text-sm" />Read-only — turn on <b className="mx-1 text-content">Edit mode</b> (top-right) to change this client’s plan or status.</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Plan" value={sub.plan_name || sub.plan_key || 'free'} icon="ti-package" />
        <StatCard label="Members" value={String(sub.member_count ?? 0)} icon="ti-users" />
        <StatCard label="Seats" value={`${sub.seats ?? 0}${sub.seat_limit ? ` / ${sub.seat_limit}` : ''}`} icon="ti-armchair" />
        <StatCard label="Status" value={suspended ? 'Suspended' : 'Active'} icon={suspended ? 'ti-ban' : 'ti-circle-check'} />
      </div>

      <div className="card p-5 mb-4 max-w-xl space-y-3">
        <h3 className="text-sm font-semibold">Plan</h3>
        <p className="text-2xs text-muted">Set this client’s plan. You can assign Free or any plan you offer (priced under Pricing).</p>
        <div className="flex items-end gap-2">
          <div className="flex-1"><label className="text-2xs text-muted block mb-1">Plan</label>
            <select className="input capitalize" disabled={!editMode} value={planSel} onChange={(e) => setPlanSel(e.target.value)}>
              {planOpts.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" disabled={busy || !editMode || planSel === sub.plan_key} onClick={changePlan}>Update plan</button>
        </div>
      </div>

      <div className="card p-5 max-w-xl flex items-center justify-between gap-4">
        <div><h3 className="text-sm font-semibold">{suspended ? 'Reactivate client' : 'Suspend client'}</h3><p className="text-2xs text-muted mt-0.5">{suspended ? 'Restore access for this client’s members.' : 'Members lose access until you reactivate.'}</p></div>
        <button onClick={toggleActive} disabled={busy || !editMode} className={`btn h-8 py-0 ${suspended ? 'btn-primary' : 'btn-danger'} ${!editMode ? 'opacity-50' : ''}`}><Icon name={suspended ? 'ti-circle-check' : 'ti-ban'} />{suspended ? 'Reactivate' : 'Suspend'}</button>
      </div>
    </Layout>
  );
}

import { useEffect, useState } from 'react';
import { Icon, Tabs } from '@/components/ui';
import { getOrgPlanInfo, listPlans, listPlanFeatures, startCheckout, openBillingPortal, getTenantEvents, TenantEvent, setAutoRenew } from '@/lib/db';
import { OrgPlanInfo, Plan, PlanFeature, FeatureKey } from '@/lib/supabase';
import { FEATURE_LABELS, formatPrice } from '@/lib/entitlements';

function PlanPanel({ org, canBill }: { org: { id: string; features?: string[] }; canBill: boolean }) {
  const [info, setInfo] = useState<OrgPlanInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pf, setPf] = useState<PlanFeature[]>([]);
  const [busy, setBusy] = useState('');
  const [billErr, setBillErr] = useState('');
  const [autoRenew, setAutoRenewState] = useState<boolean | null>(null);
  const reloadInfo = () => getOrgPlanInfo(org.id).then((i) => { setInfo(i); setAutoRenewState(i.cancel_at_period_end == null ? null : !i.cancel_at_period_end); }).catch(() => {});
  useEffect(() => { reloadInfo(); listPlans().then(setPlans).catch(() => {}); listPlanFeatures().then(setPf).catch(() => {}); /* eslint-disable-next-line */ }, [org.id]);
  const toggleAutoRenew = async () => { const next = !(autoRenew ?? true); setAutoRenewState(next); setBillErr(''); try { await setAutoRenew(org.id, next); } catch (e: any) { setBillErr(e?.message || 'Could not update auto-renew'); setAutoRenewState(!next); } };
  const periodEnd = info?.current_period_end ? new Date(info.current_period_end) : null;
  const daysLeft = periodEnd ? Math.ceil((periodEnd.getTime() - Date.now()) / 86400000) : null;
  const expiringSoon = daysLeft != null && daysLeft <= 30 && daysLeft >= 0;
  const features = org.features || [];
  const goCheckout = async (planKey: string) => {
    setBusy(planKey); setBillErr('');
    try { const url = await startCheckout(org.id, planKey); window.location.href = url; }
    catch (e: any) { setBillErr(e?.message || 'Could not start checkout'); setBusy(''); }
  };
  const goPortal = async () => {
    setBusy('portal'); setBillErr('');
    try { const url = await openBillingPortal(org.id); window.location.href = url; }
    catch (e: any) { setBillErr(e?.message || 'Could not open billing portal'); setBusy(''); }
  };
  const upgradeable = plans.filter((p) => p.is_active && p.key !== 'free' && p.key !== info?.plan?.key);
  const seatLabel = info?.seat_limit == null ? 'Unlimited' : `${info.seat_count} / ${info.seat_limit}`;
  const overSeats = info?.seat_limit != null && info.seat_count >= info.seat_limit;
  return (
    <div className="card p-6 max-w-4xl mb-6 bg-gradient-to-br from-surface to-surface2/50 border border-line/50">
      <div className="flex items-start justify-between flex-wrap gap-6 pb-6 border-b border-line">
        <div>
          <p className="text-2xs uppercase tracking-wide text-muted mb-1 font-medium">Current plan</p>
          <p className="text-xl font-semibold text-content">{info?.plan?.name || '—'}
            {info?.status && info.status !== 'active' && <span className="ml-2 text-xs text-amber-600 capitalize">({info.status})</span>}
          </p>
          {info?.plan && <p className="text-sm text-muted">{formatPrice(info.plan.price_cents, info.plan.pricing_model)}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xs uppercase tracking-wide text-muted mb-1 font-medium">Seats used</p>
          <p className={`text-xl font-semibold ${overSeats ? 'text-rose-600' : 'text-content'}`}>{seatLabel}</p>
          {overSeats && <p className="text-2xs text-rose-600">Seat limit reached</p>}
        </div>
      </div>
      {periodEnd && (
        <div className={`mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 ${expiringSoon && !(autoRenew) ? 'border-amber-400/50 bg-amber-500/5' : 'border-line bg-surface2/30'}`}>
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted mb-0.5 font-medium">{autoRenew ? 'Renews on' : 'Expires on'}</p>
            <p className="text-sm font-semibold text-content inline-flex items-center gap-2">
              {periodEnd.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              {daysLeft != null && daysLeft >= 0 && <span className={`pill ${expiringSoon ? 'pill-amber' : 'pill-gray'}`}>{daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}</span>}
              {daysLeft != null && daysLeft < 0 && <span className="pill pill-red">expired</span>}
            </p>
          </div>
          {autoRenew != null && (
            <label className={`flex items-center gap-2 text-sm ${canBill ? 'cursor-pointer' : 'opacity-60'}`}>
              <input type="checkbox" checked={!!autoRenew} disabled={!canBill} onChange={toggleAutoRenew} className="accent-accent w-4 h-4" />
              <span className="text-content">Auto-renew</span>
            </label>
          )}
        </div>
      )}
      <div className="mt-6">
        <p className="text-2xs uppercase tracking-wide text-muted mb-3 font-medium">Included features</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((k) => {
            const on = features.includes(k);
            return (
              <span key={k} className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition ${on ? 'border-accent/30 bg-accent/10 text-accentstrong' : 'border-line bg-surface2 text-muted'}`}>
                <Icon name={on ? 'ti-check' : 'ti-minus'} className="text-2xs" />{FEATURE_LABELS[k]}
              </span>
            );
          })}
        </div>
      </div>
      {plans.length > 1 && (
        <div className="mt-6 pt-6 border-t border-line">
          <p className="text-2xs uppercase tracking-wide text-muted mb-3 font-medium">Compare plans</p>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted text-2xs uppercase tracking-wide">Feature</th>
                {plans.filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order).map((p) => (
                  <th key={p.id} className={`px-3 py-2 text-center ${p.key === info?.plan?.key ? 'text-accentstrong' : 'text-content'}`}>
                    <span className="font-semibold block">{p.name}</span>
                    {p.key === info?.plan?.key ? <span className="block text-2xs text-accentstrong">Current</span>
                      : <span className="block text-2xs text-muted font-normal">{formatPrice(p.price_cents, p.pricing_model)}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((fk) => (
                <tr key={fk} className="border-t border-line">
                  <td className="px-3 py-2 text-content">{FEATURE_LABELS[fk]}</td>
                  {plans.filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order).map((p) => (
                    <td key={p.id} className={`px-3 py-2 text-center ${p.key === info?.plan?.key ? 'bg-accent/5' : ''}`}>
                      {pf.some((x) => x.plan_id === p.id && x.feature_key === fk && x.enabled)
                        ? <Icon name="ti-check" className="text-emerald-600" />
                        : <Icon name="ti-minus" className="text-muted2" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
      <div className="mt-6 pt-6 border-t border-line">
        <p className="text-2xs uppercase tracking-wide text-muted mb-3 font-medium">Billing</p>
        {billErr && <p className="text-sm text-rose-600 mb-3">{billErr}</p>}
        {canBill ? (<>
          <div className="flex flex-wrap items-center gap-2">
            {upgradeable.map((p) => (
              <button key={p.id} className="btn btn-primary" disabled={!!busy} onClick={() => goCheckout(p.key)}>
                {busy === p.key ? 'Redirecting…' : `Upgrade to ${p.name}`}
              </button>
            ))}
            <button className="btn btn-ghost border border-line" disabled={!!busy} onClick={goPortal}>
              {busy === 'portal' ? 'Opening…' : 'Manage billing'}
            </button>
          </div>
          <p className="text-2xs text-muted mt-3">Upgrades open secure Stripe Checkout — you review and confirm the charge there before paying. Manage billing opens the Stripe customer portal. Seat counts sync automatically.</p>
        </>) : (
          <p className="text-sm text-muted">Only the workspace owner can change the plan or manage billing. Ask an owner to upgrade.</p>
        )}
      </div>
    </div>
  );
}

function PlanHistory({ org }: { org: { id: string } }) {
  const [events, setEvents] = useState<TenantEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { getTenantEvents(org.id).then(setEvents).catch(() => setEvents([])).finally(() => setLoaded(true)); }, [org.id]);
  const META: Record<string, { label: string; icon: string; tone: string }> = {
    signup: { label: 'Signed up', icon: 'ti-sparkles', tone: 'text-sky-600' },
    plan_changed: { label: 'Plan changed', icon: 'ti-package', tone: 'text-violet-600' },
    suspended: { label: 'Suspended', icon: 'ti-ban', tone: 'text-rose-600' },
    reactivated: { label: 'Reactivated', icon: 'ti-circle-check', tone: 'text-emerald-600' },
    payment: { label: 'Payment', icon: 'ti-credit-card', tone: 'text-emerald-600' },
    refund: { label: 'Refund', icon: 'ti-arrow-back-up', tone: 'text-amber-600' },
    email: { label: 'Message', icon: 'ti-mail', tone: 'text-muted' },
    campaign: { label: 'Message', icon: 'ti-mail', tone: 'text-muted' },
  };
  if (!loaded) return null;
  const detail = (ev: TenantEvent) => (ev.plan_from && ev.plan_to) ? `${ev.plan_from} \u2192 ${ev.plan_to}` : (ev.reason || '\u2014');
  return (
    <div className="card p-0 mb-6 max-w-4xl overflow-hidden">
      <div className="px-5 py-4 border-b border-line">
        <p className="text-sm font-semibold text-content">Billing history</p>
        <p className="text-2xs text-muted mt-0.5">Every billing transaction and account action on this workspace, most recent first.</p>
      </div>
      {events.length === 0 ? (
        <div className="p-8 text-center"><Icon name="ti-receipt-off" className="text-2xl text-muted2 block mb-2" /><p className="text-sm text-muted2">No billing activity yet — signup, plan changes and payments will appear here.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface2/50 text-left text-2xs uppercase tracking-wide text-muted2">
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Activity</th>
                <th className="px-3 py-2.5 font-medium">Details</th>
                <th className="px-5 py-2.5 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => { const m = META[ev.event_type] || { label: ev.event_type, icon: 'ti-point', tone: 'text-muted' }; return (
                <tr key={ev.id} className="border-t border-line hover:bg-surface2/40">
                  <td className="px-5 py-3 whitespace-nowrap text-muted">{new Date(ev.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                  <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5 font-medium text-content"><Icon name={m.icon} className={`text-sm ${m.tone}`} />{m.label}</span></td>
                  <td className="px-3 py-3 text-muted capitalize">{detail(ev)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-content">{ev.amount_cents != null ? (ev.amount_cents / 100).toLocaleString(undefined, { style: 'currency', currency: ev.currency || 'USD' }) : '\u2014'}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function BillingPanel({ org, canBill }: { org: { id: string; features?: string[]; name?: string }; canBill: boolean }) {
  const [tab, setTab] = useState<'plan' | 'invoices' | 'history'>('plan');
  return (
    <>
      <Tabs tabs={[
        { key: 'plan', label: 'Plan Management', icon: 'ti-package' },
        { key: 'invoices', label: 'Invoices & Receipts', icon: 'ti-file-invoice' },
        { key: 'history', label: 'Billing history', icon: 'ti-history' },
      ]} active={tab} onChange={(k) => setTab(k as 'plan' | 'invoices' | 'history')} />
      <div className="mt-5">
        {tab === 'plan' && <PlanPanel org={org} canBill={canBill} />}
        {tab === 'invoices' && <InvoicesCard org={org} canBill={canBill} />}
        {tab === 'history' && <PlanHistory org={org} />}
      </div>
    </>
  );
}

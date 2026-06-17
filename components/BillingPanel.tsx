import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
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
  const META: Record<string, { label: string; icon: string }> = {
    signup: { label: 'Signed up', icon: 'ti-sparkles' },
    plan_changed: { label: 'Plan changed', icon: 'ti-package' },
    suspended: { label: 'Suspended', icon: 'ti-ban' },
    reactivated: { label: 'Reactivated', icon: 'ti-circle-check' },
    payment: { label: 'Payment', icon: 'ti-credit-card' },
    email: { label: 'Message received', icon: 'ti-mail' },
    campaign: { label: 'Message received', icon: 'ti-mail' },
  };
  if (!loaded || events.length === 0) return null;
  return (
    <div className="card p-6 mb-6 max-w-4xl">
      <p className="text-2xs uppercase tracking-wide text-muted mb-1 font-medium">Plan &amp; account history</p>
      <p className="text-sm text-muted mb-4">Your signup, plan changes and billing events.</p>
      <ol className="relative border-l border-line ml-2 space-y-3">
        {events.map((ev) => { const m = META[ev.event_type] || { label: ev.event_type, icon: 'ti-point' }; return (
          <li key={ev.id} className="ml-4 relative">
            <span className="absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full bg-accent" />
            <div className="flex items-center gap-2 flex-wrap">
              <Icon name={m.icon} className="text-sm text-muted2" />
              <span className="text-sm font-medium text-content">{m.label}</span>
              {ev.plan_from && ev.plan_to && <span className="text-2xs text-muted2 capitalize">{ev.plan_from} → {ev.plan_to}</span>}
              {ev.amount_cents != null && <span className="text-2xs text-content font-medium">{(ev.amount_cents / 100).toLocaleString(undefined, { style: 'currency', currency: ev.currency || 'USD' })}</span>}
              <span className="text-2xs text-muted2 ml-auto whitespace-nowrap">{new Date(ev.created_at).toLocaleDateString()}</span>
            </div>
            {ev.reason && ev.event_type !== 'plan_changed' && <p className="text-2xs text-muted mt-0.5">{ev.reason}</p>}
          </li>
        ); })}
      </ol>
    </div>
  );
}

function InvoicesCard({ org, canBill }: { org: { id: string }; canBill: boolean }) {
  const [events, setEvents] = useState<TenantEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { getTenantEvents(org.id).then(setEvents).catch(() => setEvents([])).finally(() => setLoaded(true)); }, [org.id]);
  const invoices = events.filter((e) => e.event_type === 'payment');
  const portal = async () => { setBusy(true); setErr(''); try { const url = await openBillingPortal(org.id); window.location.href = url; } catch (e: any) { setErr(e?.message || 'Could not open billing portal'); setBusy(false); } };
  if (!loaded) return null;
  return (
    <div className="card p-6 mb-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div><p className="text-2xs uppercase tracking-wide text-muted mb-1 font-medium">Invoices &amp; receipts</p><p className="text-sm text-muted">Your payments. Download itemised PDF invoices and receipts from the secure billing portal.</p></div>
        {canBill && <button className="btn btn-ghost border border-line shrink-0" disabled={busy} onClick={portal}><Icon name="ti-download" />{busy ? 'Opening…' : 'Invoices in portal'}</button>}
      </div>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {invoices.length === 0 ? (
        <p className="text-sm text-muted2">No payments recorded yet. Once you upgrade to a paid plan, your invoices appear here and in the billing portal.</p>
      ) : (
        <div className="divide-y divide-line">
          {invoices.map((ev) => (
            <div key={ev.id} className="flex items-center gap-3 py-2.5">
              <span className="w-8 h-8 rounded-md grid place-items-center bg-emerald-500/10 text-emerald-600 shrink-0"><Icon name="ti-receipt" className="text-base" /></span>
              <div className="min-w-0 flex-1"><p className="text-sm text-content">{ev.reason || 'Payment'}</p><p className="text-2xs text-muted">{new Date(ev.created_at).toLocaleString()}</p></div>
              {ev.amount_cents != null && <span className="text-sm font-semibold text-content tabular-nums">{(ev.amount_cents / 100).toLocaleString(undefined, { style: 'currency', currency: ev.currency || 'USD' })}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BillingPanel({ org, canBill }: { org: { id: string; features?: string[]; name?: string }; canBill: boolean }) {
  return (<><PlanPanel org={org} canBill={canBill} /><InvoicesCard org={org} canBill={canBill} /><PlanHistory org={org} /></>);
}

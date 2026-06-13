import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, Icon } from '@/components/ui';
import { Modal, Field, useModalTabs } from '@/components/Modal';
import { useAuthStore } from '@/lib/store';
import { listPlatformOrgs, listPlans, listFeatures, listPlanFeatures, setPlanFeature, setOrgPlan, createPlan, updatePlan, PlanPatch, billingGetStatus, billingSetConfig, billingSetPlanPrice, BillingStatus } from '@/lib/db';
import { PlatformOrg, Plan, Feature, PlanFeature } from '@/lib/supabase';
import { formatPrice } from '@/lib/entitlements';

type Tab = 'tenants' | 'plans' | 'billing';

const PRICING_MODELS: { value: Plan['pricing_model']; label: string }[] = [
  { value: 'flat', label: 'Flat (per org / month)' },
  { value: 'per_user', label: 'Per user / month' },
  { value: 'white_label', label: 'White-label (flat)' },
];

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Create / edit a subscription plan (platform admin only — enforced by plans_write RLS).
function PlanModal({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const editing = !!plan;
  const tabs = useModalTabs('plan');
  const [name, setName] = useState(plan?.name || '');
  const [key, setKey] = useState(plan?.key || '');
  const [keyTouched, setKeyTouched] = useState(editing);
  const [description, setDescription] = useState(plan?.description || '');
  const [pricingModel, setPricingModel] = useState<Plan['pricing_model']>(plan?.pricing_model || 'flat');
  const [price, setPrice] = useState(plan ? String(plan.price_cents / 100) : '0');
  const [billingPeriod, setBillingPeriod] = useState<Plan['billing_period']>(plan?.billing_period || 'monthly');
  const [userLimit, setUserLimit] = useState(plan?.user_limit != null ? String(plan.user_limit) : '');
  const [sortOrder, setSortOrder] = useState(String(plan?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(plan?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!name.trim() || saving) { tabs.setTab('plan'); return; }
    const cents = Math.round((parseFloat(price) || 0) * 100);
    if (cents < 0) { setErr('Price cannot be negative'); tabs.setTab('pricing'); return; }
    const limit = userLimit.trim() === '' ? null : Math.max(1, parseInt(userLimit, 10) || 1);
    const patch: PlanPatch = {
      name: name.trim(),
      description: description.trim() || null,
      pricing_model: pricingModel,
      price_cents: cents,
      billing_period: billingPeriod,
      user_limit: limit,
      sort_order: parseInt(sortOrder, 10) || 0,
      is_active: isActive,
    };
    setSaving(true); setErr('');
    try {
      if (editing) await updatePlan(plan!.id, patch);
      else await createPlan({ ...patch, key: (key.trim() || slugify(name)), name: name.trim() });
      await onSaved();
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} onSubmit={submit} size="lg" icon="ti-license"
      title={editing ? `Edit plan — ${plan!.name}` : 'New plan'}
      subtitle={editing ? 'Changes apply immediately to every tenant on this plan' : 'Define pricing, seats and billing; toggle features in the matrix after saving'}
      tabs={[
        { key: 'plan', label: 'Plan', icon: 'ti-license' },
        { key: 'pricing', label: 'Pricing', icon: 'ti-currency-dollar' },
      ]}
      {...tabs.bind}
      footer={(
        <div className="flex items-center justify-end gap-2">
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">↵ to save</span>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create plan'}
          </button>
        </div>
      )}>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {tabs.tab === 'plan' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" required>
            <input className="input" value={name} autoFocus placeholder="e.g. Growth"
              onChange={(e) => { setName(e.target.value); if (!keyTouched) setKey(slugify(e.target.value)); }} />
          </Field>
          <Field label="Key" required hint={editing ? 'Immutable — referenced by subscriptions' : 'Unique identifier (auto from name)'}>
            <input className="input font-mono" value={key} disabled={editing}
              onChange={(e) => { setKeyTouched(true); setKey(slugify(e.target.value)); }} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <input className="input" value={description} placeholder="Shown on the plan column" onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Sort order" hint="Column position in the matrix">
            <input className="input" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
          <Field label="Status">
            <label className="flex items-center gap-2 h-9 text-sm cursor-pointer select-none">
              <input type="checkbox" className="accent-accent w-4 h-4" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span className={isActive ? 'text-content' : 'text-muted'}>{isActive ? 'Active — selectable for tenants' : 'Inactive (hidden from new assignments)'}</span>
            </label>
          </Field>
        </div>
      )}
      {tabs.tab === 'pricing' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Pricing model" required>
            <select className="input" value={pricingModel} onChange={(e) => setPricingModel(e.target.value as Plan['pricing_model'])}>
              {PRICING_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Price (USD)" required hint={pricingModel === 'per_user' ? 'Charged per seat per period' : 'Charged per org per period'}>
            <input className="input" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Billing period" required>
            <select className="input" value={billingPeriod} onChange={(e) => setBillingPeriod(e.target.value as Plan['billing_period'])}>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </Field>
          <Field label="Seat limit" hint="Blank = unlimited; enforced on member invites">
            <input className="input" type="number" min="1" placeholder="∞" value={userLimit} onChange={(e) => setUserLimit(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

const WEBHOOK_URL = 'https://dkjdtyzjdkumnpdyezbs.supabase.co/functions/v1/stripe-webhook';

// Billing (Stripe) config — platform admin only. Secrets are write-only from here;
// the status RPC never returns secret values, only whether they are set.
function BillingTab({ plans, onReload }: { plans: Plan[]; onReload: () => Promise<void> }) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState('');
  const [publishable, setPublishable] = useState('');
  const [webhook, setWebhook] = useState('');
  const [mode, setMode] = useState('test');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});

  const loadStatus = async () => {
    setLoading(true);
    try {
      const st = await billingGetStatus();
      setStatus(st);
      if (st?.mode) setMode(st.mode);
    } catch (e: any) { setErr(e?.message || 'Failed to load billing status'); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadStatus(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { setPrices(Object.fromEntries(plans.map((p) => [p.id, p.stripe_price_id || '']))); }, [plans]);

  const saveConfig = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      await billingSetConfig({ secret, publishable, webhook, mode });
      setSecret(''); setWebhook(''); // clear sensitive inputs after save
      setMsg('Saved. Stripe configuration updated.');
      await loadStatus();
    } catch (e: any) { setErr(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const savePrice = async (planId: string) => {
    setErr(''); setMsg('');
    try { await billingSetPlanPrice(planId, prices[planId] || ''); setMsg('Price ID saved.'); await onReload(); }
    catch (e: any) { setErr(e?.message || 'Failed to save price'); }
  };

  if (loading) return <div className="card rounded-t-none p-6"><Spinner /></div>;

  return (
    <div className="card rounded-t-none p-5 sm:p-6 space-y-7">
      {/* Connection status */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`pill ${status?.has_secret ? 'pill-green' : 'pill-red'}`}>
          {status?.has_secret ? 'Connected' : 'Not connected'}
        </span>
        <span className="pill pill-gray">Mode: {status?.mode || 'test'}</span>
        <span className={`pill ${status?.has_webhook ? 'pill-green' : 'pill-amber'}`}>
          {status?.has_webhook ? 'Webhook set' : 'Webhook missing'}
        </span>
        {status?.updated_at && <span className="text-2xs text-muted">Updated {new Date(status.updated_at).toLocaleString()}</span>}
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      {/* Keys form */}
      <div className="space-y-4 max-w-xl">
        <h3 className="text-sm font-semibold text-content">Stripe API keys</h3>
        <p className="text-2xs text-muted">Paste your keys from the Stripe dashboard. Secret values are stored server-side and are never shown back here — leave a field blank to keep its current value.</p>
        <Field label="Secret key" hint={status?.has_secret ? 'A secret key is already set — leave blank to keep it.' : 'sk_test_… or sk_live_…'}>
          <input type="password" className="input" autoComplete="off" placeholder={status?.has_secret ? '•••••••• (unchanged)' : 'sk_test_…'} value={secret} onChange={(e) => setSecret(e.target.value)} />
        </Field>
        <Field label="Publishable key" hint="pk_test_… or pk_live_… (safe to display)">
          <input className="input" placeholder={status?.publishable_key || 'pk_test_…'} value={publishable} onChange={(e) => setPublishable(e.target.value)} />
        </Field>
        <Field label="Webhook signing secret" hint={status?.has_webhook ? 'Already set — leave blank to keep it.' : 'whsec_… (from the webhook endpoint you create in Stripe)'}>
          <input type="password" className="input" autoComplete="off" placeholder={status?.has_webhook ? '•••••••• (unchanged)' : 'whsec_…'} value={webhook} onChange={(e) => setWebhook(e.target.value)} />
        </Field>
        <Field label="Mode">
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="test">Test</option>
            <option value="live">Live</option>
          </select>
        </Field>
        <button className="btn btn-primary" disabled={saving} onClick={saveConfig}>
          {saving ? 'Saving…' : 'Save Stripe configuration'}
        </button>
      </div>

      {/* Webhook endpoint */}
      <div className="space-y-2 max-w-xl">
        <h3 className="text-sm font-semibold text-content">Webhook endpoint</h3>
        <p className="text-2xs text-muted">In Stripe → Developers → Webhooks, add an endpoint pointing here and subscribe to <span className="font-mono">checkout.session.completed</span>, <span className="font-mono">customer.subscription.updated</span>, <span className="font-mono">customer.subscription.deleted</span>. Then paste its signing secret above.</p>
        <code className="block text-xs bg-surface2 border border-line rounded-md px-3 py-2 break-all">{WEBHOOK_URL}</code>
      </div>

      {/* Per-plan price IDs */}
      <div className="space-y-3 max-w-xl">
        <h3 className="text-sm font-semibold text-content">Plan → Stripe Price ID</h3>
        <p className="text-2xs text-muted">Create a recurring Price for each paid plan in Stripe and paste its Price ID (price_…) here. Plans without a Price ID can't be checked out.</p>
        {plans.filter((p) => p.key !== 'free').map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm text-content">{p.name}</span>
            <input className="input flex-1" placeholder="price_…" value={prices[p.id] ?? ''} onChange={(e) => setPrices((s) => ({ ...s, [p.id]: e.target.value }))} />
            <button className="btn btn-ghost border border-line" onClick={() => savePrice(p.id)}>Save</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlatformPage() {
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  const [orgs, setOrgs] = useState<PlatformOrg[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [pf, setPf] = useState<PlanFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('tenants');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [planModal, setPlanModal] = useState<Plan | 'new' | null>(null);

  const load = async () => {
    const [o, p, f, m] = await Promise.all([listPlatformOrgs(), listPlans(), listFeatures(), listPlanFeatures()]);
    setOrgs(o); setPlans(p); setFeatures(f); setPf(m);
  };
  useEffect(() => { if (platformAdmin) load().catch((e) => setErr(e.message)).finally(() => setLoading(false)); else setLoading(false); }, [platformAdmin]);

  if (!platformAdmin) {
    return <Layout title="Platform"><div className="card p-10 text-center text-sm text-muted"><Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />Platform administration is restricted to the platform team.</div></Layout>;
  }

  const enabled = (planId: string, fk: string) => pf.some((x) => x.plan_id === planId && x.feature_key === fk && x.enabled);

  const toggleFeature = async (planId: string, fk: string, on: boolean) => {
    setBusy(true); setErr('');
    setPf((prev) => {
      const i = prev.findIndex((x) => x.plan_id === planId && x.feature_key === fk);
      if (i >= 0) { const c = prev.slice(); c[i] = { ...c[i], enabled: on }; return c; }
      return [...prev, { plan_id: planId, feature_key: fk, enabled: on }];
    });
    try { await setPlanFeature(planId, fk, on); } catch (e: any) { setErr(e.message); await load(); }
    finally { setBusy(false); }
  };

  const changePlan = async (orgId: string, planId: string) => {
    setBusy(true); setErr('');
    try { await setOrgPlan(orgId, planId); await load(); } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Layout title="Platform">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Tenants & plans" subtitle="Cross-tenant administration — subscriptions, seats and feature entitlements"
            action={tab === 'plans' ? (
              <button className="btn btn-primary" onClick={() => setPlanModal('new')}>
                <Icon name="ti-plus" className="text-base" /> New plan
              </button>
            ) : undefined} />

          {/* Tabs */}
          <div className="card rounded-b-none border-b-0 flex gap-1 px-4 bg-surface2/50 sticky top-0 z-10">
            {(['tenants', 'plans', 'billing'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? 'border-b-accent text-content'
                    : 'border-b-transparent text-muted hover:text-content'
                }`}
              >
                {t === 'tenants' ? 'Tenants' : t === 'plans' ? 'Plans & features' : 'Billing (Stripe)'}
              </button>
            ))}
          </div>

          {err && <p className="text-sm text-rose-600 mb-3 px-4 pt-4 card rounded-t-none">{err}</p>}

          {tab === 'tenants' ? (
            <div className="card overflow-hidden rounded-t-none">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 font-medium">Tenant</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Seats</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => {
                    const overSeats = o.seat_limit != null && o.member_count >= o.seat_limit;
                    return (
                      <tr key={o.org_id} className="border-t border-line hover:bg-surface2/50">
                        <td className="px-4 py-3">
                          <span className="block font-medium text-content">{o.org_name}</span>
                          <span className="block text-2xs text-muted font-mono">{o.slug}</span>
                        </td>
                        <td className="px-4 py-3">
                          <select className="input h-8 py-0" disabled={busy}
                            value={plans.find((p) => p.key === o.plan_key)?.id || ''}
                            onChange={(e) => changePlan(o.org_id, e.target.value)}>
                            {!o.plan_key && <option value="">— none —</option>}
                            {plans.filter((p) => p.is_active || p.key === o.plan_key).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                        <td className={`px-4 py-3 ${overSeats ? 'text-rose-600 font-medium' : ''}`}>
                          {o.member_count}{o.seat_limit == null ? ' / ∞' : ` / ${o.seat_limit}`}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`pill ${o.sub_status === 'active' ? 'pill-green' : o.sub_status ? 'pill-amber' : 'pill-red'}`}>
                            {o.sub_status || 'none'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
          ) : tab === 'plans' ? (
            <div className="card overflow-x-auto rounded-t-none">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-surface2 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-2xs uppercase tracking-wide text-muted">Feature</th>
                    {plans.map((p) => (
                      <th key={p.id} className="px-4 py-3 text-center">
                        <span className="flex items-center justify-center gap-1.5">
                          <span className="font-semibold text-content">{p.name}</span>
                          {!p.is_active && <span className="pill pill-gray">inactive</span>}
                          <button className="text-muted2 hover:text-accentstrong transition-colors" title={`Edit ${p.name}`}
                            onClick={() => setPlanModal(p)}>
                            <Icon name="ti-pencil" className="text-sm" />
                          </button>
                        </span>
                        <span className="block text-2xs text-muted font-normal">{formatPrice(p.price_cents, p.pricing_model)}{p.billing_period === 'annual' ? ' (annual)' : ''}</span>
                        <span className="block text-2xs text-muted font-normal">{p.user_limit == null ? 'unlimited seats' : `${p.user_limit} seats`}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {features.map((f) => (
                    <tr key={f.key} className="border-t border-line hover:bg-surface2/50">
                      <td className="px-4 py-3">
                        <span className="block font-medium text-content">{f.name}</span>
                        <span className="block text-2xs text-muted">{f.description}</span>
                      </td>
                      {plans.map((p) => (
                        <td key={p.id} className="px-4 py-3 text-center">
                          <input type="checkbox" className="accent-accent w-4 h-4" disabled={busy}
                            checked={enabled(p.id, f.key)}
                            onChange={(e) => toggleFeature(p.id, f.key, e.target.checked)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <div className="px-4 py-3 text-2xs text-muted border-t border-line">Changes apply immediately to every tenant on that plan (enforced server-side via RLS).</div>
            </div>
          ) : (
            <BillingTab plans={plans} onReload={load} />
          )}

          {planModal && (
            <PlanModal plan={planModal === 'new' ? null : planModal} onClose={() => setPlanModal(null)} onSaved={load} />
          )}
        </>
      )}
    </Layout>
  );
}

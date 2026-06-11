import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, Icon } from '@/components/ui';
import { useAuthStore } from '@/lib/store';
import { listPlatformOrgs, listPlans, listFeatures, listPlanFeatures, setPlanFeature, setOrgPlan } from '@/lib/db';
import { PlatformOrg, Plan, Feature, PlanFeature } from '@/lib/supabase';
import { formatPrice } from '@/lib/entitlements';

export default function PlatformPage() {
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  const [orgs, setOrgs] = useState<PlatformOrg[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [pf, setPf] = useState<PlanFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    const [o, p, f, m] = await Promise.all([listPlatformOrgs(), listPlans(), listFeatures(), listPlanFeatures()]);
    setOrgs(o); setPlans(p); setFeatures(f); setPf(m);
  };
  useEffect(() => { if (platformAdmin) load().catch((e) => setErr(e.message)).finally(() => setLoading(false)); else setLoading(false); }, [platformAdmin]);

  if (!platformAdmin) {
    return <Layout title="Platform"><div className="card p-10 text-center text-sm text-neutral-500"><Icon name="ti-lock" className="text-2xl text-neutral-300 block mb-2" />Platform administration is restricted to the platform team.</div></Layout>;
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
          <PageHeader title="Tenants & plans" subtitle="Cross-tenant administration — subscriptions, seats and feature entitlements" />
          {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

          <div className="card overflow-hidden mb-8">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-paper text-neutral-500 text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Tenant</th>
                  <th className="px-4 py-2.5 font-medium">Plan</th>
                  <th className="px-4 py-2.5 font-medium">Seats</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => {
                  const overSeats = o.seat_limit != null && o.member_count >= o.seat_limit;
                  return (
                    <tr key={o.org_id} className="border-t border-line">
                      <td className="px-4 py-2.5">
                        <span className="block font-medium">{o.org_name}</span>
                        <span className="block text-2xs text-neutral-400 font-mono">{o.slug}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <select className="input h-8 py-0" disabled={busy}
                          value={plans.find((p) => p.key === o.plan_key)?.id || ''}
                          onChange={(e) => changePlan(o.org_id, e.target.value)}>
                          {!o.plan_key && <option value="">— none —</option>}
                          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td className={`px-4 py-2.5 ${overSeats ? 'text-rose-600 font-medium' : ''}`}>
                        {o.member_count}{o.seat_limit == null ? ' / ∞' : ` / ${o.seat_limit}`}
                      </td>
                      <td className="px-4 py-2.5">
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

          <PageHeader title="Plans & feature entitlements" subtitle="Toggle which plan unlocks which module" />
          <div className="card overflow-x-auto">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-paper text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-2xs uppercase tracking-wide text-neutral-500">Feature</th>
                  {plans.map((p) => (
                    <th key={p.id} className="px-4 py-3 text-center">
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block text-2xs text-neutral-400 font-normal">{formatPrice(p.price_cents, p.pricing_model)}</span>
                      <span className="block text-2xs text-neutral-400 font-normal">{p.user_limit == null ? 'unlimited seats' : `${p.user_limit} seats`}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((f) => (
                  <tr key={f.key} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <span className="block font-medium">{f.name}</span>
                      <span className="block text-2xs text-neutral-400">{f.description}</span>
                    </td>
                    {plans.map((p) => (
                      <td key={p.id} className="px-4 py-2.5 text-center">
                        <input type="checkbox" className="accent-ink w-4 h-4" disabled={busy}
                          checked={enabled(p.id, f.key)}
                          onChange={(e) => toggleFeature(p.id, f.key, e.target.checked)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
          <p className="text-2xs text-neutral-400 mt-3">Changes apply immediately to every tenant on that plan (enforced server-side via RLS).</p>
        </>
      )}
    </Layout>
  );
}

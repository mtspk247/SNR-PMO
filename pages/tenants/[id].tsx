import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, StatCard, Icon, Tabs } from '@/components/ui';
import { Field } from '@/components/Modal';
import { useSetCrumbs } from '@/components/Breadcrumbs';
import { useAuthStore } from '@/lib/store';
import { FEATURE_LABELS } from '@/lib/entitlements';
import {
  listTenants, getTenantInfo, setTenantPlan, setTenantActive, setTenantFeatureOverride, setTenantLimitOverride,
  listPlans, TenantInfo, tenantSnapshot, wipeTenantData, listTenantSnapshots, restoreTenantSnapshot, TenantSnapshot,
  getTenantUsage, getOrgActivity, TenantUsage, ActivityItem,
  getTenantDomain, setCustomDomain, requestDomainVerification, checkDomainVerification, TenantDomain,
} from '@/lib/db';
import { Plan } from '@/lib/supabase';

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const over = pct != null && pct >= 90;
  return (
    <div>
      <div className="flex items-center justify-between text-2xs mb-1"><span className="text-muted">{label}</span>
        <span className={over ? 'text-rose-600 font-medium' : 'text-content'}>{used}{limit != null ? ` / ${limit}` : ' / ∞'}{pct != null ? ` (${pct}%)` : ''}</span></div>
      <div className="h-1.5 rounded-full bg-surface2 overflow-hidden"><div className={`h-full ${over ? 'bg-rose-500' : 'bg-accent'}`} style={{ width: `${pct ?? 4}%` }} /></div>
    </div>
  );
}

export default function TenantDetail() {
  const router = useRouter();
  const orgId = typeof router.query.id === 'string' ? router.query.id : '';
  const platformAdmin = useAuthStore((s) => s.platformAdmin);

  const [tenant, setTenant] = useState<any | null>(null);
  const [info, setInfo] = useState<TenantInfo | null>(null);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [snaps, setSnaps] = useState<TenantSnapshot[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [wipeName, setWipeName] = useState(''); const [wiping, setWiping] = useState(false);
  const [dom, setDom] = useState<TenantDomain | null>(null);
  const [domInput, setDomInput] = useState(''); const [domBusy, setDomBusy] = useState(false); const [domMsg, setDomMsg] = useState('');
  const [loading, setLoading] = useState(true); const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState('overview');

  useSetCrumbs(tenant ? [{ label: 'Tenants', href: '/tenants' }, { label: tenant.org_name }] : null);

  const refreshInfo = async () => setInfo(await getTenantInfo(orgId));
  const refreshUsage = () => getTenantUsage(orgId).then(setUsage).catch(() => {});
  const refreshSnaps = () => listTenantSnapshots(orgId).then(setSnaps).catch(() => setSnaps([]));
  const loadDomain = () => { setDomMsg(''); return getTenantDomain(orgId).then((d) => { setDom(d); setDomInput(d.custom_domain || ''); }).catch(() => setDom(null)); };

  useEffect(() => {
    if (!platformAdmin || !orgId) return;
    let active = true;
    (async () => {
      setLoading(true); setErr('');
      try {
        const rows = await listTenants();
        const t = rows.find((r: any) => r.org_id === orgId);
        if (!active) return;
        if (!t) { setNotFound(true); setLoading(false); return; }
        setTenant(t);
        refreshUsage(); refreshSnaps(); loadDomain();
        getOrgActivity(orgId).then(setActivity).catch(() => {});
        listPlans().then(setPlans).catch(() => {});
        setInfo(await getTenantInfo(orgId));
      } catch (e: any) { if (active) setErr(e.message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [platformAdmin, orgId]);

  const changePlan = async (key: string) => { setBusy(true); try { await setTenantPlan(orgId, key); await refreshInfo(); refreshUsage(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const toggleActive = async () => { if (!info) return; setBusy(true); try { await setTenantActive(orgId, !info.active); await refreshInfo(); refreshUsage(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const setFeature = async (key: string, val: boolean | null) => { setBusy(true); try { await setTenantFeatureOverride(orgId, key, val); await refreshInfo(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const saveQuota = async (mb: string) => { setBusy(true); try { await setTenantLimitOverride(orgId, 'storage_mb', mb === '' ? null : Number(mb)); await refreshInfo(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

  const saveDomain = async () => { setDomBusy(true); setErr(''); try { const d = await setCustomDomain(orgId, domInput.trim()); setDom(d); setDomInput(d.custom_domain || ''); } catch (e: any) { setErr(e.message); } finally { setDomBusy(false); } };
  const removeDomain = async () => { setDomBusy(true); setErr(''); try { const d = await setCustomDomain(orgId, ''); setDom(d); setDomInput(''); } catch (e: any) { setErr(e.message); } finally { setDomBusy(false); } };
  const verifyDomain = async () => {
    setDomBusy(true); setErr(''); setDomMsg('Checking DNS…');
    try {
      await requestDomainVerification(orgId);
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const { state } = await checkDomainVerification(orgId);
        if (state === 'verified') { await loadDomain(); setDomMsg('Domain verified.'); setDomBusy(false); return; }
        if (state === 'error') { setDomMsg('DNS lookup failed — check the domain and try again.'); setDomBusy(false); return; }
        if (state === 'not_found') { setDomMsg('No matching _snr-verify TXT record found yet — DNS can take a few minutes to propagate. Try again shortly.'); setDomBusy(false); return; }
      }
      setDomMsg('Still checking — DNS may not have propagated yet. Try again in a few minutes.');
    } catch (e: any) { setErr(e.message); } finally { setDomBusy(false); }
  };

  const doWipe = async () => {
    if (!tenant || wipeName.trim() !== tenant.org_name) return;
    setWiping(true); setErr('');
    try { await tenantSnapshot(orgId, 'Pre-wipe backup'); await wipeTenantData(orgId); setWipeName(''); await refreshSnaps(); await refreshInfo(); refreshUsage(); }
    catch (e: any) { setErr(e.message); } finally { setWiping(false); }
  };
  const doRestore = async (id: string) => {
    if (!confirm('Restore this snapshot? It re-inserts the backed-up records.')) return;
    setWiping(true); setErr('');
    try { await restoreTenantSnapshot(id); await refreshInfo(); refreshUsage(); }
    catch (e: any) { setErr(e.message); } finally { setWiping(false); }
  };

  if (!platformAdmin) return <Layout flat title="Tenant"><EmptyState icon="ti-lock" title="Platform admins only" text="Tenant management is restricted to platform administrators." /></Layout>;
  if (loading) return <Layout flat title="Tenant"><Spinner /></Layout>;
  if (notFound || !tenant) return (
    <Layout flat title="Tenant">
      <EmptyState icon="ti-building-community" title="Tenant not found" text="This organization doesn't exist or you can't access it." />
      <div className="mt-4"><button className="btn" onClick={() => router.push('/tenants')}><Icon name="ti-arrow-left" />Back to tenants</button></div>
    </Layout>
  );

  return (
    <Layout flat title={tenant.org_name}>
      <PageHeader title={tenant.org_name} subtitle={tenant.slug} icon="ti-building-community"
        action={<div className="flex items-center gap-2">
          <span className={`pill ${info?.active === false ? 'pill-red' : 'pill-green'}`}>{info?.active === false ? 'Suspended' : 'Active'}</span>
          <button className={`btn h-8 py-0 ${info?.active === false ? 'btn-primary' : 'btn-danger'}`} disabled={busy || !info} onClick={toggleActive}>
            <Icon name={info?.active === false ? 'ti-circle-check' : 'ti-ban'} />{info?.active === false ? 'Reactivate' : 'Suspend'}
          </button>
          <button className="btn h-8 py-0" onClick={() => router.push('/tenants')}><Icon name="ti-arrow-left" />Back</button>
        </div>} />

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Plan" value={usage?.plan || tenant.plan_name || tenant.plan_key || '—'} icon="ti-package" hint={`Owner: ${usage?.owner || '—'}`} />
        <StatCard label="Members" value={usage ? `${usage.seat_count}${usage.seat_limit ? ` / ${usage.seat_limit}` : ''}` : '—'} icon="ti-users" hint={usage ? `${usage.guests} guests` : undefined} />
        <StatCard label="Storage" value={usage ? `${usage.storage_used_mb} MB` : '—'} icon="ti-database" hint={usage?.storage_limit_mb ? `of ${usage.storage_limit_mb} MB` : 'Unlimited'} />
        <StatCard label="Created" value={usage?.created_at ? new Date(usage.created_at).toLocaleDateString() : '—'} icon="ti-calendar" hint={info?.active === false ? 'Suspended' : 'Active'} hintTone={info?.active === false ? 'down' : 'up'} />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Overview', icon: 'ti-layout-dashboard' },
        { key: 'plan', label: 'Plan & features', icon: 'ti-package' },
        { key: 'domain', label: 'Custom domain', icon: 'ti-world' },
        { key: 'danger', label: 'Danger zone', icon: 'ti-alert-triangle' },
      ]} />

      {tab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {usage ? (
              <div className="card p-5 space-y-3">
                <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Usage vs limits</p>
                <UsageBar label="Members (seats)" used={usage.seat_count} limit={usage.seat_limit} />
                <UsageBar label="Storage (MB)" used={usage.storage_used_mb} limit={usage.storage_limit_mb} />
                <div className="flex items-center justify-between text-2xs"><span className="text-muted">Guests invited</span><span className="text-content font-medium">{usage.guests}</span></div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
                  {Object.entries(usage.counts).map(([k, val]) => (
                    <div key={k} className="rounded-md border border-line bg-surface p-2 text-center"><p className="text-sm font-semibold tabular-nums text-content">{val}</p><p className="text-2xs text-muted2 capitalize">{k}</p></div>
                  ))}
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted2 mb-1.5">Features enabled</p>
                  <div className="flex flex-wrap gap-1.5">{usage.features.map((f) => <span key={f} className="pill pill-green text-2xs">{FEATURE_LABELS[f as keyof typeof FEATURE_LABELS] || f}</span>)}</div>
                </div>
              </div>
            ) : <div className="card p-8"><Spinner /></div>}
          </div>
          <div className="space-y-4">
            <div className="card p-5">
              <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Recent activity</p>
              {activity.length === 0 ? <p className="text-sm text-muted2">No recent activity.</p> : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {activity.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-2xs">
                      <span className="text-content font-medium">{(a.username || 'Someone').split(' ')[0]}</span>
                      <span className="text-muted">{({ INSERT: 'created', UPDATE: 'updated', DELETE: 'deleted' } as Record<string, string>)[a.action] || a.action.toLowerCase()} {(a.entity_type || '').replace(/_/g, ' ')}</span>
                      <span className="text-muted2 ml-auto whitespace-nowrap">{new Date(a.ts).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'plan' && info && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="space-y-4">
            <div className="card p-5 space-y-3">
              <Field label="Plan">
                <select className="input" value={info.plan || ''} disabled={busy} onChange={(e) => changePlan(e.target.value)}>
                  <option value="">—</option>{plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Storage quota override (MB)" hint="Blank = use plan default">
                <input className="input" type="number" defaultValue={info.limits.storage_mb ?? ''} disabled={busy}
                  onBlur={(e) => saveQuota(e.target.value)} placeholder="e.g. 51200" />
              </Field>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="card p-5">
              <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Feature overrides</p>
              <div className="divide-y divide-line">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                  const ov = info.features[key];
                  return (
                    <div key={key} className="flex items-center gap-2 py-2">
                      <span className="text-sm text-content flex-1">{label}</span>
                      <div className="flex items-center rounded-lg border border-line overflow-hidden text-2xs">
                        {([['default', undefined], ['on', true], ['off', false]] as const).map(([lab, val]) => {
                          const activeSel = ov === val;
                          return <button key={lab} disabled={busy} onClick={() => setFeature(key, (val as boolean | undefined) ?? null)}
                            className={`px-2.5 h-7 capitalize transition ${activeSel ? 'bg-accent/15 text-accentstrong font-medium' : 'text-muted hover:bg-surface2'}`}>{lab}</button>;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'domain' && (
        <div className="card p-5 max-w-2xl">
          <p className="text-sm font-semibold text-content mb-1">Custom domain</p>
          <p className="text-2xs text-muted mb-3">Serve this tenant on its own domain. Their logo, colors and name load automatically once the domain is verified.</p>
          <div className="flex items-center gap-2">
            <input className="input flex-1" value={domInput} onChange={(e) => setDomInput(e.target.value)} placeholder="pm.acme.com" disabled={domBusy} />
            <button className="btn btn-primary shrink-0" disabled={domBusy} onClick={saveDomain}>{domBusy ? '…' : 'Save'}</button>
            {dom?.custom_domain && <button className="btn shrink-0" disabled={domBusy} onClick={removeDomain}>Remove</button>}
          </div>
          {dom?.custom_domain && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium ${dom.verified ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>{dom.verified ? 'Verified' : 'Pending verification'}</span>
                {!dom.verified && <button className="btn-ghost text-2xs" disabled={domBusy} onClick={verifyDomain}><Icon name="ti-refresh" />{domBusy ? 'Checking…' : 'Verify domain'}</button>}
              </div>
              {domMsg && <p className="text-2xs text-muted">{domMsg}</p>}
              {!dom.verified && (
                <div className="rounded-md bg-surface2 p-2.5 text-2xs text-muted space-y-1.5">
                  <p className="font-medium text-content">Add these DNS records, then add the domain to the Vercel project:</p>
                  <p>1. <span className="font-mono text-content">CNAME</span> <span className="font-mono text-content">{dom.custom_domain}</span> → <span className="font-mono">cname.vercel-dns.com</span></p>
                  <p>2. <span className="font-mono text-content">TXT</span> <span className="font-mono text-content">_snr-verify.{dom.custom_domain}</span> → <span className="font-mono break-all text-content">{dom.token}</span></p>
                  <p className="text-muted2">Add the records, then click “Verify domain” — we check the TXT automatically. (Also add the domain to the Vercel project.)</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'danger' && (
        <div className="card border-rose-200 bg-rose-50/40 p-5 max-w-2xl">
          <p className="text-2xs uppercase tracking-wide text-rose-600 font-semibold mb-1">Danger zone — wipe data</p>
          <p className="text-2xs text-muted mb-3">Permanently clears all business data (projects, tasks, CRM, HR, finance, drives…). Keeps the org, members, plan, branding and roles. A restorable snapshot is taken automatically first.</p>
          {snaps.length > 0 && (
            <div className="mb-3 space-y-1">
              <p className="text-2xs uppercase tracking-wide text-muted2">Restorable snapshots</p>
              {snaps.map((s2) => (
                <div key={s2.id} className="flex items-center gap-2 text-2xs">
                  <Icon name="ti-database-export" className="text-muted2 shrink-0" />
                  <span className="flex-1 text-muted truncate">{new Date(s2.created_at).toLocaleString()} · {s2.row_count} rows</span>
                  <button className="btn btn-ghost h-7 py-0 border border-line shrink-0" disabled={busy || wiping} onClick={() => doRestore(s2.id)}>Restore</button>
                </div>
              ))}
            </div>
          )}
          <label className="text-2xs text-muted">Type <span className="font-mono font-semibold text-content">{tenant.org_name}</span> to confirm</label>
          <input className="input mt-1 max-w-sm" value={wipeName} onChange={(e) => setWipeName(e.target.value)} placeholder={tenant.org_name} />
          <div className="mt-2"><button className="btn btn-danger" disabled={wiping || busy || wipeName.trim() !== tenant.org_name} onClick={doWipe}>
            <Icon name="ti-trash-x" />{wiping ? 'Backing up & wiping…' : 'Back up & wipe tenant data'}
          </button></div>
        </div>
      )}
    </Layout>
  );
}

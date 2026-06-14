import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Tabs } from '@/components/ui';
import { updateOrgSettings, getOrgPlanInfo, listPlans, startCheckout, openBillingPortal, getNotificationPrefs, saveNotificationPrefs, getMyNotifSettings, NotifSetting } from '@/lib/db';
import { applyBranding } from '@/lib/branding';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';
import { FEATURE_LABELS, formatPrice } from '@/lib/entitlements';
import { OrgPlanInfo, FeatureKey, Plan } from '@/lib/supabase';

function PlanPanel({ org }: { org: { id: string; features?: string[] } }) {
  const [info, setInfo] = useState<OrgPlanInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState('');
  const [billErr, setBillErr] = useState('');
  useEffect(() => { getOrgPlanInfo(org.id).then(setInfo).catch(() => {}); listPlans().then(setPlans).catch(() => {}); }, [org.id]);
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
      {/* Billing actions */}
      <div className="mt-6 pt-6 border-t border-line">
        <p className="text-2xs uppercase tracking-wide text-muted mb-3 font-medium">Billing</p>
        {billErr && <p className="text-sm text-rose-600 mb-3">{billErr}</p>}
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
        <p className="text-2xs text-muted mt-3">Upgrades open secure Stripe Checkout. Manage billing opens the Stripe customer portal to change or cancel your plan. Seat counts sync automatically.</p>
      </div>
    </div>
  );
}

const DEFAULTS = { primary: '#3ECF8E', accent: '#6FD3D9' };

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded-md border border-line bg-white p-1 cursor-pointer shrink-0" />
        <input className="input font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

function NotificationPrefs() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<NotifSetting[] | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = () => {
    if (!org || !me) return;
    Promise.all([getMyNotifSettings(org.id), getNotificationPrefs(me.id)])
      .then(([s, p]) => { setRows(s); setPrefs(p); })
      .catch(() => setRows([]));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id, me?.id]);

  const toggle = async (row: NotifSetting) => {
    if (row.locked || !me || !org) return;
    const next = { ...prefs, [row.key]: !row.enabled };
    setPrefs(next); setSaving(true); setSaved(false);
    try { await saveNotificationPrefs(me.id, next); setRows(await getMyNotifSettings(org.id)); setSaved(true); }
    catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="card p-6 max-w-4xl mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="ti-bell-cog" className="text-muted" />
        <p className="text-sm font-semibold">Notifications</p>
        {saving && <span className="text-2xs text-muted ml-2">Saving…</span>}
        {saved && !saving && <span className="text-2xs text-emerald-600 ml-2">Saved</span>}
      </div>
      <p className="text-2xs text-muted mb-4">Choose which notifications you receive. Required ones are set by your admin and can’t be turned off.</p>
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <p className="text-2xs text-muted2">No notification types available.</p>
      ) : (
        <div className="divide-y divide-line">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm text-content font-medium">{row.label}</span>
                  <span className="pill pill-gray text-2xs">{row.category}</span>
                  {row.locked && <span className="pill pill-amber text-2xs">Required</span>}
                </span>
                <span className="block text-2xs text-muted">{row.description}</span>
              </span>
              <button type="button" role="switch" aria-checked={row.enabled} onClick={() => toggle(row)} disabled={row.locked || saving}
                title={row.locked ? 'Required by your admin' : undefined}
                className={`relative h-5 w-9 rounded-full transition shrink-0 disabled:opacity-60 ${row.enabled ? 'bg-accent' : 'bg-surface2 border border-line'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${row.enabled ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const org = useActiveOrg();
  const patchOrg = useAuthStore((s) => s.patchOrg);
  const admin = can.manageOrg(org);
  const [tab, setTab] = useState<'notifications' | 'billing' | 'branding'>('notifications');

  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [primary, setPrimary] = useState(DEFAULTS.primary);
  const [accent, setAccent] = useState(DEFAULTS.accent);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!org) return;
    const b = org.branding || {};
    setName(org.name || '');
    setLogo(b.logo_url || '');
    setPrimary(b.primary_color || DEFAULTS.primary);
    setAccent(b.accent_color || DEFAULTS.accent);
  }, [org?.id]);

  if (!org) return <Layout flat title="Settings"><Spinner /></Layout>;

  const save = async () => {
    setSaving(true); setMsg('');
    const branding = {
      ...(org.branding || {}),
      logo_url: logo.trim() || undefined,
      primary_color: primary,
      accent_color: accent,
    };
    try {
      const updated = await updateOrgSettings(org.id, { name: name.trim() || org.name, branding });
      patchOrg({ id: org.id, name: updated.name, branding: updated.branding });
      applyBranding(updated);
      setMsg('Saved');
    } catch (e: any) { setMsg(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const reset = () => { setPrimary(DEFAULTS.primary); setAccent(DEFAULTS.accent); };

  return (
    <Layout flat title="Settings">
      <PageHeader title="Settings" subtitle="Your preferences, subscription, and white-label settings" />
      {admin && (
        <Tabs tabs={[
          { key: 'notifications', label: 'Notifications', icon: 'ti-bell' },
          { key: 'billing', label: 'Plan & billing', icon: 'ti-credit-card' },
          { key: 'branding', label: 'Branding', icon: 'ti-palette' },
        ]} active={tab} onChange={(k) => setTab(k as 'notifications' | 'billing' | 'branding')} />
      )}
      {(!admin || tab === 'notifications') && <NotificationPrefs />}
      {admin && tab === 'billing' && <PlanPanel org={org} />}
      {admin && tab === 'branding' && <div className="grid lg:grid-cols-3 gap-6 max-w-4xl">
        {/* Form */}
        <div className="lg:col-span-2 card p-6 space-y-5">
          <div>
            <label className="label">Workspace name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." />
          </div>
          <div>
            <label className="label">Logo URL</label>
            <input className="input" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…/logo.png" />
            <p className="text-2xs text-muted mt-2">Square image works best. Leave blank to use the name initial.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <ColorField label="Primary" value={primary} onChange={setPrimary} />
            <ColorField label="Accent" value={accent} onChange={setAccent} />
          </div>
          <p className="text-2xs text-muted">Primary recolours buttons, links, focus rings and the active nav item. Accent is used for secondary highlights.</p>
          <div className="pt-2">
            <label className="label">Workspace subdomain</label>
            <div className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-line bg-surface2 text-sm text-muted">
              <Icon name="ti-world" /><span className="font-mono text-content">{org.slug}</span><span className="text-muted">.yourdomain.com</span>
            </div>
            <p className="text-2xs text-muted mt-2">Maps to your white-label URL once a custom domain is connected. Contact an owner to change.</p>
          </div>
          <div className="flex items-center gap-3 pt-4 border-t border-line">
            <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : 'Save changes'}</button>
            <button onClick={reset} disabled={saving} className="btn btn-ghost">Reset colors</button>
            {msg && <span className={`text-sm ml-auto ${msg === 'Saved' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span>}
          </div>
        </div>

        {/* Live preview */}
        <div className="card p-6">
          <p className="text-2xs uppercase tracking-wide text-muted mb-4 font-medium">Preview</p>
          <div className="rounded-lg overflow-hidden border border-line">
            <div className="flex h-40">
              <div className="w-28 shrink-0 p-2 bg-surface border-r border-line">
                <div className="flex items-center gap-2 mb-3">
                  {logo
                    ? <img src={logo} alt="" className="w-6 h-6 rounded object-cover" />
                    : <span className="w-6 h-6 rounded grid place-items-center text-2xs font-semibold text-[#fff]" style={{ background: primary }}>{(name || 'A').charAt(0).toUpperCase()}</span>}
                  <span className="text-xs font-semibold truncate">{name || 'Workspace'}</span>
                </div>
                <div className="space-y-1">
                  {/* active nav item — primary-tinted, primary left bar */}
                  <div className="flex items-center gap-1.5 rounded px-1.5 py-1" style={{ background: primary + '22', boxShadow: `inset 2px 0 0 ${primary}` }}>
                    <span className="w-2 h-2 rounded-sm" style={{ background: primary }} />
                    <span className="h-1.5 flex-1 rounded-full" style={{ background: primary, opacity: 0.6 }} />
                  </div>
                  <div className="flex items-center gap-1.5 px-1.5 py-1">
                    <span className="w-2 h-2 rounded-sm bg-neutral-300" />
                    <span className="h-1.5 w-3/4 rounded-full bg-neutral-200" />
                  </div>
                  <div className="flex items-center gap-1.5 px-1.5 py-1">
                    <span className="w-2 h-2 rounded-sm bg-neutral-300" />
                    <span className="h-1.5 w-2/3 rounded-full bg-neutral-200" />
                  </div>
                </div>
              </div>
              <div className="flex-1 bg-paper p-2.5">
                <div className="h-6 w-24 rounded-md mb-2 grid place-items-center text-2xs font-medium text-[#fff]" style={{ background: primary }}>Button</div>
                <div className="flex gap-1.5 mb-2">
                  <span className="h-4 w-10 rounded-full" style={{ background: accent }} />
                  <span className="h-4 w-8 rounded-full" style={{ background: primary + '22' }} />
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded bg-neutral-200" />
                  <div className="h-1.5 w-5/6 rounded" style={{ background: primary, opacity: 0.5 }} />
                </div>
              </div>
            </div>
          </div>
          <p className="text-2xs text-neutral-400 mt-3">Live white-label preview — primary drives buttons, links and the active nav item.</p>
        </div>
      </div>}
    </Layout>
  );
}

import { titleCase } from '@/lib/format';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Tabs } from '@/components/ui';
import { updateOrgSettings, setOrgTheme, getOrgPlanInfo, listPlans, listPlanFeatures, startCheckout, openBillingPortal, getNotificationPrefs, saveNotificationPrefs, getMyNotifSettings, NotifSetting, tenantSnapshot, wipeTenantData, listTenantSnapshots, restoreTenantSnapshot, TenantSnapshot } from '@/lib/db';
import { applyBranding } from '@/lib/branding';
import ProfileSettings from '@/components/ProfileSettings';
import { SKINS, SkinMeta, applySkin, normalizeSkin, Skin } from '@/lib/skin';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';
import { FEATURE_LABELS, formatPrice } from '@/lib/entitlements';
import { OrgPlanInfo, FeatureKey, Plan, PlanFeature } from '@/lib/supabase';

function SkinThumb({ sk }: { sk: SkinMeta }) {
  const { bg, sf, bd, tx, mu, ac } = sk.c; const r = Math.min(sk.r, 6);
  const line = (w: string, c: string) => <span style={{ display: 'block', height: 5, borderRadius: 3, width: w, background: c }} />;
  const body = (
    <div style={{ flex: 1, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ height: 11, width: 34, borderRadius: r, background: ac }} />
      {line('100%', bd)}{line('82%', bd)}{line('64%', bd)}
    </div>
  );
  if (sk.nav === 'top') {
    return (
      <div style={{ height: 78, borderRadius: 8, overflow: 'hidden', border: `1px solid ${bd}`, background: bg }}>
        <div style={{ height: 17, background: sf, borderBottom: `1px solid ${bd}`, display: 'flex', alignItems: 'center', gap: 5, padding: '0 6px' }}>
          <span style={{ height: 5, width: 18, borderRadius: 3, background: ac }} />
          <span style={{ height: 5, width: 14, borderRadius: 3, background: mu }} />
          <span style={{ height: 5, width: 14, borderRadius: 3, background: mu }} />
        </div>
        {body}
      </div>
    );
  }
  return (
    <div style={{ height: 78, borderRadius: 8, overflow: 'hidden', border: `1px solid ${bd}`, background: bg, display: 'flex' }}>
      <div style={{ width: '30%', background: sf, borderRight: `1px solid ${bd}`, padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ height: 6, borderRadius: 3, width: '100%', background: ac }} />
        <span style={{ height: 5, borderRadius: 3, width: '80%', background: mu }} />
        <span style={{ height: 5, borderRadius: 3, width: '80%', background: mu }} />
        <span style={{ height: 5, borderRadius: 3, width: '58%', background: mu }} />
      </div>
      {body}
    </div>
  );
}

function PlanPanel({ org, canBill }: { org: { id: string; features?: string[] }; canBill: boolean }) {
  const [info, setInfo] = useState<OrgPlanInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pf, setPf] = useState<PlanFeature[]>([]);
  const [busy, setBusy] = useState('');
  const [billErr, setBillErr] = useState('');
  useEffect(() => { getOrgPlanInfo(org.id).then(setInfo).catch(() => {}); listPlans().then(setPlans).catch(() => {}); listPlanFeatures().then(setPf).catch(() => {}); }, [org.id]);
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

      {/* Billing actions */}
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
          <p className="text-2xs text-muted mt-3">Upgrades open secure Stripe Checkout — you review and confirm the charge there before paying. Manage billing opens the Stripe customer portal to change or cancel. Seat counts sync automatically.</p>
        </>) : (
          <p className="text-sm text-muted">Only the workspace owner can change the plan or manage billing. Ask an owner to upgrade.</p>
        )}
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
        <div className="space-y-6">
          {Object.entries(rows.reduce((acc, r) => { const k = r.category || 'General'; (acc[k] = acc[k] || []).push(r); return acc; }, {} as Record<string, NotifSetting[]>)).map(([cat, items]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted2">{titleCase(cat)}</span>
                <span className="h-px flex-1 bg-line" />
                <span className="text-2xs text-muted2">{items.filter((i) => !i.locked).length} optional · {items.filter((i) => i.locked).length} required</span>
              </div>
              <div className="divide-y divide-line">
                {[...items].sort((a, b) => Number(a.locked) - Number(b.locked)).map((row) => (
                  <div key={row.key} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm text-content font-medium">{row.label}</span>
                        {row.locked
                          ? <span className="pill pill-amber text-2xs">Required</span>
                          : <span className="pill pill-gray text-2xs">Optional</span>}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteSafetyToggle({ org }: { org: { id: string; branding?: Record<string, any> } }) {
  const patchOrg = useAuthStore((s) => s.patchOrg);
  const [on, setOn] = useState((org.branding as any)?.require_delete_confirm !== false);
  const [saving, setSaving] = useState(false);
  const toggle = async () => {
    const next = !on; setOn(next); setSaving(true);
    try {
      const branding = { ...(org.branding || {}), require_delete_confirm: next };
      const updated = await updateOrgSettings(org.id, { branding });
      patchOrg({ id: org.id, branding: updated.branding });
    } catch { setOn(!next); } finally { setSaving(false); }
  };
  return (
    <div className="card p-6 max-w-4xl mb-6">
      <div className="flex items-center gap-3">
        <Icon name="ti-shield-check" className="text-muted shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Require typing DELETE for core records</p>
          <p className="text-2xs text-muted">When on, deleting parent records (projects, companies, clients, invoices…) asks for a typed confirmation. Everything still goes to Trash either way.</p>
        </div>
        <button role="switch" aria-checked={on} onClick={toggle} disabled={saving}
          className={`relative h-5 w-9 rounded-full transition shrink-0 ${on ? 'bg-accent' : 'bg-surface2 border border-line'}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>
    </div>
  );
}

function WipeWorkspace({ org }: { org: { id: string; name: string } }) {
  const [snaps, setSnaps] = useState<TenantSnapshot[]>([]);
  const [name, setName] = useState(''); const [wiping, setWiping] = useState(false); const [msg, setMsg] = useState('');
  const refresh = () => listTenantSnapshots(org.id).then(setSnaps).catch(() => {});
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [org.id]);
  const wipe = async () => {
    if (name.trim() !== org.name) return;
    setWiping(true); setMsg('');
    try { await tenantSnapshot(org.id, 'Pre-wipe backup'); await wipeTenantData(org.id); setName(''); refresh(); setMsg('Workspace data wiped. A restorable snapshot was saved below.'); }
    catch (e: any) { setMsg(e.message || 'Wipe failed'); } finally { setWiping(false); }
  };
  const restore = async (id: string) => {
    if (!confirm('Restore this snapshot? It re-inserts the backed-up records.')) return;
    setWiping(true); setMsg('');
    try { await restoreTenantSnapshot(id); setMsg('Snapshot restored.'); }
    catch (e: any) { setMsg(e.message); } finally { setWiping(false); }
  };
  return (
    <div className="card p-6 max-w-4xl mb-6 border border-rose-200">
      <div className="flex items-center gap-2 mb-1"><Icon name="ti-alert-triangle" className="text-rose-600" /><p className="text-sm font-semibold">Wipe workspace data</p></div>
      <p className="text-2xs text-muted mb-3">Permanently clears all business data (projects, tasks, CRM, HR, finance, drives…). Keeps your organization, members, plan, branding and roles. A restorable snapshot is taken automatically first.</p>
      {snaps.length > 0 && (
        <div className="mb-3 space-y-1">
          {snaps.map((sn) => (
            <div key={sn.id} className="flex items-center gap-2 text-2xs">
              <Icon name="ti-database-export" className="text-muted2 shrink-0" />
              <span className="flex-1 text-muted truncate">{new Date(sn.created_at).toLocaleString()} · {sn.row_count} rows</span>
              <button className="btn btn-ghost h-7 py-0 border border-line shrink-0" disabled={wiping} onClick={() => restore(sn.id)}>Restore</button>
            </div>
          ))}
        </div>
      )}
      <label className="text-2xs text-muted">Type <span className="font-mono font-semibold text-content">{org.name}</span> to confirm</label>
      <input className="input mt-1 max-w-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder={org.name} />
      <div className="mt-2 flex items-center gap-3">
        <button className="btn btn-danger" disabled={wiping || name.trim() !== org.name} onClick={wipe}><Icon name="ti-trash-x" />{wiping ? 'Backing up & wiping…' : 'Back up & wipe data'}</button>
        {msg && <span className="text-2xs text-muted">{msg}</span>}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const org = useActiveOrg();
  const patchOrg = useAuthStore((s) => s.patchOrg);
  const admin = can.manageOrg(org);
  const isOwner = org?.member_role === 'owner';
  const [tab, setTab] = useState<'notifications' | 'billing' | 'branding' | 'danger'>('notifications');
  const router = useRouter();
  useEffect(() => { const q = router.query.tab; if (typeof q === 'string' && ['notifications', 'billing', 'branding', 'danger'].includes(q)) setTab(q as 'notifications' | 'billing' | 'branding' | 'danger'); }, [router.query.tab]);

  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [primary, setPrimary] = useState(DEFAULTS.primary);
  const [accent, setAccent] = useState(DEFAULTS.accent);
  const [skin, setSkin] = useState<Skin>('classic');
  const [skinMsg, setSkinMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!org) return;
    const b = org.branding || {};
    setName(org.name || '');
    setLogo(b.logo_url || '');
    setPrimary(b.primary_color || DEFAULTS.primary);
    setAccent(b.accent_color || DEFAULTS.accent);
    setSkin(normalizeSkin(org.theme_skin));
  }, [org?.id]);

  // Theme is saved on click via its own ungated path (not the white-label branding Save).
  const pickSkin = async (k: Skin) => {
    if (!org) return;
    const prev = skin;
    setSkin(k); applySkin(k); setSkinMsg('');
    try {
      await setOrgTheme(org.id, k);
      patchOrg({ id: org.id, theme_skin: k });
      setSkinMsg('Theme saved'); setTimeout(() => setSkinMsg(''), 2000);
    } catch (e: any) {
      setSkin(prev); applySkin(prev); setSkinMsg(e.message || 'Could not save theme');
    }
  };

  if (!org) return <Layout flat title="Settings"><Spinner /></Layout>;

  const save = async () => {
    setSaving(true); setMsg('');
    const branding = {
      ...(org.branding || {}),
      logo_url: logo.trim() || undefined,
      // Treat the stock defaults as "no custom brand" so the chosen skin's accent
      // shows; a genuinely customised colour still persists and overrides the skin.
      primary_color: primary && primary.toLowerCase() !== DEFAULTS.primary.toLowerCase() ? primary : undefined,
      accent_color: accent && accent.toLowerCase() !== DEFAULTS.accent.toLowerCase() ? accent : undefined,
      skin,
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
      <ProfileSettings />
      {admin && (
        <Tabs tabs={[
          { key: 'notifications', label: 'Notifications', icon: 'ti-bell' },
          { key: 'billing', label: 'Plan & billing', icon: 'ti-credit-card' },
          { key: 'branding', label: 'Branding', icon: 'ti-palette' },
          ...(isOwner ? [{ key: 'danger', label: 'Danger zone', icon: 'ti-alert-triangle' }] : []),
        ]} active={tab} onChange={(k) => setTab(k as 'notifications' | 'billing' | 'branding' | 'danger')} />
      )}
      {(!admin || tab === 'notifications') && <NotificationPrefs />}
      {admin && tab === 'billing' && <PlanPanel org={org} canBill={isOwner} />}
      {isOwner && tab === 'danger' && <WipeWorkspace org={org} />}
      {admin && tab === 'branding' && <DeleteSafetyToggle org={org} />}
      {admin && tab === 'branding' && (
        <div className="card p-6 mb-6 max-w-4xl">
          <p className="text-2xs uppercase tracking-wide text-muted mb-1 font-medium">Workspace theme</p>
          <p className="text-sm text-muted mb-4">Sets the layout, palette and density for everyone in this workspace. Light vs dark stays a personal choice per user.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SKINS.map((sk) => (
              <button key={sk.key} type="button" onClick={() => pickSkin(sk.key)}
                className={`text-left rounded-lg border p-3 transition ${skin === sk.key ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-borderstrong'}`}>
                <div className="mb-2"><SkinThumb sk={sk} /></div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-4 h-4 rounded" style={{ background: sk.swatch }} />
                  <span className="text-sm font-medium">{sk.label}</span>
                  {skin === sk.key && <Icon name="ti-check" className="ml-auto text-accentstrong text-sm" />}
                </div>
                <p className="text-2xs text-muted">{sk.blurb}</p>
              </button>
            ))}
          </div>
          <p className="text-2xs text-muted mt-3">Saved instantly for the whole workspace. Light vs dark stays a personal choice.{skinMsg && <span className="ml-2 text-emerald-600 font-medium">{skinMsg}</span>}</p>
        </div>
      )}
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

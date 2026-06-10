import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { updateOrgSettings, getOrgPlanInfo } from '@/lib/db';
import { applyBranding } from '@/lib/branding';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';
import { FEATURE_LABELS, formatPrice } from '@/lib/entitlements';
import { OrgPlanInfo, FeatureKey } from '@/lib/supabase';

function PlanPanel({ org }: { org: { id: string; features?: string[] } }) {
  const [info, setInfo] = useState<OrgPlanInfo | null>(null);
  useEffect(() => { getOrgPlanInfo(org.id).then(setInfo).catch(() => {}); }, [org.id]);
  const features = org.features || [];
  const seatLabel = info?.seat_limit == null ? 'Unlimited' : `${info.seat_count} / ${info.seat_limit}`;
  const overSeats = info?.seat_limit != null && info.seat_count >= info.seat_limit;
  return (
    <div className="card p-5 max-w-4xl mb-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-1">Current plan</p>
          <p className="text-lg font-semibold">{info?.plan?.name || '—'}
            {info?.status && info.status !== 'active' && <span className="ml-2 text-xs text-amber-600 capitalize">({info.status})</span>}
          </p>
          {info?.plan && <p className="text-sm text-neutral-500">{formatPrice(info.plan.price_cents, info.plan.pricing_model)}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-1">Seats used</p>
          <p className={`text-lg font-semibold ${overSeats ? 'text-rose-600' : ''}`}>{seatLabel}</p>
          {overSeats && <p className="text-2xs text-rose-600">Seat limit reached</p>}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Included features</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((k) => {
            const on = features.includes(k);
            return (
              <span key={k} className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${on ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-line bg-paper text-neutral-400'}`}>
                <Icon name={on ? 'ti-check' : 'ti-minus'} className="text-2xs" />{FEATURE_LABELS[k]}
              </span>
            );
          })}
        </div>
      </div>
      <p className="text-2xs text-neutral-400 mt-3">Plan changes are managed by the platform team. Contact us to upgrade or add seats.</p>
    </div>
  );
}

const DEFAULTS = { primary: '#2D7FF9', accent: '#6FD3D9', ink: '#0E2233' };

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

export default function SettingsPage() {
  const org = useActiveOrg();
  const patchOrg = useAuthStore((s) => s.patchOrg);
  const admin = can.manageOrg(org);

  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [primary, setPrimary] = useState(DEFAULTS.primary);
  const [accent, setAccent] = useState(DEFAULTS.accent);
  const [ink, setInk] = useState(DEFAULTS.ink);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!org) return;
    const b = org.branding || {};
    setName(org.name || '');
    setLogo(b.logo_url || '');
    setPrimary(b.primary_color || DEFAULTS.primary);
    setAccent(b.accent_color || DEFAULTS.accent);
    setInk(b.ink_color || DEFAULTS.ink);
  }, [org?.id]);

  if (!org) return <Layout title="Settings"><Spinner /></Layout>;
  if (!admin) return <Layout title="Settings"><EmptyState icon="ti-lock" text="Only org admins can edit branding" /></Layout>;

  const save = async () => {
    setSaving(true); setMsg('');
    const branding = {
      ...(org.branding || {}),
      logo_url: logo.trim() || undefined,
      primary_color: primary,
      accent_color: accent,
      ink_color: ink,
    };
    try {
      const updated = await updateOrgSettings(org.id, { name: name.trim() || org.name, branding });
      patchOrg({ id: org.id, name: updated.name, branding: updated.branding });
      applyBranding(updated);
      setMsg('Saved');
    } catch (e: any) { setMsg(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const reset = () => { setPrimary(DEFAULTS.primary); setAccent(DEFAULTS.accent); setInk(DEFAULTS.ink); };

  return (
    <Layout title="Settings">
      <PageHeader title="Plan & branding" subtitle="Your subscription, entitlements, and white-label settings" />
      <PlanPanel org={org} />
      <div className="grid lg:grid-cols-3 gap-6 max-w-4xl">
        {/* Form */}
        <div className="lg:col-span-2 card p-5 space-y-4">
          <div>
            <label className="label">Workspace name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." />
          </div>
          <div>
            <label className="label">Logo URL</label>
            <input className="input" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…/logo.png" />
            <p className="text-2xs text-neutral-400 mt-1">Square image works best. Leave blank to use the name initial.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <ColorField label="Primary" value={primary} onChange={setPrimary} />
            <ColorField label="Accent" value={accent} onChange={setAccent} />
            <ColorField label="Sidebar" value={ink} onChange={setInk} />
          </div>
          <div>
            <label className="label">Workspace subdomain</label>
            <div className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-line bg-paper text-sm text-neutral-500">
              <Icon name="ti-world" /><span className="font-mono text-ink">{org.slug}</span><span className="text-neutral-400">.yourdomain.com</span>
            </div>
            <p className="text-2xs text-neutral-400 mt-1">Maps to your white-label URL once a custom domain is connected. Contact an owner to change the slug.</p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : 'Save changes'}</button>
            <button onClick={reset} disabled={saving} className="btn">Reset colors</button>
            {msg && <span className={`text-sm ${msg === 'Saved' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span>}
          </div>
        </div>

        {/* Live preview */}
        <div className="card p-5">
          <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-3">Preview</p>
          <div className="rounded-lg overflow-hidden border border-line">
            <div className="flex h-40">
              <div className="w-28 shrink-0 p-2.5 text-white" style={{ background: ink }}>
                <div className="flex items-center gap-2 mb-3">
                  {logo
                    ? <img src={logo} alt="" className="w-6 h-6 rounded object-cover" />
                    : <span className="w-6 h-6 rounded grid place-items-center text-2xs font-semibold" style={{ background: primary }}>{(name || 'A').charAt(0).toUpperCase()}</span>}
                  <span className="text-xs font-semibold truncate">{name || 'Workspace'}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-1.5 rounded-full" style={{ background: primary, width: '80%' }} />
                  <div className="h-1.5 rounded-full bg-white/20" style={{ width: '60%' }} />
                  <div className="h-1.5 rounded-full bg-white/20" style={{ width: '70%' }} />
                </div>
              </div>
              <div className="flex-1 bg-paper p-2.5">
                <div className="h-5 w-20 rounded-md mb-2" style={{ background: primary }} />
                <div className="flex gap-1.5 mb-2">
                  <span className="h-4 w-10 rounded-full" style={{ background: accent }} />
                  <span className="h-4 w-8 rounded-full bg-neutral-200" />
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded bg-neutral-200" />
                  <div className="h-1.5 w-5/6 rounded bg-neutral-200" />
                </div>
              </div>
            </div>
          </div>
          <p className="text-2xs text-neutral-400 mt-3">Primary = buttons &amp; links. Accent = highlights. Sidebar = navigation.</p>
        </div>
      </div>
    </Layout>
  );
}

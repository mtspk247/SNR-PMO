import { titleCase } from '@/lib/format';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Tabs } from '@/components/ui';
import { updateOrgSettings, setOrgTheme, setOrgAllowUserThemes, getNotificationPrefs, saveNotificationPrefs, getMyNotifSettings, NotifSetting, tenantSnapshot, wipeTenantData, listTenantSnapshots, restoreTenantSnapshot, TenantSnapshot } from '@/lib/db';
import { getOrgProfile, saveOrgProfile } from '@/lib/db';
import { applyBranding } from '@/lib/branding';
import ProfileSettings from '@/components/ProfileSettings';
import OrgProfileForm from '@/components/OrgProfileForm';
import DemoDataCard from '@/components/DemoDataCard';
import ListsManager from '@/components/ListsManager';
import BusinessSetup from '@/components/BusinessSetup';
import { PRESET_AVATARS, presetColor } from '@/lib/avatars';
import NotifPolicyPanel from '@/components/NotifPolicyPanel';
import AuditLog from '@/components/AuditLog';
import { SKINS, SkinMeta, applySkin, normalizeSkin, Skin, getUserSkin, setUserSkin } from '@/lib/skin';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

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
      <p className="text-2xs text-muted mb-4">Choose which notifications you receive. Required ones are set by your admin and can't be turned off.</p>
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
      <label className="block text-2xs text-muted mb-1">Type <span className="font-mono font-semibold text-content">{org.name}</span> to confirm</label>
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
  const meUser = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'business' | 'branding' | 'themes' | 'workspace' | 'notifications' | 'lists' | 'audit' | 'danger' | 'demo'>('business');
  const router = useRouter();
  useEffect(() => { const q = router.query.tab; if (typeof q === 'string') { const t = q === 'profile' ? 'business' : q; if (['business', 'branding', 'themes', 'workspace', 'notifications', 'lists', 'audit', 'danger', 'demo'].includes(t)) setTab(t as any); } }, [router.query.tab]);

  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [brandName, setBrandName] = useState('');
  const [logoPicker, setLogoPicker] = useState(false);
  const [logoErr, setLogoErr] = useState('');
  const [primary, setPrimary] = useState(DEFAULTS.primary);
  const [accent, setAccent] = useState(DEFAULTS.accent);
  const [skin, setSkin] = useState<Skin>('classic');
  const [skinMsg, setSkinMsg] = useState('');
  const [uSkin, setUSkin] = useState<Skin | ''>('');
  const [allowUserThemes, setAllowUserThemes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!org) return;
    const b = org.branding || {};
    setName(org.name || '');
    setLogo(b.logo_url || '');
    setBrandName((b as { name?: string }).name || '');
    setPrimary(b.primary_color || DEFAULTS.primary);
    setAccent(b.accent_color || DEFAULTS.accent);
    setSkin(normalizeSkin(org.theme_skin));
    setUSkin(getUserSkin());
    setAllowUserThemes(!!org.allow_user_themes);
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

  // Personal theme (per user, only when the tenant allows it). Light/dark stays the
  // existing per-user toggle in the top bar; this is the skin override.
  const pickUserSkin = (k: Skin | '') => {
    if (!org) return;
    setUSkin(k); setUserSkin(k);
    applySkin(k || normalizeSkin(org.theme_skin));
  };
  const toggleAllowUserThemes = async () => {
    if (!org) return;
    const next = !allowUserThemes; setAllowUserThemes(next);
    try { await setOrgAllowUserThemes(org.id, next); patchOrg({ id: org.id, allow_user_themes: next }); }
    catch { setAllowUserThemes(!next); }
  };

  if (!org) return <Layout flat title="Settings"><Spinner /></Layout>;

  const save = async () => {
    setSaving(true); setMsg('');
    const branding = {
      ...(org.branding || {}),
      logo_url: logo.trim() || undefined,
      name: brandName.trim() || undefined,
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

  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setLogoErr('');
    if (!/^image\//.test(f.type)) { setLogoErr('Please choose an image file.'); return; }
    if (f.size > 1.5 * 1024 * 1024) { setLogoErr('Image is too large (max 1.5 MB).'); return; }
    const r = new FileReader();
    r.onload = () => setLogo(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => setLogoErr('Could not read that file.');
    r.readAsDataURL(f);
  };


  return (
    <Layout flat title="Settings">
      <PageHeader help="business-profile" title="Settings" subtitle="Your preferences, subscription, and white-label settings" />
      {!admin && <ProfileSettings />}
      {org.allow_user_themes && (
        <div className="card p-6 mb-6 max-w-4xl">
          <p className="text-2xs uppercase tracking-wide text-muted mb-1 font-medium">Your theme</p>
          <p className="text-sm text-muted mb-4">This workspace lets you choose your own theme. Pick one, or follow the workspace default. Light vs dark is always your choice (toggle in the top bar).</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button type="button" onClick={() => pickUserSkin('')}
              className={`text-left rounded-lg border p-3 transition ${uSkin === '' ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-borderstrong'}`}>
              <div className="mb-2"><div className="h-16 rounded-md border border-line bg-surface2 flex items-center justify-center"><Icon name="ti-building" className="text-muted text-xl" /></div></div>
              <div className="flex items-center gap-2 mb-1.5"><span className="text-sm font-medium">Follow workspace</span>{uSkin === '' && <Icon name="ti-check" className="ml-auto text-accentstrong text-sm" />}</div>
              <p className="text-2xs text-muted">Use the workspace default theme</p>
            </button>
            {SKINS.map((sk) => (
              <button key={sk.key} type="button" onClick={() => pickUserSkin(sk.key)}
                className={`text-left rounded-lg border p-3 transition ${uSkin === sk.key ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-borderstrong'}`}>
                <div className="mb-2"><SkinThumb sk={sk} /></div>
                <div className="flex items-center gap-2 mb-1.5"><span className="w-4 h-4 rounded" style={{ background: sk.swatch }} /><span className="text-sm font-medium">{sk.label}</span>{uSkin === sk.key && <Icon name="ti-check" className="ml-auto text-accentstrong text-sm" />}</div>
                <p className="text-2xs text-muted">{sk.blurb}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      {admin && (
        <Tabs tabs={[
          { key: 'business', label: 'Profile', icon: 'ti-id-badge-2' },
          { key: 'branding', label: 'Brand', icon: 'ti-palette' },
          { key: 'themes', label: 'Themes', icon: 'ti-color-swatch' },
          { key: 'notifications', label: 'Notifications', icon: 'ti-bell' },
          { key: 'lists', label: 'Lists & options', icon: 'ti-list-details' },
          { key: 'audit', label: 'Audit log', icon: 'ti-history' },
          ...(isOwner ? [{ key: 'danger', label: 'Danger zone', icon: 'ti-alert-triangle' }] : []),
          ...(admin ? [{ key: 'demo', label: 'Demo data', icon: 'ti-sparkles' }] : []),
        ]} active={tab} onChange={(k) => setTab(k as any)} />
      )}
      {!admin && <NotificationPrefs />}
      {admin && tab === 'notifications' && (
        <div className="space-y-3 max-w-3xl">
          <NotifPolicyPanel orgId={org.id} />
          <p className="text-2xs text-muted">This is the <strong>workspace-wide</strong> notification policy — what members must receive and what they may manage. To change <strong>your own</strong> alerts, open <a href={meUser ? `/users/${meUser.id}` : '/users'} className="text-accentstrong hover:underline">your profile → Notifications</a>.</p>
        </div>
      )}
      {isOwner && tab === 'danger' && <WipeWorkspace org={org} />}

      {admin && tab === 'audit' && org && (
        <div className="max-w-5xl"><AuditLog /></div>
      )}

      {admin && tab === 'lists' && org && (
        <div className="max-w-5xl"><ListsManager /></div>
      )}

      {admin && tab === 'demo' && org && (
        <DemoDataCard orgId={org.id} defaultIndustry={org.onboarding?.industry} />
      )}

      {admin && tab === 'business' && org && (
            <div className="space-y-6">
              <BusinessSetup orgId={org.id} />
              <OrgProfileForm
                load={() => getOrgProfile(org.id)}
                onSave={(patch) => saveOrgProfile(org.id, patch)}
                orgId={org.id}
                leadingTab={{
                  id: 'workspace',
                  label: 'Workspace',
                  icon: 'ti-building-store',
                  render: () => (
                    <div className="space-y-5">
                      <p className="text-2xs text-muted flex items-center gap-1.5"><Icon name="ti-info-circle" className="text-sm" />Your logo, brand name and colours now live in <button type="button" onClick={() => setTab('branding')} className="text-accentstrong hover:underline font-medium">Settings → Brand</button>.</p>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div><label className="label">Workspace name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." /></div>
                        <div><label className="label">Workspace subdomain</label><div className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-line bg-surface2 text-sm text-muted"><Icon name="ti-world" /><span className="font-mono text-content">{org.slug}</span><span className="text-muted">.yourdomain.com</span></div></div>
                      </div>
                      <div className="flex items-center gap-3 pt-4 border-t border-line">
                        <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : 'Save workspace'}</button>
                        {msg && <span className={`text-sm ${msg === 'Saved' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span>}
                      </div>
                    </div>
                  ),
                }}
              />
              <DeleteSafetyToggle org={org} />
            </div>
          )}



      {admin && tab === 'themes' && org && (
            <div className="card p-6">
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
              <label className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-line cursor-pointer">
                <input type="checkbox" checked={allowUserThemes} onChange={toggleAllowUserThemes} className="accent-accent" />
                <span className="text-sm text-content">Allow members to choose their own theme</span>
                <span className="text-2xs text-muted">members can override the workspace theme from their own Settings; light/dark is always personal.</span>
              </label>
            </div>
          )}

      {admin && tab === 'branding' && org && (
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 card p-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label !mb-0">Logo</label>
                    <button type="button" onClick={() => router.push('/dashboard?setup=1')} className="text-2xs text-accentstrong hover:underline font-medium inline-flex items-center gap-1"><Icon name="ti-rocket" className="text-xs" />Re-run setup wizard</button>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-lg border border-line bg-surface2 grid place-items-center overflow-hidden shrink-0">
                      {logo && logo.startsWith('preset:') ? <span className="w-full h-full grid place-items-center text-2xl" style={{ background: presetColor(logo.slice(7)) }}>{logo.slice(7)}</span>
                        : logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <Icon name="ti-photo" className="text-muted2 text-xl" />}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <label className="btn btn-ghost text-xs cursor-pointer border border-line"><Icon name="ti-upload" className="text-sm" /> Upload logo<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={onLogoFile} /></label>
                        <button type="button" onClick={() => setLogoPicker((v) => !v)} className="btn btn-ghost text-xs border border-line"><Icon name="ti-mood-smile" className="text-sm" />Use an avatar</button>
                        {logo && <button type="button" onClick={() => { setLogo(''); setLogoPicker(false); }} className="btn btn-ghost text-xs text-rose-600">Remove</button>}
                      </div>
                      {logoErr && <span className="text-2xs text-rose-600">{logoErr}</span>}
                      <span className="text-2xs text-muted">The single logo used across the app, the login screen and emails.</span>
                    </div>
                  </div>
                  {logoPicker && (
                    <div className="grid grid-cols-8 sm:grid-cols-12 gap-2 p-3 rounded-lg border border-line bg-surface2/40 mt-3">
                      {PRESET_AVATARS.map((e) => (
                        <button key={e} type="button" onClick={() => { setLogo('preset:' + e); setLogoPicker(false); }} style={{ background: presetColor(e) }} className={`w-9 h-9 rounded-lg grid place-items-center text-lg transition hover:scale-110 ${logo === 'preset:' + e ? 'ring-2 ring-offset-2 ring-accent' : ''}`}>{e}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="label">Brand name <span className="text-muted2">(white-label)</span></label>
                  <input className="input" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder={org.name} maxLength={40} />
                  <p className="text-2xs text-muted mt-1">Your product name — shown in the browser tab and the install prompt, and it cascades to your sub-tenants. Leave blank to use the workspace name.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <ColorField label="Primary" value={primary} onChange={setPrimary} />
                  <ColorField label="Accent" value={accent} onChange={setAccent} />
                </div>
                <p className="text-2xs text-muted">Primary recolours buttons, links, focus rings and the active nav item. Accent is used for secondary highlights.</p>
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
            </div>
          )}
    </Layout>
  );
}

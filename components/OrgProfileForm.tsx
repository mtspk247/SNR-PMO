import { useEffect, useState } from 'react';
import { OrgProfile, ORG_PROFILE_KEYS } from '@/lib/supabase';
import { Icon } from '@/components/ui';
import Select from '@/components/Select';
import { INDUSTRIES, categoriesFor, withCurrent } from '@/lib/taxonomy';
import { getOrgOptions, addOption } from '@/lib/db';

// Reusable, multi-tab tenant-profile editor. Same form for the owner (/settings) and
// the operator (/tenants/[id]); the caller supplies load + save (RLS direct vs RPC).
const empty = (): OrgProfile => Object.fromEntries(ORG_PROFILE_KEYS.map((k) => [k, ''])) as unknown as OrgProfile;

const TABS = [
  { id: 'contact', label: 'Contact', icon: 'ti-address-book' },
  { id: 'classification', label: 'Classification', icon: 'ti-category' },
  { id: 'people', label: 'Contact person', icon: 'ti-user' },
  { id: 'address', label: 'Address', icon: 'ti-map-pin' },
  { id: 'tax', label: 'Tax & legal', icon: 'ti-receipt' },
  { id: 'social', label: 'Social', icon: 'ti-share' },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-2xs uppercase tracking-wide text-muted mb-1 font-medium">{label}</span>
      {children}
    </label>
  );
}

export default function OrgProfileForm({ load, onSave, readOnly = false, orgId, leadingTab }: {
  load: () => Promise<OrgProfile>;
  onSave: (patch: Partial<OrgProfile>) => Promise<void>;
  readOnly?: boolean;
  orgId?: string;
  leadingTab?: { id: string; label: string; icon: string; render: () => React.ReactNode };
}) {
  const [v, setV] = useState<OrgProfile | null>(null);
  const [tab, setTab] = useState(leadingTab ? leadingTab.id : 'contact');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [mInd, setMInd] = useState<string[]>([]);
  const [mCat, setMCat] = useState<string[]>([]);

  useEffect(() => { load().then((d) => setV({ ...empty(), ...Object.fromEntries(Object.entries(d || {}).map(([k, val]) => [k, val ?? ''])) } as OrgProfile)).catch((e) => setErr(e.message)); }, []);
  // Merge the org's admin-managed lists (org_options) with the built-in taxonomy.
  // Falls back silently to the static taxonomy when not readable (e.g. operator on another tenant).
  useEffect(() => {
    if (!orgId) return;
    getOrgOptions(orgId, 'industry').then((o) => setMInd(o.filter((x) => x.active).map((x) => x.label))).catch(() => {});
    getOrgOptions(orgId, 'category').then((o) => setMCat(o.filter((x) => x.active).map((x) => x.label))).catch(() => {});
  }, [orgId]);

  if (err && !v) return <p className="text-sm text-rose-600">{err}</p>;
  if (!v) return <p className="text-sm text-muted">Loading…</p>;

  const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean)));
  const indList = uniq([...mInd, ...INDUSTRIES]);
  const catList = uniq([...mCat, ...categoriesFor(v.industry)]);
  const set = (k: keyof OrgProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const inp = (k: keyof OrgProfile, type = 'text', ph = '') =>
    <input className="input" type={type} value={(v[k] as string) || ''} onChange={set(k)} placeholder={ph} disabled={readOnly} />;

  const save = async () => {
    setBusy(true); setErr(''); setOk(false);
    try { await onSave(v); setOk(true); setTimeout(() => setOk(false), 2500); }
    catch (e: any) { setErr(e.message || 'Save failed'); }
    finally { setBusy(false); }
  };

  const allTabs = leadingTab
    ? [{ id: leadingTab.id, label: leadingTab.label, icon: leadingTab.icon }, ...TABS]
    : TABS;

  return (
    <div className="card p-0 max-w-3xl overflow-hidden">
      <div className="flex gap-1 px-3 pt-3 border-b border-line bg-surface2/40 overflow-x-auto">
        {allTabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${tab === t.id ? 'border-b-accent text-content' : 'border-b-transparent text-muted hover:text-content'}`}>
            <Icon name={t.icon} className="text-sm" />{t.label}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-4">
        {leadingTab && tab === leadingTab.id && leadingTab.render()}

        {tab === 'contact' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Row label="Website">{inp('website', 'url', 'https://acme.com')}</Row>
            <Row label="Contact email">{inp('contact_email', 'email', 'hello@acme.com')}</Row>
            <Row label="Phone">{inp('contact_phone', 'tel', '+1 555 0100')}</Row>
          </div>
        )}

        {tab === 'classification' && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Row label="Industry">
                <Select search placeholder="Select industry…" value={v.industry || ''}
                  options={withCurrent(indList, v.industry)}
                  onChange={(ind) => setV({ ...v, industry: ind, category: categoriesFor(ind).includes(v.category || '') ? v.category : '' })}
                  allowAdd={!readOnly}
                  onAdd={(val) => { if (orgId) addOption(orgId, 'industry', val).catch(() => {}); setMInd((p) => Array.from(new Set([...p, val]))); }}
                  disabled={readOnly} />
              </Row>
              <Row label="Category">
                <Select search placeholder="Select category…" value={v.category || ''}
                  options={withCurrent(catList, v.category)}
                  onChange={(c) => setV({ ...v, category: c })}
                  allowAdd={!readOnly}
                  onAdd={(val) => { if (orgId) addOption(orgId, 'category', val).catch(() => {}); setMCat((p) => Array.from(new Set([...p, val]))); }}
                  disabled={readOnly} />
              </Row>
            </div>
            <Row label="About"><textarea className="input min-h-[72px]" value={v.about || ''} onChange={set('about')} placeholder="Short description of the business" disabled={readOnly} /></Row>
            <div className="grid sm:grid-cols-3 gap-4">
              <Row label="Legal name">{inp('legal_name', 'text', 'Registered legal entity name')}</Row>
              <Row label="Founded (year)">{inp('founded_year', 'text', 'e.g. 2018')}</Row>
              <Row label="Company size">
                <Select placeholder="Select size…" value={v.company_size || ''}
                  options={withCurrent(['1–10', '11–50', '51–200', '201–500', '500+'], v.company_size)}
                  onChange={(c) => setV({ ...v, company_size: c })} disabled={readOnly} />
              </Row>
            </div>
          </div>
        )}

        {tab === 'people' && (
          <div className="space-y-4">
            <p className="text-2xs text-muted">Primary point of contact for this business — used on documents and for account communication.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Row label="Contact name">{inp('contact_person', 'text', 'Full name')}</Row>
              <Row label="Role / title">{inp('contact_role', 'text', 'e.g. Operations Director')}</Row>
              <Row label="Contact email">{inp('contact_person_email', 'email', 'name@company.com')}</Row>
              <Row label="Contact phone">{inp('contact_person_phone', 'tel', '+1 555 0100')}</Row>
            </div>
          </div>
        )}

        {tab === 'address' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Row label="Address line 1">{inp('address_line1')}</Row>
            <Row label="Address line 2">{inp('address_line2')}</Row>
            <Row label="City">{inp('city')}</Row>
            <Row label="State / region">{inp('state_region')}</Row>
            <Row label="Postal code">{inp('postal_code')}</Row>
            <Row label="Country">{inp('country')}</Row>
          </div>
        )}

        {tab === 'tax' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Row label="Tax / VAT ID">{inp('tax_id', 'text', 'e.g. GB123456789')}</Row>
            <Row label="Registration no.">{inp('registration_no', 'text', 'Company reg. number')}</Row>
          </div>
        )}

        {tab === 'social' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Row label="LinkedIn">{inp('social_linkedin', 'url', 'https://linkedin.com/company/…')}</Row>
            <Row label="Twitter / X">{inp('social_twitter', 'url', 'https://x.com/…')}</Row>
            <Row label="Facebook">{inp('social_facebook', 'url', 'https://facebook.com/…')}</Row>
            <Row label="Instagram">{inp('social_instagram', 'url', 'https://instagram.com/…')}</Row>
          </div>
        )}

        {err && <p className="text-sm text-rose-600">{err}</p>}
        {!readOnly && tab !== (leadingTab?.id ?? '__none__') && (
          <div className="flex items-center gap-3 pt-2 border-t border-line">
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save profile'}</button>
            {ok && <span className="text-sm text-emerald-600 inline-flex items-center gap-1"><Icon name="ti-check" />Saved</span>}
          </div>
        )}
      </div>
    </div>
  );
}

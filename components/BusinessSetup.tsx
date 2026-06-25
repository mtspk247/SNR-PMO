import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { getOrgProfile } from '@/lib/db';
import { OrgProfile } from '@/lib/supabase';

// Guided business-profile completion prompt shown above the org profile editor.
// Groups the profile into sections; a section counts as done when its key field(s) are set.
const SECTIONS: { id: string; label: string; icon: string; keys: (keyof OrgProfile)[] }[] = [
  // Mirrors the profile tabs you fill in. (The 7th tab, Workspace, is your name + logo set when
  // the workspace was created, so it is not part of this fill-in checklist.) A section counts as
  // done once any of its key fields is set.
  { id: 'contact', label: 'Contact details', icon: 'ti-address-book', keys: ['website', 'contact_email', 'contact_phone'] },
  { id: 'classification', label: 'Industry & about', icon: 'ti-category', keys: ['industry', 'about', 'category'] },
  { id: 'person', label: 'Contact person', icon: 'ti-user', keys: ['contact_person', 'contact_person_email', 'contact_person_phone'] },
  { id: 'address', label: 'Business address', icon: 'ti-map-pin', keys: ['address_line1', 'city', 'country'] },
  { id: 'tax', label: 'Tax & legal', icon: 'ti-receipt', keys: ['tax_id', 'registration_no'] },
  { id: 'social', label: 'Social links', icon: 'ti-share', keys: ['social_linkedin', 'social_twitter', 'social_facebook', 'social_instagram'] },
];

export default function BusinessSetup({ orgId }: { orgId: string }) {
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => { getOrgProfile(orgId).then((p) => { if (active) setProfile(p); }).catch(() => {}); };
    load();
    const onSaved = () => load();
    window.addEventListener('snr:profile-saved', onSaved);   // refresh when the form below saves
    return () => { active = false; window.removeEventListener('snr:profile-saved', onSaved); };
  }, [orgId]);
  if (!profile) return null;

  const has = (k: keyof OrgProfile) => !!(profile[k] && String(profile[k]).trim());
  const sectionDone = (s: typeof SECTIONS[number]) => s.keys.some((k) => has(k));
  const done = SECTIONS.filter(sectionDone).length;
  const pct = Math.round((done / SECTIONS.length) * 100);
  const complete = done === SECTIONS.length;

  return (
    <div className={`card p-5 max-w-3xl ${complete ? '' : 'border-accent/40 bg-accent/5'}`}>
      <div className="flex items-start gap-3">
        <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${complete ? 'bg-emerald-500/10 text-emerald-600' : 'bg-accent/10 text-accentstrong'}`}>
          <Icon name={complete ? 'ti-checks' : 'ti-building-store'} className="text-lg" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-content">{complete ? 'Your business profile is complete' : 'Complete your business profile'}</h3>
          <p className="text-2xs text-muted mt-0.5">{complete ? 'This information powers your invoices, proposals, white-label emails and documents.' : `${done} of ${SECTIONS.length} sections done — fill these in below so your invoices, proposals and emails carry your business details.`}</p>
          <div className="h-1.5 rounded-full bg-surface2 overflow-hidden my-3"><div className={`h-full transition-all ${complete ? 'bg-emerald-500' : 'bg-accent'}`} style={{ width: `${pct}%` }} /></div>
          <div className="flex flex-wrap gap-1.5">
            {SECTIONS.map((s) => { const ok = sectionDone(s); return (
              <span key={s.id} className={`pill ${ok ? 'pill-green' : 'pill-gray'} inline-flex items-center gap-1`}><Icon name={ok ? 'ti-check' : s.icon} className="text-2xs" />{s.label}</span>
            ); })}
          </div>
        </div>
      </div>
    </div>
  );
}

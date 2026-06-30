import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon } from '@/components/ui';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { toast } from '@/lib/toast';
import { getTenantUsage, createProject } from '@/lib/db';

/** First-value accelerator: one click scaffolds starter projects for the tenant's business type.
 *  Shown on the dashboard to admins/owners only while the workspace has no projects yet. */
const TEMPLATES: { key: string; label: string; icon: string; desc: string; projects: string[] }[] = [
  { key: 'agency', label: 'Agency', icon: 'ti-briefcase', desc: 'Client work, retainers & deliverables', projects: ['Client onboarding', 'Website redesign', 'Monthly retainer', 'Content calendar'] },
  { key: 'consulting', label: 'Consulting', icon: 'ti-presentation', desc: 'Engagements & advisory', projects: ['Discovery & audit', 'Strategy engagement', 'Implementation roadmap'] },
  { key: 'services', label: 'Services / Studio', icon: 'ti-tools', desc: 'Intake, delivery & follow-up', projects: ['New client intake', 'Service delivery', 'Follow-ups & reviews'] },
  { key: 'internal', label: 'Internal / Ops', icon: 'ti-building', desc: 'Run your own company', projects: ['Company setup', 'This quarter’s goals', 'Team initiatives'] },
];

export default function QuickStart() {
  const org = useActiveOrg(); const me = useAuthStore((s) => s.user); const router = useRouter();
  const [show, setShow] = useState(false); const [busy, setBusy] = useState('');
  useEffect(() => {
    let active = true;
    if (!org || !can.manageOrg(org)) { setShow(false); return; }
    getTenantUsage(org.id).then((u) => { if (active) setShow((u.counts?.projects || 0) === 0); }).catch(() => {});
    return () => { active = false; };
  }, [org?.id]);
  if (!org || !show) return null;
  const apply = async (t: typeof TEMPLATES[number]) => {
    setBusy(t.key);
    try {
      for (const name of t.projects) await createProject({ name, org_id: org.id, created_by: me?.id, status: 'active' });
      toast(`${t.projects.length} starter projects created — you’re set up!`, 'success');
      setShow(false); router.push('/projects');
    } catch (e: any) { toast(e.message || 'Could not create starter projects', 'error'); setBusy(''); }
  };
  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="w-9 h-9 rounded-lg grid place-items-center bg-accent/10 text-accentstrong shrink-0"><Icon name="ti-wand" className="text-lg" /></span>
        <div><h3 className="text-sm font-semibold text-content">Quick start — get value in one click</h3>
          <p className="text-2xs text-muted">Pick what fits your business and we’ll create starter projects so you’re not staring at a blank workspace.</p></div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
        {TEMPLATES.map((t) => (
          <button key={t.key} disabled={!!busy} onClick={() => apply(t)} className="text-left rounded-xl border border-line p-3 hover:border-accent hover:bg-accent/5 transition disabled:opacity-50">
            <div className="flex items-center gap-2 mb-1"><Icon name={t.icon} className="text-accentstrong" /><span className="text-sm font-medium text-content">{t.label}</span></div>
            <p className="text-2xs text-muted">{t.desc}</p>
            <p className="text-[10px] text-muted2 mt-1.5">{busy === t.key ? 'Creating…' : `Creates ${t.projects.length} projects`}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

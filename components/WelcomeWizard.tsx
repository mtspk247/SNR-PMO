import { useEffect, useState } from 'react';
import Select from '@/components/Select';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';
import { saveOnboarding, getOrgOptions } from '@/lib/db';

const TEAM = ['Just me', '2–10', '11–50', '50+'];
const INDUSTRY = ['Agency', 'SaaS / Software', 'Consulting', 'E-commerce', 'Construction / Real estate', 'Healthcare', 'Education', 'Other'];
const USECASE = ['Projects & tasks', 'CRM & sales', 'HR & people', 'Finance & accounting', 'A bit of everything'];

/**
 * First-run welcome wizard. Shown once to a new workspace owner/admin to collect a
 * little context (renames the auto-created workspace). Skippable — the dashboard
 * checklist nudges the rest. Hidden once onboarding.completed_at is set.
 */
export default function WelcomeWizard() {
  const org = useActiveOrg();
  const patchOrg = useAuthStore((s) => s.patchOrg);
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [industry, setIndustry] = useState('');
  const [useCase, setUseCase] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (org) setName((n) => n || org.name || ''); }, [org?.id]);
  const [industries, setIndustries] = useState<string[]>(INDUSTRY);
  const [useCases, setUseCases] = useState<string[]>(USECASE);
  useEffect(() => {
    if (!org) return;
    getOrgOptions(org.id, 'industry').then((o) => { const a = o.filter((x) => x.active).map((x) => x.label); if (a.length) setIndustries(a); }).catch(() => {});
    getOrgOptions(org.id, 'use_case').then((o) => { const a = o.filter((x) => x.active).map((x) => x.label); if (a.length) setUseCases(a); }).catch(() => {});
  }, [org?.id]);

  const key = org ? `snr_onboard_skip_${org.id}` : '';
  const skipped = typeof window !== 'undefined' && key ? window.localStorage.getItem(key) === '1' : false;
  const show = !!org && can.manageOrg(org) && !org.onboarding?.completed_at && !skipped && !dismissed;
  if (!show) return null;

  const skip = () => { if (typeof window !== 'undefined' && key) window.localStorage.setItem(key, '1'); setDismissed(true); };
  const save = async () => {
    if (!org) return; setBusy(true); setErr('');
    try {
      await saveOnboarding(org.id, name, { team_size: teamSize, industry, use_case: useCase, role });
      patchOrg({ id: org.id, name: name.trim() || org.name, onboarding: { completed_at: new Date().toISOString(), team_size: teamSize, industry, use_case: useCase, role } });
      setDismissed(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={skip} size="md" icon="ti-rocket" title="Welcome — let’s set up your workspace"
      subtitle="A few quick details to tailor things. You can skip and finish later."
      footer={<>
        <button className="btn mr-auto" onClick={skip}>Skip for now</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save & continue'}</button>
      </>}>
      <div className="space-y-3">
        <Field label="Company / workspace name" hint="We’ll rename your workspace to this.">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Team size">
            <Select value={teamSize} onChange={(v) => setTeamSize(v)} options={[{ value: '', label: 'Select…' }, ...TEAM.map((t) => ({ value: t, label: t }))]} />
          </Field>
          <Field label="Industry">
            <Select value={industry} onChange={(v) => setIndustry(v)} options={[{ value: '', label: 'Select…' }, ...industries.map((t) => ({ value: t, label: t }))]} />
          </Field>
        </div>
        <Field label="What will you mainly use it for?">
          <Select value={useCase} onChange={(v) => setUseCase(v)} options={[{ value: '', label: 'Select…' }, ...useCases.map((t) => ({ value: t, label: t }))]} />
        </Field>
        <Field label="Your role" hint="e.g. Founder, Project Manager">
          <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Founder" />
        </Field>
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </div>
    </Modal>
  );
}

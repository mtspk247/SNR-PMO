import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { getOrgCompanies, createOrgCompany, getProjects } from '@/lib/db';
import { OrgCompany, Project } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';

export default function CompaniesPage() {
  const org = useActiveOrg();
  const admin = can.manageMembers(org);
  const [companies, setCompanies] = useState<OrgCompany[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [nc, setNc] = useState({ name: '', description: '' });

  useEffect(() => {
    Promise.all([getOrgCompanies(), getProjects()])
      .then(([c, p]) => { setCompanies(c); setProjects(p); })
      .finally(() => setLoading(false));
  }, [org?.id]);

  const submit = async () => {
    if (!org || !nc.name.trim()) return;
    setBusy(true); setErr('');
    try {
      const c = await createOrgCompany({ name: nc.name.trim(), org_id: org.id, description: nc.description.trim() || null });
      setCompanies((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      setShowNew(false); setNc({ name: '', description: '' });
    } catch (e: any) { setErr(e.message || 'Could not create company'); }
    finally { setBusy(false); }
  };

  const projectCount = (cid: string) => projects.filter((p) => p.company_id === cid).length;

  return (
    <Layout title="Companies">
      <PageHeader title="Companies" subtitle={`${companies.length} companies`}
        action={admin ? <button onClick={() => { setErr(''); setShowNew(true); }} className="btn btn-primary"><Icon name="ti-plus" />New company</button> : undefined} />
      {loading ? <Spinner /> : !admin ? (
        <EmptyState icon="ti-lock" text="Only org admins can manage companies" />
      ) : companies.length === 0 ? (
        <EmptyState icon="ti-building" text="No companies yet — create your first one" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {companies.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-md bg-neutral-100 grid place-items-center text-neutral-500 shrink-0"><Icon name="ti-building" className="text-lg" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-2xs text-neutral-400">{projectCount(c.id)} projects</p>
                </div>
              </div>
              {c.description && <p className="text-2xs text-neutral-500 mt-2 line-clamp-2">{c.description}</p>}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-30 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-lg border border-line w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">New company</h3>
            <div className="space-y-3">
              <div><label className="label">Name</label><input autoFocus value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} className="input" placeholder="Company name" /></div>
              <div><label className="label">Description</label><textarea value={nc.description} onChange={(e) => setNc({ ...nc, description: e.target.value })} className="w-full px-3 py-2 rounded-md border border-line bg-white text-sm text-ink placeholder:text-neutral-400 outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 h-20 resize-none" placeholder="Optional" /></div>
              {err && <p className="text-sm text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowNew(false)} className="btn flex-1">Cancel</button>
              <button onClick={submit} disabled={busy || !nc.name.trim()} className="btn btn-primary flex-1">{busy ? 'Creating…' : 'Create company'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Pill, Spinner, EmptyState, PageHeader, Icon } from '@/components/ui';
import { getProjects, createProject, getOrgCompanies } from '@/lib/db';
import { Project, OrgCompany } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

const STATUSES = ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const EMPTY = { name: '', description: '', status: 'Planning', priority: 'Medium', start_date: '', end_date: '', company_id: '' };

export default function Projects() {
  const activeOrg = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<OrgCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [np, setNp] = useState(EMPTY);
  const canCreate = can.createProject(activeOrg);

  useEffect(() => {
    Promise.all([getProjects(), getOrgCompanies()])
      .then(([p, c]) => { setProjects(p); setCompanies(c); })
      .finally(() => setLoading(false));
  }, [activeOrg?.id]);

  const submit = async () => {
    if (!activeOrg || !np.name.trim()) return;
    setBusy(true); setErr('');
    try {
      const list = await createProject({
        name: np.name.trim(), org_id: activeOrg.id, description: np.description.trim() || null,
        status: np.status, priority: np.priority,
        start_date: np.start_date || null, end_date: np.end_date || null,
        company_id: np.company_id || null,
        pm_id: me?.id || null, created_by: me?.id || null,
      });
      setProjects(list);
      setShowNew(false); setNp(EMPTY);
    } catch (e: any) { setErr(e.message || 'Could not create project'); }
    finally { setBusy(false); }
  };

  return (
    <Layout title="Projects">
      <PageHeader title="Projects" subtitle={`${projects.length} projects`}
        action={canCreate ? <button onClick={() => { setErr(''); setShowNew(true); }} className="btn btn-primary"><Icon name="ti-plus" />New project</button> : undefined} />
      {loading ? <Spinner /> : projects.length === 0 ? (
        <EmptyState text={canCreate ? 'No projects yet — create your first one' : 'No projects yet'} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr>
              <th className="th">Name</th><th className="th">Status</th><th className="th">Priority</th>
              <th className="th">Timeline</th><th className="th w-44">Progress</th>
            </tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="row">
                  <td className="td">
                    <p className="font-medium">{p.name}</p>
                    {p.description && <p className="text-2xs text-neutral-500 truncate max-w-xs">{p.description}</p>}
                  </td>
                  <td className="td"><Pill label={p.status} /></td>
                  <td className="td"><Pill label={p.priority} /></td>
                  <td className="td text-2xs text-neutral-500">{p.start_date || '—'} → {p.end_date || '—'}</td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded bg-neutral-100"><div className="h-1.5 rounded bg-ink" style={{ width: `${p.progress || 0}%` }} /></div>
                      <span className="text-2xs text-neutral-500 w-8 text-right">{p.progress || 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-30 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-lg border border-line w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">New project</h3>
            <div className="space-y-3">
              <div><label className="label">Name</label><input autoFocus value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} className="input" placeholder="Project name" /></div>
              {companies.length > 0 && <div><label className="label">Company</label><select value={np.company_id} onChange={(e) => setNp({ ...np, company_id: e.target.value })} className="input"><option value="">No company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
              <div><label className="label">Description</label><textarea value={np.description} onChange={(e) => setNp({ ...np, description: e.target.value })} className="w-full px-3 py-2 rounded-md border border-line bg-white text-sm text-ink placeholder:text-neutral-400 outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 h-20 resize-none" placeholder="Optional" /></div>
              <div className="flex gap-3">
                <div className="flex-1"><label className="label">Status</label><select value={np.status} onChange={(e) => setNp({ ...np, status: e.target.value })} className="input">{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
                <div className="flex-1"><label className="label">Priority</label><select value={np.priority} onChange={(e) => setNp({ ...np, priority: e.target.value })} className="input">{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1"><label className="label">Start</label><input type="date" value={np.start_date} onChange={(e) => setNp({ ...np, start_date: e.target.value })} className="input" /></div>
                <div className="flex-1"><label className="label">End</label><input type="date" value={np.end_date} onChange={(e) => setNp({ ...np, end_date: e.target.value })} className="input" /></div>
              </div>
              {err && <p className="text-sm text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowNew(false)} className="btn flex-1">Cancel</button>
              <button onClick={submit} disabled={busy || !np.name.trim()} className="btn btn-primary flex-1">{busy ? 'Creating…' : 'Create project'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

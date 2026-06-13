import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { Pill, Spinner, EmptyState, PageHeader, Icon, StatusBadge } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { usePagination, Pagination } from '@/components/Pagination';
import { useProjects, useOrgCompanies, usePortfolios, useCreateProject, useUpdateProject, useDeleteProject } from '@/lib/queries';
import { Project } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

const STATUSES = ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const EMPTY = { name: '', description: '', status: 'Planning', priority: 'Medium', start_date: '', end_date: '', company_id: '', portfolio_id: '' };

export default function Projects() {
  const activeOrg = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const { data: projects = [], isLoading } = useProjects();
  const { data: companies = [] } = useOrgCompanies();
  const router = useRouter();
  const { data: portfolios = [] } = usePortfolios();
  const createM = useCreateProject();
  const updateM = useUpdateProject();
  const deleteM = useDeleteProject();
  const busy = createM.isPending || updateM.isPending || deleteM.isPending;

  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState('');
  const [np, setNp] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const canCreate = can.createProject(activeOrg);

  const pg = usePagination(projects, 25);

  const portfolioName = (id?: string | null) => (id ? portfolios.find((pf) => pf.id === id)?.name : undefined);
  const companyName = (id?: string | null) => (id ? companies.find((c) => c.id === id)?.name : undefined);
  // Portfolios belong to a company; offer only those under the chosen company.
  const modalPortfolios = portfolios.filter((pf) => pf.company_id === np.company_id);

  const openNew = () => { setErr(''); setEditId(null); setNp(EMPTY); setShowNew(true); };
  const openEdit = (p: Project) => {
    if (!canCreate) return;
    setErr(''); setEditId(p.id);
    setNp({
      name: p.name, description: p.description || '', status: p.status, priority: p.priority,
      start_date: p.start_date || '', end_date: p.end_date || '',
      company_id: p.company_id || '', portfolio_id: p.portfolio_id || '',
    });
    setShowNew(true);
  };

  const submit = async () => {
    if (!activeOrg || !np.name.trim()) return;
    setErr('');
    try {
      const fields = {
        name: np.name.trim(), description: np.description.trim() || null,
        status: np.status, priority: np.priority,
        start_date: np.start_date || null, end_date: np.end_date || null,
        company_id: np.company_id || null, portfolio_id: np.portfolio_id || null,
      };
      if (editId) await updateM.mutateAsync({ id: editId, patch: fields });
      else await createM.mutateAsync({ ...fields, org_id: activeOrg.id, pm_id: me?.id || null, created_by: me?.id || null });
      setShowNew(false); setEditId(null); setNp(EMPTY);
    } catch (e: any) { setErr(e.message || 'Could not save project'); }
  };
  const remove = async () => {
    if (!editId || !confirm('Delete this project? This cannot be undone.')) return;
    setErr('');
    try {
      await deleteM.mutateAsync(editId);
      setShowNew(false); setEditId(null); setNp(EMPTY);
    } catch (e: any) { setErr(e.message || 'Could not delete — remove its tasks, risks and financials first.'); }
  };

  return (
    <Layout title="Projects">
      <PageHeader title="Projects" subtitle={`${projects.length} projects`}
        action={canCreate ? <button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New project</button> : undefined} />
      {isLoading ? <Spinner /> : projects.length === 0 ? (
        <EmptyState text={canCreate ? 'No projects yet — create your first one' : 'No projects yet'} />
      ) : (
        <div className="bg-surface overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr>
              <th className="th">Name</th><th className="th">Status</th><th className="th">Company</th><th className="th">Priority</th>
              <th className="th">Timeline</th><th className="th w-44">Progress</th><th className="th w-10"></th>
            </tr></thead>
            <tbody>
              {pg.pageItems.map((p) => (
                <tr key={p.id} onClick={() => router.push(`/projects/${p.id}`)} className="row cursor-pointer">
                  <td className="td">
                    <p className="font-medium">{p.name}</p>
                    {portfolioName(p.portfolio_id) && <p className="text-2xs text-neutral-400 inline-flex items-center gap-1"><Icon name="ti-stack-2" />{portfolioName(p.portfolio_id)}</p>}
                    {p.description && <p className="text-2xs text-neutral-500 truncate max-w-xs">{p.description}</p>}
                  </td>
                  <td className="td"><StatusBadge status={p.status} /></td>
                  <td className="td text-2xs text-muted">{companyName(p.company_id) || '—'}</td>
                  <td className="td"><Pill label={p.priority} /></td>
                  <td className="td text-2xs text-neutral-500">{p.start_date || '—'} → {p.end_date || '—'}</td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded bg-neutral-100"><div className="h-1.5 rounded bg-ink" style={{ width: `${p.progress || 0}%` }} /></div>
                      <span className="text-2xs text-neutral-500 w-8 text-right">{p.progress || 0}%</span>
                    </div>
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-1 justify-end">
                      {canCreate && <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} title="Edit project" className="text-muted2 hover:text-content p-1"><Icon name="ti-pencil" className="text-sm" /></button>}
                      <Link href={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="text-muted2 hover:text-content inline-flex p-1" title="Open project"><Icon name="ti-arrow-right" /></Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} start={pg.start} end={pg.end} onPage={pg.setPage} />
        </div>
      )}

      <Modal
        open={showNew}
        onClose={() => { setShowNew(false); setEditId(null); }}
        title={editId ? 'Edit project' : 'New project'}
        subtitle={editId ? 'Update details, timeline and assignment.' : 'Set up a project and assign it to a company or portfolio.'}
        icon={editId ? 'ti-edit' : 'ti-folder-plus'}
        onSubmit={() => { if (!busy && np.name.trim()) submit(); }}
        footer={
          <>
            {editId && <button onClick={remove} disabled={busy} className="btn text-rose-600 px-3" title="Delete project"><Icon name="ti-trash" /></button>}
            <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
            <button onClick={() => { setShowNew(false); setEditId(null); }} className="btn">Cancel</button>
            <button onClick={submit} disabled={busy || !np.name.trim()} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Saving…' : (editId ? 'Save changes' : 'Create project')}</button>
          </>
        }
      >
        <div className="space-y-3.5">
          <input autoFocus value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} placeholder="Project name"
            className="w-full text-lg font-semibold bg-transparent outline-none text-content placeholder:text-muted2 px-0 pb-1" />
          {companies.length > 0 && (
            <Field label="Company">
              <select value={np.company_id} onChange={(e) => setNp({ ...np, company_id: e.target.value, portfolio_id: '' })} className="input"><option value="">No company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>
          )}
          {np.company_id && modalPortfolios.length > 0 && (
            <Field label="Portfolio">
              <select value={np.portfolio_id} onChange={(e) => setNp({ ...np, portfolio_id: e.target.value })} className="input"><option value="">No portfolio</option>{modalPortfolios.map((pf) => <option key={pf.id} value={pf.id}>{pf.name}</option>)}</select>
            </Field>
          )}
          <Field label="Description" hint="Optional — a sentence on scope or goals.">
            <textarea value={np.description} onChange={(e) => setNp({ ...np, description: e.target.value })} className="textarea h-20" placeholder="What is this project about?" />
          </Field>
          <div className="flex gap-3">
            <Field label="Status" className="flex-1">
              <select value={np.status} onChange={(e) => setNp({ ...np, status: e.target.value })} className="input">{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
            </Field>
            <Field label="Priority" className="flex-1">
              <select value={np.priority} onChange={(e) => setNp({ ...np, priority: e.target.value })} className="input">{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select>
            </Field>
          </div>
          <div className="flex gap-3">
            <Field label="Start" className="flex-1">
              <input type="date" value={np.start_date} onChange={(e) => setNp({ ...np, start_date: e.target.value })} className="input" />
            </Field>
            <Field label="End" className="flex-1">
              <input type="date" value={np.end_date} onChange={(e) => setNp({ ...np, end_date: e.target.value })} className="input" />
            </Field>
          </div>
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
      </Modal>
    </Layout>
  );
}

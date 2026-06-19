import { useState, useEffect, useMemo } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { Pill, Spinner, EmptyState, PageHeader, Icon, StatusBadge } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { usePagination, Pagination } from '@/components/Pagination';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { ViewControls, useViewPrefs, buildGroups } from '@/components/ViewControls';
import { useProjects, useOrgCompanies, usePortfolios, useCreateProject, useUpdateProject, useDeleteProject } from '@/lib/queries';
import { Project } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { ensureTaskStatuses, TaskStatus } from '@/lib/db';
import StatusManager from '@/components/StatusManager';
import { can } from '@/lib/authz';

const STATUSES = ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const EMPTY = { name: '', description: '', status: 'Planning', priority: 'Medium', start_date: '', end_date: '', company_id: '', portfolio_id: '' };
const PROJECT_COLS: ColDef[] = [{ id: 'name', label: 'Name', locked: true }, { id: 'status', label: 'Status' }, { id: 'company', label: 'Company' }, { id: 'priority', label: 'Priority' }, { id: 'timeline', label: 'Timeline' }, { id: 'progress', label: 'Progress' }];

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
  const [pstatuses, setPstatuses] = useState<TaskStatus[]>([]);
  const [statusMgr, setStatusMgr] = useState(false);
  useEffect(() => { if (activeOrg?.id) ensureTaskStatuses(activeOrg.id, 'project').then(setPstatuses).catch(() => {}); }, [activeOrg?.id]);
  const reloadP = () => { if (activeOrg?.id) ensureTaskStatuses(activeOrg.id, 'project').then(setPstatuses).catch(() => {}); };
  const pColor = (n: string) => pstatuses.find((s) => s.name === n)?.color;
  const pNames = pstatuses.length ? pstatuses.map((s) => s.name) : STATUSES;

  const lp = useListPrefs(`snr-projects-view-${me?.id || 'anon'}`, PROJECT_COLS);
  const FILTERS: FilterDef[] = useMemo(() => [
    { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, ...pNames.map((s) => ({ value: s, label: titleCase(s) }))] },
    { id: 'company', label: 'Company', options: [{ value: 'all', label: 'All companies' }, ...companies.map((c) => ({ value: c.id, label: c.name }))] },
    { id: 'priority', label: 'Priority', options: [{ value: 'all', label: 'All priorities' }, ...PRIORITIES.map((x) => ({ value: x, label: titleCase(x) }))] },
  ], [pNames, companies]);
  const filtered = useMemo(() => {
    const term = lp.query.trim().toLowerCase();
    const fs = lp.filters;
    return projects.filter((p) => {
      if (term && !(`${p.name || ''} ${p.description || ''}`.toLowerCase().includes(term))) return false;
      if (fs.status && fs.status !== 'all' && p.status !== fs.status) return false;
      if (fs.company && fs.company !== 'all' && (p.company_id || '') !== fs.company) return false;
      if (fs.priority && fs.priority !== 'all' && p.priority !== fs.priority) return false;
      return true;
    });
  }, [projects, lp.query, lp.filters]);
  const pg = usePagination(filtered, 25);

  const portfolioName = (id?: string | null) => (id ? portfolios.find((pf) => pf.id === id)?.name : undefined);
  const companyName = (id?: string | null) => (id ? companies.find((c) => c.id === id)?.name : undefined);
  // Portfolios belong to a company; offer only those under the chosen company.
  const modalPortfolios = portfolios.filter((pf) => pf.company_id === np.company_id);
  const vp = useViewPrefs(`snr-projects-vp-${me?.id || 'anon'}`, { view: 'table', groupBy: 'none' });
  const groupOptions = [
    { value: 'none', label: 'No grouping' },
    { value: 'company', label: 'Group by company' },
    { value: 'portfolio', label: 'Group by portfolio' },
    { value: 'status', label: 'Group by status' },
    { value: 'priority', label: 'Group by priority' },
  ];
  const gKey = (p: Project) => vp.groupBy === 'company' ? (p.company_id || '') : vp.groupBy === 'portfolio' ? (p.portfolio_id || '') : vp.groupBy === 'status' ? p.status : vp.groupBy === 'priority' ? p.priority : 'all';
  const gLabel = (k: string) => vp.groupBy === 'company' ? (companyName(k) || 'No company') : vp.groupBy === 'portfolio' ? (portfolioName(k) || 'No portfolio') : (k || '—');

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

  const ProjectRow = (p: Project) => {
    const cell = (id: string) => { switch (id) {
      case 'name': return (<><p className="font-medium">{p.name}</p>{portfolioName(p.portfolio_id) && <p className="text-2xs text-neutral-400 inline-flex items-center gap-1"><Icon name="ti-stack-2" />{portfolioName(p.portfolio_id)}</p>}{p.description && <p className="text-2xs text-neutral-500 truncate max-w-xs">{p.description}</p>}</>);
      case 'status': return <StatusBadge status={p.status} color={pColor(p.status)} />;
      case 'company': return <span className="text-2xs text-muted">{companyName(p.company_id) || '—'}</span>;
      case 'priority': return <Pill label={p.priority} />;
      case 'timeline': return <span className="text-2xs text-neutral-500">{p.start_date || '—'} → {p.end_date || '—'}</span>;
      case 'progress': return (<div className="flex items-center gap-2"><div className="flex-1 h-1.5 rounded bg-neutral-100"><div className="h-1.5 rounded bg-ink" style={{ width: `${p.progress || 0}%` }} /></div><span className="text-2xs text-neutral-500 w-8 text-right">{p.progress || 0}%</span></div>);
      default: return null; } };
    return (
      <tr key={p.id} onClick={() => router.push(`/projects/${p.id}`)} className="row cursor-pointer">
        {lp.ordered.map((id) => <td key={id} className="td">{cell(id)}</td>)}
        <td className="td"><div className="flex items-center gap-1 justify-end">{canCreate && <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} title="Edit project" className="text-muted2 hover:text-content p-1"><Icon name="ti-pencil" className="text-sm" /></button>}<Link href={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="text-muted2 hover:text-content inline-flex p-1" title="Open project"><Icon name="ti-arrow-right" /></Link></div></td>
      </tr>
    );
  };
  const ProjectTable = ({ items }: { items: Project[] }) => (
    <div className="bg-surface overflow-hidden rounded-lg border border-line">
      <div className="overflow-x-auto"><table className="w-full">
        <thead><tr>{lp.ordered.map((id) => <th key={id} className={`th ${id === 'progress' ? 'w-44' : ''}`}>{PROJECT_COLS.find((c) => c.id === id)?.label}</th>)}<th className="th w-10"></th></tr></thead>
        <tbody>{items.map(ProjectRow)}</tbody>
      </table></div>
    </div>
  );
  const ProjectCards = ({ items }: { items: Project[] }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((p) => (
        <div key={p.id} onClick={() => router.push(`/projects/${p.id}`)} className="card p-4 cursor-pointer hover:border-borderstrong transition group">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium truncate">{p.name}</p>
            {canCreate && <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} title="Edit" className="text-muted2 hover:text-content p-1 opacity-0 group-hover:opacity-100 shrink-0"><Icon name="ti-pencil" className="text-sm" /></button>}
          </div>
          <div className="flex items-center gap-2 mt-2"><StatusBadge status={p.status} color={pColor(p.status)} /><Pill label={p.priority} /></div>
          {companyName(p.company_id) && <p className="text-2xs text-muted mt-2 inline-flex items-center gap-1"><Icon name="ti-building" />{companyName(p.company_id)}</p>}
          {portfolioName(p.portfolio_id) && <p className="text-2xs text-muted2 inline-flex items-center gap-1"><Icon name="ti-stack-2" />{portfolioName(p.portfolio_id)}</p>}
          <div className="flex items-center gap-2 mt-3"><div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${p.progress || 0}%` }} /></div><span className="text-2xs text-muted w-9 text-right tabular-nums">{p.progress || 0}%</span></div>
        </div>
      ))}
    </div>
  );
  const groups = vp.groupBy === 'none' ? [{ key: 'all', label: '', items: pg.pageItems }] : buildGroups(filtered, gKey, gLabel);

  return (
    <Layout title="Projects">
      <PageHeader help="work" title="Projects" subtitle={`${projects.length} projects`}
        action={canCreate ? <div className="flex items-center gap-2"><button onClick={() => setStatusMgr(true)} className="btn"><Icon name="ti-flag-3" className="text-sm" />Statuses</button><button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New project</button></div> : undefined} />
      {isLoading ? <Spinner /> : projects.length === 0 ? (
        <EmptyState text={canCreate ? 'No projects yet — create your first one' : 'No projects yet'} />
      ) : (
        <>
          <ListToolbar prefs={lp} cols={PROJECT_COLS} filters={FILTERS} placeholder="Search projects…">
            <ViewControls prefs={vp} views={[{ id: 'table', icon: 'ti-list', label: 'List' }, { id: 'cards', icon: 'ti-layout-grid', label: 'Cards' }]} groupOptions={groupOptions} />
          </ListToolbar>
          {filtered.length === 0 ? <EmptyState text="No projects match your filters" /> : (
            <div className="space-y-6">
              {groups.map((g) => (
                <div key={g.key}>
                  {g.label && <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-semibold text-content">{g.label}</h3><span className="text-2xs text-muted2 bg-surface2 rounded-full px-2 py-0.5">{g.items.length}</span></div>}
                  {vp.view === 'cards' ? <ProjectCards items={g.items} /> : <ProjectTable items={g.items} />}
                </div>
              ))}
              {vp.groupBy === 'none' && <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} start={pg.start} end={pg.end} onPage={pg.setPage} />}
            </div>
          )}
        </>
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
              <Select value={np.company_id} onChange={(v) => setNp({ ...np, company_id: v, portfolio_id: '' })} options={[{ value: '', label: 'No company' }, ...companies.map((c) => ({ value: c.id, label: c.name }))]} />
            </Field>
          )}
          {np.company_id && modalPortfolios.length > 0 && (
            <Field label="Portfolio">
              <Select value={np.portfolio_id} onChange={(v) => setNp({ ...np, portfolio_id: v })} options={[{ value: '', label: 'No portfolio' }, ...modalPortfolios.map((pf) => ({ value: pf.id, label: pf.name }))]} />
            </Field>
          )}
          <Field label="Description" hint="Optional — a sentence on scope or goals.">
            <textarea value={np.description} onChange={(e) => setNp({ ...np, description: e.target.value })} className="textarea h-20" placeholder="What is this project about?" />
          </Field>
          <div className="flex gap-3">
            <Field label="Status" className="flex-1">
              <Select value={np.status} onChange={(v) => setNp({ ...np, status: v })} options={[...pNames.map(s => ({ value: s, label: titleCase(s) }))]} />
            </Field>
            <Field label="Priority" className="flex-1">
              <Select value={np.priority} onChange={(v) => setNp({ ...np, priority: v })} options={[...PRIORITIES.map(p => ({ value: p, label: titleCase(p) }))]} />
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
      {activeOrg?.id && <StatusManager open={statusMgr} onClose={() => setStatusMgr(false)} orgId={activeOrg.id} scope="project" statuses={pstatuses} onChanged={reloadP} />}
    </Layout>
  );
}

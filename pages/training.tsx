import React, { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, StatCard, Icon } from '@/components/ui';
import { Modal, Field, useModalTabs } from '@/components/Modal';
import { useTrainingDocs, useJobDescriptions } from '@/lib/queries';
import {
  createTrainingDoc, updateTrainingDoc, deleteTrainingDoc,
  createJobDescription, updateJobDescription, deleteJobDescription,
  uploadHrDoc, removeHrDoc, getTrainingDocUrl,
  listRoleTemplates,
} from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection, BulkBar } from '@/components/RowSelection';
import { DataList, GroupMeta, EditSpec } from '@/components/DataList';
import { can } from '@/lib/authz';
import { TrainingDoc, JobDescription, RoleTemplate } from '@/lib/supabase';

type TabKey = 'training' | 'jd';

type TDocForm = {
  title: string; category: string; department: string;
  role_template_id: string; link_url: string; description: string;
};
const emptyTDocForm = (): TDocForm => ({
  title: '', category: '', department: '', role_template_id: '', link_url: '', description: '',
});

type JDForm = {
  title: string; department: string; role_template_id: string;
  summary: string; responsibilities: string; requirements: string;
};
const emptyJDForm = (): JDForm => ({
  title: '', department: '', role_template_id: '', summary: '', responsibilities: '', requirements: '',
});

const TD_COLS: ColDef[] = [
  { id: 'title', label: 'Title', locked: true },
  { id: 'category', label: 'Category' },
  { id: 'department', label: 'Department' },
  { id: 'role', label: 'Role' },
  { id: 'file', label: 'File / Link' },
  { id: 'added', label: 'Added' },
  { id: 'actions', label: '' },
];
const JD_COLS: ColDef[] = [
  { id: 'title', label: 'Title', locked: true },
  { id: 'department', label: 'Department' },
  { id: 'role', label: 'Role' },
  { id: 'file', label: 'File' },
  { id: 'added', label: 'Added' },
  { id: 'actions', label: '' },
];

type TdGroupBy = 'category' | 'none';
type JdGroupBy = 'department' | 'none';

export default function TrainingPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const admin = can.manageMembers(org);
  const qc = useQueryClient();

  const { data: trainingDocs = [], isLoading: loadingTd } = useTrainingDocs();
  const { data: jobDescs = [], isLoading: loadingJd } = useJobDescriptions();

  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  useEffect(() => {
    listRoleTemplates().then(setRoleTemplates).catch(() => {});
  }, [org?.id]);

  const [tab, setTab] = useState<TabKey>('training');

  // Training doc state
  const [showTdModal, setShowTdModal] = useState(false);
  const [editingTd, setEditingTd] = useState<TrainingDoc | null>(null);
  const [tdForm, setTdForm] = useState<TDocForm>(emptyTDocForm());
  const [tdBusy, setTdBusy] = useState(false);
  const [tdGroupBy, setTdGroupBy] = useState<TdGroupBy>('category');

  // JD state
  const [showJdModal, setShowJdModal] = useState(false);
  const [editingJd, setEditingJd] = useState<JobDescription | null>(null);
  const [jdForm, setJdForm] = useState<JDForm>(emptyJDForm());
  const [jdBusy, setJdBusy] = useState(false);
  const [expandedJd, setExpandedJd] = useState<string | null>(null);
  const [jdGroupBy, setJdGroupBy] = useState<JdGroupBy>('department');

  // Stats
  const withFiles = trainingDocs.filter((d) => !!d.doc_path).length;
  const allDepts = useMemo(() => {
    const s = new Set<string>();
    trainingDocs.forEach((d) => d.department && s.add(d.department));
    jobDescs.forEach((d) => d.department && s.add(d.department));
    return s.size;
  }, [trainingDocs, jobDescs]);

  const tdCategories = useMemo(() => {
    const s = new Set<string>();
    trainingDocs.forEach((d) => d.category && s.add(d.category));
    return Array.from(s).sort();
  }, [trainingDocs]);

  const jdDepartments = useMemo(() => {
    const s = new Set<string>();
    jobDescs.forEach((d) => d.department && s.add(d.department));
    return Array.from(s).sort();
  }, [jobDescs]);

  const tdLp = useListPrefs(`snrpmo.training-docs.cols`, TD_COLS);
  const jdLp = useListPrefs(`snrpmo.training-jd.cols`, JD_COLS);
  const TD_FILTERS: FilterDef[] = useMemo(() => [{ id: 'category', label: 'Category', options: [{ value: 'all', label: 'All categories' }, ...tdCategories.map((c) => ({ value: c, label: titleCase(c) }))] }], [tdCategories]);
  const JD_FILTERS: FilterDef[] = useMemo(() => [{ id: 'department', label: 'Department', options: [{ value: 'all', label: 'All departments' }, ...jdDepartments.map((d) => ({ value: d, label: titleCase(d) }))] }], [jdDepartments]);

  const filteredTd = useMemo(() => {
    const term = tdLp.query.trim().toLowerCase();
    return trainingDocs.filter((d) => {
      if (tdLp.filters.category && tdLp.filters.category !== 'all' && d.category !== tdLp.filters.category) return false;
      if (!term) return true;
      return (
        d.title.toLowerCase().includes(term) ||
        (d.description || '').toLowerCase().includes(term) ||
        (d.category || '').toLowerCase().includes(term) ||
        (d.department || '').toLowerCase().includes(term)
      );
    });
  }, [trainingDocs, tdLp.query, tdLp.filters]);

  const filteredJd = useMemo(() => {
    const term = jdLp.query.trim().toLowerCase();
    return jobDescs.filter((d) => {
      if (jdLp.filters.department && jdLp.filters.department !== 'all' && d.department !== jdLp.filters.department) return false;
      if (!term) return true;
      return (
        d.title.toLowerCase().includes(term) ||
        (d.department || '').toLowerCase().includes(term) ||
        (d.summary || '').toLowerCase().includes(term)
      );
    });
  }, [jobDescs, jdLp.query, jdLp.filters]);

  const rsTd = useRowSelection(filteredTd);
  const rsJd = useRowSelection(filteredJd);

  // Training doc CRUD
  const openNewTd = () => { setEditingTd(null); setTdForm(emptyTDocForm()); setShowTdModal(true); };
  const openEditTd = (d: TrainingDoc) => {
    setEditingTd(d);
    setTdForm({
      title: d.title, category: d.category || '', department: d.department || '',
      role_template_id: d.role_template_id || '', link_url: d.link_url || '', description: d.description || '',
    });
    setShowTdModal(true);
  };
  const saveTd = async () => {
    if (!org) return;
    if (!tdForm.title.trim()) { alert('Title is required.'); return; }
    setTdBusy(true);
    try {
      if (editingTd) {
        const updated = await updateTrainingDoc(editingTd.id, {
          title: tdForm.title.trim(), category: tdForm.category.trim() || null,
          department: tdForm.department.trim() || null, role_template_id: tdForm.role_template_id || null,
          link_url: tdForm.link_url.trim() || null, description: tdForm.description.trim() || null,
        });
        qc.setQueryData<TrainingDoc[]>(qk.trainingDocs(org.id), (prev = []) =>
          prev.map((d) => (d.id === updated.id ? updated : d)));
      } else {
        const created = await createTrainingDoc({
          org_id: org.id, title: tdForm.title.trim(), category: tdForm.category.trim() || null,
          department: tdForm.department.trim() || null, role_template_id: tdForm.role_template_id || null,
          link_url: tdForm.link_url.trim() || null, description: tdForm.description.trim() || null,
          created_by: me?.id || null,
        });
        qc.setQueryData<TrainingDoc[]>(qk.trainingDocs(org.id), (prev = []) => [created, ...(prev || [])]);
      }
      setShowTdModal(false);
    } catch (e: any) { alert(e.message); } finally { setTdBusy(false); }
  };
  const removeTd = async (d: TrainingDoc) => {
    if (!org || !confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
    try {
      await deleteTrainingDoc({ id: d.id, doc_path: d.doc_path });
      qc.setQueryData<TrainingDoc[]>(qk.trainingDocs(org.id), (prev = []) => prev.filter((x) => x.id !== d.id));
    } catch (e: any) { alert(e.message); }
  };

  // Inline edit for TD: category field calls updateTrainingDoc
  const onInlineEditTd = async (doc: TrainingDoc, colId: string, value: string) => {
    if (!org) return;
    try {
      const updated = await updateTrainingDoc(doc.id, { [colId]: value || null });
      qc.setQueryData<TrainingDoc[]>(qk.trainingDocs(org.id), (prev = []) =>
        prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (e: any) { alert(e.message); }
  };

  // JD CRUD
  const openNewJd = () => { setEditingJd(null); setJdForm(emptyJDForm()); setShowJdModal(true); };
  const openEditJd = (d: JobDescription) => {
    setEditingJd(d);
    setJdForm({
      title: d.title, department: d.department || '', role_template_id: d.role_template_id || '',
      summary: d.summary || '', responsibilities: d.responsibilities || '', requirements: d.requirements || '',
    });
    setShowJdModal(true);
  };
  const saveJd = async () => {
    if (!org) return;
    if (!jdForm.title.trim()) { alert('Title is required.'); return; }
    setJdBusy(true);
    try {
      if (editingJd) {
        const updated = await updateJobDescription(editingJd.id, {
          title: jdForm.title.trim(), department: jdForm.department.trim() || null,
          role_template_id: jdForm.role_template_id || null, summary: jdForm.summary.trim() || null,
          responsibilities: jdForm.responsibilities.trim() || null, requirements: jdForm.requirements.trim() || null,
        });
        qc.setQueryData<JobDescription[]>(qk.jobDescriptions(org.id), (prev = []) =>
          prev.map((d) => (d.id === updated.id ? updated : d)));
      } else {
        const created = await createJobDescription({
          org_id: org.id, title: jdForm.title.trim(), department: jdForm.department.trim() || null,
          role_template_id: jdForm.role_template_id || null, summary: jdForm.summary.trim() || null,
          responsibilities: jdForm.responsibilities.trim() || null, requirements: jdForm.requirements.trim() || null,
          created_by: me?.id || null,
        });
        qc.setQueryData<JobDescription[]>(qk.jobDescriptions(org.id), (prev = []) => [created, ...(prev || [])]);
      }
      setShowJdModal(false);
    } catch (e: any) { alert(e.message); } finally { setJdBusy(false); }
  };
  const removeJd = async (d: JobDescription) => {
    if (!org || !confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
    try {
      await deleteJobDescription({ id: d.id, doc_path: d.doc_path });
      qc.setQueryData<JobDescription[]>(qk.jobDescriptions(org.id), (prev = []) => prev.filter((x) => x.id !== d.id));
    } catch (e: any) { alert(e.message); }
  };

  // Inline edit for JD: department field
  const onInlineEditJd = async (jd: JobDescription, colId: string, value: string) => {
    if (!org) return;
    try {
      const updated = await updateJobDescription(jd.id, { [colId]: value || null });
      qc.setQueryData<JobDescription[]>(qk.jobDescriptions(org.id), (prev = []) =>
        prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (e: any) { alert(e.message); }
  };

  // Group metas derived from actual data
  const tdGroups: GroupMeta[] = useMemo(() =>
    tdCategories.map((c) => ({ value: c, label: titleCase(c), pill: 'pill-gray' })),
    [tdCategories]
  );
  const jdGroups: GroupMeta[] = useMemo(() =>
    jdDepartments.map((d) => ({ value: d, label: titleCase(d) })),
    [jdDepartments]
  );

  const tdEditable: Record<string, EditSpec> = {
    category: { type: 'text' },
  };
  const jdEditable: Record<string, EditSpec> = {
    department: { type: 'text' },
  };

  // Cell renderers
  const tdCell = (id: string, doc: TrainingDoc) => {
    switch (id) {
      case 'title': return (<><p className="font-medium text-content truncate">{doc.title}</p>{doc.description && <p className="text-2xs text-muted truncate mt-0.5">{doc.description}</p>}</>);
      case 'category': return doc.category ? <span className="pill pill-gray">{doc.category}</span> : <span className="text-muted2">—</span>;
      case 'department': return <span className="text-sm text-muted">{doc.department || '—'}</span>;
      case 'role': return <span className="text-sm text-muted">{doc.role_template?.name || '—'}</span>;
      case 'file': return <HrFileChip table="training_docs" row={doc} admin={admin} onUpdated={(updated) => qc.setQueryData<TrainingDoc[]>(qk.trainingDocs(org?.id), (prev = []) => prev.map((d) => (d.id === updated.id ? (updated as TrainingDoc) : d)))} />;
      case 'added': return <span className="text-2xs text-muted tabular-nums">{doc.created_at ? doc.created_at.slice(0, 10) : '—'}</span>;
      case 'actions': return admin ? (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button className="btn-ghost p-1.5" title="Edit" onClick={() => openEditTd(doc)}><Icon name="ti-pencil" /></button>
          <button className="btn-ghost p-1.5 text-rose-500" title="Delete" onClick={() => removeTd(doc)}><Icon name="ti-trash" /></button>
        </div>
      ) : null;
      default: return null;
    }
  };

  const jdCell = (id: string, jd: JobDescription) => {
    switch (id) {
      case 'title': return (
        <div className="flex items-center gap-1.5">
          <Icon name={expandedJd === jd.id ? 'ti-chevron-down' : 'ti-chevron-right'} className="text-muted2 text-xs shrink-0" />
          <p className="font-medium text-content truncate">{jd.title}</p>
        </div>
      );
      case 'department': return <span className="text-sm text-muted">{jd.department || '—'}</span>;
      case 'role': return <span className="text-sm text-muted">{jd.role_template?.name || '—'}</span>;
      case 'file': return <HrFileChip table="job_descriptions" row={jd} admin={admin} onUpdated={(updated) => qc.setQueryData<JobDescription[]>(qk.jobDescriptions(org?.id), (prev = []) => prev.map((d) => (d.id === updated.id ? (updated as JobDescription) : d)))} />;
      case 'added': return <span className="text-2xs text-muted tabular-nums">{jd.created_at ? jd.created_at.slice(0, 10) : '—'}</span>;
      case 'actions': return admin ? (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button className="btn-ghost p-1.5" title="Edit" onClick={() => openEditJd(jd)}><Icon name="ti-pencil" /></button>
          <button className="btn-ghost p-1.5 text-rose-500" title="Delete" onClick={() => removeJd(jd)}><Icon name="ti-trash" /></button>
        </div>
      ) : null;
      default: return null;
    }
  };

  // BulkBar CSV export helpers
  const exportTdSelected = () => {
    const esc = (v: any) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const heads = ['Title', 'Category', 'Department', 'Role', 'Added'];
    const rows = rsTd.selected.map((d) => [d.title, d.category, d.department, d.role_template?.name, d.created_at?.slice(0, 10)]);
    const csv = heads.join(',') + '\n' + rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'training-docs-selected.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const exportJdSelected = () => {
    const esc = (v: any) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const heads = ['Title', 'Department', 'Role', 'Added'];
    const rows = rsJd.selected.map((d) => [d.title, d.department, d.role_template?.name, d.created_at?.slice(0, 10)]);
    const csv = heads.join(',') + '\n' + rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'job-descriptions-selected.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const bulkDeleteTd = async () => {
    if (!rsTd.count || !confirm(`Delete ${rsTd.count} training doc${rsTd.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    try { for (const d of rsTd.selected) await deleteTrainingDoc({ id: d.id, doc_path: d.doc_path }); rsTd.clear(); }
    catch (e: any) { alert(e.message); }
  };
  const bulkDeleteJd = async () => {
    if (!rsJd.count || !confirm(`Delete ${rsJd.count} job description${rsJd.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    try { for (const d of rsJd.selected) await deleteJobDescription({ id: d.id, doc_path: d.doc_path }); rsJd.clear(); }
    catch (e: any) { alert(e.message); }
  };

  const isLoading = loadingTd || loadingJd;

  return (
    <Layout flat title="Training & JDs">
      <PageHeader help="hr"
        title="Training & Job Descriptions"
        subtitle="Manage training materials and job description documents for your organisation."
        action={
          admin ? (
            tab === 'training' ? (
              <button className="btn btn-primary" onClick={openNewTd}>
                <Icon name="ti-plus" /> New document
              </button>
            ) : (
              <button className="btn btn-primary" onClick={openNewJd}>
                <Icon name="ti-plus" /> New JD
              </button>
            )
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Training docs" value={String(trainingDocs.length)} hint="All materials" icon="ti-school" />
        <StatCard label="With files" value={String(withFiles)} hint="Have an uploaded file" icon="ti-file-text" />
        <StatCard label="Job descriptions" value={String(jobDescs.length)} hint="All JDs" icon="ti-briefcase" />
        <StatCard label="Departments" value={String(allDepts)} hint="Across all docs" icon="ti-building" />
      </div>

      <div className="flex gap-1 mb-4 border-b border-line">
        {([['training', 'Training docs'], ['jd', 'Job descriptions']] as [TabKey, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === k ? 'border-accent text-content font-medium' : 'border-transparent text-muted hover:text-content'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'training' && (
        <>
          {/* Toolbar + Group-by control */}
          <div className="flex items-end gap-2 flex-wrap mb-4">
            <div className="flex-1 min-w-0">
              <ListToolbar prefs={tdLp} cols={TD_COLS} filters={TD_FILTERS} placeholder="Search training docs…" />
            </div>
            <div className="flex items-center gap-1.5 mb-[1px] pb-0.5">
              <span className="text-2xs text-muted2 uppercase tracking-wide mr-0.5">Group by</span>
              <button
                onClick={() => setTdGroupBy('category')}
                className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${tdGroupBy === 'category' ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}
              >
                Category
              </button>
              <button
                onClick={() => setTdGroupBy('none')}
                className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${tdGroupBy === 'none' ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}
              >
                None
              </button>
            </div>
          </div>

          <BulkBar count={rsTd.count} onClear={rsTd.clear}>
            <button onClick={exportTdSelected} className="btn h-8 text-xs"><Icon name="ti-download" className="text-xs" />Export</button>
            {admin && <button onClick={bulkDeleteTd} className="btn h-8 text-xs text-rose-600"><Icon name="ti-trash" className="text-xs" />Delete</button>}
          </BulkBar>

          {isLoading ? (
            <div className="card p-8"><Spinner /></div>
          ) : filteredTd.length === 0 ? (
            <div className="card p-5">
              <EmptyState icon="ti-school" text={tdLp.query || tdLp.activeCount ? 'No docs match your filters.' : 'No training docs yet — add the first one.'} />
            </div>
          ) : (
            <DataList
              rows={filteredTd}
              rowKey={(d) => d.id}
              cols={TD_COLS}
              prefs={tdLp}
              cell={tdCell}
              selection={rsTd}
              groupBy={tdGroupBy}
              groupOf={(d) => d.category || ''}
              groups={tdGroups}
              editable={tdEditable}
              rawValue={(id, d) => id === 'category' ? (d.category || '') : ''}
              onEdit={onInlineEditTd}
            />
          )}
        </>
      )}

      {tab === 'jd' && (
        <>
          {/* Toolbar + Group-by control */}
          <div className="flex items-end gap-2 flex-wrap mb-4">
            <div className="flex-1 min-w-0">
              <ListToolbar prefs={jdLp} cols={JD_COLS} filters={JD_FILTERS} placeholder="Search job descriptions…" />
            </div>
            <div className="flex items-center gap-1.5 mb-[1px] pb-0.5">
              <span className="text-2xs text-muted2 uppercase tracking-wide mr-0.5">Group by</span>
              <button
                onClick={() => setJdGroupBy('department')}
                className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${jdGroupBy === 'department' ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}
              >
                Department
              </button>
              <button
                onClick={() => setJdGroupBy('none')}
                className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${jdGroupBy === 'none' ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}
              >
                None
              </button>
            </div>
          </div>

          <BulkBar count={rsJd.count} onClear={rsJd.clear}>
            <button onClick={exportJdSelected} className="btn h-8 text-xs"><Icon name="ti-download" className="text-xs" />Export</button>
            {admin && <button onClick={bulkDeleteJd} className="btn h-8 text-xs text-rose-600"><Icon name="ti-trash" className="text-xs" />Delete</button>}
          </BulkBar>

          {isLoading ? (
            <div className="card p-8"><Spinner /></div>
          ) : filteredJd.length === 0 ? (
            <div className="card p-5">
              <EmptyState icon="ti-briefcase" text={jdLp.query || jdLp.activeCount ? 'No JDs match your filters.' : 'No job descriptions yet — add the first one.'} />
            </div>
          ) : (
            <>
              <DataList
                rows={filteredJd}
                rowKey={(d) => d.id}
                cols={JD_COLS}
                prefs={jdLp}
                cell={jdCell}
                onRowClick={(jd) => setExpandedJd(expandedJd === jd.id ? null : jd.id)}
                selection={rsJd}
                groupBy={jdGroupBy}
                groupOf={(d) => d.department || ''}
                groups={jdGroups}
                editable={jdEditable}
                rawValue={(id, d) => id === 'department' ? (d.department || '') : ''}
                onEdit={onInlineEditJd}
              />
              {/* Expanded JD detail panel */}
              {expandedJd && (() => {
                const jd = filteredJd.find((d) => d.id === expandedJd);
                if (!jd) return null;
                return (
                  <div className="card border border-line/40 px-8 py-4 mt-1">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-content">{jd.title}</p>
                      <button onClick={() => setExpandedJd(null)} className="text-muted hover:text-content"><Icon name="ti-x" /></button>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-4 text-sm">
                      {jd.summary && (
                        <div>
                          <p className="text-2xs text-muted2 uppercase tracking-wide mb-1 font-medium">Summary</p>
                          <p className="text-muted whitespace-pre-wrap">{jd.summary}</p>
                        </div>
                      )}
                      {jd.responsibilities && (
                        <div>
                          <p className="text-2xs text-muted2 uppercase tracking-wide mb-1 font-medium">Responsibilities</p>
                          <p className="text-muted whitespace-pre-wrap">{jd.responsibilities}</p>
                        </div>
                      )}
                      {jd.requirements && (
                        <div>
                          <p className="text-2xs text-muted2 uppercase tracking-wide mb-1 font-medium">Requirements</p>
                          <p className="text-muted whitespace-pre-wrap">{jd.requirements}</p>
                        </div>
                      )}
                      {!jd.summary && !jd.responsibilities && !jd.requirements && (
                        <p className="text-muted2 text-sm col-span-3">No details recorded yet.</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}

      <TdModal
        open={showTdModal}
        editing={editingTd}
        form={tdForm}
        setForm={setTdForm}
        busy={tdBusy}
        roleTemplates={roleTemplates}
        onClose={() => setShowTdModal(false)}
        onSubmit={saveTd}
      />

      <JdModal
        open={showJdModal}
        editing={editingJd}
        form={jdForm}
        setForm={setJdForm}
        busy={jdBusy}
        roleTemplates={roleTemplates}
        onClose={() => setShowJdModal(false)}
        onSubmit={saveJd}
      />
    </Layout>
  );
}


// ---------------------------------------------------------------------------
// TdModal — Training document modal (tabbed: Basics / Source)
// ---------------------------------------------------------------------------
function TdModal({ open, editing, form, setForm, busy, roleTemplates, onClose, onSubmit }: {
  open: boolean;
  editing: TrainingDoc | null;
  form: TDocForm;
  setForm: React.Dispatch<React.SetStateAction<TDocForm>>;
  busy: boolean;
  roleTemplates: RoleTemplate[];
  onClose: () => void;
  onSubmit: () => void;
}) {
  const tabs = useModalTabs('basics');
  const submit = () => {
    if (!form.title.trim()) { tabs.setTab('basics'); return; }
    onSubmit();
  };
  return (
    <Modal
      open={open} onClose={onClose}
      title={editing ? 'Edit training document' : 'New training document'}
      subtitle={editing ? editing.title : 'Add a training resource for your organisation'}
      icon="ti-school" size="md"
      tabs={[
        { key: 'basics', label: 'Basics', icon: 'ti-id-badge-2' },
        { key: 'source', label: 'Source', icon: 'ti-link' },
      ]}
      {...tabs.bind}
      onSubmit={() => { if (!busy) submit(); }}
      footer={
        <>
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">↵ to save</span>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add document'}
          </button>
        </>
      }
    >
      {tabs.tab === 'basics' && (
        <div className="flex flex-col gap-4">
          <Field label="Title" required>
            <input className="input w-full" placeholder="Document title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} autoFocus />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Category">
              <input className="input w-full" placeholder="e.g. Safety, Compliance" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </Field>
            <Field label="Department">
              <input className="input w-full" placeholder="e.g. Engineering, HR" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
            </Field>
          </div>
          {roleTemplates.length > 0 && (
            <Field label="Role template">
              <div className="w-full"><Select value={form.role_template_id} onChange={(v) => setForm((f) => ({ ...f, role_template_id: v }))} options={[{ value: '', label: 'None' }, ...roleTemplates.map((r) => ({ value: r.id, label: r.name }))]} /></div>
            </Field>
          )}
          <Field label="Description">
            <textarea className="input w-full" rows={3} placeholder="Brief description of this document" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
        </div>
      )}
      {tabs.tab === 'source' && (
        <div className="flex flex-col gap-4">
          <Field label="Link URL" hint="External resource (optional; overridden by an uploaded file)">
            <input className="input w-full" placeholder="https://…" value={form.link_url} onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))} autoFocus />
          </Field>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// JdModal — Job description modal (tabbed: Basics / Content)
// ---------------------------------------------------------------------------
function JdModal({ open, editing, form, setForm, busy, roleTemplates, onClose, onSubmit }: {
  open: boolean;
  editing: JobDescription | null;
  form: JDForm;
  setForm: React.Dispatch<React.SetStateAction<JDForm>>;
  busy: boolean;
  roleTemplates: RoleTemplate[];
  onClose: () => void;
  onSubmit: () => void;
}) {
  const tabs = useModalTabs('basics');
  const submit = () => {
    if (!form.title.trim()) { tabs.setTab('basics'); return; }
    onSubmit();
  };
  return (
    <Modal
      open={open} onClose={onClose}
      title={editing ? 'Edit job description' : 'New job description'}
      subtitle={editing ? editing.title : 'Add a job description for your organisation'}
      icon="ti-briefcase" size="md"
      tabs={[
        { key: 'basics', label: 'Basics', icon: 'ti-id-badge-2' },
        { key: 'content', label: 'Content', icon: 'ti-article' },
      ]}
      {...tabs.bind}
      onSubmit={() => { if (!busy) submit(); }}
      footer={
        <>
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">↵ to save</span>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add JD'}
          </button>
        </>
      }
    >
      {tabs.tab === 'basics' && (
        <div className="flex flex-col gap-4">
          <Field label="Title" required>
            <input className="input w-full" placeholder="Job title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} autoFocus />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Department">
              <input className="input w-full" placeholder="e.g. Engineering" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
            </Field>
            {roleTemplates.length > 0 && (
              <Field label="Role template">
                <div className="w-full"><Select value={form.role_template_id} onChange={(v) => setForm((f) => ({ ...f, role_template_id: v }))} options={[{ value: '', label: 'None' }, ...roleTemplates.map((r) => ({ value: r.id, label: r.name }))]} /></div>
              </Field>
            )}
          </div>
        </div>
      )}
      {tabs.tab === 'content' && (
        <div className="flex flex-col gap-4">
          <Field label="Summary">
            <textarea className="input w-full" rows={2} placeholder="Brief role overview" value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} autoFocus />
          </Field>
          <Field label="Responsibilities">
            <textarea className="input w-full" rows={3} placeholder="Key responsibilities…" value={form.responsibilities} onChange={(e) => setForm((f) => ({ ...f, responsibilities: e.target.value }))} />
          </Field>
          <Field label="Requirements">
            <textarea className="input w-full" rows={3} placeholder="Skills, experience, qualifications…" value={form.requirements} onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// HrFileChip
// ---------------------------------------------------------------------------
type HrTable = 'training_docs' | 'job_descriptions';

function HrFileChip({
  table, row, admin, onUpdated,
}: {
  table: HrTable;
  row: TrainingDoc | JobDescription;
  admin: boolean;
  onUpdated: (updated: TrainingDoc | JobDescription) => void;
}) {
  const [busy, setBusy] = useState(false);

  const openFile = async () => {
    if (!row.doc_path) return;
    setBusy(true);
    try { window.open(await getTrainingDocUrl(row.doc_path), '_blank'); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      setBusy(true);
      try { onUpdated(await uploadHrDoc(table, { id: row.id, org_id: row.org_id }, file)); }
      catch (e: any) { alert(e.message); } finally { setBusy(false); }
    };
    input.click();
  };

  const remove = async () => {
    if (!confirm('Remove this file?')) return;
    setBusy(true);
    try { onUpdated(await removeHrDoc(table, { id: row.id, doc_path: row.doc_path })); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  if (row.doc_path) {
    return (
      <span className="inline-flex items-center gap-1 shrink-0">
        <button onClick={openFile} disabled={busy} title={row.doc_name || 'View file'}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 text-accentstrong text-2xs max-w-[10rem]">
          <Icon name="ti-file-text" className="text-xs shrink-0" />
          <span className="truncate">{row.doc_name || 'file'}</span>
        </button>
        {admin && (
          <button onClick={remove} disabled={busy} title="Remove file" className="text-muted2 hover:text-rose-500">
            <Icon name="ti-x" className="text-xs" />
          </button>
        )}
      </span>
    );
  }

  if (row.link_url) {
    return (
      <button onClick={() => window.open(row.link_url!, '_blank')} title={row.link_url}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-line text-2xs text-muted hover:text-accentstrong hover:border-accent max-w-[10rem]">
        <Icon name="ti-external-link" className="text-xs shrink-0" />
        <span className="truncate">Link</span>
      </button>
    );
  }

  if (admin) {
    return (
      <button onClick={pick} disabled={busy} title="Upload file"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-line text-2xs text-muted hover:text-content hover:border-accent">
        <Icon name="ti-upload" className="text-xs" />
        {busy ? 'Uploading…' : 'Upload'}
      </button>
    );
  }

  return <span className="text-muted2 text-2xs">—</span>;
}

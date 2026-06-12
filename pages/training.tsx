import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, StatCard, Icon } from '@/components/ui';
import { usePagination, Pagination } from '@/components/Pagination';
import { Modal, Field } from '@/components/Modal';
import { useTrainingDocs, useJobDescriptions } from '@/lib/queries';
import {
  createTrainingDoc, updateTrainingDoc, deleteTrainingDoc,
  createJobDescription, updateJobDescription, deleteJobDescription,
  uploadHrDoc, removeHrDoc, getTrainingDocUrl,
  listRoleTemplates,
} from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useActiveOrg, useAuthStore } from '@/lib/store';
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
  const [tdQ, setTdQ] = useState('');
  const [tdCatFilter, setTdCatFilter] = useState('');
  const [showTdModal, setShowTdModal] = useState(false);
  const [editingTd, setEditingTd] = useState<TrainingDoc | null>(null);
  const [tdForm, setTdForm] = useState<TDocForm>(emptyTDocForm());
  const [tdBusy, setTdBusy] = useState(false);

  // JD state
  const [jdQ, setJdQ] = useState('');
  const [jdDeptFilter, setJdDeptFilter] = useState('');
  const [showJdModal, setShowJdModal] = useState(false);
  const [editingJd, setEditingJd] = useState<JobDescription | null>(null);
  const [jdForm, setJdForm] = useState<JDForm>(emptyJDForm());
  const [jdBusy, setJdBusy] = useState(false);
  const [expandedJd, setExpandedJd] = useState<string | null>(null);

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

  const filteredTd = useMemo(() => {
    const term = tdQ.trim().toLowerCase();
    return trainingDocs.filter((d) => {
      if (tdCatFilter && d.category !== tdCatFilter) return false;
      if (!term) return true;
      return (
        d.title.toLowerCase().includes(term) ||
        (d.description || '').toLowerCase().includes(term) ||
        (d.category || '').toLowerCase().includes(term) ||
        (d.department || '').toLowerCase().includes(term)
      );
    });
  }, [trainingDocs, tdQ, tdCatFilter]);

  const filteredJd = useMemo(() => {
    const term = jdQ.trim().toLowerCase();
    return jobDescs.filter((d) => {
      if (jdDeptFilter && d.department !== jdDeptFilter) return false;
      if (!term) return true;
      return (
        d.title.toLowerCase().includes(term) ||
        (d.department || '').toLowerCase().includes(term) ||
        (d.summary || '').toLowerCase().includes(term)
      );
    });
  }, [jobDescs, jdQ, jdDeptFilter]);

  const pgTd = usePagination(filteredTd, 25);
  const pgJd = usePagination(filteredJd, 25);

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

  const isLoading = loadingTd || loadingJd;

  return (
    <Layout title="Training & JDs">
      <PageHeader
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
        <div className="card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 border-b border-line">
            <div className="relative flex-1 max-w-xs">
              <Icon name="ti-search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted2" />
              <input className="input pl-8 w-full" placeholder="Search training docs…" value={tdQ} onChange={(e) => setTdQ(e.target.value)} />
            </div>
            <select className="input w-auto" value={tdCatFilter} onChange={(e) => setTdCatFilter(e.target.value)}>
              <option value="">All categories</option>
              {tdCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {isLoading ? (
            <div className="p-8"><Spinner /></div>
          ) : filteredTd.length === 0 ? (
            <div className="p-5">
              <EmptyState icon="ti-school" text={tdQ || tdCatFilter ? 'No docs match your filters.' : 'No training docs yet — add the first one.'} />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Title</th>
                      <th className="th">Category</th>
                      <th className="th">Department</th>
                      <th className="th">Role</th>
                      <th className="th">File / Link</th>
                      <th className="th">Added</th>
                      <th className="th w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pgTd.pageItems.map((doc) => (
                      <tr key={doc.id} className="row">
                        <td className="td max-w-xs">
                          <p className="font-medium text-content truncate">{doc.title}</p>
                          {doc.description && <p className="text-2xs text-muted truncate mt-0.5">{doc.description}</p>}
                        </td>
                        <td className="td">
                          {doc.category ? <span className="pill pill-gray">{doc.category}</span> : <span className="text-muted2">—</span>}
                        </td>
                        <td className="td text-sm text-muted">{doc.department || <span className="text-muted2">—</span>}</td>
                        <td className="td text-sm text-muted">{doc.role_template?.name || <span className="text-muted2">—</span>}</td>
                        <td className="td">
                          <HrFileChip
                            table="training_docs" row={doc} admin={admin}
                            onUpdated={(updated) =>
                              qc.setQueryData<TrainingDoc[]>(qk.trainingDocs(org?.id), (prev = []) =>
                                prev.map((d) => (d.id === updated.id ? (updated as TrainingDoc) : d)))}
                          />
                        </td>
                        <td className="td text-2xs text-muted tabular-nums">{doc.created_at ? doc.created_at.slice(0, 10) : '—'}</td>
                        <td className="td">
                          {admin && (
                            <div className="flex items-center justify-end gap-1">
                              <button className="btn-ghost p-1.5" title="Edit" onClick={() => openEditTd(doc)}><Icon name="ti-pencil" /></button>
                              <button className="btn-ghost p-1.5 text-rose-500" title="Delete" onClick={() => removeTd(doc)}><Icon name="ti-trash" /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={pgTd.page} pageCount={pgTd.pageCount} total={pgTd.total} start={pgTd.start} end={pgTd.end} onPage={pgTd.setPage} />
            </>
          )}
        </div>
      )}

      {tab === 'jd' && (
        <div className="card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 border-b border-line">
            <div className="relative flex-1 max-w-xs">
              <Icon name="ti-search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted2" />
              <input className="input pl-8 w-full" placeholder="Search job descriptions…" value={jdQ} onChange={(e) => setJdQ(e.target.value)} />
            </div>
            <select className="input w-auto" value={jdDeptFilter} onChange={(e) => setJdDeptFilter(e.target.value)}>
              <option value="">All departments</option>
              {jdDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {isLoading ? (
            <div className="p-8"><Spinner /></div>
          ) : filteredJd.length === 0 ? (
            <div className="p-5">
              <EmptyState icon="ti-briefcase" text={jdQ || jdDeptFilter ? 'No JDs match your filters.' : 'No job descriptions yet — add the first one.'} />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Title</th>
                      <th className="th">Department</th>
                      <th className="th">Role</th>
                      <th className="th">File</th>
                      <th className="th">Added</th>
                      <th className="th w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pgJd.pageItems.map((jd) => (
                      <>
                        <tr key={jd.id} className="row cursor-pointer" onClick={() => setExpandedJd(expandedJd === jd.id ? null : jd.id)}>
                          <td className="td max-w-xs">
                            <div className="flex items-center gap-1.5">
                              <Icon name={expandedJd === jd.id ? 'ti-chevron-down' : 'ti-chevron-right'} className="text-muted2 text-xs shrink-0" />
                              <p className="font-medium text-content truncate">{jd.title}</p>
                            </div>
                          </td>
                          <td className="td text-sm text-muted">{jd.department || <span className="text-muted2">—</span>}</td>
                          <td className="td text-sm text-muted">{jd.role_template?.name || <span className="text-muted2">—</span>}</td>
                          <td className="td" onClick={(e) => e.stopPropagation()}>
                            <HrFileChip
                              table="job_descriptions" row={jd} admin={admin}
                              onUpdated={(updated) =>
                                qc.setQueryData<JobDescription[]>(qk.jobDescriptions(org?.id), (prev = []) =>
                                  prev.map((d) => (d.id === updated.id ? (updated as JobDescription) : d)))}
                            />
                          </td>
                          <td className="td text-2xs text-muted tabular-nums">{jd.created_at ? jd.created_at.slice(0, 10) : '—'}</td>
                          <td className="td" onClick={(e) => e.stopPropagation()}>
                            {admin && (
                              <div className="flex items-center justify-end gap-1">
                                <button className="btn-ghost p-1.5" title="Edit" onClick={() => openEditJd(jd)}><Icon name="ti-pencil" /></button>
                                <button className="btn-ghost p-1.5 text-rose-500" title="Delete" onClick={() => removeJd(jd)}><Icon name="ti-trash" /></button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {expandedJd === jd.id && (
                          <tr key={`${jd.id}-expand`} className="bg-surface2/50">
                            <td colSpan={6} className="px-8 py-3">
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
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={pgJd.page} pageCount={pgJd.pageCount} total={pgJd.total} start={pgJd.start} end={pgJd.end} onPage={pgJd.setPage} />
            </>
          )}
        </div>
      )}

      <Modal
        open={showTdModal} onClose={() => setShowTdModal(false)} onSubmit={saveTd}
        title={editingTd ? 'Edit training document' : 'New training document'}
        subtitle={editingTd ? editingTd.title : 'Add a training resource for your organisation'}
        icon="ti-school" size="md"
        footer={
          <>
            <button className="btn" onClick={() => setShowTdModal(false)} disabled={tdBusy}>Cancel</button>
            <button className="btn btn-primary" onClick={saveTd} disabled={tdBusy}>
              {tdBusy ? 'Saving…' : editingTd ? 'Save changes' : 'Add document'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Title" required>
            <input className="input w-full" placeholder="Document title" value={tdForm.title} onChange={(e) => setTdForm((f) => ({ ...f, title: e.target.value }))} autoFocus />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Category">
              <input className="input w-full" placeholder="e.g. Safety, Compliance" value={tdForm.category} onChange={(e) => setTdForm((f) => ({ ...f, category: e.target.value }))} />
            </Field>
            <Field label="Department">
              <input className="input w-full" placeholder="e.g. Engineering, HR" value={tdForm.department} onChange={(e) => setTdForm((f) => ({ ...f, department: e.target.value }))} />
            </Field>
          </div>
          {roleTemplates.length > 0 && (
            <Field label="Role template">
              <select className="input w-full" value={tdForm.role_template_id} onChange={(e) => setTdForm((f) => ({ ...f, role_template_id: e.target.value }))}>
                <option value="">None</option>
                {roleTemplates.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Link URL" hint="External resource (optional; overridden by an uploaded file)">
            <input className="input w-full" placeholder="https://…" value={tdForm.link_url} onChange={(e) => setTdForm((f) => ({ ...f, link_url: e.target.value }))} />
          </Field>
          <Field label="Description">
            <textarea className="input w-full" rows={3} placeholder="Brief description of this document" value={tdForm.description} onChange={(e) => setTdForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={showJdModal} onClose={() => setShowJdModal(false)} onSubmit={saveJd}
        title={editingJd ? 'Edit job description' : 'New job description'}
        subtitle={editingJd ? editingJd.title : 'Add a job description for your organisation'}
        icon="ti-briefcase" size="md"
        footer={
          <>
            <button className="btn" onClick={() => setShowJdModal(false)} disabled={jdBusy}>Cancel</button>
            <button className="btn btn-primary" onClick={saveJd} disabled={jdBusy}>
              {jdBusy ? 'Saving…' : editingJd ? 'Save changes' : 'Add JD'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Title" required>
            <input className="input w-full" placeholder="Job title" value={jdForm.title} onChange={(e) => setJdForm((f) => ({ ...f, title: e.target.value }))} autoFocus />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Department">
              <input className="input w-full" placeholder="e.g. Engineering" value={jdForm.department} onChange={(e) => setJdForm((f) => ({ ...f, department: e.target.value }))} />
            </Field>
            {roleTemplates.length > 0 && (
              <Field label="Role template">
                <select className="input w-full" value={jdForm.role_template_id} onChange={(e) => setJdForm((f) => ({ ...f, role_template_id: e.target.value }))}>
                  <option value="">None</option>
                  {roleTemplates.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
            )}
          </div>
          <Field label="Summary">
            <textarea className="input w-full" rows={2} placeholder="Brief role overview" value={jdForm.summary} onChange={(e) => setJdForm((f) => ({ ...f, summary: e.target.value }))} />
          </Field>
          <Field label="Responsibilities">
            <textarea className="input w-full" rows={3} placeholder="Key responsibilities…" value={jdForm.responsibilities} onChange={(e) => setJdForm((f) => ({ ...f, responsibilities: e.target.value }))} />
          </Field>
          <Field label="Requirements">
            <textarea className="input w-full" rows={3} placeholder="Skills, experience, qualifications…" value={jdForm.requirements} onChange={(e) => setJdForm((f) => ({ ...f, requirements: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </Layout>
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

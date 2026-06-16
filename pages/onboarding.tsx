import { useEffect, useMemo, useState } from 'react';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import {
  getOnboardingTemplates, createOnboardingTemplate, deleteOnboardingTemplate,
  addTemplateItem, deleteTemplateItem,
  getOnboardingTasks, assignOnboarding, addOnboardingTask, setOnboardingTaskStatus, deleteOnboardingTask,
  uploadOnboardingDoc, getOnboardingDocUrl, removeOnboardingDoc,
  getOrgUsers, getTrainingDocs, getTrainingDocUrl,
} from '@/lib/db';
import { OnboardingTemplate, OnboardingTask, OrgUser, TrainingDoc } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

type Tab = 'hires' | 'templates';

export default function OnboardingPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const admin = can.manageMembers(org);

  const [tab, setTab] = useState<Tab>('hires');
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [people, setPeople] = useState<OrgUser[]>([]);
  const [docs, setDocs] = useState<TrainingDoc[]>([]);
  const [busy, setBusy] = useState(false);

  // modals
  const [showAssign, setShowAssign] = useState(false);
  const [showTmpl, setShowTmpl] = useState(false);

  useEffect(() => {
    Promise.all([getOnboardingTemplates(), getOnboardingTasks(), getOrgUsers(), getTrainingDocs().catch(() => [])])
      .then(([t, k, p, d]) => { setTemplates(t); setTasks(k); setPeople(p); setDocs(d); })
      .finally(() => setLoading(false));
  }, [org?.id]);

  // group tasks per hire
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; rows: OnboardingTask[] }>();
    for (const t of tasks) {
      const g = m.get(t.user_id) || { name: t.hire?.full_name || 'Unknown', rows: [] };
      g.rows.push(t); m.set(t.user_id, g);
    }
    return Array.from(m.entries()).map(([user_id, g]) => ({ user_id, ...g }));
  }, [tasks]);

  const toggle = async (t: OnboardingTask) => {
    const next = t.status === 'Done' ? 'Pending' : 'Done';
    setBusy(true);
    try { const r = await setOnboardingTaskStatus(t.id, next); setTasks((p) => p.map((x) => (x.id === r.id ? r : x))); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const removeTask = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try { await deleteOnboardingTask(id); setTasks((p) => p.filter((x) => x.id !== id)); }
    catch (e: any) { alert(e.message); }
  };

  return (
    <Layout flat title="Onboarding">
      <PageHeader title="Employee Onboarding" subtitle="Checklists for new hires, built from reusable templates"
        action={admin ? (
          <div className="flex gap-2">
            {tab === 'hires'
              ? <button onClick={() => setShowAssign(true)} className="btn btn-primary"><Icon name="ti-user-plus" />Onboard a hire</button>
              : <button onClick={() => setShowTmpl(true)} className="btn btn-primary"><Icon name="ti-plus" />New template</button>}
          </div>
        ) : undefined} />

      <div className="flex gap-1 mb-4 border-b border-line">
        {([['hires', 'Active onboarding'], ['templates', 'Templates']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === k ? 'border-accent text-content font-medium' : 'border-transparent text-muted hover:text-content'}`}>{label}</button>
        ))}
      </div>

      {loading ? <Spinner /> : tab === 'hires' ? (
        groups.length === 0 ? (
          <EmptyState icon="ti-user-plus" text={admin ? 'No active onboarding — onboard your first hire' : 'Nothing assigned to you yet'} />
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const done = g.rows.filter((r) => r.status === 'Done').length;
              const pct = g.rows.length ? Math.round((done / g.rows.length) * 100) : 0;
              return (
                <div key={g.user_id} className="card p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar name={g.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{g.name}</p>
                      <p className="text-2xs text-muted2">{done}/{g.rows.length} complete</p>
                    </div>
                    <span className={`pill ${pct === 100 ? 'pill-green' : 'pill-blue'}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface2 mb-3 overflow-hidden">
                    <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: pct === 100 ? '#10b981' : 'var(--brand-primary, #2D7FF9)' }} />
                  </div>
                  <div className="space-y-1">
                    {g.rows.map((t) => (
                      <div key={t.id} className="flex items-center gap-2.5 py-1 group">
                        <input type="checkbox" checked={t.status === 'Done'} disabled={busy} onChange={() => toggle(t)} className="accent-ink w-4 h-4 shrink-0" />
                        <span className={`text-sm flex-1 min-w-0 truncate ${t.status === 'Done' ? 'line-through text-muted2' : ''}`}>{t.title}</span>
                        <DocCell task={t} canUpload={admin || me?.id === t.user_id} orgId={org?.id || ''}
                          onChange={(r) => setTasks((p) => p.map((x) => (x.id === r.id ? r : x)))} />
                        <TrainingChip doc={t.training_doc} />
                        {t.due_date && <span className="text-2xs text-muted2 shrink-0">{t.due_date}</span>}
                        {t.assignee?.full_name && <span className="text-2xs text-muted2 shrink-0 hidden sm:inline">· {t.assignee.full_name}</span>}
                        {admin && <button onClick={() => removeTask(t.id)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500 shrink-0"><Icon name="ti-x" className="text-sm" /></button>}
                      </div>
                    ))}
                  </div>
                  {admin && <AddItemRow onAdd={async (title) => {
                    const r = await addOnboardingTask({ user_id: g.user_id, org_id: org!.id, title, created_by: me?.id, sort_order: g.rows.length });
                    setTasks((p) => [...p, r]);
                  }} />}
                </div>
              );
            })}
          </div>
        )
      ) : (
        !admin ? <EmptyState icon="ti-lock" text="Only org admins can manage templates" /> :
        templates.length === 0 ? <EmptyState icon="ti-list-check" text="No templates yet — create one to standardize onboarding" /> : (
          <div className="grid md:grid-cols-2 gap-3">
            {templates.map((t) => (
              <TemplateCard key={t.id} tmpl={t} orgId={org!.id} docs={docs}
                onItemsChange={(items) => setTemplates((p) => p.map((x) => (x.id === t.id ? { ...x, items } : x)))}
                onDelete={async () => { if (!confirm('Delete template?')) return; await deleteOnboardingTemplate(t.id); setTemplates((p) => p.filter((x) => x.id !== t.id)); }} />
            ))}
          </div>
        )
      )}

      {showAssign && (
        <AssignModal people={people} templates={templates} busy={busy}
          onClose={() => setShowAssign(false)}
          onSubmit={async (userId, tmplId, start) => {
            const tmpl = templates.find((t) => t.id === tmplId); if (!tmpl || !org) return;
            setBusy(true);
            try { const rows = await assignOnboarding({ user_id: userId, org_id: org.id, template: tmpl, created_by: me?.id, start_date: start || undefined }); setTasks(rows); setShowAssign(false); setTab('hires'); }
            catch (e: any) { alert(e.message); } finally { setBusy(false); }
          }} />
      )}

      {showTmpl && (
        <NewTemplateModal busy={busy} onClose={() => setShowTmpl(false)}
          onSubmit={async (name, desc) => {
            if (!org) return; setBusy(true);
            try { const t = await createOnboardingTemplate({ name, org_id: org.id, description: desc, created_by: me?.id }); setTemplates((p) => [t, ...p]); setShowTmpl(false); }
            catch (e: any) { alert(e.message); } finally { setBusy(false); }
          }} />
      )}
    </Layout>
  );
}

// ---- per-item document cell (upload / view / remove) -----------------------
// Storage RLS (bucket employee-docs) admits org owner/admin or the hire; the
// canUpload flag only mirrors that for UX.
function DocCell({ task, canUpload, orgId, onChange }: {
  task: OnboardingTask; canUpload: boolean; orgId: string; onChange: (t: OnboardingTask) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!task.requires_doc && !task.doc_path) return null;

  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      setBusy(true);
      try { onChange(await uploadOnboardingDoc(task, orgId, file)); }
      catch (e: any) { alert(e.message); } finally { setBusy(false); }
    };
    input.click();
  };
  const view = async () => {
    try { window.open(await getOnboardingDocUrl(task.doc_path!), '_blank'); }
    catch (e: any) { alert(e.message); }
  };
  const remove = async () => {
    if (!confirm('Remove this document?')) return;
    setBusy(true);
    try { onChange(await removeOnboardingDoc(task)); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  if (task.doc_path) return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <button onClick={view} title={task.doc_name || 'View document'}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 text-accentstrong text-2xs max-w-[9rem]">
        <Icon name="ti-file-check" className="text-xs" /><span className="truncate">{task.doc_name || 'document'}</span>
      </button>
      {canUpload && <button onClick={remove} disabled={busy} title="Remove document"
        className="text-muted2 hover:text-rose-500"><Icon name="ti-x" className="text-xs" /></button>}
    </span>
  );
  return canUpload ? (
    <button onClick={pick} disabled={busy} title="Upload required document"
      className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-line text-2xs text-muted hover:text-content hover:border-accent">
      <Icon name="ti-upload" className="text-xs" />{busy ? 'Uploading…' : 'Upload doc'}
    </button>
  ) : (
    <span className="shrink-0 inline-flex items-center gap-1 text-2xs text-amber-500" title="Document required">
      <Icon name="ti-paperclip" className="text-xs" />doc needed
    </span>
  );
}

// ---- inline add-item row (active checklist) -------------------------------
function AddItemRow({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => { if (!v.trim()) return; setBusy(true); try { await onAdd(v.trim()); setV(''); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };
  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-line">
      <Icon name="ti-plus" className="text-muted2 text-sm" />
      <input value={v} disabled={busy} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Add an item…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted2" />
    </div>
  );
}

// ---- template card with item editor ---------------------------------------
function TemplateCard({ tmpl, orgId, docs, onItemsChange, onDelete }:
  { tmpl: OnboardingTemplate; orgId: string; docs: TrainingDoc[]; onItemsChange: (items: OnboardingTemplate['items']) => void; onDelete: () => void }) {
  const items = tmpl.items || [];
  const [title, setTitle] = useState('');
  const [days, setDays] = useState('');
  const [needsDoc, setNeedsDoc] = useState(false);
  const [docId, setDocId] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!title.trim()) return; setBusy(true);
    try {
      const it = await addTemplateItem({ template_id: tmpl.id, org_id: orgId, title: title.trim(), sort_order: items.length, offset_days: parseInt(days) || 0, requires_doc: needsDoc, training_doc_id: docId || null });
      onItemsChange([...items, it]); setTitle(''); setDays(''); setNeedsDoc(false); setDocId('');
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    try { await deleteTemplateItem(id); onItemsChange(items.filter((x) => x.id !== id)); } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="card p-4">
      <div className="flex items-start gap-2 mb-3">
        <span className="w-9 h-9 rounded-md bg-surface2 grid place-items-center text-muted shrink-0"><Icon name="ti-list-check" className="text-lg" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{tmpl.name}</p>
          <p className="text-2xs text-muted2">{items.length} steps{tmpl.description ? ` · ${tmpl.description}` : ''}</p>
        </div>
        <button onClick={onDelete} className="text-muted2 hover:text-rose-500 shrink-0"><Icon name="ti-trash" className="text-base" /></button>
      </div>
      <div className="space-y-1 mb-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 py-0.5 group text-sm">
            <Icon name="ti-point" className="text-muted2 text-xs shrink-0" />
            <span className="flex-1 min-w-0 truncate">{it.title}</span>
            {it.requires_doc && <Icon name="ti-paperclip" className="text-muted2 text-xs shrink-0" />}
            {it.training_doc && <Icon name="ti-book" title={it.training_doc.title} className="text-muted2 text-xs shrink-0" />}
            {!!it.offset_days && <span className="text-2xs text-muted2 shrink-0">+{it.offset_days}d</span>}
            <button onClick={() => remove(it.id)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500 shrink-0"><Icon name="ti-x" className="text-sm" /></button>
          </div>
        ))}
        {items.length === 0 && <p className="text-2xs text-muted2 py-1">No steps yet</p>}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-line">
        <input value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add a step…" className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted2" />
        <input value={days} disabled={busy} onChange={(e) => setDays(e.target.value)} type="number" placeholder="day"
          title="Due day offset from start date" className="w-14 px-1.5 py-1 rounded border border-line text-2xs text-center outline-none" />
        <label title="Hire must upload a document (contract, ID, bank details…)"
          className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-1 rounded border text-2xs cursor-pointer select-none ${needsDoc ? 'border-accent text-accentstrong' : 'border-line text-muted2'}`}>
          <input type="checkbox" checked={needsDoc} disabled={busy} onChange={(e) => setNeedsDoc(e.target.checked)} className="hidden" />
          <Icon name="ti-paperclip" className="text-xs" />doc
        </label>
        {docs.length > 0 && (
          <div className="w-24"><Select value={docId} onChange={(v) => setDocId(v)} disabled={busy} className="px-1 rounded border border-line bg-surface text-2xs outline-none" options={[{ value: '', label: 'no training' }, ...docs.map((d) => ({ value: d.id, label: d.title }))]} /></div>
        )}
        <button onClick={add} disabled={busy || !title.trim()} className="btn btn-sm">Add</button>
      </div>
    </div>
  );
}

// ---- training material chip -------------------------------------------------
// Shown on a hire's checklist row when the template step linked a training doc.
function TrainingChip({ doc }: { doc?: OnboardingTask['training_doc'] }) {
  const [busy, setBusy] = useState(false);
  if (!doc) return null;
  const open = async () => {
    if (busy) return;
    try {
      setBusy(true);
      if (doc.doc_path) window.open(await getTrainingDocUrl(doc.doc_path), '_blank');
      else if (doc.link_url) window.open(doc.link_url, '_blank');
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  return (
    <button onClick={open} disabled={busy} title={`Training: ${doc.title}`}
      className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-line text-2xs text-muted hover:text-accentstrong hover:border-accent max-w-[10rem]">
      <Icon name="ti-book" className="text-xs" /><span className="truncate">{doc.title}</span>
    </button>
  );
}

// ---- modals ----------------------------------------------------------------
function AssignModal({ people, templates, busy, onClose, onSubmit }:
  { people: OrgUser[]; templates: OnboardingTemplate[]; busy: boolean; onClose: () => void; onSubmit: (userId: string, tmplId: string, start: string) => void }) {
  const [userId, setUserId] = useState('');
  const [tmplId, setTmplId] = useState(templates[0]?.id || '');
  const [start, setStart] = useState('');
  const noTmpl = templates.length === 0;
  const valid = !noTmpl && !!userId && !!tmplId;
  const submit = () => valid && onSubmit(userId, tmplId, start);
  return (
    <Modal
      open
      onClose={onClose}
      title="Onboard a hire"
      subtitle="Assign an onboarding checklist template to a team member."
      icon="ti-user-plus"
      onSubmit={() => { if (!busy && valid) submit(); }}
      footer={
        <>
          {!noTmpl && <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>}
          <button onClick={onClose} className="btn">Cancel</button>
          {!noTmpl && <button onClick={submit} disabled={busy || !valid} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Assigning…' : 'Assign checklist'}</button>}
        </>
      }
    >
      {noTmpl ? <p className="text-sm text-muted">Create a template first, then come back to assign it.</p> : (
        <div className="space-y-3.5">
          <Field label="Employee" required>
            <Select value={userId} onChange={(v) => setUserId(v)} options={[{ value: '', label: 'Select…' }, ...people.map((p) => ({ value: p.id, label: p.full_name }))]} />
          </Field>
          <Field label="Template" required>
            <Select value={tmplId} onChange={(v) => setTmplId(v)} options={[...templates.map((t) => ({ value: t.id, label: `${t.name} (${(t.items || []).length} steps)` }))]} />
          </Field>
          <Field label="Start date" hint="Sets due dates for checklist items.">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function NewTemplateModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (name: string, desc: string) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const valid = !!name.trim();
  const submit = () => valid && onSubmit(name.trim(), desc.trim());
  return (
    <Modal
      open
      onClose={onClose}
      title="New onboarding template"
      subtitle="Create a reusable checklist for new hires."
      icon="ti-list-check"
      onSubmit={() => { if (!busy && valid) submit(); }}
      footer={
        <>
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy || !valid} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Creating…' : 'Create template'}</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Name" required hint="A short, recognizable name."><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard New Hire" className="input" /></Field>
        <Field label="Description" hint="Optional"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" className="input" /></Field>
      </div>
    </Modal>
  );
}

import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import {
  getOnboardingTemplates, createOnboardingTemplate, deleteOnboardingTemplate,
  addTemplateItem, deleteTemplateItem,
  getOnboardingTasks, assignOnboarding, addOnboardingTask, setOnboardingTaskStatus, deleteOnboardingTask,
  getOrgUsers,
} from '@/lib/db';
import { OnboardingTemplate, OnboardingTask, OrgUser } from '@/lib/supabase';
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
  const [busy, setBusy] = useState(false);

  // modals
  const [showAssign, setShowAssign] = useState(false);
  const [showTmpl, setShowTmpl] = useState(false);

  useEffect(() => {
    Promise.all([getOnboardingTemplates(), getOnboardingTasks(), getOrgUsers()])
      .then(([t, k, p]) => { setTemplates(t); setTasks(k); setPeople(p); })
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
    <Layout title="Onboarding">
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
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === k ? 'border-sky-500 text-ink font-medium' : 'border-transparent text-neutral-500 hover:text-ink'}`}>{label}</button>
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
                      <p className="text-2xs text-neutral-400">{done}/{g.rows.length} complete</p>
                    </div>
                    <span className={`pill ${pct === 100 ? 'pill-green' : 'pill-blue'}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-neutral-100 mb-3 overflow-hidden">
                    <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: pct === 100 ? '#10b981' : 'var(--brand-primary, #2D7FF9)' }} />
                  </div>
                  <div className="space-y-1">
                    {g.rows.map((t) => (
                      <div key={t.id} className="flex items-center gap-2.5 py-1 group">
                        <input type="checkbox" checked={t.status === 'Done'} disabled={busy} onChange={() => toggle(t)} className="accent-ink w-4 h-4 shrink-0" />
                        <span className={`text-sm flex-1 min-w-0 truncate ${t.status === 'Done' ? 'line-through text-neutral-400' : ''}`}>{t.title}</span>
                        {t.due_date && <span className="text-2xs text-neutral-400 shrink-0">{t.due_date}</span>}
                        {t.assignee?.full_name && <span className="text-2xs text-neutral-400 shrink-0 hidden sm:inline">· {t.assignee.full_name}</span>}
                        {admin && <button onClick={() => removeTask(t.id)} className="opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-rose-500 shrink-0"><Icon name="ti-x" className="text-sm" /></button>}
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
              <TemplateCard key={t.id} tmpl={t} orgId={org!.id}
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

// ---- inline add-item row (active checklist) -------------------------------
function AddItemRow({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => { if (!v.trim()) return; setBusy(true); try { await onAdd(v.trim()); setV(''); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };
  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-line">
      <Icon name="ti-plus" className="text-neutral-300 text-sm" />
      <input value={v} disabled={busy} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Add an item…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400" />
    </div>
  );
}

// ---- template card with item editor ---------------------------------------
function TemplateCard({ tmpl, orgId, onItemsChange, onDelete }:
  { tmpl: OnboardingTemplate; orgId: string; onItemsChange: (items: OnboardingTemplate['items']) => void; onDelete: () => void }) {
  const items = tmpl.items || [];
  const [title, setTitle] = useState('');
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!title.trim()) return; setBusy(true);
    try {
      const it = await addTemplateItem({ template_id: tmpl.id, org_id: orgId, title: title.trim(), sort_order: items.length, offset_days: parseInt(days) || 0 });
      onItemsChange([...items, it]); setTitle(''); setDays('');
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    try { await deleteTemplateItem(id); onItemsChange(items.filter((x) => x.id !== id)); } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="card p-4">
      <div className="flex items-start gap-2 mb-3">
        <span className="w-9 h-9 rounded-md bg-neutral-100 grid place-items-center text-neutral-500 shrink-0"><Icon name="ti-list-check" className="text-lg" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{tmpl.name}</p>
          <p className="text-2xs text-neutral-400">{items.length} steps{tmpl.description ? ` · ${tmpl.description}` : ''}</p>
        </div>
        <button onClick={onDelete} className="text-neutral-300 hover:text-rose-500 shrink-0"><Icon name="ti-trash" className="text-base" /></button>
      </div>
      <div className="space-y-1 mb-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 py-0.5 group text-sm">
            <Icon name="ti-point" className="text-neutral-300 text-xs shrink-0" />
            <span className="flex-1 min-w-0 truncate">{it.title}</span>
            {!!it.offset_days && <span className="text-2xs text-neutral-400 shrink-0">+{it.offset_days}d</span>}
            <button onClick={() => remove(it.id)} className="opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-rose-500 shrink-0"><Icon name="ti-x" className="text-sm" /></button>
          </div>
        ))}
        {items.length === 0 && <p className="text-2xs text-neutral-400 py-1">No steps yet</p>}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-line">
        <input value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add a step…" className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-neutral-400" />
        <input value={days} disabled={busy} onChange={(e) => setDays(e.target.value)} type="number" placeholder="day"
          title="Due day offset from start date" className="w-14 px-1.5 py-1 rounded border border-line text-2xs text-center outline-none" />
        <button onClick={add} disabled={busy || !title.trim()} className="btn btn-sm">Add</button>
      </div>
    </div>
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
      {noTmpl ? <p className="text-sm text-neutral-500">Create a template first, then come back to assign it.</p> : (
        <div className="space-y-3.5">
          <Field label="Employee" required>
            <select autoFocus value={userId} onChange={(e) => setUserId(e.target.value)} className="input">
              <option value="">Select…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </Field>
          <Field label="Template" required>
            <select value={tmplId} onChange={(e) => setTmplId(e.target.value)} className="input">
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({(t.items || []).length} steps)</option>)}
            </select>
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

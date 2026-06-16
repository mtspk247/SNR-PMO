import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import {
  getTaskFieldDefs, createTaskFieldDef, deleteTaskFieldDef,
  getTaskFieldValues, upsertTaskFieldValue,
} from '@/lib/db';
import { Task, TaskFieldDef } from '@/lib/supabase';
import Dropdown from '@/components/Dropdown';

const TYPE_META: { value: string; label: string; icon: string }[] = [
  { value: 'text', label: 'Text', icon: 'ti-letter-t' },
  { value: 'number', label: 'Number', icon: 'ti-number-123' },
  { value: 'date', label: 'Date', icon: 'ti-calendar' },
  { value: 'dropdown', label: 'Dropdown', icon: 'ti-chevron-down' },
  { value: 'checkbox', label: 'Checkbox', icon: 'ti-checkbox' },
  { value: 'multiselect', label: 'Multi-select', icon: 'ti-list-check' },
];
const typeIcon = (t: string) => TYPE_META.find((x) => x.value === t)?.icon || 'ti-letter-t';

/** Per-project custom fields on a task (ClickUp-style), clean popover-based controls. */
export default function TaskCustomFields({ task }: { task: Task }) {
  const projectId = task.project_id;
  const [defs, setDefs] = useState<TaskFieldDef[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ name: string; field_type: string; options: string }>({ name: '', field_type: 'text', options: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!projectId) { setDefs([]); return; } getTaskFieldDefs(projectId).then(setDefs).catch(() => setDefs([])); }, [projectId]);
  useEffect(() => {
    setVals({});
    getTaskFieldValues(task.id).then((rows) => {
      const m: Record<string, string> = {}; rows.forEach((r) => { if (r.value != null) m[r.field_id] = r.value; }); setVals(m);
    }).catch(() => {});
  }, [task.id]);

  if (!projectId) return null;

  const save = async (fieldId: string, value: string) => {
    setVals((v) => ({ ...v, [fieldId]: value }));
    try { await upsertTaskFieldValue({ task_id: task.id, field_id: fieldId, project_id: projectId, value }); }
    catch (e: any) { alert(e.message); }
  };
  const addField = async () => {
    if (!draft.name.trim() || !task.org_id) return; setBusy(true);
    try {
      const needsOpts = draft.field_type === 'dropdown' || draft.field_type === 'multiselect';
      const d = await createTaskFieldDef({
        org_id: task.org_id, project_id: projectId, name: draft.name.trim(), field_type: draft.field_type,
        options: needsOpts ? draft.options.split(',').map((s) => s.trim()).filter(Boolean) : null,
      });
      setDefs((p) => [...p, d]); setAdding(false); setDraft({ name: '', field_type: 'text', options: '' });
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const removeField = async (d: TaskFieldDef) => {
    if (!confirm(`Remove field "${d.name}"? Its values on all tasks are deleted.`)) return;
    try { await deleteTaskFieldDef(d.id); setDefs((p) => p.filter((x) => x.id !== d.id)); } catch (e: any) { alert(e.message); }
  };

  const control = (d: TaskFieldDef) => {
    const v = vals[d.id] ?? '';
    const valBtn = (text: string, muted = false) => (
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm hover:bg-surface2 transition ${muted ? 'text-muted2' : 'text-content'}`}>{text}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>
    );
    switch (d.field_type) {
      case 'checkbox':
        return <input type="checkbox" checked={v === 'true'} onChange={(e) => save(d.id, String(e.target.checked))} className="accent-accentstrong w-4 h-4" />;
      case 'dropdown':
        return (
          <Dropdown value={v} onChange={(nv) => save(d.id, nv)} width={200}
            items={[{ value: '', label: '—' }, ...(d.options || []).map((o) => ({ value: o, label: o }))]}
            trigger={v ? <span className="inline-flex items-center gap-1.5 text-2xs font-semibold px-2 py-0.5 rounded-full bg-accent/12 text-accentstrong">{v}<Icon name="ti-chevron-down" className="text-2xs" /></span> : valBtn('Select', true)} />
        );
      case 'multiselect': {
        const sel = v ? v.split(',').filter(Boolean) : [];
        return (
          <Dropdown multiple values={sel} onToggle={(o) => save(d.id, (sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o]).join(','))} width={200}
            items={(d.options || []).map((o) => ({ value: o, label: o }))}
            trigger={<span className="inline-flex items-center gap-1 flex-wrap max-w-[12rem]">{sel.length ? sel.map((o) => <span key={o} className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-accent/12 text-accentstrong">{o}</span>) : <span className="text-sm text-muted2 px-2 py-1 rounded-md hover:bg-surface2">Select…</span>}</span>} />
        );
      }
      case 'date':
        return <input type="date" value={v} onChange={(e) => save(d.id, e.target.value)} className="bg-transparent text-sm text-content rounded-md px-2 py-1 hover:bg-surface2 outline-none cursor-pointer" />;
      case 'number':
        return <input type="number" defaultValue={v} onBlur={(e) => { if (e.target.value !== v) save(d.id, e.target.value); }} placeholder="—" className="bg-transparent text-sm text-content rounded-md px-2 py-1 hover:bg-surface2 focus:bg-surface2 outline-none w-24" />;
      default:
        return <input defaultValue={v} onBlur={(e) => { if (e.target.value !== v) save(d.id, e.target.value); }} placeholder="Empty" className="bg-transparent text-sm text-content rounded-md px-2 py-1 hover:bg-surface2 focus:bg-surface2 outline-none w-40" />;
    }
  };

  const needsOpts = draft.field_type === 'dropdown' || draft.field_type === 'multiselect';

  return (
    <div className="mt-6 pt-5 border-t border-line">
      <p className="section-label mb-2.5">Fields</p>

      <div className="flex flex-col">
        {defs.map((d) => (
          <div key={d.id} className="flex items-center gap-2 min-h-[34px] px-2 -mx-2 rounded-lg hover:bg-surface2/50 group transition-colors">
            <span className="flex items-center gap-2 w-36 shrink-0 text-xs text-muted"><Icon name={typeIcon(d.field_type)} className="text-sm text-muted2" />{d.name}</span>
            <div className="flex-1 min-w-0">{control(d)}</div>
            <button onClick={() => removeField(d)} title="Remove field" className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500 transition shrink-0"><Icon name="ti-trash" className="text-sm" /></button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="mt-2 p-3 rounded-xl border border-line bg-surface2/40 space-y-2.5">
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Field name" className="input h-9 text-sm" autoFocus />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted w-16">Type</span>
            <Dropdown value={draft.field_type} onChange={(t) => setDraft({ ...draft, field_type: t })} items={TYPE_META} width={200}
              trigger={<span className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-surface text-sm text-content hover:border-borderstrong"><Icon name={typeIcon(draft.field_type)} className="text-base text-muted2" />{TYPE_META.find((t) => t.value === draft.field_type)?.label}<Icon name="ti-chevron-down" className="text-2xs text-muted2 ml-1" /></span>} />
          </div>
          {needsOpts && <input value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} placeholder="Options, comma-separated" className="input h-9 text-sm" />}
          <div className="flex items-center gap-2">
            <button onClick={addField} disabled={busy || !draft.name.trim()} className="btn btn-primary h-8 px-4 text-xs">{busy ? 'Adding…' : 'Add field'}</button>
            <button onClick={() => setAdding(false)} className="btn-ghost h-8 px-3 text-xs">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-1 inline-flex items-center gap-1.5 text-xs text-accentstrong hover:opacity-80 font-medium"><Icon name="ti-plus" className="text-sm" />Add field</button>
      )}
    </div>
  );
}

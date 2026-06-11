import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import {
  getTaskFieldDefs, createTaskFieldDef, deleteTaskFieldDef,
  getTaskFieldValues, upsertTaskFieldValue,
} from '@/lib/db';
import { Task, TaskFieldDef } from '@/lib/supabase';

const TYPES = ['text', 'number', 'date', 'checkbox', 'dropdown'] as const;

/**
 * Per-project custom fields on a task (ClickUp-style).
 * Definitions live on the project (visible on every task in it); values per task.
 * RLS gates both to users with project access.
 */
export default function TaskCustomFields({ task }: { task: Task }) {
  const projectId = task.project_id;
  const [defs, setDefs] = useState<TaskFieldDef[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', field_type: 'text', options: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!projectId) { setDefs([]); return; }
    getTaskFieldDefs(projectId).then(setDefs).catch(() => setDefs([]));
  }, [projectId]);

  useEffect(() => {
    setVals({});
    getTaskFieldValues(task.id).then((rows) => {
      const m: Record<string, string> = {};
      rows.forEach((r) => { if (r.value != null) m[r.field_id] = r.value; });
      setVals(m);
    }).catch(() => {});
  }, [task.id]);

  if (!projectId) return null;

  const save = async (fieldId: string, value: string) => {
    setVals((v) => ({ ...v, [fieldId]: value }));
    try { await upsertTaskFieldValue({ task_id: task.id, field_id: fieldId, project_id: projectId, value }); }
    catch (e: any) { alert(e.message); }
  };

  const addField = async () => {
    if (!draft.name.trim() || !task.org_id) return;
    setBusy(true);
    try {
      const d = await createTaskFieldDef({
        org_id: task.org_id, project_id: projectId, name: draft.name.trim(),
        field_type: draft.field_type,
        options: draft.field_type === 'dropdown'
          ? draft.options.split(',').map((s) => s.trim()).filter(Boolean)
          : null,
      });
      setDefs((p) => [...p, d]);
      setAdding(false); setDraft({ name: '', field_type: 'text', options: '' });
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const removeField = async (d: TaskFieldDef) => {
    if (!confirm(`Remove field "${d.name}" from this project? Its values on all tasks are deleted.`)) return;
    try { await deleteTaskFieldDef(d.id); setDefs((p) => p.filter((x) => x.id !== d.id)); }
    catch (e: any) { alert(e.message); }
  };

  const control = (d: TaskFieldDef) => {
    const v = vals[d.id] ?? '';
    const k = `${task.id}:${d.id}`;
    switch (d.field_type) {
      case 'checkbox':
        return <input key={k} type="checkbox" checked={v === 'true'} onChange={(e) => save(d.id, String(e.target.checked))} className="accent-accentstrong" />;
      case 'dropdown':
        return (
          <select key={k} value={v} onChange={(e) => save(d.id, e.target.value)} className="input h-8 py-0 text-sm max-w-[10rem]">
            <option value="">—</option>
            {(d.options || []).map((o) => <option key={o}>{o}</option>)}
          </select>
        );
      case 'date':
        return <input key={k} type="date" value={v} onChange={(e) => save(d.id, e.target.value)} className="input h-8 py-0 text-sm max-w-[10rem]" />;
      case 'number':
        return <input key={k} type="number" defaultValue={v} onBlur={(e) => { if (e.target.value !== v) save(d.id, e.target.value); }} className="input h-8 py-0 text-sm max-w-[10rem]" />;
      default:
        return <input key={k} defaultValue={v} onBlur={(e) => { if (e.target.value !== v) save(d.id, e.target.value); }} className="input h-8 py-0 text-sm max-w-[10rem]" placeholder="—" />;
    }
  };

  return (
    <div className="mt-5 pt-4 border-t border-line">
      <div className="flex items-center justify-between mb-2">
        <p className="text-2xs uppercase tracking-wide text-muted2">Custom fields</p>
        <button onClick={() => setAdding((a) => !a)} className="text-2xs text-muted hover:text-content inline-flex items-center gap-0.5">
          <Icon name={adding ? 'ti-x' : 'ti-plus'} className="text-xs" />{adding ? 'Cancel' : 'Add field'}
        </button>
      </div>

      {defs.length === 0 && !adding && <p className="text-2xs text-muted2">No custom fields on this project yet.</p>}

      <div className="space-y-2.5">
        {defs.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2 group">
            <span className="text-sm text-muted truncate" title={d.field_type}>{d.name}</span>
            <span className="flex items-center gap-1">
              {control(d)}
              <button onClick={() => removeField(d)} title="Remove field from project"
                className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500 transition">
                <Icon name="ti-trash" className="text-sm" />
              </button>
            </span>
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-3 p-3 rounded-md border border-line bg-surface2/40 space-y-2">
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Field name" className="input h-8 text-sm" autoFocus />
          <select value={draft.field_type} onChange={(e) => setDraft({ ...draft, field_type: e.target.value })} className="input h-8 py-0 text-sm">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {draft.field_type === 'dropdown' && (
            <input value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })}
              placeholder="Options, comma-separated" className="input h-8 text-sm" />
          )}
          <button onClick={addField} disabled={busy || !draft.name.trim()} className="btn btn-primary h-8 w-full text-xs">
            {busy ? 'Adding…' : 'Add to project'}
          </button>
          <p className="text-2xs text-muted2">Shows on every task in this project.</p>
        </div>
      )}
    </div>
  );
}

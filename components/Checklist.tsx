import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { getTaskChecklist, addChecklistItem, toggleChecklistItem, deleteChecklistItem } from '@/lib/db';
import { ChecklistItem } from '@/lib/supabase';

/** W2 — lightweight per-task checklist (distinct from subtasks). */
export default function Checklist({ taskId, orgId, projectId }: {
  taskId: string; orgId: string; projectId?: string | null;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (taskId) getTaskChecklist(taskId).then(setItems).catch(() => {}); }, [taskId]);

  const done = items.filter((i) => i.done).length;
  const add = async () => {
    if (!label.trim()) return; setBusy(true);
    try {
      const it = await addChecklistItem({ org_id: orgId, task_id: taskId, project_id: projectId, label: label.trim(), sort_order: items.length });
      setItems((p) => [...p, it]); setLabel('');
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const toggle = async (it: ChecklistItem) => {
    setItems((p) => p.map((x) => x.id === it.id ? { ...x, done: !it.done } : x));
    try { await toggleChecklistItem(it.id, !it.done); }
    catch (e: any) { alert(e.message); setItems((p) => p.map((x) => x.id === it.id ? { ...x, done: it.done } : x)); }
  };
  const remove = async (id: string) => {
    setBusy(true);
    try { await deleteChecklistItem(id); setItems((p) => p.filter((x) => x.id !== id)); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="mt-5 pt-4 border-t border-line">
      <div className="flex items-center justify-between mb-2">
        <p className="text-2xs uppercase tracking-wide text-muted2">Checklist</p>
        {items.length > 0 && <span className="text-2xs text-muted">{done}/{items.length}</span>}
      </div>
      {items.length > 0 && (
        <div className="h-1 rounded-full bg-surface2 mb-3 overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
        </div>
      )}
      <div className="space-y-1">
        {items.map((it) => (
          <div key={it.id} className="group flex items-center gap-2">
            <button onClick={() => toggle(it)} className={`w-4 h-4 shrink-0 rounded border grid place-items-center transition-colors ${it.done ? 'bg-accent border-accent text-accentfg' : 'border-line hover:border-accent'}`} aria-label={it.done ? 'Uncheck' : 'Check'}>
              {it.done && <Icon name="ti-check" className="text-2xs" />}
            </button>
            <span className={`text-sm flex-1 ${it.done ? 'line-through text-muted2' : 'text-content'}`}>{it.label}</span>
            <button onClick={() => remove(it.id)} disabled={busy} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500" aria-label="Remove item">
              <Icon name="ti-x" className="text-2xs" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add item…" className="input h-8 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(); } }} />
        <button onClick={add} disabled={busy || !label.trim()} className="btn h-8 px-2 text-xs shrink-0"><Icon name="ti-plus" /></button>
      </div>
    </div>
  );
}

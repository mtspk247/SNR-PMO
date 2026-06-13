import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { Icon } from '@/components/ui';
import { createTaskStatus, updateTaskStatusDef, deleteTaskStatusDef, TaskStatus } from '@/lib/db';

/** Shared status-category manager (used for tasks, projects, …). `scope` partitions the set. */
export default function StatusManager({ open, onClose, orgId, scope = 'task', statuses, onChanged }: {
  open: boolean; onClose: () => void; orgId: string; scope?: string; statuses: TaskStatus[]; onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [cat, setCat] = useState('active');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!name.trim()) return; setBusy(true);
    try { await createTaskStatus({ org_id: orgId, scope, name: name.trim(), color, category: cat, position: statuses.length ? Math.max(...statuses.map((s) => s.position)) + 1 : 0 }); setName(''); onChanged(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const patch = async (id: string, pa: Partial<{ name: string; color: string; category: string }>) => { try { await updateTaskStatusDef(id, pa); onChanged(); } catch (e: any) { alert(e.message); } };
  const del = async (id: string) => { if (!confirm('Delete this status? Existing items keep their current value.')) return; try { await deleteTaskStatusDef(id); onChanged(); } catch (e: any) { alert(e.message); } };
  return (
    <Modal open={open} onClose={onClose} title="Manage statuses" subtitle="Customize the workflow statuses for this workspace." icon="ti-flag-3" size="md"
      footer={<><span className="text-2xs text-muted2 mr-auto hidden sm:block">Applies to everyone in the workspace.</span><button onClick={onClose} className="btn">Done</button></>}>
      <div className="space-y-2">
        {statuses.map((st) => (
          <div key={st.id} className="flex items-center gap-2">
            <input type="color" value={st.color} onChange={(e) => patch(st.id, { color: e.target.value })} className="w-8 h-8 rounded-md border border-line bg-surface cursor-pointer shrink-0 p-0.5" title="Colour" />
            <input defaultValue={st.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== st.name) patch(st.id, { name: v }); }} className="input flex-1" />
            <select value={st.category} onChange={(e) => patch(st.id, { category: e.target.value })} className="input h-9 w-24 shrink-0">
              <option value="todo">To-do</option><option value="active">Active</option><option value="done">Done</option>
            </select>
            <button onClick={() => del(st.id)} title="Delete" className="btn-ghost p-1.5 rounded text-muted2 hover:text-rose-500 shrink-0"><Icon name="ti-trash" className="text-sm" /></button>
          </div>
        ))}
        {statuses.length === 0 && <p className="text-sm text-muted2 py-2">No statuses yet — add one below.</p>}
      </div>
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-line">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded-md border border-line bg-surface cursor-pointer shrink-0 p-0.5" />
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="New status name" className="input flex-1" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="input h-9 w-24 shrink-0"><option value="todo">To-do</option><option value="active">Active</option><option value="done">Done</option></select>
        <button onClick={add} disabled={busy || !name.trim()} className="btn btn-primary shrink-0"><Icon name="ti-plus" />Add</button>
      </div>
    </Modal>
  );
}

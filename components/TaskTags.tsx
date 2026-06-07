import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { getTags, createTag, getTaskTags, addTaskTag, removeTaskTag } from '@/lib/db';
import { Tag } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store';

export default function TaskTags({ taskId, orgId }: { taskId: string; orgId?: string }) {
  const me = useAuthStore((s) => s.user);
  const [all, setAll] = useState<Tag[]>([]);
  const [mine, setMine] = useState<Tag[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getTags().then(setAll).catch(() => {}); }, [orgId]);
  useEffect(() => { if (taskId) getTaskTags(taskId).then(setMine).catch(() => {}); }, [taskId]);

  const avail = all.filter((t) => !mine.some((m) => m.id === t.id));
  const add = async (tagId: string) => {
    if (!orgId || !tagId) return; setBusy(true);
    try { await addTaskTag(taskId, tagId, orgId); const t = all.find((x) => x.id === tagId); if (t) setMine((p) => [...p, t]); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const remove = async (tagId: string) => {
    setBusy(true);
    try { await removeTaskTag(taskId, tagId); setMine((p) => p.filter((t) => t.id !== tagId)); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const create = async () => {
    if (!newName.trim() || !orgId || !me) return; setBusy(true);
    try {
      const t = await createTag({ name: newName.trim(), org_id: orgId, created_by: me.id });
      setAll((p) => [...p, t]); await addTaskTag(taskId, t.id, orgId); setMine((p) => [...p, t]);
      setNewName(''); setAdding(false);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="mt-5 pt-4 border-t border-line">
      <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Tags</p>
      <div className="flex flex-wrap gap-1.5">
        {mine.map((t) => (
          <span key={t.id} className="pill inline-flex items-center gap-1" style={{ background: (t.color || '#3b82f6') + '22', color: t.color || '#3b82f6' }}>
            {t.name}
            <button onClick={() => remove(t.id)} disabled={busy} className="hover:opacity-70"><Icon name="ti-x" className="text-2xs" /></button>
          </span>
        ))}
        {mine.length === 0 && !adding && <span className="text-2xs text-neutral-400">No tags</span>}
      </div>
      <div className="flex items-center gap-2 mt-2">
        {avail.length > 0 && (
          <select value="" disabled={busy} onChange={(e) => add(e.target.value)} className="input h-8 py-0 text-sm">
            <option value="">+ Add tag…</option>
            {avail.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {adding ? (
          <div className="flex items-center gap-1">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="New tag" className="input h-8 text-sm w-28" />
            <button onClick={create} disabled={busy || !newName.trim()} className="btn h-8 px-2 text-xs"><Icon name="ti-check" /></button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="btn-ghost h-8 px-2 text-xs text-neutral-500"><Icon name="ti-plus" />New</button>
        )}
      </div>
    </div>
  );
}

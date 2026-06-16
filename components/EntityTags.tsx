import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { getTags, createTag, getEntityTags, addEntityTag, removeEntityTag, TagEntityType } from '@/lib/db';
import { Tag } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store';
import Dropdown from '@/components/Dropdown';

const SWATCHES = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

/** F1 — generic tag chips + picker for any entity. Clean popover picker (no native select). */
export default function EntityTags({ entityType, entityId, orgId, title = 'Tags', bare = false }: {
  entityType: TagEntityType; entityId: string; orgId?: string; title?: string; bare?: boolean;
}) {
  const me = useAuthStore((s) => s.user);
  const [all, setAll] = useState<Tag[]>([]);
  const [mine, setMine] = useState<Tag[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(SWATCHES[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getTags().then(setAll).catch(() => {}); }, [orgId]);
  useEffect(() => { if (entityId) getEntityTags(entityType, entityId).then(setMine).catch(() => {}); }, [entityType, entityId]);

  const add = async (tagId: string) => {
    if (!orgId || !tagId) return; setBusy(true);
    try { await addEntityTag(entityType, entityId, tagId, orgId, me?.id); const t = all.find((x) => x.id === tagId); if (t) setMine((p) => [...p, t]); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const remove = async (tagId: string) => {
    setBusy(true);
    try { await removeEntityTag(entityType, entityId, tagId); setMine((p) => p.filter((t) => t.id !== tagId)); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const toggle = (tagId: string) => mine.some((m) => m.id === tagId) ? remove(tagId) : add(tagId);
  const create = async () => {
    if (!newName.trim() || !orgId || !me) return; setBusy(true);
    try {
      const t = await createTag({ name: newName.trim(), color: newColor, org_id: orgId, created_by: me.id });
      setAll((p) => [...p, t]); await addEntityTag(entityType, entityId, t.id, orgId, me.id); setMine((p) => [...p, t]);
      setNewName('');
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const picker = (
    <Dropdown
      search width={240} placeholder="Find or create a tag…"
      multiple values={mine.map((t) => t.id)} onToggle={toggle}
      items={all.map((t) => ({ value: t.id, label: t.name, dot: t.color || '#3b82f6' }))}
      trigger={<span className="inline-flex items-center gap-1 text-2xs text-muted px-2 py-1 rounded-md border border-dashed border-borderstrong hover:border-accent hover:text-content transition"><Icon name="ti-plus" className="text-xs" />Tag</span>}
      footer={
        <div className="flex items-center gap-1.5 flex-wrap py-0.5">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } }} placeholder="New tag" className="input h-7 text-sm w-24" />
          <div className="flex items-center gap-1">
            {SWATCHES.map((c) => <button key={c} type="button" onClick={() => setNewColor(c)} aria-label={c} className={`w-3.5 h-3.5 rounded-full ${newColor === c ? 'ring-2 ring-offset-1 ring-accent' : ''}`} style={{ background: c }} />)}
          </div>
          <button type="button" onClick={create} disabled={busy || !newName.trim()} className="btn h-7 px-2 text-xs"><Icon name="ti-check" /></button>
        </div>
      }
    />
  );

  const body = (
    <div className="flex flex-wrap items-center gap-1.5">
      {mine.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-md" style={{ background: (t.color || '#3b82f6') + '22', color: t.color || '#3b82f6' }}>
          {t.name}
          <button onClick={() => remove(t.id)} disabled={busy} className="hover:opacity-70" aria-label={`Remove ${t.name}`}><Icon name="ti-x" className="text-2xs" /></button>
        </span>
      ))}
      {picker}
    </div>
  );

  if (bare) return body;
  return (
    <div>
      <p className="section-label mb-2">{title}</p>
      {body}
    </div>
  );
}

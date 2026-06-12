import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { getTags, createTag, getEntityTags, addEntityTag, removeEntityTag, TagEntityType } from '@/lib/db';
import { Tag } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store';

const SWATCHES = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

/**
 * F1 — generic tag chips + picker for any entity (task, project, deal, ledger
 * entry, …). Backed by snrpmo.entity_tags; org tag catalog is shared.
 */
export default function EntityTags({ entityType, entityId, orgId, title = 'Tags', bare = false }: {
  entityType: TagEntityType;
  entityId: string;
  orgId?: string;
  title?: string;
  /** bare = no top border/heading wrapper (for use inside modal tabs/cards). */
  bare?: boolean;
}) {
  const me = useAuthStore((s) => s.user);
  const [all, setAll] = useState<Tag[]>([]);
  const [mine, setMine] = useState<Tag[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(SWATCHES[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getTags().then(setAll).catch(() => {}); }, [orgId]);
  useEffect(() => { if (entityId) getEntityTags(entityType, entityId).then(setMine).catch(() => {}); }, [entityType, entityId]);

  const avail = all.filter((t) => !mine.some((m) => m.id === t.id));
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
  const create = async () => {
    if (!newName.trim() || !orgId || !me) return; setBusy(true);
    try {
      const t = await createTag({ name: newName.trim(), color: newColor, org_id: orgId, created_by: me.id });
      setAll((p) => [...p, t]); await addEntityTag(entityType, entityId, t.id, orgId, me.id); setMine((p) => [...p, t]);
      setNewName(''); setAdding(false);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const body = (
    <>
      <div className="flex flex-wrap gap-1.5">
        {mine.map((t) => (
          <span key={t.id} className="pill inline-flex items-center gap-1" style={{ background: (t.color || '#3b82f6') + '22', color: t.color || '#3b82f6' }}>
            {t.name}
            <button onClick={() => remove(t.id)} disabled={busy} className="hover:opacity-70" aria-label={`Remove ${t.name}`}><Icon name="ti-x" className="text-2xs" /></button>
          </span>
        ))}
        {mine.length === 0 && !adding && <span className="text-2xs text-muted2">No tags</span>}
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {avail.length > 0 && (
          <select value="" disabled={busy} onChange={(e) => add(e.target.value)} className="input h-8 py-0 text-sm w-auto">
            <option value="">+ Add tag…</option>
            {avail.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {adding ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); create(); } }} placeholder="New tag" className="input h-8 text-sm w-28" />
            <div className="flex items-center gap-1">
              {SWATCHES.map((c) => (
                <button key={c} onClick={() => setNewColor(c)} aria-label={c}
                  className={`w-4 h-4 rounded-full ${newColor === c ? 'ring-2 ring-offset-1 ring-accent' : ''}`} style={{ background: c }} />
              ))}
            </div>
            <button onClick={create} disabled={busy || !newName.trim()} className="btn h-8 px-2 text-xs"><Icon name="ti-check" /></button>
            <button onClick={() => setAdding(false)} className="btn-ghost h-8 px-2 text-xs"><Icon name="ti-x" /></button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="btn-ghost h-8 px-2 text-xs text-muted"><Icon name="ti-plus" />New</button>
        )}
      </div>
    </>
  );

  if (bare) return <div>{body}</div>;
  return (
    <div className="mt-5 pt-4 border-t border-line">
      <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">{title}</p>
      {body}
    </div>
  );
}

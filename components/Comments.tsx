import { useEffect, useState } from 'react';
import { Avatar, Icon, Spinner } from '@/components/ui';
import { getComments, addComment, deleteComment, notify } from '@/lib/db';
import { Comment, OrgUser } from '@/lib/supabase';

export default function CommentsThread({ entityType, entityId, orgId, users, currentUserId }:
  { entityType: 'task' | 'project'; entityId: string; orgId?: string; users: OrgUser[]; currentUserId?: string }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [q, setQ] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setLoading(true); getComments(entityType, entityId).then(setItems).finally(() => setLoading(false)); }, [entityType, entityId]);

  const nameOf = (id?: string | null) => users.find((u) => u.id === id)?.full_name || 'Someone';

  const onChange = (v: string) => { setBody(v); const m = v.match(/@([\w]*)$/); setQ(m ? m[1].toLowerCase() : null); };
  const choose = (u: OrgUser) => {
    setBody((b) => b.replace(/@([\w]*)$/, '@' + u.full_name + ' '));
    setMentions((p) => (p.includes(u.id) ? p : [...p, u.id]));
    setQ(null);
  };
  const post = async () => {
    if (!body.trim() || !orgId || !currentUserId) return;
    setBusy(true);
    try {
      const c = await addComment({ entity_type: entityType, entity_id: entityId, org_id: orgId, author_id: currentUserId, body: body.trim(), mentions });
      mentions.filter((id) => id !== currentUserId).forEach((id) =>
        notify({ org_id: orgId, user_id: id, type: 'MENTION', title: `${nameOf(currentUserId)} mentioned you`, body: body.trim().slice(0, 140), link: '/' + entityType + 's', entity_type: entityType, entity_id: entityId }).catch(() => {}));
      setItems((p) => [...p, c]); setBody(''); setMentions([]); setQ(null);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const del = async (id: string) => { setBusy(true); try { await deleteComment(id); setItems((p) => p.filter((c) => c.id !== id)); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };

  const renderBody = (c: Comment) => {
    let nodes: any[] = [c.body];
    (c.mentions || []).forEach((id) => {
      const tag = '@' + nameOf(id);
      nodes = nodes.flatMap((n) => {
        if (typeof n !== 'string') return [n];
        const segs = n.split(tag); const out: any[] = [];
        segs.forEach((s, i) => { out.push(s); if (i < segs.length - 1) out.push(<span key={id + i} className="text-sky-600 font-medium">{tag}</span>); });
        return out;
      });
    });
    return nodes;
  };

  const suggestions = q !== null ? users.filter((u) => u.full_name.toLowerCase().includes(q)).slice(0, 5) : [];

  return (
    <div className="mt-5 pt-4 border-t border-line">
      <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Comments {items.length > 0 && <span className="text-neutral-300">· {items.length}</span>}</p>
      {loading ? <Spinner /> : (
        <div className="space-y-3">
          {items.length === 0 && <p className="text-2xs text-neutral-400">No comments yet.</p>}
          {items.map((c) => (
            <div key={c.id} className="flex gap-2 group">
              <Avatar name={nameOf(c.author_id)} size={24} />
              <div className="min-w-0 flex-1">
                <p className="text-2xs text-neutral-500"><span className="font-medium text-ink">{nameOf(c.author_id)}</span>{c.created_at ? ' · ' + new Date(c.created_at).toLocaleDateString() : ''}</p>
                <p className="text-sm whitespace-pre-wrap break-words">{renderBody(c)}</p>
              </div>
              {c.author_id === currentUserId && <button onClick={() => del(c.id)} disabled={busy} className="opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-rose-600"><Icon name="ti-x" className="text-sm" /></button>}
            </div>
          ))}
        </div>
      )}
      <div className="relative mt-3">
        {suggestions.length > 0 && (
          <div className="absolute left-0 right-0 bottom-full mb-1 z-10 bg-white border border-line rounded-md shadow-lg py-1">
            {suggestions.map((u) => (
              <button key={u.id} onClick={() => choose(u)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-paper flex items-center gap-2"><Avatar name={u.full_name} size={20} />{u.full_name}</button>
            ))}
          </div>
        )}
        <textarea value={body} onChange={(e) => onChange(e.target.value)} placeholder="Write a comment… use @ to mention" rows={2}
          className="input h-auto py-2 text-sm w-full resize-none" />
        <div className="flex justify-end mt-2">
          <button onClick={post} disabled={busy || !body.trim()} className="btn btn-primary text-xs"><Icon name="ti-send" />Comment</button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { Icon, Spinner } from '@/components/ui';
import { OrgUser } from '@/lib/supabase';
import { DriveComment, DriveLevel, listDriveComments, addDriveComment, setCommentResolved, deleteDriveComment } from '@/lib/db';

// Comments + @mention tagging on a file/doc. Commenter+ can post; viewers are read-only.
// Posting goes through the drive_comment_add RPC so mention notifications fan out server-side.
export default function DriveComments({ fileId, fileName, meId, people, level, onClose }: {
  fileId: string; fileName: string; meId: string; people: OrgUser[]; level: DriveLevel | null; onClose: () => void;
}) {
  const [items, setItems] = useState<DriveComment[] | null>(null);
  const [body, setBody] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false); const [mentionQ, setMentionQ] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const canComment = level === 'commenter' || level === 'editor' || level === 'manage';
  const canManage = level === 'manage';

  const load = () => listDriveComments(fileId).then(setItems).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fileId]);

  const nameById = (id: string) => { const u = people.find((p) => p.id === id); return u?.full_name || u?.email || 'Someone'; };
  const collectMentions = (text: string): string[] => {
    const ids: string[] = [];
    people.forEach((p) => { const n = (p.full_name || '').trim(); if (n && text.includes('@' + n)) ids.push(p.id); });
    return Array.from(new Set(ids));
  };
  const onBody = (v: string) => {
    setBody(v);
    const upto = v.slice(0, taRef.current?.selectionStart ?? v.length);
    const m = upto.match(/@([\w ]{0,30})$/);
    if (m) { setMentionOpen(true); setMentionQ(m[1].toLowerCase()); } else setMentionOpen(false);
  };
  const insertMention = (u: OrgUser) => { setBody((b) => b.replace(/@([\w ]{0,30})$/, '@' + (u.full_name || u.email) + ' ')); setMentionOpen(false); taRef.current?.focus(); };
  const mentionList = people.filter((p) => (p.full_name || p.email || '').toLowerCase().includes(mentionQ)).slice(0, 6);

  const post = async () => {
    if (!body.trim() || busy) return; setBusy(true); setErr('');
    try { await addDriveComment({ file_id: fileId, body: body.trim(), mentions: collectMentions(body) }); setBody(''); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const toggleResolved = async (c: DriveComment) => { try { await setCommentResolved(c.id, !c.resolved); load(); } catch (e: any) { setErr(e.message); } };
  const del = async (c: DriveComment) => { try { await deleteDriveComment(c.id); load(); } catch (e: any) { setErr(e.message); } };

  return (
    <Modal open onClose={onClose} size="md" icon="ti-message-circle" title={`Comments — ${fileName}`}
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
      <div className="space-y-3">
        <div className="max-h-[50vh] overflow-auto space-y-2">
          {items === null ? <Spinner /> : items.length === 0 ? <p className="text-2xs text-muted2 py-4 text-center">No comments yet.</p> :
            items.map((c) => (
              <div key={c.id} className={`rounded-lg border border-line p-2.5 ${c.resolved ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon name="ti-user-circle" className="text-muted2" />
                  <span className="text-sm font-medium">{nameById(c.author_id)}</span>
                  <span className="text-2xs text-muted2">{new Date(c.created_at).toLocaleString()}</span>
                  {c.resolved && <span className="text-2xs text-emerald-600 inline-flex items-center"><Icon name="ti-check" className="mr-0.5" />Resolved</span>}
                  <span className="ml-auto flex items-center gap-1">
                    {canComment && <button className="text-muted2 hover:text-content" title={c.resolved ? 'Reopen' : 'Resolve'} onClick={() => toggleResolved(c)}><Icon name="ti-circle-check" /></button>}
                    {(c.author_id === meId || canManage) && <button className="text-muted2 hover:text-rose-500" title="Delete" onClick={() => del(c)}><Icon name="ti-trash" /></button>}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            ))}
        </div>
        {canComment ? (
          <div className="relative">
            <textarea ref={taRef} className="input min-h-[68px] resize-y w-full" placeholder="Write a comment…  Use @ to mention a teammate" value={body}
              onChange={(e) => onBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); }} />
            {mentionOpen && mentionList.length > 0 && (
              <div className="absolute z-10 left-2 bottom-14 w-60 rounded-lg border border-line bg-surface shadow-lg divide-y divide-line">
                {mentionList.map((u) => (
                  <button key={u.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface2 flex items-center gap-2" onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}>
                    <Icon name="ti-user" className="text-muted2" />{u.full_name || u.email}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-2"><button className="btn btn-primary" disabled={!body.trim() || busy} onClick={post}>{busy ? 'Posting…' : 'Comment'}</button></div>
          </div>
        ) : <p className="text-2xs text-muted2">You have view-only access — commenting is disabled.</p>}
      </div>
    </Modal>
  );
}

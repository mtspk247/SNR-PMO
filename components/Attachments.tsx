import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { listAttachments, addAttachmentFile, addAttachmentLink, attachmentUrl, deleteAttachment, Attachment } from '@/lib/db';

const fmtBytes = (n: number) => { if (!n) return ''; const u = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(n) / Math.log(1024)); return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`; };

/** Reusable attachments block — drop onto any record. */
export default function Attachments({ entityType, entityId, orgId, currentUserId }:
  { entityType: string; entityId: string; orgId?: string; currentUserId?: string }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [linkMode, setLinkMode] = useState(false);
  const [linkName, setLinkName] = useState(''); const [linkUrl, setLinkUrl] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () => { listAttachments(entityType, entityId).then(setItems).catch(() => {}); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entityType, entityId]);

  const upload = async (list: FileList | null) => {
    if (!orgId || !currentUserId || !list?.length) return; setBusy(true); setErr('');
    try { for (const file of Array.from(list)) await addAttachmentFile({ org_id: orgId, entity_type: entityType, entity_id: entityId, file, created_by: currentUserId }); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  };
  const addLink = async () => {
    if (!orgId || !currentUserId || !linkName.trim() || !linkUrl.trim()) return; setBusy(true); setErr('');
    try { await addAttachmentLink({ org_id: orgId, entity_type: entityType, entity_id: entityId, name: linkName.trim(), url: linkUrl.trim(), created_by: currentUserId }); setLinkName(''); setLinkUrl(''); setLinkMode(false); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const open = async (a: Attachment) => { try { const url = a.url || (a.storage_path ? await attachmentUrl(a.storage_path) : null); if (url) window.open(url, '_blank'); } catch (e: any) { setErr(e.message); } };
  const del = async (a: Attachment) => { if (!confirm(`Remove "${a.file_name}"?`)) return; setBusy(true); try { await deleteAttachment(a); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-2xs uppercase tracking-wide text-muted2 mr-auto">Attachments {items.length > 0 && <span className="text-muted">· {items.length}</span>}</p>
        <button className="btn-ghost h-7 px-2 text-2xs" onClick={() => setLinkMode((v) => !v)}><Icon name="ti-link" />Link</button>
        <button className="btn h-7 px-2 text-2xs" disabled={busy} onClick={() => fileInput.current?.click()}><Icon name="ti-paperclip" />Upload</button>
        <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </div>
      {err && <p className="text-2xs text-rose-600 mb-2">{err}</p>}
      {linkMode && (
        <div className="flex items-center gap-1.5 mb-2">
          <input className="input h-8 text-xs w-32" placeholder="Label" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
          <input className="input h-8 text-xs flex-1" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <button className="btn h-8 px-2 text-xs" disabled={busy || !linkName.trim() || !linkUrl.trim()} onClick={addLink}><Icon name="ti-check" /></button>
        </div>
      )}
      {items.length === 0 ? <p className="text-2xs text-muted2">No attachments.</p> : (
        <div className="space-y-1">
          {items.map((a) => (
            <div key={a.id} className="group flex items-center gap-2 text-sm">
              <Icon name={a.url ? 'ti-link' : 'ti-file'} className="text-muted shrink-0" />
              <button className="text-content truncate flex-1 text-left hover:text-accentstrong" onClick={() => open(a)}>{a.file_name}</button>
              {a.size_bytes > 0 && <span className="text-2xs text-muted2 shrink-0">{fmtBytes(a.size_bytes)}</span>}
              {(a.created_by === currentUserId) && <button onClick={() => del(a)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500"><Icon name="ti-x" className="text-sm" /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Modal, Field } from '@/components/Modal';
import { Icon, Spinner } from '@/components/ui';
import Select from '@/components/Select';
import { OrgUser } from '@/lib/supabase';
import { DriveFolder, DriveGrant, DriveLevel, listDriveGrants, upsertUserGrant, removeDriveGrant, getItemLevel, requestAccess } from '@/lib/db';
import DriveLinkPanel from '@/components/DriveLinkPanel';

const LEVELS = [{ value: 'viewer', label: 'Viewer' }, { value: 'commenter', label: 'Commenter' }, { value: 'editor', label: 'Editor' }];

// Per-item access. Managers get the full overview (inherited vs direct, add/change/remove + bulk-remove).
// Non-managers get a privacy-safe view: their own level + a "request access" path (routes to managers).
export default function DriveAccessModal({ target, orgId, folders, people, meId, canManage, onClose }: {
  target: { kind: 'folder' | 'file'; id: string; name: string; drive_id: string; folder_id?: string | null };
  orgId: string; folders: DriveFolder[]; people: OrgUser[]; meId: string; canManage: boolean; onClose: () => void;
}) {
  const [grants, setGrants] = useState<DriveGrant[] | null>(canManage ? null : []);
  const [pick, setPick] = useState(''); const [lvl, setLvl] = useState('viewer');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [myLevel, setMyLevel] = useState<DriveLevel | null>(null);
  const [reqLevel, setReqLevel] = useState('editor'); const [reqNote, setReqNote] = useState(''); const [reqSent, setReqSent] = useState(false);

  const load = () => listDriveGrants(target.drive_id).then(setGrants).catch((e) => setErr(e.message));
  useEffect(() => {
    if (canManage) load();
    getItemLevel({ drive_id: target.drive_id, folder_id: target.kind === 'folder' ? target.id : (target.folder_id ?? null), file_id: target.kind === 'file' ? target.id : null }).then(setMyLevel).catch(() => {});
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [target.drive_id, target.id]);

  const folderById = useMemo(() => { const m = new Map<string, DriveFolder>(); folders.forEach((f) => m.set(f.id, f)); return m; }, [folders]);
  const ancestorsOf = (fid: string | null | undefined): string[] => { const out: string[] = []; let cur = fid || null; let g = 0; while (cur && g < 200) { out.push(cur); cur = folderById.get(cur)?.parent_id || null; g++; } return out; };
  const inheritedFolders = target.kind === 'file' ? ancestorsOf(target.folder_id) : ancestorsOf(folderById.get(target.id)?.parent_id);
  const userName = (id: string | null) => { const u = people.find((p) => p.id === id); return u?.full_name || u?.email || 'Unknown user'; };
  const srcLabel = (g: DriveGrant) => (g.folder_id ? `folder “${folderById.get(g.folder_id)?.name || '…'}”` : 'the whole drive');

  const all = grants || [];
  const explicit = all.filter((g) => g.subject_user_id && (target.kind === 'file' ? g.file_id === target.id : g.folder_id === target.id));
  const inherited = all.filter((g) => g.subject_user_id && ((g.folder_id === null && g.file_id === null) || (g.folder_id && inheritedFolders.includes(g.folder_id))));
  const explicitUsers = new Set(explicit.map((g) => g.subject_user_id as string));
  const candidates = people.filter((p) => p.id !== meId && !explicitUsers.has(p.id));

  const grantArgs = (uid: string, level: string) => ({ org_id: orgId, drive_id: target.drive_id, subject_user_id: uid, level: level as any, created_by: meId, folder_id: target.kind === 'folder' ? target.id : null, file_id: target.kind === 'file' ? target.id : null });
  const add = async () => { if (!pick || busy) return; setBusy(true); setErr(''); try { await upsertUserGrant(grantArgs(pick, lvl)); setPick(''); setLvl('viewer'); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const change = async (g: DriveGrant, level: string) => { try { await upsertUserGrant(grantArgs(g.subject_user_id as string, level)); load(); } catch (e: any) { setErr(e.message); } };
  const remove = async (id: string) => { try { await removeDriveGrant(id); load(); } catch (e: any) { setErr(e.message); } };
  const bulkRemove = async () => { if (!sel.size) return; setBusy(true); setErr(''); try { for (const id of Array.from(sel)) await removeDriveGrant(id); setSel(new Set()); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sendRequest = async () => { setBusy(true); setErr(''); try { await requestAccess({ drive_id: target.drive_id, folder_id: target.kind === 'folder' ? target.id : null, file_id: target.kind === 'file' ? target.id : null, level: reqLevel as any, note: reqNote.trim() || undefined }); setReqSent(true); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

  return (
    <Modal open onClose={onClose} title={`Access — ${target.name}`} icon="ti-shield-lock" size="md"
      footer={<button className="btn" onClick={onClose}>Done</button>}>
      {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
      {grants === null ? <Spinner /> : canManage ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line text-sm"><Icon name="ti-shield-check" className="text-accentstrong" /><span className="flex-1">Owners &amp; admins</span><span className="text-2xs text-muted2">Full access</span></div>
          {inherited.length > 0 && (
            <div>
              <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Inherited access</p>
              <div className="rounded-lg border border-line divide-y divide-line">
                {inherited.map((g) => (
                  <div key={g.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <Icon name="ti-arrow-down-right" className="text-muted2 shrink-0" />
                    <span className="flex-1 truncate">{userName(g.subject_user_id)}</span>
                    <span className="text-2xs text-muted2">{g.level} · via {srcLabel(g)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center mb-1">
              <p className="text-2xs uppercase tracking-wide text-muted2 flex-1">Direct access to this {target.kind}</p>
              {sel.size > 0 && <button className="text-2xs text-rose-600 hover:underline" disabled={busy} onClick={bulkRemove}>Remove {sel.size} selected</button>}
            </div>
            <div className="rounded-lg border border-line divide-y divide-line">
              {explicit.length === 0 && <div className="px-3 py-2 text-2xs text-muted2">No one is shared on this {target.kind} directly{inherited.length ? ' (they inherit access above)' : ''}.</div>}
              {explicit.map((g) => (
                <div key={g.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <input type="checkbox" className="shrink-0" checked={sel.has(g.id)} onChange={() => toggleSel(g.id)} />
                  <Icon name="ti-user" className="text-muted2 shrink-0" />
                  <span className="flex-1 truncate">{userName(g.subject_user_id)}</span>
                  <Select width={130} value={g.level} onChange={(v) => change(g, v)} options={LEVELS} />
                  <button onClick={() => remove(g.id)} className="text-muted2 hover:text-rose-500" title="Remove"><Icon name="ti-x" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1"><Field label={`Share this ${target.kind} with`}><Select width={260} value={pick} onChange={setPick} search options={[{ value: '', label: 'Select a person…' }, ...candidates.map((p) => ({ value: p.id, label: p.full_name || p.email }))]} /></Field></div>
            <Select width={140} value={lvl} onChange={setLvl} options={LEVELS} />
            <button className="btn btn-primary" disabled={!pick || busy} onClick={add}><Icon name="ti-plus" />Add</button>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">Share with a link</p>
            <DriveLinkPanel target={{ drive_id: target.drive_id, folder_id: target.kind === 'folder' ? target.id : null, file_id: target.kind === 'file' ? target.id : null }} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">Your access to this {target.kind}: <span className="font-medium capitalize">{myLevel || 'none'}</span>.</p>
          {reqSent ? (
            <div className="rounded-lg border border-line px-3 py-3 text-sm flex items-center gap-2"><Icon name="ti-check" className="text-emerald-600" />Request sent — a manager will review it.</div>
          ) : (
            <div className="rounded-lg border border-line p-3 space-y-2">
              <p className="text-2xs uppercase tracking-wide text-muted2">Request access</p>
              <div className="flex items-center gap-2">
                <Select width={150} value={reqLevel} onChange={setReqLevel} options={LEVELS} />
                <input className="input flex-1" placeholder="Optional note to the owner" value={reqNote} onChange={(e) => setReqNote(e.target.value)} maxLength={500} />
              </div>
              <div className="flex justify-end"><button className="btn btn-primary" disabled={busy} onClick={sendRequest}><Icon name="ti-send" className="text-sm" />Request</button></div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

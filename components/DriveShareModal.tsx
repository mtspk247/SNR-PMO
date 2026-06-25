import { useEffect, useState } from 'react';
import { Modal, Field } from '@/components/Modal';
import { Icon } from '@/components/ui';
import Select from '@/components/Select';
import { OrgUser } from '@/lib/supabase';
import { Drive, DriveGrant, listDriveGrants, upsertUserGrant, removeDriveGrant, setDriveRestricted } from '@/lib/db';

const LEVELS = [{ value: 'viewer', label: 'Viewer' }, { value: 'commenter', label: 'Commenter' }, { value: 'editor', label: 'Editor' }];

// Share a drive with custom access levels. RLS is the wall; this UI only edits grants
// for managers (owner/admin/creator). Owners & admins always have full access.
export default function DriveShareModal({ drive, meId, people, canManage, onClose, onChanged }: {
  drive: Drive; meId: string; people: OrgUser[]; canManage: boolean; onClose: () => void; onChanged?: (restricted: boolean) => void;
}) {
  const [grants, setGrants] = useState<DriveGrant[]>([]);
  const [restricted, setRestricted] = useState<boolean>(!!drive.restricted);
  const [pick, setPick] = useState(''); const [lvl, setLvl] = useState('viewer');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  const load = () => listDriveGrants(drive.id).then(setGrants).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [drive.id]);

  const byId = (id: string | null) => people.find((p) => p.id === id);
  const userGrants = grants.filter((g) => g.subject_user_id);
  const granted = new Set(userGrants.map((g) => g.subject_user_id as string));
  const candidates = people.filter((p) => p.id !== meId && !granted.has(p.id));

  const toggleRestricted = async (v: boolean) => {
    setRestricted(v);
    try { await setDriveRestricted(drive.id, v); onChanged?.(v); } catch (e: any) { setErr(e.message); setRestricted(!v); }
  };
  const add = async () => {
    if (!pick || busy) return; setBusy(true); setErr('');
    try { await upsertUserGrant({ org_id: drive.org_id, drive_id: drive.id, subject_user_id: pick, level: lvl as any, created_by: meId }); setPick(''); setLvl('viewer'); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const change = async (g: DriveGrant, level: string) => {
    try { await upsertUserGrant({ org_id: drive.org_id, drive_id: drive.id, subject_user_id: g.subject_user_id as string, level: level as any, created_by: meId }); load(); }
    catch (e: any) { setErr(e.message); }
  };
  const remove = async (g: DriveGrant) => { try { await removeDriveGrant(g.id); load(); } catch (e: any) { setErr(e.message); } };

  return (
    <Modal open onClose={onClose} title={`Share “${drive.name}”`} icon="ti-user-share" size="md"
      footer={<button className="btn" onClick={onClose}>Done</button>}>
      {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
      <div className="space-y-4">
        <label className="flex items-start gap-3 p-3 rounded-lg border border-line cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={restricted} disabled={!canManage} onChange={(e) => toggleRestricted(e.target.checked)} />
          <span>
            <span className="text-sm font-medium block">Restrict access</span>
            <span className="text-2xs text-muted2">{restricted ? 'Only owners/admins and the people below can open this drive.' : 'Everyone in your workspace can access this drive (default).'}</span>
          </span>
        </label>

        {canManage && (
          <div className="flex items-end gap-2">
            <div className="flex-1"><Field label="Add person"><Select width={260} value={pick} onChange={setPick} search options={[{ value: '', label: 'Select a person…' }, ...candidates.map((p) => ({ value: p.id, label: p.full_name || p.email }))]} /></Field></div>
            <Select width={140} value={lvl} onChange={setLvl} options={LEVELS} />
            <button className="btn btn-primary" disabled={!pick || busy} onClick={add}><Icon name="ti-plus" />Add</button>
          </div>
        )}

        <div>
          <p className="text-2xs uppercase tracking-wide text-muted2 mb-1">People with access</p>
          <div className="rounded-lg border border-line divide-y divide-line">
            <div className="flex items-center gap-2 px-3 py-2 text-sm"><Icon name="ti-shield-check" className="text-accentstrong" /><span className="flex-1">Owners &amp; admins</span><span className="text-2xs text-muted2">Full access</span></div>
            {userGrants.length === 0 && !restricted && <div className="px-3 py-2 text-2xs text-muted2">Everyone in the workspace (drive is not restricted).</div>}
            {userGrants.map((g) => { const u = byId(g.subject_user_id); return (
              <div key={g.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Icon name="ti-user" className="text-muted2" />
                <span className="flex-1 truncate">{u?.full_name || u?.email || 'Unknown user'}</span>
                {canManage ? (<>
                  <Select width={130} value={g.level} onChange={(v) => change(g, v)} options={LEVELS} />
                  <button onClick={() => remove(g)} className="text-muted2 hover:text-rose-500" title="Remove"><Icon name="ti-x" /></button>
                </>) : <span className="text-2xs text-muted2 capitalize">{g.level}</span>}
              </div>); })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

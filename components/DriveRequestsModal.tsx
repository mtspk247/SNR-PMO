import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { Icon, Spinner } from '@/components/ui';
import { OrgUser } from '@/lib/supabase';
import { DriveAccessRequest, DriveFolder, DriveFile, listAccessRequests, decideAccessRequest } from '@/lib/db';

// Manager inbox: pending access requests for a drive, approve (mints the grant) / deny.
export default function DriveRequestsModal({ driveId, people, folders, files, onClose, onChange }: {
  driveId: string; people: OrgUser[]; folders: DriveFolder[]; files: DriveFile[]; onClose: () => void; onChange?: () => void;
}) {
  const [items, setItems] = useState<DriveAccessRequest[] | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const load = () => listAccessRequests({ driveId, status: 'pending' }).then(setItems).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [driveId]);
  const who = (id: string) => { const u = people.find((p) => p.id === id); return u?.full_name || u?.email || 'Someone'; };
  const targetName = (r: DriveAccessRequest) => r.file_id ? (files.find((f) => f.id === r.file_id)?.name || 'a file') : r.folder_id ? (folders.find((f) => f.id === r.folder_id)?.name || 'a folder') : 'the whole drive';
  const decide = async (r: DriveAccessRequest, approve: boolean) => { setBusy(true); setErr(''); try { await decideAccessRequest(r.id, approve); load(); onChange?.(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} size="md" icon="ti-inbox" title="Access requests"
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
      {items === null ? <Spinner /> : items.length === 0 ? <p className="text-2xs text-muted2 py-4 text-center">No pending requests.</p> : (
        <div className="space-y-2">
          {items.map((r) => (
            <div key={r.id} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex items-center gap-2">
                <Icon name="ti-user" className="text-muted2 shrink-0" />
                <span className="flex-1"><span className="font-medium">{who(r.requester_id)}</span> wants <span className="font-medium">{r.requested_level}</span> access to {targetName(r)}</span>
              </div>
              {r.note && <p className="text-2xs text-muted2 mt-1 pl-6">“{r.note}”</p>}
              <div className="flex gap-2 mt-2 pl-6">
                <button className="btn btn-primary h-7 py-0" disabled={busy} onClick={() => decide(r, true)}><Icon name="ti-check" className="text-sm" />Approve</button>
                <button className="btn h-7 py-0" disabled={busy} onClick={() => decide(r, false)}><Icon name="ti-x" className="text-sm" />Deny</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

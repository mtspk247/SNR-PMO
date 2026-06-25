import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { Icon, Spinner } from '@/components/ui';
import { OrgUser } from '@/lib/supabase';
import { DriveActivity, listActivity } from '@/lib/db';

const VERB: Record<string, { icon: string; label: string }> = {
  created: { icon: 'ti-plus', label: 'created this' },
  renamed: { icon: 'ti-pencil', label: 'renamed' },
  moved: { icon: 'ti-arrows-move', label: 'moved this' },
  archived: { icon: 'ti-archive', label: 'archived this' },
  restored: { icon: 'ti-arrow-back-up', label: 'restored this' },
  deleted: { icon: 'ti-trash', label: 'deleted this' },
};

// Activity / audit history for a file or folder. Read-gated by RLS (drive viewers+).
export default function DriveActivityModal({ fileId, folderId, name, people, onClose }: {
  fileId?: string; folderId?: string; name: string; people: OrgUser[]; onClose: () => void;
}) {
  const [items, setItems] = useState<DriveActivity[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { listActivity({ fileId, folderId }).then(setItems).catch((e) => setErr(e.message)); }, [fileId, folderId]);
  const who = (id: string | null) => { if (!id) return 'System'; const u = people.find((p) => p.id === id); return u?.full_name || u?.email || 'Someone'; };
  return (
    <Modal open onClose={onClose} size="md" icon="ti-history" title={`Activity — ${name}`}
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
      {items === null ? <Spinner /> : items.length === 0 ? <p className="text-2xs text-muted2 py-4 text-center">No activity recorded yet.</p> : (
        <ul className="space-y-2 max-h-[55vh] overflow-auto">
          {items.map((a) => { const v = VERB[a.action] || { icon: 'ti-point', label: a.action }; return (
            <li key={a.id} className="flex items-start gap-2 text-sm">
              <Icon name={v.icon} className="text-muted2 mt-0.5 shrink-0" />
              <span className="flex-1">
                <span className="font-medium">{who(a.actor_id)}</span> {v.label}
                {a.action === 'renamed' && a.detail && a.detail.from ? <span className="text-muted2"> “{a.detail.from}” → “{a.detail.to}”</span> : null}
                <span className="block text-2xs text-muted2">{new Date(a.created_at).toLocaleString()}</span>
              </span>
            </li>
          ); })}
        </ul>
      )}
    </Modal>
  );
}

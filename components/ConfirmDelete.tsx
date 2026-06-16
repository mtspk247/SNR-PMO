import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { Icon } from '@/components/ui';
import { softDelete } from '@/lib/db';
import { useActiveOrg } from '@/lib/store';

/**
 * Safe-delete trigger + confirmation modal. Routes the delete through Trash
 * (reversible 30 days). For core/parent records, when the org's
 * `require_delete_confirm` setting is on (default), the user must type DELETE.
 */
export default function ConfirmDelete({
  entityType, id, name, isCore = true, label = 'Delete', iconOnly = false, className = '', onDeleted,
}: {
  entityType: string; id: string; name?: string; isCore?: boolean;
  label?: string; iconOnly?: boolean; className?: string; onDeleted?: () => void;
}) {
  const org = useActiveOrg();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const requireType = isCore && (org?.branding as any)?.require_delete_confirm !== false; // default ON
  const ready = !requireType || typed.trim().toUpperCase() === 'DELETE';
  const close = () => { setOpen(false); setTyped(''); setErr(''); };

  const run = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr('');
    try { await softDelete(entityType, id); close(); onDeleted?.(); }
    catch (e: any) { setErr(e?.message || 'Delete failed'); } finally { setBusy(false); }
  };

  return (
    <>
      {iconOnly ? (
        <button onClick={(e) => { e.stopPropagation(); setOpen(true); }} title={label} className={className || 'text-muted2 hover:text-rose-600'}><Icon name="ti-trash" className="text-base" /></button>
      ) : (
        <button onClick={(e) => { e.stopPropagation(); setOpen(true); }} className={className || 'btn btn-danger'}><Icon name="ti-trash" />{label}</button>
      )}
      {open && (
        <Modal open onClose={close} size="sm" icon="ti-alert-triangle" title={`Delete ${name ? `“${name}”` : 'this item'}?`}
          footer={<>
            <button className="btn btn-ghost" onClick={close}>Cancel</button>
            <button className="btn btn-danger ml-auto" disabled={!ready || busy} onClick={run}>{busy ? 'Deleting…' : 'Delete'}</button>
          </>}>
          <div className="space-y-3">
            <p className="text-sm text-content">This moves it to <span className="font-medium">Trash</span>, where it can be restored for 30 days. Nested items removed alongside it are not restored.</p>
            {requireType && (
              <div>
                <p className="text-2xs text-muted mb-1">Type <span className="font-mono font-semibold">DELETE</span> to confirm.</p>
                <input autoFocus className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE"
                  onKeyDown={(e) => { if (e.key === 'Enter') run(); }} />
              </div>
            )}
            {err && <p className="text-sm text-rose-600">{err}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

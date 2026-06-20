import { useState } from 'react';
import Select from '@/components/Select';
import { CUSTOM_FIELD_TYPES, NEEDS_OPTIONS } from '@/components/useCustomColumns';
import type { CustomColumnsApi } from '@/components/useCustomColumns';

// Shared "+ Add column" form — offers all ClickUp field types + options for dropdown/labels.
export default function AddColumnForm({ cf, onDone }: { cf: CustomColumnsApi; onDone?: () => void }) {
  const [nm, setNm] = useState('');
  const [ty, setTy] = useState('text');
  const [opts, setOpts] = useState('');
  const [busy, setBusy] = useState(false);
  const needsOpts = NEEDS_OPTIONS.has(ty);
  const submit = async () => {
    const n = nm.trim(); if (!n || busy) return;
    setBusy(true);
    const options = needsOpts ? opts.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) : undefined;
    try { await cf.addColumn(n, ty, options); setNm(''); setTy('text'); setOpts(''); if (onDone) onDone(); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <p className="text-2xs font-semibold text-muted2 uppercase tracking-wider px-0.5">New column</p>
      <input autoFocus value={nm} onChange={(e) => setNm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="Column name" className="input h-8 text-sm w-full" />
      <Select value={ty} onChange={setTy} options={CUSTOM_FIELD_TYPES.map((t) => ({ value: t.value, label: t.label }))} className="h-8 text-sm" />
      {needsOpts && <textarea value={opts} onChange={(e) => setOpts(e.target.value)} placeholder="Options — one per line or comma-separated" rows={3} className="input text-sm w-full py-1.5" />}
      <button onClick={submit} disabled={busy} className="btn btn-primary h-8 text-xs w-full">{busy ? 'Adding…' : 'Add column'}</button>
    </div>
  );
}

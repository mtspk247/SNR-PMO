import { useState } from 'react';
import Select from '@/components/Select';
import { CUSTOM_FIELD_TYPES, NEEDS_OPTIONS } from '@/components/useCustomColumns';
import type { CustomColumnsApi } from '@/components/useCustomColumns';
import OptionsEditor, { OptionsValue } from '@/components/OptionsEditor';

// Shared "+ Add column" form — offers all ClickUp field types + colored, reorderable
// options for dropdown/labels fields (via OptionsEditor).
export default function AddColumnForm({ cf, onDone }: { cf: CustomColumnsApi; onDone?: () => void }) {
  const [nm, setNm] = useState('');
  const [ty, setTy] = useState('text');
  const [opts, setOpts] = useState<OptionsValue>({ options: [''], meta: {} });
  const [busy, setBusy] = useState(false);
  const needsOpts = NEEDS_OPTIONS.has(ty);
  const submit = async () => {
    const n = nm.trim(); if (!n || busy) return;
    setBusy(true);
    let options: string[] | undefined; let meta: Record<string, string> | undefined;
    if (needsOpts) {
      options = opts.options.map((s) => s.trim()).filter(Boolean);
      meta = {}; options.forEach((o) => { if (opts.meta[o]) meta![o] = opts.meta[o]; });
    }
    try { await cf.addColumn(n, ty, options, meta); setNm(''); setTy('text'); setOpts({ options: [''], meta: {} }); if (onDone) onDone(); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <p className="text-2xs font-semibold text-muted2 uppercase tracking-wider px-0.5">New column</p>
      <input autoFocus value={nm} onChange={(e) => setNm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !needsOpts) submit(); }} placeholder="Column name" className="input h-8 text-sm w-full" />
      <Select value={ty} onChange={setTy} options={CUSTOM_FIELD_TYPES.map((t) => ({ value: t.value, label: t.label }))} className="h-8 text-sm" />
      {needsOpts && <div className="rounded-md border border-line/70 p-2"><OptionsEditor value={opts} onChange={setOpts} /></div>}
      <button onClick={submit} disabled={busy} className="btn btn-primary h-8 text-xs w-full">{busy ? 'Adding…' : 'Add column'}</button>
    </div>
  );
}

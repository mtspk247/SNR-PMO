import { useState } from 'react';
import { Icon } from '@/components/ui';
import { OPTION_PALETTE, defaultOptionColor } from '@/components/useCustomColumns';
import type { CustomColumnsApi } from '@/components/useCustomColumns';
import type { CustomFieldDef } from '@/lib/supabase';

// Shared editor for the options of a Dropdown / Labels custom field: per-option
// colour (ClickUp-style colored pills) + drag-to-reorder. Used by the "+ Add column"
// form (new fields) and the Columns menu (editing an existing field), so options
// behave identically on every list in the app.

export type OptionsValue = { options: string[]; meta: Record<string, string> };

export default function OptionsEditor({ value, onChange }: { value: OptionsValue; onChange: (v: OptionsValue) => void }) {
  const { options, meta } = value;
  const [drag, setDrag] = useState<number | null>(null);
  const [palOpen, setPalOpen] = useState<number | null>(null);
  const emit = (o: string[], m: Record<string, string>) => onChange({ options: o, meta: m });
  const colorOf = (i: number) => meta[options[i]] || defaultOptionColor(options[i] || '');
  const setLabel = (i: number, label: string) => {
    const old = options[i];
    const next = [...options]; next[i] = label;
    const m = { ...meta };
    if (old && old in m && old !== label) { m[label] = m[old]; delete m[old]; }
    emit(next, m);
  };
  const setColor = (i: number, color: string) => { setPalOpen(null); emit(options, { ...meta, [options[i] || '']: color }); };
  const add = () => emit([...options, ''], meta);
  const remove = (i: number) => { const m = { ...meta }; delete m[options[i]]; emit(options.filter((_, j) => j !== i), m); };
  const onDrop = (i: number) => { if (drag === null || drag === i) { setDrag(null); return; } const next = [...options]; const [x] = next.splice(drag, 1); next.splice(i, 0, x); setDrag(null); emit(next, meta); };
  return (
    <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
      {options.map((o, i) => (
        <div key={i} draggable
          onDragStart={(e) => { e.stopPropagation(); setDrag(i); }}
          onDragEnd={(e) => { e.stopPropagation(); setDrag(null); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => { e.stopPropagation(); onDrop(i); }}
          className={`flex items-center gap-1.5 ${drag === i ? 'opacity-40' : ''}`}>
          <Icon name="ti-grip-vertical" className="text-sm text-muted2 cursor-grab shrink-0" title="Drag to reorder" />
          <div className="relative shrink-0">
            <button type="button" onClick={() => setPalOpen((p) => (p === i ? null : i))} title="Pick colour"
              className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/10 block" style={{ background: colorOf(i) }} />
            {palOpen === i && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setPalOpen(null)} aria-hidden />
                <div className="absolute left-0 top-6 z-40 w-44 bg-surface border border-line rounded-lg shadow-lg p-2 grid grid-cols-7 gap-1.5">
                  {OPTION_PALETTE.map((c) => (
                    <button key={c} type="button" onClick={() => setColor(i, c)} title={c}
                      className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/10 hover:scale-110 transition" style={{ background: c }} />
                  ))}
                </div>
              </>
            )}
          </div>
          <input value={o} onChange={(e) => setLabel(i, e.target.value)} placeholder="Option label" className="input h-8 text-sm flex-1 min-w-0" />
          <button type="button" onClick={() => remove(i)} title="Remove" className="text-muted2 hover:text-rose-500 shrink-0"><Icon name="ti-x" className="text-sm" /></button>
        </div>
      ))}
      <button type="button" onClick={add} className="flex items-center gap-1.5 text-xs text-accentstrong hover:underline px-0.5"><Icon name="ti-plus" className="text-sm" />Add option</button>
    </div>
  );
}

export function ColumnOptionsEditor({ def, cf }: { def: CustomFieldDef; cf: CustomColumnsApi }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<OptionsValue>({ options: def.options || [], meta: def.option_meta || {} });
  const [busy, setBusy] = useState(false);
  const openEditor = () => { setDraft({ options: def.options || [], meta: def.option_meta || {} }); setOpen(true); };
  const save = async () => {
    setBusy(true);
    const options = draft.options.map((s) => s.trim()).filter(Boolean);
    const meta: Record<string, string> = {};
    options.forEach((o) => { if (draft.meta[o]) meta[o] = draft.meta[o]; });
    try { await cf.updateColumnOptions('cf:' + def.id, options, meta); setOpen(false); }
    finally { setBusy(false); }
  };
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={openEditor} title="Edit options & colours" className="text-muted2 hover:text-content"><Icon name="ti-palette" className="text-sm" /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-6 z-30 w-64 bg-surface border border-line rounded-lg shadow-lg p-2" onClick={(e) => e.stopPropagation()}>
            <p className="text-2xs font-semibold text-muted2 uppercase tracking-wider px-0.5 mb-1.5 truncate">Options · {def.name}</p>
            <OptionsEditor value={draft} onChange={setDraft} />
            <button type="button" onClick={save} disabled={busy} className="btn btn-primary h-8 text-xs w-full mt-2">{busy ? 'Saving…' : 'Save options'}</button>
          </div>
        </>
      )}
    </div>
  );
}

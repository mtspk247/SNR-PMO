import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui';
import { CUSTOM_FIELD_TYPES, NEEDS_OPTIONS, AI_TRANSFORMS } from '@/components/useCustomColumns';
import type { CustomColumnsApi } from '@/components/useCustomColumns';
import OptionsEditor, { OptionsValue } from '@/components/OptionsEditor';
import { RELATION_ENTITIES } from '@/lib/db';

// "+ Add column" → a searchable, grouped field-type palette (ClickUp "Fields" panel):
// pick a type from the list, name it (+ colored options for choice fields), Add.
// Every field is created via the org-scoped createCustomFieldDef (RLS-enforced).
export default function AddColumnForm({ cf, onDone }: { cf: CustomColumnsApi; onDone?: () => void }) {
  const [q, setQ] = useState('');
  const [ty, setTy] = useState<string | null>(null);
  const [nm, setNm] = useState('');
  const [opts, setOpts] = useState<OptionsValue>({ options: [''], meta: {} });
  const [aiT, setAiT] = useState('summarize');
  const [aiP, setAiP] = useState('');
  const [busy, setBusy] = useState(false);
  const [relEntity, setRelEntity] = useState('projects');

  const sel = ty ? CUSTOM_FIELD_TYPES.find((t) => t.value === ty) : null;
  const needsOpts = !!ty && NEEDS_OPTIONS.has(ty);
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const matched = CUSTOM_FIELD_TYPES.filter((t) => !ql || t.label.toLowerCase().includes(ql) || t.value.includes(ql));
    return ['Basic', 'Numeric', 'Choice', 'Contact', 'Connect', 'AI']
      .map((g) => ({ g, items: matched.filter((t) => t.group === g) }))
      .filter((x) => x.items.length);
  }, [q]);

  const submit = async () => {
    const n = nm.trim(); if (!n || !ty || busy) return;
    setBusy(true);
    let options: string[] | undefined; let meta: Record<string, string> | undefined;
    if (ty === 'ai') {
      meta = { ai_transform: aiT };
      if (aiT === 'custom' && aiP.trim()) meta.ai_prompt = aiP.trim();
      if (aiT === 'categorize') { options = opts.options.map((s) => s.trim()).filter(Boolean); options.forEach((o) => { if (opts.meta[o]) meta![o] = opts.meta[o]; }); }
    } else if (needsOpts) { options = opts.options.map((s) => s.trim()).filter(Boolean); meta = {}; options.forEach((o) => { if (opts.meta[o]) meta![o] = opts.meta[o]; }); }
    else if (ty === 'relationship') { meta = { relation_entity: relEntity }; }
    try { await cf.addColumn(n, ty, options, meta); if (onDone) onDone(); }
    finally { setBusy(false); }
  };

  if (!ty) {
    return (
      <div className="w-full" onClick={(e) => e.stopPropagation()}>
        <p className="text-2xs font-semibold text-muted2 uppercase tracking-wider px-0.5 mb-1.5">Add a field</p>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search field types…" className="input h-8 text-sm w-full mb-2" />
        <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-2">
          {groups.map(({ g, items }) => (
            <div key={g}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted2 px-1 mb-0.5">{g}</p>
              {items.map((t) => (
                <button key={t.value} onClick={() => { setTy(t.value); setNm(''); setOpts({ options: [''], meta: {} }); }}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-content hover:bg-surface2 text-left">
                  <Icon name={t.icon} className="text-base text-muted2 shrink-0" />
                  <span className="truncate">{t.label}</span>
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && <p className="text-2xs text-muted px-1 py-2">No field type matches that search.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setTy(null)} className="inline-flex items-center gap-1 text-2xs text-muted hover:text-content"><Icon name="ti-chevron-left" className="text-xs" />All fields</button>
      <div className="flex items-center gap-2 px-0.5"><Icon name={sel?.icon || 'ti-plus'} className="text-base text-accentstrong" /><span className="text-sm font-medium text-content">{sel?.label}</span></div>
      <input autoFocus value={nm} onChange={(e) => setNm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !needsOpts) submit(); }} placeholder="Field name" className="input h-8 text-sm w-full" />
      {ty === 'relationship' && (
        <div>
          <p className="text-2xs text-muted2 mb-1">Link to records from…</p>
          <select value={relEntity} onChange={(e) => setRelEntity(e.target.value)} className="input h-8 text-sm w-full">
            {RELATION_ENTITIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-[10px] text-muted2 mt-1 inline-flex items-center gap-1"><Icon name="ti-info-circle" className="text-xs" />Each cell links one record from {RELATION_ENTITIES.find((o) => o.value === relEntity)?.label || 'the module'}; pick it inline.</p>
        </div>
      )}
      {ty === 'ai' && (
        <div className="space-y-2">
          <div>
            <p className="text-2xs text-muted2 mb-1">What should AI put in this column?</p>
            <div className="grid grid-cols-2 gap-1">
              {AI_TRANSFORMS.map((o) => (
                <button key={o.value} onClick={() => setAiT(o.value)} title={o.hint}
                  className={`px-2 py-1.5 rounded-md text-xs text-left border ${aiT === o.value ? 'border-accent bg-accent/10 text-accentstrong' : 'border-line text-muted hover:bg-surface2'}`}>{o.label}</button>
              ))}
            </div>
          </div>
          {aiT === 'categorize' && <div className="rounded-md border border-line/70 p-2"><p className="text-2xs text-muted2 mb-1">Categories AI may choose from</p><OptionsEditor value={opts} onChange={setOpts} /></div>}
          {aiT === 'custom' && <textarea value={aiP} onChange={(e) => setAiP(e.target.value)} placeholder="e.g. Extract the city from the address" className="input text-sm w-full min-h-[60px] resize-y" />}
          <p className="text-[10px] text-muted2 inline-flex items-center gap-1"><Icon name="ti-info-circle" className="text-xs" />Reads the row and fills this cell on demand (\u2728). Needs an AI key connected in Console.</p>
        </div>
      )}
      {needsOpts && <div className="rounded-md border border-line/70 p-2"><OptionsEditor value={opts} onChange={setOpts} /></div>}
      <button onClick={submit} disabled={busy || !nm.trim()} className="btn btn-primary h-8 text-xs w-full">{busy ? 'Adding…' : 'Add field'}</button>
    </div>
  );
}

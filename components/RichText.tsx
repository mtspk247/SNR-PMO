import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';

type MergeField = { label: string; token: string };

/** Lightweight dependency-free rich-text editor (contentEditable + toolbar).
 *  Stores HTML. Optional merge-field inserter drops {{tokens}} at the cursor. */
export default function RichText({ value, onChange, mergeFields = [], minHeight = 320 }: {
  value: string; onChange: (html: string) => void; mergeFields?: MergeField[]; minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) ref.current.innerHTML = value || '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd: string, arg?: string) => { document.execCommand(cmd, false, arg); ref.current?.focus(); emit(); };
  const emit = () => { if (ref.current) onChange(ref.current.innerHTML); };
  const insert = (token: string) => { ref.current?.focus(); document.execCommand('insertText', false, token); setFieldsOpen(false); emit(); };
  const Btn = ({ cmd, arg, icon, title }: { cmd: string; arg?: string; icon: string; title: string }) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); exec(cmd, arg); }} className="w-8 h-8 grid place-items-center rounded hover:bg-surface2 text-muted hover:text-content"><Icon name={icon} className="text-base" /></button>
  );

  return (
    <div className="rounded-lg border border-line overflow-hidden bg-surface">
      <div className="flex items-center gap-0.5 flex-wrap px-1.5 py-1 border-b border-line bg-surface2/50">
        <Btn cmd="formatBlock" arg="<h2>" icon="ti-h-1" title="Heading" />
        <Btn cmd="formatBlock" arg="<h3>" icon="ti-h-2" title="Subheading" />
        <Btn cmd="formatBlock" arg="<p>" icon="ti-pilcrow" title="Paragraph" />
        <span className="w-px h-5 bg-line mx-1" />
        <Btn cmd="bold" icon="ti-bold" title="Bold" />
        <Btn cmd="italic" icon="ti-italic" title="Italic" />
        <Btn cmd="underline" icon="ti-underline" title="Underline" />
        <span className="w-px h-5 bg-line mx-1" />
        <Btn cmd="insertUnorderedList" icon="ti-list" title="Bullet list" />
        <Btn cmd="insertOrderedList" icon="ti-list-numbers" title="Numbered list" />
        <Btn cmd="formatBlock" arg="<blockquote>" icon="ti-quote" title="Quote" />
        <button type="button" title="Link" onMouseDown={(e) => { e.preventDefault(); const u = prompt('Link URL'); if (u) exec('createLink', u); }} className="w-8 h-8 grid place-items-center rounded hover:bg-surface2 text-muted hover:text-content"><Icon name="ti-link" className="text-base" /></button>
        <Btn cmd="removeFormat" icon="ti-clear-formatting" title="Clear formatting" />
        {mergeFields.length > 0 && (
          <div className="relative ml-auto">
            <button type="button" onClick={() => setFieldsOpen((v) => !v)} className="btn btn-ghost border border-line h-8 py-0 text-xs"><Icon name="ti-braces" className="text-sm" />Insert field</button>
            {fieldsOpen && <button type="button" aria-hidden className="fixed inset-0 z-20" onClick={() => setFieldsOpen(false)} />}
            {fieldsOpen && (
              <div className="absolute right-0 mt-1 z-30 w-56 max-h-72 overflow-y-auto card p-1 shadow-lg">
                {mergeFields.map((m) => (
                  <button key={m.token} type="button" onMouseDown={(e) => { e.preventDefault(); insert(m.token); }} className="w-full text-left px-2.5 py-1.5 rounded-md text-sm hover:bg-surface2 flex items-center justify-between gap-2"><span>{m.label}</span><code className="text-2xs text-muted2">{m.token}</code></button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning onInput={emit} onBlur={emit}
        className="prose-doc px-4 py-3 text-sm text-content focus:outline-none overflow-y-auto"
        style={{ minHeight }} />
    </div>
  );
}

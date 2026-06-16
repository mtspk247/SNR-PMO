import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';

export interface DropItem { value: string; label: string; icon?: string; dot?: string; }

/**
 * Smooth, consistent custom dropdown used app-wide instead of native <select>.
 * Renders the menu fixed-positioned (anchored to the trigger) so it never clips
 * inside scrolling modal panes. Single-select (value/onChange) or multi-select
 * (multiple + values/onToggle). Optional search box and a footer (e.g. "create").
 */
export default function Dropdown({
  items, value, onChange, trigger, align = 'left', width = 224, search = false,
  multiple = false, values = [], onToggle, footer, placeholder, disabled = false,
}: {
  items: DropItem[];
  value?: string;
  onChange?: (v: string) => void;
  trigger: React.ReactNode;
  align?: 'left' | 'right';
  width?: number;
  search?: boolean;
  multiple?: boolean;
  values?: string[];
  onToggle?: (v: string) => void;
  footer?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    let left = align === 'right' ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const top = Math.min(r.bottom + 6, window.innerHeight - 80);
    setPos({ top, left });
  };
  useLayoutEffect(() => { if (open) { place(); setQ(''); } /* eslint-disable-next-line */ }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const filtered = q ? items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())) : items;

  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} onClick={() => !disabled && setOpen((o) => !o)} className="inline-flex items-center text-left max-w-full disabled:opacity-60">
        {trigger}
      </button>
      {open && pos && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} aria-hidden />
          <div className="fixed z-[61] animate-in" style={{ top: pos.top, left: pos.left, width }}>
            <div className="bg-surface border border-line rounded-xl shadow-lg p-1.5 max-h-[18rem] overflow-y-auto">
              {search && (
                <div className="px-0.5 pb-1.5">
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onClick={(e) => e.stopPropagation()}
                    placeholder={placeholder || 'Search…'} className="input h-8 text-sm" />
                </div>
              )}
              {filtered.map((it) => {
                const active = multiple ? values.includes(it.value) : value === it.value;
                return (
                  <button key={it.value} type="button"
                    onClick={() => { if (multiple) { onToggle?.(it.value); } else { onChange?.(it.value); setOpen(false); } }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-left transition-colors ${active ? 'bg-accent/10 text-accentstrong font-medium' : 'text-content hover:bg-surface2'}`}>
                    {it.dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: it.dot }} />}
                    {it.icon && <Icon name={it.icon} className="text-base text-muted2 shrink-0" />}
                    <span className="flex-1 truncate">{it.label}</span>
                    {active && <Icon name="ti-check" className="text-sm text-accentstrong shrink-0" />}
                  </button>
                );
              })}
              {filtered.length === 0 && <div className="px-2.5 py-2 text-sm text-muted2">No matches</div>}
              {footer && <div className="border-t border-line mt-1 pt-1.5 px-0.5" onClick={(e) => e.stopPropagation()}>{footer}</div>}
            </div>
          </div>
        </>
      )}
    </>
  );
}

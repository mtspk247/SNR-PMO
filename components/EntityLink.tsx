import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon } from '@/components/ui';

export type EntityAction = { label: string; icon: string; onClick: () => void };

/**
 * Cross-navigation dropdown on an entity name (inside modals/drawers/tables).
 * Click the name → menu: Open page, Copy link, plus rights-gated extra actions.
 */
export default function EntityLink({ label, icon = 'ti-link', href, actions = [], maxWidth = 'max-w-[10rem]' }: {
  label: string;
  icon?: string;
  href: string;
  actions?: EntityAction[];
  maxWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const items: EntityAction[] = [
    { label: 'Open', icon: 'ti-external-link', onClick: () => router.push(href) },
    { label: 'Copy link', icon: 'ti-copy', onClick: () => { navigator.clipboard?.writeText(window.location.origin + href).catch(() => {}); } },
    ...actions,
  ];

  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center gap-1 font-medium text-content hover:text-accentstrong transition group">
        <Icon name={icon} className="text-sm text-muted group-hover:text-accentstrong" />
        <span className={`truncate ${maxWidth}`}>{label}</span>
        <Icon name="ti-chevron-down" className="text-xs text-muted2" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-surface border border-line rounded-md shadow-lg py-1">
          {items.map((a) => (
            <button key={a.label} type="button" onClick={(e) => { e.stopPropagation(); setOpen(false); a.onClick(); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-content hover:bg-surface2 text-left">
              <Icon name={a.icon} className="text-sm text-muted" />{a.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

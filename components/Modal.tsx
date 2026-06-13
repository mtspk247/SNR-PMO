import React, { useEffect } from 'react';
import { Icon } from '@/components/ui';

type Size = 'sm' | 'md' | 'lg' | 'xl';
const WIDTH: Record<Size, string> = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

export interface ModalTab { key: string; label: string; icon?: string; badge?: number | string | null }

/** Tiny controlled-tab helper for tabbed modals: const t = useModalTabs('basics'); <Modal tabs={…} {...t.bind}> */
export function useModalTabs(initial: string) {
  const [tab, setTab] = React.useState(initial);
  return { tab, setTab, bind: { tab, onTab: setTab } };
}

/**
 * Reusable modal shell — token-driven so it flips with the theme.
 * Header (optional accent icon tile + title + subtitle + X), scrollable body,
 * optional sticky footer. Esc closes; Cmd/Ctrl+Enter fires onSubmit when provided.
 * `headerExtra` renders inline next to the title (pills, EntityLink dropdowns…).
 */
export function Modal({
  open, onClose, title, subtitle, icon, size = 'md', onSubmit, children, footer, headerExtra, tabs, tab, onTab,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: string;
  size?: Size;
  onSubmit?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerExtra?: React.ReactNode;
  /** Optional tab strip under the header — long forms switch panels instead of scrolling. */
  tabs?: ModalTab[];
  tab?: string;
  onTab?: (key: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(); }
      else if (e.key === 'Enter' && onSubmit) {
        // Standard form behaviour: Enter in a single-line input/select submits.
        const t = e.target as HTMLElement;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) { e.preventDefault(); onSubmit(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose, onSubmit]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`modal-card card w-full ${WIDTH[size]} max-h-[90vh] flex flex-col overflow-hidden shadow-xl`}
      >
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-line">
          {icon && (
            <span className="w-9 h-9 shrink-0 rounded-lg grid place-items-center bg-accent/10 text-accentstrong">
              <Icon name={icon} className="text-lg" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-lg font-semibold tracking-tight text-content leading-tight truncate">{title}</h3>
              {headerExtra}
            </div>
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn btn-ghost h-8 w-8 px-0 -mt-1 -mr-1 text-muted hover:text-content"
          >
            <Icon name="ti-x" />
          </button>
        </div>

        {tabs && tabs.length > 0 && (
          <div className="px-6 border-b border-line bg-surface2/30 flex items-center gap-1 overflow-x-auto" role="tablist">
            {tabs.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onTab?.(t.key)}
                  className={`relative shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors -mb-px border-b-2 ${
                    active ? 'border-accent text-content' : 'border-transparent text-muted hover:text-content'
                  }`}
                >
                  {t.icon && <Icon name={t.icon} className="text-sm" />}
                  {t.label}
                  {t.badge != null && t.badge !== 0 && (
                    <span className="text-2xs px-1.5 py-px rounded-full bg-accent/10 text-accentstrong">{t.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <div className="px-6 py-5 overflow-y-auto">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-line bg-surface2/40 flex items-center gap-2">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** Consistent labelled field wrapper — required marker + optional helper hint. */
export function Field({ label, required, hint, className = '', children }: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="label">{label}{required && <span className="text-rose-500 ml-0.5">*</span>}</label>
      {children}
      {hint && <p className="text-2xs text-muted2 mt-1">{hint}</p>}
    </div>
  );
}

/** Titled group inside a modal body — separates long forms into scannable sections. */
export function ModalSection({ title, icon, children, className = '' }: {
  title: string;
  icon?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`pt-4 mt-4 border-t border-line first:pt-0 first:mt-0 first:border-t-0 ${className}`}>
      <p className="text-2xs uppercase tracking-wide text-muted2 mb-3 flex items-center gap-1.5">
        {icon && <Icon name={icon} className="text-sm" />}{title}
      </p>
      {children}
    </div>
  );
}

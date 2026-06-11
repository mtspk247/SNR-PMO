import React, { useEffect } from 'react';
import { Icon } from '@/components/ui';

type Size = 'sm' | 'md' | 'lg';
const WIDTH: Record<Size, string> = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

/**
 * Reusable modal shell — token-driven so it flips with the theme.
 * Header (optional accent icon tile + title + subtitle + X), scrollable body,
 * optional sticky footer. Esc closes; Cmd/Ctrl+Enter fires onSubmit when provided.
 */
export function Modal({
  open, onClose, title, subtitle, icon, size = 'md', onSubmit, children, footer,
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
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(); }
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
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-line">
          {icon && (
            <span className="w-9 h-9 shrink-0 rounded-lg grid place-items-center bg-accent/10 text-accentstrong">
              <Icon name={icon} className="text-lg" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-content leading-tight">{title}</h3>
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

        <div className="px-5 py-4 overflow-y-auto">{children}</div>

        {footer && (
          <div className="px-5 py-3.5 border-t border-line bg-surface2/40 flex items-center gap-2">{footer}</div>
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

import React from 'react';

export const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <i className={`ti ${name} ${className}`} aria-hidden="true" />
);

const COLOR: Record<string, string> = {
  // projects
  Planning: 'pill-blue', Active: 'pill-green', 'On Hold': 'pill-amber', Completed: 'pill-violet', Cancelled: 'pill-red',
  // priority
  Low: 'pill-gray', Medium: 'pill-blue', High: 'pill-amber', Urgent: 'pill-red',
  // tasks
  Backlog: 'pill-gray', 'To Do': 'pill-blue', 'In Progress': 'pill-amber', Review: 'pill-violet', Done: 'pill-green',
  // deals
  Lead: 'pill-gray', Qualified: 'pill-blue', Proposal: 'pill-violet', Negotiation: 'pill-amber', Won: 'pill-green', Lost: 'pill-red',
  // contacts
  Customer: 'pill-green', Inactive: 'pill-gray',
  // risks
  Open: 'pill-red', Mitigating: 'pill-amber', Monitoring: 'pill-blue', Closed: 'pill-green', Accepted: 'pill-gray',
  Operational: 'pill-blue', Financial: 'pill-violet', Technical: 'pill-amber', Schedule: 'pill-gray', External: 'pill-red',
  // health
  'On track': 'pill-green', 'At risk': 'pill-amber', 'Off track': 'pill-red',
};

export const Pill = ({ label }: { label: string }) => (
  <span className={`pill ${COLOR[label] || 'pill-gray'}`}>{label}</span>
);

export const Avatar = ({ name, size = 28 }: { name: string; size?: number }) => {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="inline-flex items-center justify-center rounded-full bg-surface2 text-content font-medium shrink-0"
    >{initials}</span>
  );
};

export const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-muted2">
    <Icon name="ti-loader-2" className="animate-spin text-2xl" />
  </div>
);

export const StatCard = ({ label, value, hint, hintTone = 'muted', icon }:
  { label: string; value: React.ReactNode; hint?: string; hintTone?: 'muted' | 'up' | 'down'; icon?: string }) => (
  <div className="stat group">
    <div className="flex items-start justify-between gap-2">
      <p className="section-label">{label}</p>
      {icon && (
        <span className="w-8 h-8 -mt-0.5 -mr-0.5 rounded-lg grid place-items-center bg-accent/10 text-accentstrong shrink-0 transition group-hover:bg-accent group-hover:text-accentfg">
          <Icon name={icon} className="text-base" />
        </span>
      )}
    </div>
    <p className="text-[1.7rem] leading-tight font-semibold mt-2 text-content tnum">{value}</p>
    {hint && (
      <p className={`text-2xs mt-1.5 inline-flex items-center gap-1 font-medium ${hintTone === 'up' ? 'text-emerald-600' : hintTone === 'down' ? 'text-rose-600' : 'text-muted2'}`}>
        {hintTone === 'up' && <Icon name="ti-trending-up" className="text-sm" />}
        {hintTone === 'down' && <Icon name="ti-trending-down" className="text-sm" />}
        {hint}
      </p>
    )}
  </div>
);

export const PageHeader = ({ title, subtitle, action, icon }:
  { title: string; subtitle?: string; action?: React.ReactNode; icon?: string }) => (
  <div className="flex items-start justify-between gap-3 mb-5">
    <div className="flex items-start gap-3 min-w-0">
      {icon && (
        <span className="w-10 h-10 shrink-0 rounded-xl grid place-items-center bg-accent/10 text-accentstrong ring-1 ring-inset ring-accent/15">
          <Icon name={icon} className="text-xl" />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const EmptyState = ({ icon = 'ti-inbox', title, text, action }: { icon?: string; title?: string; text: string; action?: React.ReactNode }) => (
  <div className="flex flex-col items-center justify-center text-center py-16 px-6">
    <span className="w-12 h-12 rounded-2xl grid place-items-center bg-surface2 text-muted2 ring-1 ring-inset ring-line mb-3">
      <Icon name={icon} className="text-2xl" />
    </span>
    {title && <p className="text-sm font-semibold text-content">{title}</p>}
    <p className="text-sm text-muted2 max-w-xs mt-0.5">{text}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/** Underline-style tab strip (token-driven). Counts render as small pills. */
export const Tabs = ({ tabs, active, onChange }: {
  tabs: { key: string; label: string; icon?: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}) => (
  <div className="flex items-center gap-1 border-b border-line mb-4 overflow-x-auto">
    {tabs.map((t) => (
      <button key={t.key} onClick={() => onChange(t.key)}
        className={`relative flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap transition -mb-px border-b-2
          ${active === t.key ? 'border-accent text-content font-medium' : 'border-transparent text-muted hover:text-content'}`}>
        {t.icon && <Icon name={t.icon} className="text-base" />}
        {t.label}
        {typeof t.count === 'number' && (
          <span className={`pill ${active === t.key ? 'bg-accent/15 text-accentstrong' : 'pill-gray'}`}>{t.count}</span>
        )}
      </button>
    ))}
  </div>
);

export const Phase2 = ({ name, icon }: { name: string; icon: string }) => (
  <div className="card flex flex-col items-center justify-center py-24 text-center">
    <Icon name={icon} className="text-4xl text-muted2 mb-3" />
    <h2 className="text-base font-medium">{name}</h2>
    <p className="text-sm text-muted mt-1 max-w-sm">This module ships in Phase 2. The data model is already live in Supabase.</p>
    <span className="pill pill-gray mt-4">Coming soon</span>
  </div>
);

/** Inline error card for a failed data load (use with react-query's `error`/`refetch`). */
export const ErrorState = ({ text = 'Something went wrong loading this view.', onRetry }: { text?: string; onRetry?: () => void }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <Icon name="ti-alert-triangle" className="text-3xl mb-2 text-rose-500" />
    <p className="text-sm text-muted max-w-sm">{text}</p>
    {onRetry && (
      <button className="btn btn-ghost border border-line mt-4" onClick={onRetry}>
        <Icon name="ti-refresh" className="text-base" /> Try again
      </button>
    )}
  </div>
);

/** App-wide error boundary: catches uncaught render errors so a single bad page
 *  shows a friendly card instead of a blank white screen. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { if (typeof console !== 'undefined') console.error('Render error:', error); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <Icon name="ti-alert-triangle" className="text-4xl text-rose-500 mb-3" />
          <h1 className="text-lg font-semibold text-content">This page hit an unexpected error</h1>
          <p className="text-sm text-muted mt-1 max-w-md">Try reloading. If it keeps happening, the team has been notified via the console log.</p>
          <button className="btn btn-primary mt-5" onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}>
            <Icon name="ti-refresh" className="text-base" /> Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** ClickUp-style status colour system — shared across tasks, board, detail, dashboard. */
export const STATUS_META: Record<string, { dot: string; solid: string; soft: string }> = {
  'Backlog':     { dot: 'bg-slate-400',   solid: 'bg-slate-500 text-white',   soft: 'bg-slate-500/10 text-slate-600 ring-slate-500/25' },
  'To Do':       { dot: 'bg-zinc-400',    solid: 'bg-zinc-500 text-white',    soft: 'bg-zinc-500/10 text-zinc-600 ring-zinc-500/25' },
  'In Progress': { dot: 'bg-indigo-500',  solid: 'bg-indigo-500 text-white',  soft: 'bg-indigo-500/10 text-indigo-600 ring-indigo-500/25' },
  'Review':      { dot: 'bg-amber-500',   solid: 'bg-amber-500 text-white',   soft: 'bg-amber-500/10 text-amber-600 ring-amber-500/25' },
  'Done':        { dot: 'bg-emerald-500', solid: 'bg-emerald-500 text-white', soft: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25' },
  'On Hold':     { dot: 'bg-orange-500',  solid: 'bg-orange-500 text-white',  soft: 'bg-orange-500/10 text-orange-600 ring-orange-500/25' },
  'Cancelled':   { dot: 'bg-rose-500',    solid: 'bg-rose-500 text-white',    soft: 'bg-rose-500/10 text-rose-600 ring-rose-500/25' },
  'Planning':    { dot: 'bg-sky-500',     solid: 'bg-sky-500 text-white',     soft: 'bg-sky-500/10 text-sky-600 ring-sky-500/25' },
  'Active':      { dot: 'bg-emerald-500', solid: 'bg-emerald-500 text-white', soft: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25' },
  'Completed':   { dot: 'bg-violet-500',  solid: 'bg-violet-500 text-white',  soft: 'bg-violet-500/10 text-violet-600 ring-violet-500/25' },
};
export const statusMeta = (s: string) => STATUS_META[s] || { dot: 'bg-zinc-400', solid: 'bg-zinc-500 text-white', soft: 'bg-zinc-500/10 text-zinc-600 ring-zinc-500/25' };

/** Status badge. `solid` = bold filled pill (group headers); default = soft ringed pill with dot. */
export const StatusBadge = ({ status, solid = false, color, className = '' }: { status: string; solid?: boolean; color?: string; className?: string }) => {
  const m = statusMeta(status);
  if (color) {
    // Custom (per-org) status colour via hex — inline-styled.
    return solid ? (
      <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-white ${className}`} style={{ backgroundColor: color }}>
        <span className="w-1.5 h-1.5 rounded-full bg-white/85" />{status}
      </span>
    ) : (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-medium ${className}`}
        style={{ backgroundColor: color + '1a', color, boxShadow: `inset 0 0 0 1px ${color}40` }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />{status}
      </span>
    );
  }
  return solid ? (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-2xs font-bold uppercase tracking-wide ${m.solid} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-white/85" />{status}
    </span>
  ) : (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-medium ring-1 ring-inset ${m.soft} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{status}
    </span>
  );
};

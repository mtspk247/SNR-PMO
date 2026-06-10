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
};

export const Pill = ({ label }: { label: string }) => (
  <span className={`pill ${COLOR[label] || 'pill-gray'}`}>{label}</span>
);

export const Avatar = ({ name, size = 28 }: { name: string; size?: number }) => {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="inline-flex items-center justify-center rounded-full bg-neutral-200 text-neutral-700 font-medium shrink-0"
    >{initials}</span>
  );
};

export const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-neutral-400">
    <Icon name="ti-loader-2" className="animate-spin text-2xl" />
  </div>
);

export const StatCard = ({ label, value, hint, hintTone = 'muted', icon }:
  { label: string; value: React.ReactNode; hint?: string; hintTone?: 'muted' | 'up' | 'down'; icon?: string }) => (
  <div className="stat group">
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs text-muted">{label}</p>
      {icon && (
        <span className="w-8 h-8 -mt-0.5 -mr-0.5 rounded-lg grid place-items-center bg-accent/10 text-accentstrong shrink-0 transition group-hover:bg-accent group-hover:text-accentfg">
          <Icon name={icon} className="text-base" />
        </span>
      )}
    </div>
    <p className="text-2xl font-semibold mt-1.5 text-content">{value}</p>
    {hint && (
      <p className={`text-2xs mt-1 ${hintTone === 'up' ? 'text-emerald-600' : hintTone === 'down' ? 'text-rose-600' : 'text-muted2'}`}>{hint}</p>
    )}
  </div>
);

export const PageHeader = ({ title, subtitle, action }:
  { title: string; subtitle?: string; action?: React.ReactNode }) => (
  <div className="flex items-end justify-between mb-5">
    <div>
      <h1 className="text-lg font-semibold">{title}</h1>
      {subtitle && <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const EmptyState = ({ icon = 'ti-inbox', text }: { icon?: string; text: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
    <Icon name={icon} className="text-3xl mb-2" />
    <p className="text-sm">{text}</p>
  </div>
);

export const Phase2 = ({ name, icon }: { name: string; icon: string }) => (
  <div className="card flex flex-col items-center justify-center py-24 text-center">
    <Icon name={icon} className="text-4xl text-neutral-300 mb-3" />
    <h2 className="text-base font-medium">{name}</h2>
    <p className="text-sm text-neutral-500 mt-1 max-w-sm">This module ships in Phase 2. The data model is already live in Supabase.</p>
    <span className="pill pill-gray mt-4">Coming soon</span>
  </div>
);

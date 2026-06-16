import React from 'react';
import { Icon } from '@/components/ui';

// Shared detail-page property primitives — mirrors the task modal's design language
// (borderless rows that highlight on hover). Use on every entity detail page.
export const PropRow = ({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 min-h-[34px] px-2 -mx-2 rounded-lg hover:bg-surface2/40 transition-colors">
    <span className="flex items-center gap-2 w-28 shrink-0 text-xs text-muted"><Icon name={icon} className="text-sm text-muted2" />{label}</span>
    <div className="flex-1 min-w-0 text-sm text-content">{children}</div>
  </div>
);

export const DetailMeta = ({ items }: { items: { icon: string; label: string; value: React.ReactNode }[] }) => (
  <div className="space-y-0.5">
    {items.map((m, i) => <PropRow key={i} icon={m.icon} label={m.label}>{m.value}</PropRow>)}
  </div>
);

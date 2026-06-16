import { Icon } from '@/components/ui';

// Reusable, color-coded plan badge. Tier color is derived from the plan key
// (preferred) or name, so the same plan reads consistently everywhere it shows
// (tenants list, tenant header, etc.). Unknown paid plans fall back to accent.
type Tier = { bg: string; text: string; ring: string };
const FREE: Tier = { bg: 'bg-surface2', text: 'text-muted', ring: 'ring-line' };
const TIERS: Record<string, Tier> = {
  free:       FREE,
  trial:      { bg: 'bg-slate-500/10',   text: 'text-slate-600',   ring: 'ring-slate-500/20' },
  starter:    { bg: 'bg-sky-500/10',     text: 'text-sky-600',     ring: 'ring-sky-500/20' },
  basic:      { bg: 'bg-sky-500/10',     text: 'text-sky-600',     ring: 'ring-sky-500/20' },
  pro:        { bg: 'bg-emerald-500/10', text: 'text-emerald-600', ring: 'ring-emerald-500/20' },
  business:   { bg: 'bg-violet-500/10',  text: 'text-violet-600',  ring: 'ring-violet-500/20' },
  team:       { bg: 'bg-violet-500/10',  text: 'text-violet-600',  ring: 'ring-violet-500/20' },
  enterprise: { bg: 'bg-amber-500/10',   text: 'text-amber-600',   ring: 'ring-amber-500/20' },
};
const FALLBACK: Tier = TIERS.pro;

function tierFor(key?: string | null, name?: string | null): Tier {
  const k = (key || name || '').toLowerCase().trim();
  if (!k) return FREE;
  for (const id in TIERS) if (k.includes(id)) return TIERS[id];
  return FALLBACK;
}

export function PlanBadge({ planKey, planName, size = 'md', className = '' }: {
  planKey?: string | null; planName?: string | null; size?: 'sm' | 'md'; className?: string;
}) {
  const label = planName || planKey || 'Free';
  const t = tierFor(planKey, planName);
  const pad = size === 'sm' ? 'px-2 py-0.5 text-2xs gap-1' : 'px-2.5 py-1 text-xs gap-1.5';
  return (
    <span className={`inline-flex items-center font-medium rounded-full ring-1 ring-inset ${t.bg} ${t.text} ${t.ring} ${pad} ${className}`}>
      <Icon name="ti-package" className={size === 'sm' ? 'text-xs' : 'text-sm'} />
      <span className="capitalize truncate">{label}</span>
    </span>
  );
}

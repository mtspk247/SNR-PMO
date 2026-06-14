import Link from 'next/link';
import { Icon } from '@/components/ui';
import { FEATURE_LABELS } from '@/lib/entitlements';
import { FeatureKey } from '@/lib/supabase';

/**
 * Shown (in place of a page's content) when the active org's plan doesn't include
 * the feature gating that route. Plan-based upsell — the operator-disabled case is
 * hidden from the nav instead. Upgrade CTA points at billing (Stripe wired later).
 */
export default function UpgradeScreen({ feature, canManage }: { feature: FeatureKey; canManage?: boolean }) {
  const label = FEATURE_LABELS[feature] || feature;
  return (
    <div className="grid place-items-center min-h-[60vh]">
      <div className="card max-w-md w-full p-8 text-center space-y-4">
        <span className="mx-auto w-14 h-14 rounded-2xl grid place-items-center bg-accent/10 text-accentstrong">
          <Icon name="ti-lock" className="text-2xl" />
        </span>
        <h1 className="text-xl font-semibold text-content">Unlock {label}</h1>
        <p className="text-sm text-muted">{label} isn’t included in your current plan. Upgrade to turn it on for your whole workspace.</p>
        {canManage
          ? <Link href="/settings" className="btn btn-primary w-full"><Icon name="ti-rocket" />View plans &amp; upgrade</Link>
          : <p className="text-sm text-muted2">Ask your workspace owner to upgrade the plan to enable this.</p>}
        <Link href="/dashboard" className="text-2xs text-muted hover:text-content">← Back to dashboard</Link>
      </div>
    </div>
  );
}

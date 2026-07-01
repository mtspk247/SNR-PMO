import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { FEATURE_LABELS } from '@/lib/entitlements';
import { FeatureKey } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';
import { upsellPromptsFor, UpsellPrompt } from '@/lib/db';

/**
 * Shown in place of a page's content when the active org's plan doesn't include the feature
 * gating that route. Content is driven by the upsell engine's feature_locked prompt (resolved
 * per tenant = platform default + reseller override), so operators customize lock screens too;
 * falls back to a sensible default. Operator-disabled features are hidden from nav instead.
 */
export default function UpgradeScreen({ feature, canManage }: { feature: FeatureKey; canManage?: boolean }) {
  const org = useActiveOrg();
  const label = FEATURE_LABELS[feature] || feature;
  const [prompt, setPrompt] = useState<UpsellPrompt | null>(null);
  useEffect(() => {
    let alive = true;
    if (!org?.id) return;
    upsellPromptsFor(org.id).then((ps) => {
      if (!alive) return;
      const locks = (ps || []).filter((p) => p.trigger_type === 'feature_locked' && p.status === 'active');
      setPrompt(locks.find((p) => p.feature_key === feature) || locks.find((p) => !p.feature_key) || null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [org?.id, feature]);

  const title = prompt?.title ? prompt.title.replace('{feature}', label) : `Unlock ${label}`;
  const body = prompt?.body ? prompt.body.replace('{feature}', label) : `${label} isn’t included in your current plan. Upgrade to turn it on for your whole workspace.`;
  const ctaLabel = prompt?.cta_label || 'View plans & upgrade';
  const ctaHref = prompt?.cta_href || '/billing';

  return (
    <div className="grid place-items-center min-h-[60vh]">
      <div className="card max-w-md w-full p-8 text-center space-y-4">
        <span className="mx-auto w-14 h-14 rounded-2xl grid place-items-center bg-accent/10 text-accentstrong">
          <Icon name={(prompt?.style && prompt.style.icon) || 'ti-lock'} className="text-2xl" />
        </span>
        <h1 className="text-xl font-semibold text-content">{title}</h1>
        <p className="text-sm text-muted">{body}</p>
        {canManage
          ? <Link href={ctaHref} className="btn btn-primary w-full"><Icon name="ti-rocket" />{ctaLabel}</Link>
          : <p className="text-sm text-muted2">Ask your workspace owner to upgrade the plan to enable this.</p>}
        <Link href="/dashboard" className="text-2xs text-muted hover:text-content">← Back to dashboard</Link>
      </div>
    </div>
  );
}

import { FeatureKey, MyOrg } from './supabase';

// 3.3 client-side entitlement gating. The DB is the source of truth (RLS feature
// clauses + seat trigger); these helpers only decide what the UI offers. A user
// who forces a hidden route still hits an empty/denied result server-side.

// Human labels for plan feature keys (used by settings + platform console).
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  crm: 'CRM',
  risk: 'Risk Analysis',
  financial: 'Financial Data',
  hr: 'HR / Onboarding',
  integrations: 'Integrations',
  audit: 'Audit Log',
  white_label: 'White-label',
  portfolios: 'Portfolios',
};

// True if the org's plan enables `key`. No key → ungated (core module).
export function hasFeature(org: MyOrg | null | undefined, key?: FeatureKey): boolean {
  if (!key) return true;
  return !!org?.features?.includes(key);
}

export function formatPrice(cents: number, model: string): string {
  if (cents === 0) return 'Free';
  const dollars = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return model === 'per_user' ? `$${dollars}/user/mo` : `$${dollars}/mo`;
}

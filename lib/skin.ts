// Per-tenant visual "skin" (theme). Orthogonal to light/dark mode (lib/theme.ts).
// Applied via <html data-skin>. The pre-paint default is set by the inline script
// in _document.tsx (from localStorage); the active org's skin is applied at runtime
// by applyBranding (lib/branding.ts), called pre-auth (host) and post-auth (active org).
export type Skin = 'classic' | 'nebula' | 'atlas' | 'coral';

export const SKINS: { key: Skin; label: string; blurb: string; swatch: string }[] = [
  { key: 'classic', label: 'Classic', blurb: 'Supabase green · left sidebar', swatch: '#3ECF8E' },
  { key: 'nebula',  label: 'Nebula',  blurb: 'ClickUp-style · purple · sidebar', swatch: '#7B68EE' },
  { key: 'atlas',   label: 'Atlas',   blurb: 'Jira-style · blue · top nav', swatch: '#0052CC' },
  { key: 'coral',   label: 'Coral',   blurb: 'Asana-style · coral · sidebar', swatch: '#F06A6A' },
];

const KEY = 'snr-skin';
const VALID: Skin[] = ['classic', 'nebula', 'atlas', 'coral'];

export function normalizeSkin(s?: string | null): Skin {
  return (VALID as string[]).includes(s || '') ? (s as Skin) : 'classic';
}

export function getSkin(): Skin {
  if (typeof document === 'undefined') return 'classic';
  return normalizeSkin(document.documentElement.dataset.skin);
}

export function applySkin(s?: string | null): Skin {
  const skin = normalizeSkin(s);
  if (typeof document === 'undefined') return skin;
  document.documentElement.dataset.skin = skin;
  try { localStorage.setItem(KEY, skin); } catch { /* ignore */ }
  return skin;
}
